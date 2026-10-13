#!/usr/bin/env node
// Adapt the pinned upstream image; never pass the Supervisor token to Termix.
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createHash } = require('node:crypto');

function embeddedAuthPatch(source) {
  // Upstream's desktop login detection treats every iframe as a desktop link.
  // HA renders the entire application in an iframe, so omit only that fallback.
  const fallback = 'try{if(window.self!==window.top)return!0}catch{return!0}';
  return { source: source.replace(fallback, ''), count: source.split(fallback).length - 1 };
}

function prepareFrontend(directory) {
  let count = 0;
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith('.js')) {
        const result = embeddedAuthPatch(fs.readFileSync(file, 'utf8'));
        count += result.count;
        if (result.count) fs.writeFileSync(file, result.source);
      }
    }
  }
  visit(directory);
  if (count !== 1) throw new Error('Upstream embedded login detection changed; review HA iframe integration');
  // Upstream asset URLs carry long-lived immutable cache headers. Give adapted
  // modules fresh names and rewrite their imports so a previous build cannot
  // reuse the desktop-auth helper from the browser cache.
  const suffix = '-ha-' + createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').slice(0,10);
  const assets = path.join(directory, 'assets');
  const names = new Map(fs.readdirSync(assets).filter(name => name.endsWith('.js'))
    .map(name => [name, name.slice(0,-3) + suffix + '.js']));
  function rewrite(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) rewrite(file);
      else if (/\.(js|html|json)$/.test(entry.name)) {
        const source = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, source.replace(/[A-Za-z0-9_-]+\.js\b/g, name => names.get(name) || name));
      }
    }
  }
  rewrite(directory);
  for (const [original, replacement] of names) fs.renameSync(path.join(assets,original), path.join(assets,replacement));
}

function validateBasePath(value) {
  if (typeof value !== 'string' || !/^\/api\/hassio_ingress\/[A-Za-z0-9_-]+\/?$/.test(value)) {
    throw new Error('Supervisor returned an invalid ingress URL');
  }
  return value.replace(/\/$/, '');
}

async function ingressPath(env = process.env) {
  if (!env.SUPERVISOR_TOKEN) {
    if (env.TERMIX_LOCAL_TEST === '1') return '';
    throw new Error('Supervisor token unavailable; refusing unprotected startup');
  }
  // Only the app's own metadata is read; the default Supervisor role is sufficient.
  const response = await fetch('http://supervisor/addons/self/info', {
    headers: { Authorization: `Bearer ${env.SUPERVISOR_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supervisor metadata request failed (${response.status})`);
  const result = await response.json();
  if (result.result !== 'ok') throw new Error('Supervisor metadata request rejected');
  return validateBasePath(result.data?.ingress_url);
}

function nginxTemplate(template, localTest) {
  if (!template.includes("frame-ancestors 'none'") || !template.includes('X-Frame-Options "DENY"')) {
    throw new Error('Upstream iframe policy changed; review ingress compatibility');
  }
  return template
    // Ingress ACL must use the actual peer, never a client-supplied forwarded IP.
    .replace(/^\s*(?:set_real_ip_from|real_ip_header|real_ip_recursive)\s+[^;]+;\s*$/gm, '')
    .replaceAll("frame-ancestors 'none'", "frame-ancestors 'self'")
    .replaceAll('X-Frame-Options "DENY"', 'X-Frame-Options "SAMEORIGIN"')
    .replace('listen ${PORT};', 'listen ${PORT};\n' + (localTest
      ? '        # Explicit local development mode; never enabled under Supervisor.'
      : '        allow 172.30.32.2;\n        allow 127.0.0.1;\n        allow ::1;\n        deny all;'));
}

async function main() {
  const basePath = await ingressPath();
  const localTest = !process.env.SUPERVISOR_TOKEN && process.env.TERMIX_LOCAL_TEST === '1';
  const env = { ...process.env, BASE_PATH: basePath, DATA_DIR: '/data/termix', PORT: '8080',
    ENABLE_SSL: 'false', PUID: '1000', PGID: '1000' };
  delete env.SUPERVISOR_TOKEN;
  delete env.HASSIO_TOKEN;
  delete env.TERMIX_LOCAL_TEST;
  delete process.env.SUPERVISOR_TOKEN;
  delete process.env.HASSIO_TOKEN;
  fs.mkdirSync('/data/termix', { recursive: true, mode: 0o700 });
  fs.chownSync('/data/termix', 1000, 1000);
  fs.chmodSync('/data/termix', 0o700);
  // Upstream still has explicit /app/data paths for SSL and bootstrap.
  // Redirect those paths too, rather than relying solely on DATA_DIR.
  let entrypoint = fs.readFileSync('/entrypoint.sh', 'utf8');
  entrypoint = entrypoint.replaceAll('/app/data', '/data/termix');
  entrypoint = entrypoint.replace('chmod 755 /data/termix /app/uploads',
    'chmod 700 /data/termix; chmod 755 /app/uploads');
  fs.writeFileSync('/tmp/termix-entrypoint.sh', entrypoint, { mode: 0o755 });
  // Restore pristine assets before upstream's one-shot BASE_PATH substitutions.
  fs.rmSync('/app/html', { recursive: true, force: true });
  fs.cpSync('/usr/local/share/termix/html', '/app/html', { recursive: true });
  prepareFrontend('/app/html');
  for (const name of ['nginx.conf.template', 'nginx-https.conf.template']) {
    const path = `/app/nginx/${name}`;
    fs.writeFileSync(path, nginxTemplate(fs.readFileSync(`/usr/local/share/termix/nginx/${name}`, 'utf8'), localTest));
  }
  if (localTest) console.log('Termix local test mode: ingress restriction disabled');
  console.log('Starting Termix with persistent data and native ingress base path');
  const child = spawn('/tmp/termix-entrypoint.sh', [], { env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1); });
}

if (require.main === module) main().catch(error => {
  console.error(`Termix startup failed: ${error.message}`);
  process.exitCode = 1;
});
module.exports = { validateBasePath, ingressPath, nginxTemplate, embeddedAuthPatch };
