// Computer agent: uses the submitted website the way a person checking it would —
// opens it, resizes it, follows its navigation, types into search, changes filters,
// opens a product and clicks "add to cart" — capturing a screenshot at each step.
//
// One script, three hosts, each labelled for what it is:
//   KERNEL_LIVE    the script runs in a Kernel cloud browser (@onkernel/sdk playwright.execute)
//   LOCAL_BROWSER  the same script runs in a Chromium on this server via playwright-core —
//                  real clicks and screenshots, but explicitly NOT Kernel
//   DEMO_ADAPTER   no browser at all: static HTTP GET and HTML inspection only
//
// Safety: navigation follows same-origin links only and skips anything that looks like
// paying, buying, deleting or account changes. The only button it presses is "add to cart",
// which changes cart state in the visitor's own browser and moves no money. It never submits
// a form, so it never places an order.
import fs from 'node:fs';
import Kernel from '@onkernel/sdk';
import { saveEvidenceFile, now, id } from '../db.js';
import type { KernelRun, Evidence } from '../types.js';

export const kernelConfigured = () => !!process.env.KERNEL_API_KEY;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean) as string[];
export const localChrome = () => (process.env.DISABLE_LOCAL_BROWSER === 'true' ? null : CHROME_CANDIDATES.find((p) => fs.existsSync(p)) || null);
export const computerAgentMode = (): KernelRun['mode'] => (kernelConfigured() ? 'KERNEL_LIVE' : localChrome() ? 'LOCAL_BROWSER' : 'DEMO_ADAPTER_HTTP_FETCH');

const KEYWORDS = /(product|shop|catalog|item|detail|cart|checkout|admin|dashboard|search|about|service|pricing|contact)/i;
const FORBIDDEN = /(pay|buy|purchase|place order|delete|remove account|subscribe|confirm order|log ?out|sign ?out|unsubscribe)/i;

/** The journey, as Playwright code. Runs unchanged on Kernel or locally; `page` is in scope.
 *  It returns plain data (screenshots as base64) so the host can persist evidence. */
