// Read-only collector. stdout is gzip/base64 JSON for native artifact writers.
// Includes build dependencies conservatively because frontend dependencies are
// marked devDependencies upstream but their compiled code is distributed.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const VERSION = '26.10.1';
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
function untar(buffer) {
  const data = zlib.gunzipSync(buffer), files = [];
  let longname = '';
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString(), 8) || 0;
    const body = data.subarray(offset + 512, offset + 512 + size);
    const type = String.fromCharCode(header[156]);
    const prefix = header.subarray(345, 500).toString().replace(/\0.*$/s, '');
    if (type === 'L') longname = body.toString().replace(/\0.*$/s, '');
    else if (type === '0' || type === '\0') {
      files.push({ name: longname || (prefix ? prefix + '/' : '') + name, data: body });
      longname = '';
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
async function main() {
  const lockURL = `https://raw.githubusercontent.com/Termix-SSH/Termix/v${VERSION}/package-lock.json`;
  const lockBytes = await download(lockURL), lock = JSON.parse(lockBytes);
  const packages = new Map();
  for (const [path, item] of Object.entries(lock.packages)) {
    if (!path.includes('node_modules/') || item.link) continue;
    // Nested inBundle entries are read from their parent's tarball, including
    // their nested notice files; they have no separate resolved/integrity pair.
    if (item.inBundle && !item.resolved) continue;
    if (!item.resolved?.startsWith('https://registry.npmjs.org/')) throw new Error(`Non-registry package: ${path}`);
    if (!packages.has(item.resolved)) packages.set(item.resolved, { ...item, paths: [] });
    packages.get(item.resolved).paths.push(path);
  }
  const work = [...packages.values()], groups = new Map(), inventory = [], missing = [];
  let cursor = 0;
  async function worker() {
    while (cursor < work.length) {
      const item = work[cursor++], archive = await download(item.resolved);
      const [algorithm, expected] = item.integrity.split('-');
      if (crypto.createHash(algorithm).update(archive).digest('base64') !== expected) throw new Error(`Integrity mismatch: ${item.resolved}`);
      const files = untar(archive);
      const packageFile = files.find(file => /^(?:package|[^/]+)\/package.json$/.test(file.name));
      if (!packageFile) throw new Error(`package.json missing: ${item.resolved}`);
      const metadata = JSON.parse(packageFile.data);
      let notices = files.filter(file => /(?:^|\/)(?:LICEN[CS]E|COPYING|COPYRIGHT|NOTICE|OFL|FTL)(?:[._-][^/]*)?$/i.test(file.name));
      if (!notices.length) {
        // Preserve embedded README licenses and any package author attribution.
        const readmes = files.filter(file => /\/readme(?:\.[^/]+)?$/i.test(file.name));
        notices = readmes.filter(file => /license|copyright|permission is hereby|sil open font/i.test(file.data.toString()));
      }
      if (!notices.length) missing.push({ name: metadata.name, version: metadata.version, license: metadata.license || item.license,
        author: metadata.author, repository: metadata.repository, source: item.resolved, paths: item.paths });
      const record = { name: metadata.name, version: metadata.version, license: metadata.license || item.license,
        source: item.resolved, integrity: item.integrity, paths: item.paths, notices: [] };
      for (const notice of notices) {
        const hash = digest(notice.data);
        if (!groups.has(hash)) groups.set(hash, { text: notice.data.toString(), packages: [] });
        groups.get(hash).packages.push(`${metadata.name}@${metadata.version}: ${notice.name}`);
        record.notices.push({ path: notice.name, sha256: hash });
      }
      inventory.push(record);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  inventory.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  let body = '# Termix dependency notices\n\nCollected from integrity-verified packages in the upstream lockfile.\n';
  body += 'Includes build dependencies conservatively; listing does not imply every package is present in the runtime image.\n';
  for (const [hash, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    body += `\n## Notice ${hash}\n\n` + group.packages.sort().map(name => '- ' + name).join('\n') + '\n\n' + group.text + '\n';
  }
  const files = {
    'termix/licenses/dependencies-NOTICES.md': body,
    'termix/licenses/dependencies-sources.json': JSON.stringify({ upstream: VERSION, lockURL, lock_sha256: digest(lockBytes), packages: inventory, missing }, null, 2) + '\n',
  };
  if (process.env.NATIVE_ARTIFACTS_URL) {
    const response = await fetch(process.env.NATIVE_ARTIFACTS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(files),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Native artifact writer rejected payload');
    console.log(JSON.stringify({ packages: inventory.length, noticeGroups: groups.size, missing }));
  } else console.log('ARTIFACTS:' + zlib.gzipSync(Buffer.from(JSON.stringify(files))).toString('base64'));
}
main().catch(error => { console.log('FAILED ' + error.message); process.exitCode = 1; });
