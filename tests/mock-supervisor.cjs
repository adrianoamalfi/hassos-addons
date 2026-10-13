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
      session.on('shell', acceptShell => {
        const stream = acceptShell();
        stream.write('Termix SSH fixture connected\r\nfixture$ ');
        stream.on('data', data => stream.write(data));
      });
      session.on('exec', (acceptExec, reject, info) => {
        const stream = acceptExec();
        stream.write(`Fixture command received: ${info.command}\n`);
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