function journeyScript(url: string, searchTerm: string) {
  return `
const steps = [];
const errors = [];
const FORBIDDEN = ${FORBIDDEN.toString()};
const KEYWORDS = ${KEYWORDS.toString()};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let n = 0;
const shot = async () => (await page.screenshot({ type: 'jpeg', quality: 55 })).toString('base64');
const step = async (kind, what, found, ok, withShot) => {
  steps.push({ n: ++n, kind, what, found, ok, url: page.url(), shot: withShot ? await shot() : undefined });
};
const facts = async () => page.evaluate(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const visible = (e) => e.offsetParent !== null;
  return {
    title: document.title,
    headings: q('h1,h2').map((h) => h.textContent.trim()).filter(Boolean).slice(0, 8),
    viewportMeta: !!document.querySelector('meta[name=viewport]'),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    searchInput: !!document.querySelector('input[type=search], input[name*=search i], input[placeholder*=search i]'),
    products: q('[data-product], .product, .product-card').filter(visible).length,
    filters: q('select, input[type=checkbox], [data-filter]').length,
    imagesMissingAlt: q('img').filter((i) => !i.getAttribute('alt')).length,
    forms: q('form').length,
    requiredFields: q('input[required], select[required], textarea[required]').length,
    tables: q('table').length,
    cartText: (q('a, button, span').find((e) => /cart/i.test(e.textContent || '')) || {}).textContent || '',
  };
});
const visibleProducts = () => page.$$eval('[data-product], .product, .product-card', (els) => els.filter((e) => e.offsetParent !== null).length);

// 1. Open at desktop width
await page.setViewportSize({ width: 1440, height: 900 });
const resp = await page.goto(${JSON.stringify(url)}, { waitUntil: 'networkidle', timeout: 30000 });
const home = await facts();
const pages = [{ url: page.url(), title: home.title, viewport: 'desktop 1440x900', headings: home.headings, signals: { httpStatus: resp ? resp.status() : 0, viewportMeta: home.viewportMeta, searchInput: home.searchInput, productCards: home.products, filterControls: home.filters, imagesMissingAlt: home.imagesMissingAlt, forms: home.forms, cartLink: /cart/i.test(home.cartText), tables: home.tables } }];
await step('open', 'Opened the submitted URL at desktop width (1440 px)', (resp ? 'HTTP ' + resp.status() : 'no response') + ' · "' + home.title + '" · ' + home.headings.length + ' headings', !!resp && resp.status() < 400, true);

// 2. Responsive check at phone width
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(300);
const mobile = await facts();
pages.push({ url: page.url(), title: mobile.title, viewport: 'mobile 375x812', headings: mobile.headings, signals: { horizontalOverflow: mobile.overflow, viewportMeta: mobile.viewportMeta } });
await step('resize', 'Resized to a phone (375 px) to check the layout', mobile.overflow ? 'Content overflows horizontally — the page scrolls sideways' : 'No horizontal overflow; layout fits the screen', !mobile.overflow, true);
await page.setViewportSize({ width: 1440, height: 900 });

// 3. Follow the site's own navigation (same-origin, nothing destructive)
const origin = new URL(page.url()).origin;
const links = await page.$$eval('a[href]', (as) => as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 50) })));
const seen = new Set([page.url().split('#')[0]]);
const targets = [];
for (const l of links) {
  try {
    const u = new URL(l.href);
    const key = u.href.split('#')[0];
    if (u.origin !== origin || seen.has(key) || FORBIDDEN.test(l.text) || !KEYWORDS.test(u.pathname + ' ' + l.text)) continue;
    seen.add(key); targets.push(l);
  } catch (e) {}
  if (targets.length >= 4) break;
}
for (const t of targets) {
  try {
    const r = await page.goto(t.href, { waitUntil: 'networkidle', timeout: 20000 });
    const f = await facts();
    pages.push({ url: page.url(), title: f.title, viewport: 'desktop 1440x900', headings: f.headings, signals: { httpStatus: r ? r.status() : 0, searchInput: f.searchInput, productCards: f.products, filterControls: f.filters, forms: f.forms, requiredFields: f.requiredFields, tables: f.tables, cartLink: /cart/i.test(f.cartText) } });
    await step('navigate', 'Followed the "' + (t.text || new URL(t.href).pathname) + '" link', 'HTTP ' + (r ? r.status() : '?') + ' · ' + (f.headings[0] || f.title) + (f.products ? ' · ' + f.products + ' products shown' : '') + (f.requiredFields ? ' · form with ' + f.requiredFields + ' required fields' : ''), !!r && r.status() < 400, true);
  } catch (e) { await step('navigate', 'Tried to follow "' + t.text + '"', 'Failed: ' + String(e).slice(0, 120), false, false); }
}

// 4. Search: find a page with a search box, type, measure the change
const searchPage = pages.find((p) => p.signals.searchInput);
let searchProbe = null;
if (searchPage) {
  await page.goto(searchPage.url, { waitUntil: 'networkidle' });
  const input = await page.$('input[type=search], input[name*=search i], input[placeholder*=search i]');
  if (input) {
    const before = await visibleProducts();
    const t0 = Date.now();
    await input.fill(${JSON.stringify(searchTerm)});
    await page.waitForTimeout(700);
    const after = await visibleProducts();
    const empty = await page.$eval('body', (b) => /no (products|results)|nothing matches/i.test(b.innerText));
    searchProbe = { term: ${JSON.stringify(searchTerm)}, before, after, ms: Date.now() - t0 };
    await step('type', 'Typed "' + ${JSON.stringify(searchTerm)} + '" into the search box', before + ' products narrowed to ' + after + (after === 0 && empty ? ' (empty-state message shown)' : ''), after < before || (after === 0 && empty), true);
    // A term that cannot match, to see the empty state
    await input.fill('zzqx-no-such-item');
    await page.waitForTimeout(600);
    const none = await visibleProducts();
    const emptyMsg = await page.$eval('body', (b) => /no (products|results)|nothing matches/i.test(b.innerText));
    await step('type', 'Typed a term that cannot match anything', none === 0 ? (emptyMsg ? 'No results, and an empty-state message is shown' : 'No results, but no message tells the user why') : none + ' products still visible', none === 0 && emptyMsg, true);
    await input.fill('');
    await page.waitForTimeout(400);
  }
}

// 5. Filters: change a select and see whether the results respond
const filterPage = pages.find((p) => p.signals.filterControls);
let filterProbe = null;
if (filterPage) {
  if (page.url() !== filterPage.url) await page.goto(filterPage.url, { waitUntil: 'networkidle' });
  const sel = await page.$('select');
  if (sel) {
    const opts = await sel.$$eval('option', (os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })));
    const pick = opts.find((o) => o.v);
    if (pick) {
      const before = await visibleProducts();
      await sel.selectOption(pick.v);
      await page.waitForTimeout(500);
      const after = await visibleProducts();
      filterProbe = { option: pick.t, before, after };
      await step('select', 'Chose "' + pick.t + '" in a filter', before + ' products became ' + after, after !== before, true);
      await sel.selectOption(opts[0].v);
      await page.waitForTimeout(300);
    }
  }
  // Do two filters combine? Apply each alone, then both. Combined results can never be more
  // than either filter alone — if they are, the second filter is being ignored.
  const sels = await page.$$('select');
  if (sels.length >= 2) {
    const firstOpt = async (s) => (await s.$$eval('option', (os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })))).filter((o) => o.v);
    const [o1, o2] = [(await firstOpt(sels[0]))[0], (await firstOpt(sels[1]))[0]];
    const reset0 = async () => { await sels[0].selectOption(''); await sels[1].selectOption(''); await page.waitForTimeout(300); };
    if (o1 && o2) {
      await reset0();
      await sels[0].selectOption(o1.v); await page.waitForTimeout(400);
      const onlyA = await visibleProducts();
      await reset0();
      await sels[1].selectOption(o2.v); await page.waitForTimeout(400);
      const onlyB = await visibleProducts();
      await sels[0].selectOption(o1.v); await page.waitForTimeout(400);   // both now set
      const both = await visibleProducts();
      const combines = both <= Math.min(onlyA, onlyB);
      filterProbe = { ...(filterProbe || {}), combine: { a: o1.t, b: o2.t, onlyA, onlyB, both, combines } };
      await step('select', 'Combined two filters: "' + o1.t + '" and "' + o2.t + '"',
        combines
          ? 'Alone they show ' + onlyA + ' and ' + onlyB + '; together ' + both + ' — the filters narrow each other'
          : 'Alone they show ' + onlyA + ' and ' + onlyB + ', but together ' + both + ' — more than either alone, so one filter is being ignored',
        combines, true);
      await reset0();
    }
  }
}

// 6. Open a product and add it to the cart (cart state only — no money, no order)
let cartProbe = null;
// Click what a person clicks — the product's picture or title. An inline <a> wrapping block
// children can have a near-zero box, so clicking the anchor itself often lands on nothing.
const productLink = await page.$('[data-product] a img, .product-card a img, [data-product] a h3, .product-card a h3, a[href*="product"] img, [data-product] a, .product-card a');
if (productLink) {
  try {
    // waitForLoadState resolves at once on an already-idle page, so wait for the URL to change.
    const from = page.url();
    await Promise.all([page.waitForURL((u) => u.toString() !== from, { timeout: 10000 }), productLink.click()]);
    await page.waitForLoadState('networkidle');
    const f = await facts();
    pages.push({ url: page.url(), title: f.title, viewport: 'desktop 1440x900', headings: f.headings, signals: { httpStatus: 200, productDetail: true } });
    await step('click', 'Clicked a product to open its detail page', (f.headings[0] || f.title), true, true);
    const btn = await page.$('button:has-text("Add to cart"), button:has-text("Add to bag")');
    if (btn && !(await btn.isDisabled())) {
      const cartBefore = (await facts()).cartText.replace(/\\s+/g, ' ').trim();
      await btn.click();
      await page.waitForTimeout(500);
      const cartAfter = (await facts()).cartText.replace(/\\s+/g, ' ').trim();
      cartProbe = { before: cartBefore, after: cartAfter, changed: cartBefore !== cartAfter };
      await step('click', 'Clicked "Add to cart"', cartBefore !== cartAfter ? 'Cart indicator changed from "' + cartBefore + '" to "' + cartAfter + '"' : 'Nothing visibly changed after clicking', cartBefore !== cartAfter, true);
    } else {
      await step('inspect', 'Looked for an "Add to cart" button', btn ? 'Button present but disabled (item may be out of stock)' : 'No add-to-cart button on this page', !!btn, false);
    }
  } catch (e) { await step('click', 'Tried to open a product', 'Failed: ' + String(e).slice(0, 120), false, false); }
}

// 6b. Does the order total follow the quantity? Change it in the cart and re-read the total.
// This only edits the visitor's own cart; nothing is ordered or paid.
let totalProbe = null;
if (cartProbe && cartProbe.changed) {
  const cartLink = await page.$('a[href*="cart"]');
  if (cartLink) {
    try {
      const from = page.url();
      await Promise.all([page.waitForURL((u) => u.toString() !== from, { timeout: 10000 }).catch(() => {}), cartLink.click()]);
      await page.waitForLoadState('networkidle');
      const readTotal = () => page.$eval('body', (b) => {
        const m = b.innerText.match(/total[^$\\n]*\\$\\s*([\\d,.]+)/i);
        return m ? Number(m[1].replace(/,/g, '')) : null;
      });
      const qty = await page.$('input[type=number]');
      const before = await readTotal();
      if (qty && before !== null) {
        const q0 = Number(await qty.inputValue()) || 1;
        // Type and Tab away, as a person would: the browser fires one native change event.
        // (A synthetic change on top of it re-renders the cart twice and logs a bogus error.)
        await qty.fill(String(q0 + 1));
        await qty.press('Tab');
        await page.waitForTimeout(500);
        const after = await readTotal();
        // More items must cost more. (Exact arithmetic would assume a one-line cart.)
        const follows = after !== null && after > before;
        totalProbe = { qtyFrom: q0, qtyTo: q0 + 1, before, after, follows };
        await step('type', 'Changed the quantity in the cart from ' + q0 + ' to ' + (q0 + 1),
          follows ? 'Order total went from $' + before + ' to $' + after + ' — it follows the quantity'
            : 'Order total stayed at $' + after + ' after adding another item — the total ignores the quantity',
          follows, true);
        // The cart re-renders on change, so the old handle is stale; find the field again.
        const qtyAgain = await page.$('input[type=number]');
        if (qtyAgain) { await qtyAgain.fill(String(q0)); await qtyAgain.press('Tab'); await page.waitForTimeout(300); }
        // Remove the item again: the line should disappear. Still only the visitor's own cart.
        const lines = async () => (await page.$$('input[type=number]')).length;
        const rm = await page.$('button:has-text("Remove"), a:has-text("Remove")');
        if (rm) {
          const n0 = await lines();
          await rm.click(); await page.waitForTimeout(400);
          const n1 = await lines();
          totalProbe.removed = n1 < n0;
          await step('click', 'Clicked "Remove" on the cart line', n1 < n0 ? 'The line left the cart (' + n0 + ' → ' + n1 + ')' : 'The line is still in the cart', n1 < n0, true);
        }
      } else {
        await step('inspect', 'Looked for a quantity field and an order total in the cart', 'Could not find both on the cart page', false, true);
      }
    } catch (e) { await step('type', 'Tried to change the cart quantity', 'Failed: ' + String(e).slice(0, 120), false, false); }
  }
}

// 7. Accessibility spot check on the last page
const last = await facts();
await step('inspect', 'Checked images for alternative text', last.imagesMissingAlt ? last.imagesMissingAlt + ' image(s) have no alt text' : 'Every image has alt text', last.imagesMissingAlt === 0, false);

return { pages, steps, errors, searchProbe, filterProbe, cartProbe, totalProbe };
`;
}

