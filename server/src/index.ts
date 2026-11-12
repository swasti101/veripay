import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

// Some hosts (Kernel's per-browser endpoints among them) publish an IPv6 address that many
// networks cannot route. Node's default 250 ms happy-eyeballs window gives up on IPv6 and then
// times out instead of falling back cleanly; a longer window makes the IPv4 fallback reliable
// while still using IPv6 where it works. curl was unaffected, which is what masked this.
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);
import { api, evidenceHandler, paypalWebhook, errorHandler } from './routes.js';
import { seed, ensureToolshopDemo } from './seed.js';

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
const prod = process.env.NODE_ENV === 'production';
const isCloud = prod || !!(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RAILWAY_STATIC_URL);
if (isCloud) process.env.ALLOW_PUBLIC_DEMO = 'true';
const HOST = isCloud ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');
const PORT = Number(process.env.PORT || 4000);
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
if (!loopback && process.env.ALLOW_PUBLIC_DEMO !== 'true') {
  console.error(`Refusing to bind ${HOST}: demo sign-in is not real authentication. Set ALLOW_PUBLIC_DEMO=true to knowingly expose the demo.`);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// prod is defined above
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
// Revision 1 of the same storefront, with two planted defects (filters do not combine; the
// cart total ignores quantity) so the walkthrough can show the agent catching real bugs.
app.use('/demo-store-v1', express.static(path.join(ROOT, 'server', 'public', 'demo-store-v1'), { extensions: ['html'] }));

const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get(/^\/(?!api|evidence|webhooks).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);

await seed(false);
ensureToolshopDemo();
app.listen(PORT, HOST, () => console.log(`VeriPay API on http://${HOST}:${PORT}`));
