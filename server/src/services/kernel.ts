// Kernel computer/browser agent adapter.
// LIVE mode uses @onkernel/sdk (browsers.create → browsers.playwright.execute → browsers.deleteByID).
// Without KERNEL_API_KEY it falls back to a clearly-labelled DEMO ADAPTER that only performs
// HTTP GET requests and static HTML inspection — it never claims a browser was executed.
import Kernel from '@onkernel/sdk';
import { saveEvidenceFile, now, id } from '../db.js';
import type { KernelRun, Evidence } from '../types.js';

export const kernelConfigured = () => !!process.env.KERNEL_API_KEY;

const KEYWORDS = /(product|shop|catalog|item|detail|cart|checkout|admin|dashboard|search)/i;
const FORBIDDEN = /(pay|buy|purchase|place order|delete|remove account|subscribe|confirm order)/i;

function inspectionScript(url: string, viewport: { width: number; height: number }, searchProbe: string | null) {
  return `
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.setViewportSize(${JSON.stringify(viewport)});
const resp = await page.goto(${JSON.stringify(url)}, { waitUntil: 'networkidle', timeout: 30000 });
const info = await page.evaluate(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  return {
    title: document.title,
    headings: q('h1,h2').map(h => h.textContent.trim()).filter(Boolean).slice(0, 12),
    links: q('a[href]').map(a => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 60) })).slice(0, 80),
    signals: {
      viewportMeta: !!document.querySelector('meta[name=viewport]'),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      searchInput: !!document.querySelector('input[type=search], input[name*=search i], input[placeholder*=search i]'),
      productCards: q('[data-product], .product, .product-card, article').length,
      filterControls: q('select, input[type=checkbox], input[type=range], [data-filter]').length,
      cartLink: q('a, button').some(e => /cart/i.test(e.textContent || '')),
      forms: q('form').length,
      imagesMissingAlt: q('img:not([alt])').length,
      tables: q('table').length,
    },
  };
});
let searchProbe = null;
${searchProbe ? `
try {
  const input = await page.$('input[type=search], input[name*=search i], input[placeholder*=search i]');
  if (input) {
    const before = await page.$$eval('[data-product], .product, .product-card, article', els => els.filter(e => e.offsetParent !== null).length);
    await input.fill(${JSON.stringify(searchProbe)});
    await page.waitForTimeout(800);
    const after = await page.$$eval('[data-product], .product, .product-card, article', els => els.filter(e => e.offsetParent !== null).length);
    searchProbe = { term: ${JSON.stringify(searchProbe)}, visibleBefore: before, visibleAfter: after };
    await input.fill('');
  }
} catch (e) { searchProbe = { error: String(e).slice(0, 200) }; }` : ''}
const shot = (await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false })).toString('base64');
return { status: resp ? resp.status() : null, finalUrl: page.url(), ...info, searchProbe, errors, shot };
`;
}