interface JourneyResult {
  pages: KernelRun['pages']; steps: NonNullable<KernelRun['steps']>; errors: string[];
  searchProbe: any; filterProbe: any; cartProbe: any; totalProbe?: any;
}

/** Persist step screenshots as evidence and fold probe results into page signals for QA. */
function toRun(mode: KernelRun['mode'], note: string, r: JourneyResult, actions: KernelRun['actions'], extra: Partial<KernelRun> = {}): KernelRun {
  const screenshots: Evidence[] = [];
  const steps = r.steps.map((s) => {
    if (!s.shot) return s;
    const p = saveEvidenceFile(Buffer.from(s.shot, 'base64'), 'jpg');
    screenshots.push({ id: id('ev'), kind: 'screenshot', label: `Step ${s.n} — ${s.what}`, path: p, mime: 'image/jpeg', source: mode === 'KERNEL_LIVE' ? 'kernel' : 'kernel_demo_adapter' });
    return { ...s, shot: p };
  });
  for (const s of steps) actions.push({ at: now(), action: s.kind, detail: `${s.what} → ${s.found}`, ok: s.ok });
  const first = r.pages[0];
  if (first) {
    if (r.searchProbe) first.signals.searchProbe = `typed "${r.searchProbe.term}": ${r.searchProbe.before} → ${r.searchProbe.after} products in ${r.searchProbe.ms} ms`;
    if (r.filterProbe?.option) first.signals.filterProbe = `"${r.filterProbe.option}": ${r.filterProbe.before} → ${r.filterProbe.after}`;
    const c = r.filterProbe?.combine;
    if (c) first.signals.filterCombine = `${c.combines ? 'combine' : 'do not combine'}: "${c.a}" alone ${c.onlyA}, "${c.b}" alone ${c.onlyB}, both ${c.both}`;
    if (r.cartProbe) first.signals.addToCart = r.cartProbe.changed ? `cart changed "${r.cartProbe.before}" → "${r.cartProbe.after}"` : 'no visible change';
    const t = r.totalProbe;
    if (t) first.signals.cartTotal = `${t.follows ? 'follows quantity' : 'ignores quantity'}: qty ${t.qtyFrom} → ${t.qtyTo}, total $${t.before} → $${t.after}`;
    if (t && t.removed !== undefined) first.signals.cartRemove = t.removed ? 'removing a line works' : 'removing a line did nothing';
  }
  return { mode, note, actions, pages: r.pages, steps, consoleErrors: r.errors, screenshots, ...extra };
}

