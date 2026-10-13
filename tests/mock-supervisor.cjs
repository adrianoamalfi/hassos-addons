// Local ingress fixture. No real Supervisor credentials or host data are used.
const http = require('node:http');
const prefix = '/api/hassio_ingress/fixture_token';
const { generateKeyPairSync } = require('node:crypto');
const { Server } = require('/app/node_modules/ssh2');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
new Server({ hostKeys: [privateKey.export({ type: 'pkcs1', format: 'pem' })] }, client => {
  client.on('authentication', ctx => {
    if (ctx.method === 'password' && ctx.username === 'fixture' && ctx.password === 'fixture-password') ctx.accept();
    else ctx.reject();
  }).on('ready', () => {
    client.on('session', accept => {
      const session = accept();
      session.on('pty', acceptPty => acceptPty());
      // Read-only, synthetic SFTP tree for documentation screenshots.
      session.on('sftp', acceptSftp => {
        const sftp = acceptSftp();
        const files = { '/config/configuration.yaml': '# Demonstration only\ndefault_config:\n',
          '/config/automations.yaml': '[]\n', '/share/README.txt': 'Synthetic Home Assistant demo files.\n' };
        const dirs = ['/', '/config', '/share'];
        const attrs = p => ({ mode: dirs.includes(p) ? 0o40755 : 0o100644,
          uid: 0, gid: 0, size: files[p]?.length || 0, atime: 1700000000, mtime: 1700000000 });
        const handles = new Map(); let next = 0;
        const handle = value => { const h = Buffer.from(String(++next)); handles.set(h.toString(), value); return h; };
        const normalize = p => p === '.' ? '/' : p.replace(/\/$/, '') || '/';
        sftp.on('REALPATH', (id, p) => { p = normalize(p); sftp.name(id, [{ filename: p, longname: p, attrs: attrs(p) }]); });
        for (const event of ['STAT', 'LSTAT']) sftp.on(event, (id, p) => {
          p = normalize(p); if (dirs.includes(p) || files[p] !== undefined) sftp.attrs(id, attrs(p)); else sftp.status(id, 2);
        });
        sftp.on('OPENDIR', (id, p) => { p = normalize(p); if (dirs.includes(p)) sftp.handle(id, handle({ path: p, read: false })); else sftp.status(id, 2); });
        sftp.on('READDIR', (id, h) => {
          const item = handles.get(h.toString()); if (!item || item.read) return sftp.status(id, 1);
          item.read = true;
          const base = item.path === '/' ? '/' : item.path + '/';
          const entries = [...dirs.slice(1), ...Object.keys(files)].filter(p => p.startsWith(base) && !p.slice(base.length).includes('/'));
          sftp.name(id, entries.map(p => ({ filename: p.slice(base.length), longname: p.slice(base.length), attrs: attrs(p) })));
        });
        sftp.on('OPEN', (id, p, flags) => { p = normalize(p); if (flags !== 1) return sftp.status(id, 3); if (files[p] === undefined) return sftp.status(id, 2); sftp.handle(id, handle({ path: p })); });
        sftp.on('READ', (id, h, offset, length) => { const item = handles.get(h.toString()); const data = item && Buffer.from(files[item.path] || ''); if (!data) return sftp.status(id, 2); if (offset >= data.length) return sftp.status(id, 1); sftp.data(id, data.subarray(offset, offset + length)); });
        sftp.on('CLOSE', (id, h) => { handles.delete(h.toString()); sftp.status(id, 0); });
        sftp.on('FSTAT', (id, h) => { const item = handles.get(h.toString()); if (item) sftp.attrs(id, attrs(item.path)); else sftp.status(id, 2); });
      });
      session.on('shell', acceptShell => {
        const stream = acceptShell();
        stream.write('Termix SSH fixture connected\r\nfixture$ ');
        stream.on('data', data => stream.write(data));
      });
      session.on('exec', (acceptExec, reject, info) => {
        const stream = acceptExec();
        stream.write(info.command.trim() === 'pwd' ? '/\n' : `Fixture command received: ${info.command}\n`);
        stream.exit(0); stream.end();
      });
    });
  }).on('error', () => {});
}).listen(2222);
http.createServer((req, res) => {
  if (req.url !== '/addons/self/info' || req.headers.authorization !== 'Bearer fixture-secret') {
    res.writeHead(403); res.end(); return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ result: 'ok', data: { ingress_url: prefix } }));
}).listen(80);

const ingress = http.createServer((req, res) => {
  if (req.url === '/fixture') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><title>Termix ingress fixture</title></head><body style="margin:0"><iframe title="Termix" src="${prefix}/" style="border:0;width:100vw;height:100vh"></iframe></body></html>`);
    return;
  }
  if (!req.url.startsWith(prefix + '/')) { res.writeHead(404); res.end(); return; }
  const proxy = http.request({ host: 'termix', port: 8080, path: req.url.slice(prefix.length),
    method: req.method, headers: { ...req.headers, 'x-ingress-path': prefix } }, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
  });
  proxy.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(proxy);
});
ingress.on('upgrade', (req, socket, head) => {
  const proxy = http.request({ host: 'termix', port: 8080, path: req.url.slice(prefix.length),
    headers: { ...req.headers, 'x-ingress-path': prefix } });
  proxy.on('upgrade', (res, upstream, responseHead) => {
    socket.write(`HTTP/1.1 ${res.statusCode} Switching Protocols\r\n` +
      Object.entries(res.headers).map(([key, value]) => `${key}: ${value}\r\n`).join('') + '\r\n');
    upstream.write(head); socket.write(responseHead);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  proxy.on('error', () => socket.destroy());
  proxy.end();
});
ingress.listen(8088);
