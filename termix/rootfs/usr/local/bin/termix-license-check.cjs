// Build-time check against the immutable upstream dependency inventories.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const folder = '/usr/share/licenses/termix-ha/third-party';
const read = name => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
const upstream = JSON.parse(fs.readFileSync('/app/package.json', 'utf8'));
const packages = read('dependencies-sources.json');
const coverage = read('dependencies-coverage.json');
const native = read('native-sources.json');
const plugins = read('plugins-sources.json');
const node = read('node-sources.json');
function requireCondition(condition, message) { if (!condition) throw new Error(message); }
requireCondition([packages.upstream, coverage.upstream, plugins.upstream].every(version => version === upstream.version), 'Upstream changed: regenerate license inventories');
requireCondition(process.version === node.version, 'Node version changed: update its license');
requireCondition(crypto.createHash('sha256').update(fs.readFileSync(path.join(folder, 'node-LICENSE'), 'utf8').trimEnd()).digest('hex') === node.sha256, 'Node license text changed');
requireCondition(native.missing.length === 0, 'Native dependencies lack licensing declarations');
requireCondition(!fs.existsSync('/app/opkssh-bundled'), 'Uncleared optional OPKSSH binary must not be distributed');
requireCondition(fs.existsSync('/app/packages/plugin-sdk/LICENSE'), 'Plugin SDK license missing');
const covered = new Map(coverage.coverage.map(item => [`${item.name}@${item.version}`, item]));
for (const item of packages.missing) {
  const record = covered.get(`${item.name}@${item.version}`);
  requireCondition(record && record.license === item.license, `Review package license: ${item.name}`);
  const file = record.covered_by.split('#')[0];
  requireCondition(fs.existsSync(path.resolve(folder, file)), `License text missing: ${file}`);
}
const inventory = new Map(packages.packages.map(item => [`${item.name}@${item.version}`, item]));
let checked = 0;
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) { scan(current); continue; }
    const metadataPath = path.join(current, 'package.json');
    if (!fs.existsSync(metadataPath)) continue;
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    requireCondition(inventory.has(`${metadata.name}@${metadata.version}`), `New runtime package: ${metadata.name}@${metadata.version}`);
    checked++;
    if (fs.existsSync(path.join(current, 'node_modules'))) scan(path.join(current, 'node_modules'));
  }
}
scan('/app/node_modules');
for (const plugin of plugins.plugins) {
  const metadata = JSON.parse(fs.readFileSync(`/app/dist/plugins/${plugin.id}/manifest.json`, 'utf8'));
  requireCondition(metadata.version === plugin.version && metadata.license === plugin.license && plugin.license === 'Apache-2.0', `Plugin changed: ${plugin.id}`);
}
requireCondition(fs.readdirSync('/app/dist/plugins', { withFileTypes: true }).filter(entry => entry.isDirectory()).length === plugins.plugins.length, 'Bundled plugin inventory changed');
const vips = fs.readdirSync('/app/node_modules/@img').find(name => /^sharp-libvips-linux-(arm64|x64)$/.test(name));
requireCondition(vips, 'Expected Linux libvips package missing');
const versions = JSON.parse(fs.readFileSync(`/app/node_modules/@img/${vips}/versions.json`, 'utf8'));
for (const [name, version] of Object.entries(versions)) {
  requireCondition(native.versions[name.toUpperCase().replaceAll('-', '_')] === version, `Native component changed: ${name}`);
}
console.log(`License inventories verified: ${checked} runtime package instances, ${plugins.plugins.length} plugins and native library versions`);