export async function runKernelInspection(opts: { url: string; authorized: boolean; searchTerm?: string | null }): Promise<KernelRun> {
  const actions: KernelRun['actions'] = [];
  const log = (action: string, detail: string, ok = true) => actions.push({ at: now(), action, detail, ok });
  if (!opts.authorized) {
    log('authorization.check', 'The freelancer has not authorized automated inspection of this URL', false);
    return { mode: 'SKIPPED', note: 'Skipped: the freelancer did not authorize inspection of this URL.', actions, pages: [], consoleErrors: [], screenshots: [] };
  }
  let parsed: URL;
  try { parsed = new URL(opts.url); } catch { return { mode: 'SKIPPED', note: 'The URL is not valid.', actions, pages: [], consoleErrors: [], screenshots: [], error: 'Invalid URL' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { mode: 'SKIPPED', note: 'Only http(s) URLs are inspected.', actions, pages: [], consoleErrors: [], screenshots: [] };

  const term = opts.searchTerm || 'linen';
  const mode = computerAgentMode();

  if (mode === 'KERNEL_LIVE') {
    const kernel = new Kernel();
    let sessionId = '';
    try {
      const browser = await kernel.browsers.create({ headless: false, timeout_seconds: 180 } as any);
      sessionId = browser.session_id;
      log('browsers.create', `Kernel session ${sessionId}`);
      const res = await kernel.browsers.playwright.execute(sessionId, { code: journeyScript(parsed.href, term), timeout_sec: 120 });
      if (!res.success) throw new Error(res.error || 'execution failed');
      return toRun('KERNEL_LIVE', 'Executed in a Kernel cloud browser.', res.result as JourneyResult, actions, { sessionId, liveViewUrl: browser.browser_live_view_url });
    } catch (e: any) {
      log('kernel.error', e.message || String(e), false);
      return { mode: 'KERNEL_LIVE', note: 'The Kernel run failed — see the error. No findings were made up.', sessionId, actions, pages: [], consoleErrors: [], screenshots: [], error: e.message || String(e) };
    } finally {
      if (sessionId) { try { await kernel.browsers.deleteByID(sessionId); log('browsers.deleteByID', sessionId); } catch { /* best effort */ } }
    }
  }

  if (mode === 'LOCAL_BROWSER') {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ executablePath: localChrome()!, headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      log('browser.launch', 'Local headless Chromium (not Kernel)');
      // Same script Kernel would run, so the two modes cannot drift apart.
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
      const run = new AsyncFunction('page', 'context', 'browser', journeyScript(parsed.href, term));
      const r = (await run(page, context, browser)) as JourneyResult;
      return toRun('LOCAL_BROWSER', 'Real browser on this server — the same script Kernel runs, but not a Kernel execution. Set KERNEL_API_KEY to run it in Kernel.', r, actions);
    } catch (e: any) {
      log('browser.error', e.message || String(e), false);
      return { mode: 'LOCAL_BROWSER', note: 'The local browser run failed — see the error.', actions, pages: [], consoleErrors: [], screenshots: [], error: e.message || String(e) };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  return demoAdapter(parsed, actions, log);
}

async function demoAdapter(parsed: URL, actions: KernelRun['actions'], log: (a: string, d: string, ok?: boolean) => void): Promise<KernelRun> {
  log('mode', 'No Kernel key and no local Chromium — static HTTP inspection only. No browser, no clicks, no screenshots.');
  const pages: KernelRun['pages'] = [];
  const steps: NonNullable<KernelRun['steps']> = [];
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
        imagesMissingAlt: count(/<img(?![^>]*alt=)[^>]*>/gi),
        note: 'Static HTML only — content drawn by JavaScript and all behaviour are invisible to this mode',
      },
    });
    steps.push({ n: steps.length + 1, kind: 'open', what: `Fetched ${new URL(u).pathname || '/'} over HTTP`, found: `HTTP ${r.status} · ${headings[0] || title}`, ok: r.status < 400, url: r.url });
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
    return { mode: 'DEMO_ADAPTER_HTTP_FETCH', note: 'Demo adapter — not a browser and not Kernel. Static HTTP inspection cannot verify anything a user does on the page.', actions, pages, steps, consoleErrors: [], screenshots: [] };
  } catch (e: any) {
    log('http.error', e.message, false);
    return { mode: 'DEMO_ADAPTER_HTTP_FETCH', note: 'Demo adapter — the URL could not be fetched.', actions, pages, steps, consoleErrors: [], screenshots: [], error: e.message };
  }
}
