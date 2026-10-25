const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateBasePath, ingressPath, nginxTemplate, embeddedAuthPatch } = require('../termix/rootfs/usr/local/bin/termix-ha.cjs');

test('HA iframe remains a full application rather than a desktop login bridge', () => {
  const upstream = 'function G(){if(Zt())return!1;if(window.IS_ELECTRON_WEBVIEW)return!0;try{if(window.self!==window.top)return!0}catch{return!0}return!1}';
  const result = embeddedAuthPatch(upstream);
  assert.equal(result.count, 1);
  assert.doesNotMatch(result.source, /window\.self/);
  assert.match(result.source, /window.IS_ELECTRON_WEBVIEW/);
  assert.equal(embeddedAuthPatch('new upstream implementation').count, 0);
});

test('Supervisor ingress path must be a complete trusted local path', () => {
  assert.equal(validateBasePath('/api/hassio_ingress/abc-_12/'), '/api/hassio_ingress/abc-_12');
  for (const path of ['https://example.com', '/other', '/api/hassio_ingress/../x', undefined]) {
    assert.throws(() => validateBasePath(path));
  }
});

test('without Supervisor, startup requires explicit local mode', async () => {
  await assert.rejects(ingressPath({}), /refusing unprotected/);
  assert.equal(await ingressPath({ TERMIX_LOCAL_TEST: '1' }), '');
});

test('read own metadata and reject failed Supervisor responses', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'http://supervisor/addons/self/info');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      return { ok: true, json: async () => ({ result: 'ok', data: { ingress_url: '/api/hassio_ingress/token' } }) };
    };
    assert.equal(await ingressPath({ SUPERVISOR_TOKEN: 'test-token' }), '/api/hassio_ingress/token');
    global.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(ingressPath({ SUPERVISOR_TOKEN: 'test-token', TERMIX_LOCAL_TEST: '1' }), /403/);
  } finally { global.fetch = original; }
});

test('iframe adaptation preserves other CSP rules and restricts ingress', () => {
  const template = `set_real_ip_from 172.16.0.0/12;\nreal_ip_header X-Forwarded-For;\nreal_ip_recursive on;\nlisten \${PORT};\nadd_header Content-Security-Policy "script-src 'self'; frame-ancestors 'none'";\nadd_header X-Frame-Options "DENY";`;
  const result = nginxTemplate(template, false);
  assert.match(result, /frame-ancestors 'self'/);
  assert.match(result, /script-src 'self'/);
  assert.match(result, /allow 172\.30\.32\.2/);
  assert.match(result, /deny all/);
  assert.match(result, /SAMEORIGIN/);
  assert.doesNotMatch(result, /real_ip/);
  assert.doesNotMatch(nginxTemplate(template, true), /deny all/);
  assert.throws(() => nginxTemplate('changed upstream policy', false), /policy changed/);
});
