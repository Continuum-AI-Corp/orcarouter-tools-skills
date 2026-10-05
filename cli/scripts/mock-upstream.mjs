#!/usr/bin/env node
/*
mock-upstream.mjs — the fake provider the local end-to-end test calls.

IT RUNS AS ITS OWN PROCESS, and that is the whole reason this file exists
rather than a few lines inside the test. The test drives the CLI with
execFileSync, which BLOCKS the Node event loop until the child exits — so a
mock served from the test's own process cannot answer the request the CLI is
making, and every run failed with `provider_timeout`. In a separate process
there is no shared loop to block.

HTTPS with a self-signed cert, because spec.validateProvider refuses any
base_url that is not https:// (a manifest names the host a platform
credential is sent to). The dev egress hatch turns verification off, not TLS.

THE CREDENTIAL CHECK IS AN ASSERTION. A wrong or missing key answers 401, so
a completed run proves OrcaRouter injected its stored credential — the caller
never had it, which is the property the whole platform exists for.
*/
import fs from 'node:fs';
import https from 'node:https';

const port = Number(process.env.MOCK_PORT || 3112);
const key = fs.readFileSync(process.env.MOCK_KEY_FILE, 'utf8');
const cert = fs.readFileSync(process.env.MOCK_CERT_FILE, 'utf8');
const expectedKey = process.env.MOCK_PROVIDER_KEY || 'dev-mock-provider-key';

let calls = 0;

const srv = https.createServer({ key, cert }, (req, res) => {
  // The counter endpoint is NOT a provider call and must not be counted, or
  // "the upstream was called once" becomes a function of how often the test
  // looked.
  if (req.url.startsWith('/__calls')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ calls }));
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls++;
    if (req.headers['x-api-key'] !== expectedKey) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing or wrong provider key' }));
      return;
    }
    let parsed = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      /* echo nothing */
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ echoed: parsed.query ?? null, calls }));
  });
});

srv.listen(port, '127.0.0.1', () => {
  process.stdout.write(`mock upstream on https://127.0.0.1:${port}\n`);
});
