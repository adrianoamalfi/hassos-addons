// Read-only source/notice collector for the pinned sharp-libvips build.
const cp = require('node:child_process');
const crypto = require('node:crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const BASE = 'https://raw.githubusercontent.com/lovell/sharp-libvips/v1.3.4/';
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
function members(bytes) {
  return cp.execFileSync('tar', ['-tf', '-'], { input: bytes, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\n').filter(Boolean);
}
function extract(bytes, paths) {
  return paths.length ? cp.execFileSync('tar', ['-xOf', '-', ...paths], { input: bytes, maxBuffer: 30 * 1024 * 1024 }) : Buffer.alloc(0);
}
const isNotice = name => /\/(?:LICEN[CS]E|COPYING|COPYRIGHT|NOTICE|AUTHORS|OFL|FTL)(?:[^/]*)$/i.test(name)
  && !/\.(?:c|h|cpp|hpp|js|rs|py|sh|json|xml|in|po|pot)$/i.test(name);
async function main() {
  const properties = await download(BASE + 'versions.properties');
  const script = await download(BASE + 'build/posix.sh');
  const versions = Object.fromEntries([...properties.toString().matchAll(/^VERSION_([A-Z0-9_]+)=(.+)$/gm)].map(match => [match[1], match[2].trim()]));
  const sources = [];
  for (const line of script.toString().split('\n')) {
    const match = line.match(/\$CURL\s+(https:\/\/.*?)\s+\|/);
    if (!match) continue;
    let url = match[1];
    url = url.replace(/\$\(without_patch \$VERSION_([A-Z0-9_]+)\)/g, (_, key) => versions[key].split('.').slice(0, 2).join('.'));
    url = url.replace(/\$\(without_prerelease \$VERSION_([A-Z0-9_]+)\)/g, (_, key) => versions[key].split('-')[0]);
    url = url.replace(/\$\{VERSION_([A-Z0-9_]+)\/\/\.\/([-_])\}/g, (_, key, separator) => versions[key].replaceAll('.', separator));
    url = url.replace(/\$\{VERSION_([A-Z0-9_]+)\}/g, (_, key) => versions[key]);
    if (/\$/.test(url)) throw new Error('Unresolved source URL: ' + url);
    sources.push({ url, component: match[1].match(/VERSION_([A-Z0-9_]+)/)?.[1] || 'PATCH' });
  }
  const groups = new Map(), inventory = [], crates = [], missing = [];
  let cursor = 0;
  async function worker() {
    while (cursor < sources.length) {
      const source = sources[cursor++], bytes = await download(source.url);
      const record = { ...source, sha256: hash(bytes), size: bytes.length };
      if (/\.patch$/.test(source.url)) {
        record.patch = bytes.toString();
      } else {
        const files = members(bytes), paths = files.filter(isNotice), notice = extract(bytes, paths);
        if (!paths.length) missing.push(source.url);
        const key = hash(notice);
        groups.set(key, { source: source.url, paths, text: notice.toString() });
        record.notices = paths;
        record.notices_sha256 = key;
        if (source.component === 'RSVG') {
          const path = files.find(name => name.endsWith('/Cargo.lock'));
          if (!path) throw new Error('librsvg Cargo.lock missing');
          const lock = extract(bytes, [path]).toString();
          record.cargo_lock_sha256 = hash(lock);
          for (const section of lock.split('[[package]]').slice(1)) {
            const name = section.match(/^name = "([^"]+)"/m)?.[1];
            const version = section.match(/^version = "([^"]+)"/m)?.[1];
            const checksum = section.match(/^checksum = "([^"]+)"/m)?.[1];
            if (checksum) crates.push({ name, version, checksum });
          }
        }
      }
      inventory.push(record);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  cursor = 0;
  async function crateWorker() {
    while (cursor < crates.length) {
      const crate = crates[cursor++];
      const url = `https://static.crates.io/crates/${crate.name}/${crate.name}-${crate.version}.crate`;
      const bytes = await download(url);
      if (hash(bytes) !== crate.checksum) throw new Error('Crate integrity mismatch: ' + crate.name);
      const files = members(bytes), paths = files.filter(isNotice);
      const manifestPath = files.find(path => path.endsWith('/Cargo.toml'));
      const manifest = manifestPath ? extract(bytes, [manifestPath]).toString() : '';
      const declaredLicense = manifest.match(/^license = "([^"]+)"/m)?.[1];
      let notice = extract(bytes, paths);
      if (!paths.length && declaredLicense) {
        // crates.io manifests explicitly grant the stated SPDX license. Preserve
        // the package declaration and authors; standard texts live alongside it.
        paths.push(manifestPath);
        notice = Buffer.from(manifest);
      } else if (!paths.length) missing.push(url);
      const key = hash(notice);
      groups.set(key, { source: url, paths, text: notice.toString() });
      inventory.push({ component: 'RSVG-RUST', name: crate.name, version: crate.version,
        url, sha256: crate.checksum, declared_license: declaredLicense, notices: paths, notices_sha256: key });
    }
  }
  await Promise.all(Array.from({ length: 8 }, crateWorker));
  inventory.sort((a, b) => a.url.localeCompare(b.url));
  let notices = '# Native dependency notices\n\n';
  for (const [sha256, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    notices += `\n## Notice ${sha256}\n\nSource: ${group.source}\n\nFiles:\n`
      + group.paths.map(path => '- ' + path).join('\n') + '\n\n' + group.text + '\n';
  }
  const files = {
    'termix/licenses/native-NOTICES.md': notices,
    'termix/licenses/native-sources.json': JSON.stringify({ upstream: 'sharp-libvips v1.3.4',
      versions, build_script_url: BASE + 'build/posix.sh', build_script_sha256: hash(script),
      versions_url: BASE + 'versions.properties', versions_sha256: hash(properties), sources: inventory, missing }, null, 2) + '\n',
    'termix/licenses/libvips-build-posix.sh.txt': script.toString(),
    'termix/licenses/libvips-versions.properties': properties.toString(),
  };
  const response = await fetch(process.env.NATIVE_ARTIFACTS_URL, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(files), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Native artifact writer rejected payload');
  console.log(JSON.stringify({ sources: inventory.length, rustCrates: crates.length, noticeGroups: groups.size, missing }));
}
main().catch(error => { console.log('FAILED ' + error.message); process.exitCode = 1; });