export async function runKernelInspection(opts: { url: string; authorized: boolean; searchTerm?: string | null }): Promise<KernelRun> {
  const actions: KernelRun['actions'] = [];
  const log = (action: string, detail: string, ok = true) => actions.push({ at: now(), action, detail, ok });
  if (!opts.authorized) {
    log('authorization.check', 'Freelancer has not authorized automated inspection of this URL', false);
    return { mode: 'SKIPPED', note: 'Inspection skipped: no authorization from the freelancer for this URL.', actions, pages: [], consoleErrors: [], screenshots: [] };
  }
  let parsed: URL;
  try { parsed = new URL(opts.url); } catch { return { mode: 'SKIPPED', note: 'Invalid URL', actions, pages: [], consoleErrors: [], screenshots: [], error: 'Invalid URL' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { mode: 'SKIPPED', note: 'Only http(s) URLs are inspected', actions, pages: [], consoleErrors: [], screenshots: [] };

  if (!kernelConfigured()) return demoAdapter(parsed, actions, log);

  const kernel = new Kernel();
  let sessionId = '';
  const pages: KernelRun['pages'] = [];
  const screenshots: Evidence[] = [];
  const consoleErrors: string[] = [];
  try {
    const browser = await kernel.browsers.create({ headless: false, timeout_seconds: 120 } as any);
    sessionId = browser.session_id;
    log('browsers.create', `Kernel session ${sessionId}`);
    const targets: { url: string; viewport: { width: number; height: number }; label: string }[] = [
      { url: parsed.href, viewport: { width: 1440, height: 900 }, label: 'desktop' },
      { url: parsed.href, viewport: { width: 375, height: 812 }, label: 'mobile' },
    ];
    let discovered = false;
    for (let i = 0; i < targets.length && i < 7; i++) {
      const t = targets[i];
      const res = await kernel.browsers.playwright.execute(sessionId, { code: inspectionScript(t.url, t.viewport, i === 0 ? opts.searchTerm || 'shirt' : null), timeout_sec: 60 });
      if (!res.success) { log('playwright.execute', `${t.label} ${t.url}: ${res.error}`, false); continue; }
      const r: any = res.result;
      log('page.goto', `${t.label} ${t.viewport.width}x${t.viewport.height} → ${r.finalUrl} (HTTP ${r.status})`);
      if (r.searchProbe) log('input.fill (search probe)', JSON.stringify(r.searchProbe));
      consoleErrors.push(...(r.errors || []));
      pages.push({ url: r.finalUrl, title: r.title, viewport: `${t.label} ${t.viewport.width}x${t.viewport.height}`, headings: r.headings, signals: { ...r.signals, httpStatus: r.status, ...(r.searchProbe ? { searchProbe: JSON.stringify(r.searchProbe) } : {}) } });
      if (r.shot) {
        const p = saveEvidenceFile(Buffer.from(r.shot, 'base64'), 'jpg');
        screenshots.push({ id: id('ev'), kind: 'screenshot', label: `Kernel screenshot — ${t.label} — ${r.finalUrl}`, path: p, mime: 'image/jpeg', source: 'kernel' });
        log('page.screenshot', p);
      }
      if (!discovered) {
        discovered = true;
        const seen = new Set<string>([parsed.href]);
        for (const l of r.links as { href: string; text: string }[]) {
          try {
            const u = new URL(l.href);
            if (u.origin !== parsed.origin || seen.has(u.href) || FORBIDDEN.test(l.text)) continue;
            if (KEYWORDS.test(u.pathname + ' ' + l.text) && targets.length < 7) { seen.add(u.href); targets.push({ url: u.href, viewport: { width: 1440, height: 900 }, label: `desktop:${l.text || u.pathname}` }); }
          } catch { /* ignore bad link */ }
        }
        log('links.discover', `${targets.length - 2} same-origin pages selected for inspection (purchase/payment/delete links excluded)`);
      }
    }
    return { mode: 'KERNEL_LIVE', note: 'Executed in a Kernel cloud browser. Read-only navigation; the only input was a reversible search-field probe.', sessionId, liveViewUrl: browser.browser_live_view_url, actions, pages, consoleErrors, screenshots };
  } catch (e: any) {
    log('kernel.error', e.message || String(e), false);
    return { mode: 'KERNEL_LIVE', note: 'Kernel execution failed — see error. No findings were fabricated.', sessionId, actions, pages, consoleErrors, screenshots, error: e.message || String(e) };
  } finally {
    if (sessionId) { try { await kernel.browsers.deleteByID(sessionId); log('browsers.deleteByID', sessionId); } catch { /* best effort */ } }
  }
}

async function demoAdapter(parsed: URL, actions: KernelRun['actions'], log: (a: string, d: string, ok?: boolean) => void): Promise<KernelRun> {
  log('mode', 'KERNEL_API_KEY not configured — DEMO ADAPTER: HTTP GET + static HTML inspection only. No browser executed, no screenshots, no JS run.');
  const pages: KernelRun['pages'] = [];
  const fetchPage = async (u: string) => {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'VeriPay-DemoAdapter/1.0 (read-only)' } });
    const html = await r.text();
    const count = (re: RegExp) => (html.match(re) || []).length;
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 12);
    const links = [...html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }));
    pages.push({
      url: r.url, title, viewport: 'n/a (no browser)', headings,
      signals: {
        httpStatus: r.status, viewportMeta: /<meta[^>]+name="viewport"/i.test(html),
        searchInput: /<input[^>]+(type="search"|placeholder="[^"]*search)/i.test(html),
        productCards: count(/data-product[=\s>]/gi) || count(/class="[^"]*product-card/gi),
        filterControls: count(/<select/gi) + count(/type="checkbox"/gi) + count(/data-filter/gi),
        cartLink: /cart/i.test(links.map((l) => l.text).join(' ')), forms: count(/<form/gi), tables: count(/<table/gi),
        imagesMissingAlt: count(/<img(?![^>]*alt=)[^>]*>/gi), mediaQueriesInline: /@media/i.test(html),
        note: 'Static HTML only — client-rendered content and behaviour not observed',
      },
    });
    log('http.get', `${u} → HTTP ${r.status}`);
    return links;
  };
  try {
    const links = await fetchPage(parsed.href);
    const seen = new Set([parsed.href]);
    for (const l of links) {
      try {
        const u = new URL(l.href, parsed.href);
        if (u.origin !== parsed.origin || seen.has(u.href) || FORBIDDEN.test(l.text) || !KEYWORDS.test(u.pathname + ' ' + l.text)) continue;
        seen.add(u.href);
        if (seen.size > 6) break;
        await fetchPage(u.href);
      } catch { /* skip */ }
    }
    return { mode: 'DEMO_ADAPTER_HTTP_FETCH', note: 'DEMO ADAPTER — not a Kernel execution. Static HTTP inspection only; functional behaviour cannot be verified this way.', actions, pages, consoleErrors: [], screenshots: [] };
  } catch (e: any) {
    log('http.error', e.message, false);
    return { mode: 'DEMO_ADAPTER_HTTP_FETCH', note: 'DEMO ADAPTER — URL could not be fetched.', actions, pages, consoleErrors: [], screenshots: [], error: e.message };
  }
}
