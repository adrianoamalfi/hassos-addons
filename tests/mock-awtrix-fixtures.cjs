const http = require("node:http");

const role = process.env.FIXTURE_ROLE;
const settings = { brightness: 64, autoBrightness: false };
let restoreCalls = 0;
let lastRestore = "";

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function ingress(req, res) {
  const prefix = "/api/hassio_ingress/fixture_token";
  const incoming = new URL(req.url, "http://localhost");
  if (!incoming.pathname.startsWith(prefix)) return json(res, 404, { message: "ingress route not found" });
  const suffix = incoming.pathname.slice(prefix.length) || "/";
  const target = http.request({
    hostname: "awtrix",
    port: 8080,
    path: `${suffix}${incoming.search}`,
    method: req.method,
    headers: { ...req.headers, host: "awtrix", "x-ingress-path": prefix },
  }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  target.on("error", () => json(res, 502, { message: "add-on unavailable" }));
  req.pipe(target);
}

async function awtrix(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (path === "/__fixture/state") return json(res, 200, { restoreCalls, lastRestore, settings });
  if (path === "/api/v1/device") return json(res, 200, { name: "Fixture", version: "1.2.3", boardType: "tc002", updateImage: "awtrix-ng-tc002.awup" });
  if (path === "/api/v1/settings" && req.method === "GET") return json(res, 200, settings);
  if (path === "/api/v1/settings" && req.method === "PATCH") {
    Object.assign(settings, JSON.parse((await readBody(req)).toString("utf8")));
    return json(res, 200, settings);
  }
  if (path === "/api/v1/system") return json(res, 200, {
    hostname: "fixture", wifiSsid: "FixtureNet", wifiPass: "fixture-wifi-secret",
    mqttPass: "fixture-mqtt-secret", authPass: "fixture-auth-secret",
  });
  if (path === "/api/v1/apps") return json(res, 200, []);
  if (path === "/api/v1/files") {
    const dir = url.searchParams.get("dir") || "";
    return json(res, 200, { files: dir === "/ICONS" ? [{ name: "sample.png" }] : [] });
  }
  if (path === "/ICONS/sample.png") {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (path === "/api/v1/audio/melodies") return json(res, 200, { melodies: [{ name: "beep", rtttl: "d=4,o=5,b=125:c" }] });
  if (path === "/api/v1/audio/stations") return json(res, 200, { stations: [] });
  if (path === "/api/v1/audio/mp3") return json(res, 200, { scripts: [] });
  if (path === "/api/v1/icons/origins") return json(res, 200, []);
  if (path === "/apploop.json") return json(res, 200, { order: [], disabled: [] });
  if (path === "/api/v1/restore" && req.method === "POST") {
    const body = await readBody(req);
    restoreCalls += 1;
    lastRestore = body.toString("latin1");
    return json(res, 200, {
      ok: true,
      applied: { settings: 1, wifi: body.includes(Buffer.from("wifiSsid")) ? 1 : 0 },
      warnings: ["skipped ICONS/missing.png: not present in fixture"],
    });
  }
  return json(res, 404, { error: { code: "notFound", message: "fixture route not found" } });
}

if (role === "ingress") {
  http.createServer(ingress).listen(8088, "0.0.0.0");
} else if (role === "awtrix") {
  http.createServer((req, res) => void awtrix(req, res)).listen(80, "0.0.0.0");
} else {
  throw new Error("FIXTURE_ROLE must be ingress or awtrix");
}
