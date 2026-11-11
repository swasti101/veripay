import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api, evidenceHandler, paypalWebhook, errorHandler } from './routes.js';
import { seed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..'); // repo root (works from src/ and dist/)

// Load .env (repo root or server/) without extra dependencies. Existing env vars win.
for (const f of [path.join(ROOT, '.env'), path.join(ROOT, 'server', '.env')]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

// Bind policy: loopback by default. The demo identity layer has no passwords, so a
// non-loopback bind is refused unless the operator explicitly opts in with ALLOW_PUBLIC_DEMO=true.
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4000);
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
if (!loopback && process.env.ALLOW_PUBLIC_DEMO !== 'true') {
  console.error(`Refusing to bind ${HOST}: demo sign-in is not real authentication. Set ALLOW_PUBLIC_DEMO=true to knowingly expose the demo.`);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const prod = process.env.NODE_ENV === 'production';
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  if (prod) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // CSP allows the PayPal Buttons SDK and nothing else third-party.
  // The SDK talks to api-m.* for orders AND www.* for its own telemetry/logger, so both are
  // needed under connect-src — with only api.* the buttons render but log CSP violations.
  const PP = 'https://www.paypal.com https://www.sandbox.paypal.com https://www.paypalobjects.com ' +
    'https://api-m.paypal.com https://api-m.sandbox.paypal.com';
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    `script-src 'self' ${PP} 'unsafe-inline'; ` +
    `frame-src 'self' ${PP}; ` +
    `connect-src 'self' ${PP}; ` +
    "img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.post('/webhooks/paypal', paypalWebhook);
app.use('/api', api);
app.get('/evidence/:name', evidenceHandler);
app.get('/openapi.yaml', (_req, res) => res.type('text/yaml').sendFile(path.join(ROOT, 'apimatic', 'src', 'spec', 'openapi.yaml')));
// Public demo deliverable (the "freelancer's website" that Kernel inspects). Anonymous by design.
app.use('/demo-store', express.static(path.join(ROOT, 'server', 'public', 'demo-store'), { extensions: ['html'] }));

const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get(/^\/(?!api|evidence|webhooks).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);

await seed(false);
app.listen(PORT, HOST, () => console.log(`VeriPay API on http://${HOST}:${PORT}`));
