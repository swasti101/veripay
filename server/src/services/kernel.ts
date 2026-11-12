// Computer agent: uses the submitted website the way a person checking it would —
// opens it, resizes it, follows its navigation, searches, sorts, combines filters, opens a
// product, adds it to the cart, changes the quantity and removes it — screenshot at each step.
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
// Selectors are deliberately generic: hand-written HTML stores and SPA stores (data-test hooks,
// Bootstrap-style cards, search on submit, checkbox filters) are both common deliverables.
const PRODUCT_SEL = '[data-product], .product, .product-card, a.card';
const SEARCH_SEL = 'input[type=search], input[name*=search i], input[placeholder*=search i], input[data-test*=search i], input[id*=search i]';
const QTY_SEL = 'input[type=number], input[data-test*=quantity i], input[name*=qty i], input[name*=quantity i]';
const EMPTY_SRC = 'no (products|results|items|matches)|nothing (matches|found)|0 results';
const facts = async () => page.evaluate((S) => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const visible = (e) => e.offsetParent !== null;
  const cartEl = document.querySelector('[data-test="nav-cart"], [data-test*="cart-quantity"], a[href*="cart" i]')
    || q('a, span').find((e) => /cart/i.test(e.textContent || '') && !/add to/i.test(e.textContent || ''));
  return {
    title: document.title,
    headings: q('h1,h2').map((h) => h.textContent.trim()).filter(Boolean).slice(0, 8),
    viewportMeta: !!document.querySelector('meta[name=viewport]'),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    searchInput: !!document.querySelector(S.search),
    products: q(S.product).filter(visible).length,
    filters: q('select, input[type=checkbox], [data-filter]').length,
    imagesMissingAlt: q('img').filter((i) => !i.getAttribute('alt')).length,
    forms: q('form').length,
    requiredFields: q('input[required], select[required], textarea[required]').length,
    tables: q('table').length,
    cartText: cartEl ? ((cartEl.textContent || '').trim() || 'cart icon') : '',
    cartLink: !!document.querySelector('[data-test="nav-cart"], a[href*="cart" i]'),
  };
}, { product: PRODUCT_SEL, search: SEARCH_SEL });
const visibleProducts = () => page.$$eval(PRODUCT_SEL, (els) => els.filter((e) => e.offsetParent !== null).length);
// What the visitor sees in the product list — used to tell when an SPA has finished re-rendering.
const sig = () => page.$$eval(PRODUCT_SEL, (els) => els.filter((e) => e.offsetParent !== null).map((e) => (e.innerText || '').slice(0, 60)).join('|'));
const settleFrom = async (prev, max) => {
  const t0 = Date.now();
  let cur = await sig();
  while (cur === prev && Date.now() - t0 < max) { await page.waitForTimeout(250); cur = await sig(); }
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(250); const nxt = await sig(); if (nxt === cur) break; cur = nxt; }
  return cur;
};
const cardPrices = () => page.$$eval(PRODUCT_SEL, (els) => els.filter((e) => e.offsetParent !== null).map((e) => {
  const m = (e.innerText || '').match(/\\$\\s*([\\d,]+(?:\\.\\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}).filter((x) => x !== null));
const cardNames = () => page.$$eval(PRODUCT_SEL, (els) => els.filter((e) => e.offsetParent !== null)
  .map((e) => ((e.querySelector('h1,h2,h3,h4,h5,[data-test=product-name],.name,.title') || e).textContent || '').trim()));
const pickTerm = (names) => {
  const count = {};
  for (const nm of names) for (const w of new Set(nm.toLowerCase().match(/[a-z]{4,}/g) || [])) count[w] = (count[w] || 0) + 1;
  const ok = Object.entries(count).filter(([, c]) => c >= 2 && c < names.length).sort((a, b) => b[1] - a[1]);
  return ok.length ? ok[0][0] : null;
};
const money = (x) => '$' + Number(x).toFixed(2);
// Wait for the document, then give the network a bounded chance to go quiet. A slow third-party
// asset (an image CDN, an analytics tag) must not stall or fail the whole inspection.
const quiet = () => page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
const go = async (u) => { const r = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }); await quiet(); return r; };
// A real page load between probes. Hash-routed SPAs keep their state on same-URL navigation,
// so a search left in the box would otherwise leak into the next probe.
const fresh = async (u) => { await page.goto('about:blank'); await go(u); await settleFrom('', 3000); };

// 1. Open at desktop width
await page.setViewportSize({ width: 1440, height: 900 });
const resp = await go(${JSON.stringify(url)});
await settleFrom('', 3000);
const home = await facts();
const pages = [{ url: page.url(), title: home.title, viewport: 'desktop 1440x900', headings: home.headings, signals: { httpStatus: resp ? resp.status() : 0, viewportMeta: home.viewportMeta, searchInput: home.searchInput, productCards: home.products, filterControls: home.filters, imagesMissingAlt: home.imagesMissingAlt, forms: home.forms, cartLink: home.cartLink, tables: home.tables } }];
await step('open', 'Opened the submitted URL at desktop width (1440 px)', (resp ? 'HTTP ' + resp.status() : 'no response') + ' · "' + home.title + '"' + (home.products ? ' · ' + home.products + ' products shown' : ''), !!resp && resp.status() < 400, true);

// 2. Responsive check at phone width
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(400);
const mobile = await facts();
pages.push({ url: page.url(), title: mobile.title, viewport: 'mobile 375x812', headings: mobile.headings, signals: { horizontalOverflow: mobile.overflow, viewportMeta: mobile.viewportMeta } });
await step('resize', 'Resized to a phone (375 px) to check the layout', mobile.overflow ? 'Content overflows horizontally — the page scrolls sideways' : 'No horizontal overflow; layout fits the screen', !mobile.overflow, true);
await page.setViewportSize({ width: 1440, height: 900 });

// 3. Follow the site's own navigation (same-origin, nothing destructive)
const origin = new URL(page.url()).origin;
const links = await page.$$eval('a[href]', (as) => as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50) })));
const seen = new Set([page.url()]);
const targets = [];
for (const l of links) {
  try {
    const u = new URL(l.href);
    if (u.origin !== origin || seen.has(u.href) || FORBIDDEN.test(l.text) || !KEYWORDS.test(u.pathname + u.hash + ' ' + l.text)) continue;
    seen.add(u.href); targets.push(l);
  } catch (e) {}
  if (targets.length >= 3) break;
}
for (const t of targets) {
  try {
    const r = await go(t.href);
    await page.waitForTimeout(600);
    const f = await facts();
    pages.push({ url: page.url(), title: f.title, viewport: 'desktop 1440x900', headings: f.headings, signals: { httpStatus: r ? r.status() : 200, searchInput: f.searchInput, productCards: f.products, filterControls: f.filters, forms: f.forms, requiredFields: f.requiredFields, tables: f.tables, cartLink: f.cartLink, imagesMissingAlt: f.imagesMissingAlt } });
    await step('navigate', 'Followed the "' + (t.text || new URL(t.href).pathname) + '" link', 'HTTP ' + (r ? r.status() : 200) + ' · ' + (f.headings[0] || f.title) + (f.products ? ' · ' + f.products + ' products shown' : '') + (f.requiredFields ? ' · form with ' + f.requiredFields + ' required fields' : ''), !r || r.status() < 400, true);
  } catch (e) { await step('navigate', 'Tried to follow "' + t.text + '"', 'Failed: ' + String(e).slice(0, 120), false, false); }
}
const listUrl = (pages.find((p) => Number(p.signals.productCards) > 0) || pages[0]).url;

// 4. Search: type like a person; if nothing reacts, press Enter (search-on-submit sites)
const searchPage = pages.find((p) => p.signals.searchInput);
let searchProbe = null;
if (searchPage) {
  await fresh(searchPage.url);
  const input = page.locator(SEARCH_SEL).first();
  if (await input.count()) {
    const term = ${JSON.stringify(searchTerm)} || pickTerm(await cardNames()) || 'linen';
    const search = async (text) => {
      const prev = await sig();
      await input.fill(text);
      let cur = await settleFrom(prev, 1200);
      if (cur !== prev) return false;
      await input.press('Enter');
      await settleFrom(prev, 4000);
      return true;
    };
    const before = await visibleProducts();
    const t0 = Date.now();
    const submitted = await search(term);
    const after = await visibleProducts();
    const ms = Date.now() - t0;
    const empty = await page.$eval('body', (b, re) => new RegExp(re, 'i').test(b.innerText), EMPTY_SRC);
    const narrowed = after < before || (after === 0 && empty);
    searchProbe = { term, before, after, ms, submitted, narrowed };
    await step('type', 'Typed "' + term + '" into the search box' + (submitted ? ' and pressed Enter' : ''), before + ' products narrowed to ' + after + (after === 0 && empty ? ' (empty-state message shown)' : ''), narrowed, true);
    // A term that cannot match, to see the empty state
    await search('zzqx-no-such-item');
    const none = await visibleProducts();
    const emptyMsg = await page.$eval('body', (b, re) => new RegExp(re, 'i').test(b.innerText), EMPTY_SRC);
    await step('type', 'Typed a term that cannot match anything', none === 0 ? (emptyMsg ? 'No results, and an empty-state message is shown' : 'No results, but no message tells the user why') : none + ' products still visible', none === 0 && emptyMsg, true);
  }
}

// 5. Sorting and filters
const filterPage = pages.find((p) => Number(p.signals.filterControls) > 0 && Number(p.signals.productCards) > 0) || pages.find((p) => p.signals.filterControls);
let filterProbe = null, sortProbe = null;
if (filterPage) {
  await fresh(filterPage.url);
  const selects = await page.$$eval('select', (ss) => ss.map((s, i) => ({ i,
    sort: /sort|order/i.test([s.id, s.name, s.getAttribute('data-test'), s.getAttribute('aria-label')].join(' ')) || Array.from(s.options).some((o) => /low\\s*-\\s*high|high\\s*-\\s*low|a\\s*-\\s*z|ascending|descending/i.test(o.textContent)),
    opts: Array.from(s.options).map((o) => ({ v: o.value, t: o.textContent.trim() })) })));
  const selAt = (i) => page.locator('select').nth(i);

  // 5a. Sort by price, low to high: are the prices then in ascending order?
  const sortSel = selects.find((s) => s.sort);
  const asc = sortSel && sortSel.opts.find((o) => /price/i.test(o.t) && /low\\s*(-|–|to)\\s*high|ascending|lowest/i.test(o.t));
  if (asc) {
    const prev = await sig();
    await selAt(sortSel.i).selectOption(asc.v);
    await settleFrom(prev, 4000);
    const prices = await cardPrices();
    if (prices.length >= 3) {
      const ascending = prices.every((x, i) => !i || prices[i - 1] <= x);
      sortProbe = { option: asc.t, prices: prices.slice(0, 6), ascending };
      await step('select', 'Sorted by "' + asc.t + '"', 'Prices in order: ' + prices.slice(0, 6).map(money).join(', ') + (ascending ? ' — cheapest first' : ' — not cheapest first, so the sort is wrong'), ascending, true);
    }
    const p2 = await sig();
    await selAt(sortSel.i).selectOption(sortSel.opts[0].v);
    await settleFrom(p2, 3000);
  }

  // Filters as groups: each non-sort <select>, and each family of checkboxes (category-*, brand-*, ...).
  const groups = selects.filter((s) => !s.sort).map((s) => ({ key: 'select ' + s.i, items: s.opts.filter((o) => o.v).slice(0, 3).map((o) => ({
    label: o.t, on: () => selAt(s.i).selectOption(o.v), off: () => selAt(s.i).selectOption(s.opts[0].v) })) }));
  const boxes = await page.$$eval('input[type=checkbox]', (els) => els.map((e, i) => ({ i,
    key: (e.getAttribute('data-test') || '').split('-')[0] || e.name || '',
    label: ((e.closest('label') || e.parentElement || {}).textContent || '').trim().slice(0, 40) })));
  const fam = {};
  for (const b of boxes) if (b.key && b.label) (fam[b.key] = fam[b.key] || []).push(b);
  for (const [key, list] of Object.entries(fam)) if (list.length >= 2) groups.push({ key, items: list.slice(0, 3).map((b) => ({
    label: b.label, on: () => page.locator('input[type=checkbox]').nth(b.i).check(), off: () => page.locator('input[type=checkbox]').nth(b.i).uncheck() })) });

  const apply = async (fn) => { const prev = await sig(); await fn(); const cur = await settleFrom(prev, 3500); return { count: await visibleProducts(), changed: cur !== prev }; };
  // Pick, within a group, the first option that visibly changes the list on its own.
  const pick = async (g, base) => {
    for (const it of g.items) {
      const r = await apply(it.on);
      if (r.changed || r.count !== base) return { it, ...r };
      await apply(it.off);
    }
    const it = g.items[0]; const r = await apply(it.on);
    return { it, ...r };
  };
  if (groups.length) {
    const before = await visibleProducts();
    const a = await pick(groups[0], before);
    filterProbe = { option: a.it.label, before, after: a.count, changed: a.changed || a.count !== before };
    await step('select', 'Chose "' + a.it.label + '" in a filter', before + ' products became ' + a.count + (a.changed && a.count === before ? ' (different products)' : ''), filterProbe.changed, true);
    // Do two filters combine? Together they can never show more than either does alone.
    if (groups.length >= 2) {
      await apply(a.it.off);
      const b = await pick(groups[1], before);
      const both = (await apply(a.it.on)).count;
      const combines = both <= Math.min(a.count, b.count);
      filterProbe.combine = { a: a.it.label, b: b.it.label, onlyA: a.count, onlyB: b.count, both, combines };
      await step('select', 'Combined two filters: "' + a.it.label + '" and "' + b.it.label + '"',
        combines
          ? 'Alone they show ' + a.count + ' and ' + b.count + '; together ' + both + ' — the filters narrow each other'
          : 'Alone they show ' + a.count + ' and ' + b.count + ', but together ' + both + ' — more than either alone, so one filter is being ignored',
        combines, true);
      await apply(b.it.off);
    }
    await apply(a.it.off);
  }
}

// 6. Open a product and add it to the cart (cart state only — no money, no order).
// Click what a person clicks — the picture or the title. Locators re-resolve, so an SPA that
// re-renders the list between steps does not leave us holding a detached element.
let cartProbe = null;
const PRODUCT_CLICK = '[data-product] a img, .product-card a img, a.card img, [data-product] a h3, .product-card a h3, a[href*="product"] img, [data-product] a, .product-card a, a.card';
for (let k = 0; k < 3 && !cartProbe; k++) {
  try {
    await fresh(listUrl);
    const link = page.locator(PRODUCT_CLICK).nth(k);
    if (!(await link.count())) break;
    const from = page.url();
    await Promise.all([page.waitForURL((u) => u.toString() !== from, { timeout: 10000 }), link.click()]);
    await quiet();
    const btn = page.locator('button:has-text("Add to cart"), button:has-text("Add to bag")').first();
    await btn.waitFor({ timeout: 6000 }).catch(() => {});
    const f = await facts();
    pages.push({ url: page.url(), title: f.title, viewport: 'desktop 1440x900', headings: f.headings, signals: { httpStatus: 200, productDetail: true, imagesMissingAlt: f.imagesMissingAlt } });
    await step('click', 'Clicked a product to open its detail page', (f.headings[0] || f.title) + ' · ' + page.url().replace(origin, ''), true, true);
    if (!(await btn.count()) || (await btn.isDisabled())) {
      await step('inspect', 'Looked for an "Add to cart" button', (await btn.count()) ? 'Button present but disabled (item may be out of stock) — trying another product' : 'No add-to-cart button on this page', false, false);
      if (!(await btn.count())) break;
      continue;
    }
    const cartBefore = (await facts()).cartText.replace(/\\s+/g, ' ').trim();
    await btn.click();
    let cartAfter = cartBefore;
    for (let i = 0; i < 12 && cartAfter === cartBefore; i++) { await page.waitForTimeout(250); cartAfter = (await facts()).cartText.replace(/\\s+/g, ' ').trim(); }
    cartProbe = { before: cartBefore || '(no cart indicator)', after: cartAfter || '(no cart indicator)', changed: cartBefore !== cartAfter };
    await step('click', 'Clicked "Add to cart"', cartProbe.changed ? 'Cart indicator changed from "' + cartProbe.before + '" to "' + cartProbe.after + '"' : 'Nothing visibly changed after clicking', cartProbe.changed, true);
  } catch (e) { await step('click', 'Tried to open a product', 'Failed: ' + String(e).slice(0, 120), false, false); break; }
}

// 6b. In the cart: change the quantity, then check the line price and the order total.
// This only edits the visitor's own cart; nothing is ordered or paid.
let totalProbe = null;
if (cartProbe && cartProbe.changed) {
  const cartLink = page.locator('[data-test="nav-cart"], a[href*="cart" i]').first();
  if (await cartLink.count()) {
    try {
      const from = page.url();
      await Promise.all([page.waitForURL((u) => u.toString() !== from, { timeout: 10000 }).catch(() => {}), cartLink.click()]);
      await quiet();
      const qty = page.locator(QTY_SEL).first();
      await qty.waitFor({ timeout: 8000 }).catch(() => {});
      const cf = await facts();
      pages.push({ url: page.url(), title: cf.title, viewport: 'desktop 1440x900', headings: cf.headings, signals: { httpStatus: 200, cartPage: true, tables: cf.tables } });
      const readTotal = () => page.evaluate(() => {
        const el = document.querySelector('[data-test*="cart-total" i], [data-test*="order-total" i], #total, .cart-total, .order-total');
        const txt = el ? el.textContent : ((document.body.innerText.match(/total[^$\\n]*\\$\\s*[\\d,.]+/i) || [''])[0]);
        const m = (txt || '').match(/\\$\\s*([\\d,]+(?:\\.\\d+)?)/);
        return m ? Number(m[1].replace(/,/g, '')) : null;
      });
      const readLine = () => qty.evaluate((el) => {
        const row = el.closest('tr, li, [class*=item i], [class*=line i]') || el.parentElement;
        return ((row && row.innerText) || '').match(/\\$\\s*[\\d,]+(?:\\.\\d+)?/g)?.map((m) => Number(m.replace(/[^\\d.]/g, ''))) || [];
      }).catch(() => []);
      const before = await readTotal();
      if ((await qty.count()) && before !== null) {
        const q0 = Number(await qty.inputValue()) || 1;
        const lineBefore = await readLine();
        // Type and Tab away, as a person would: the browser fires one native change event.
        await qty.fill(String(q0 + 1));
        await qty.press('Tab');
        let after = before;
        for (let i = 0; i < 14 && after === before; i++) { await page.waitForTimeout(250); after = await readTotal(); }
        await page.waitForTimeout(300);
        const lineAfter = await readLine();
        // More items must cost more. (Exact arithmetic would assume a one-line cart.)
        const follows = after !== null && after > before;
        const unit = lineBefore.length ? Math.max(...lineBefore) / q0 : null;
        const expected = unit !== null ? Math.round(unit * (q0 + 1) * 100) / 100 : null;
        const lineFollows = expected === null ? null : lineAfter.some((x) => Math.abs(x - expected) < 0.011);
        totalProbe = { qtyFrom: q0, qtyTo: q0 + 1, before, after, follows, lineBefore, lineAfter, expectedLine: expected, lineFollows };
        await step('type', 'Changed the quantity in the cart from ' + q0 + ' to ' + (q0 + 1),
          follows ? 'Order total went from ' + money(before) + ' to ' + money(after) + ' — it follows the quantity'
            : 'Order total stayed at ' + money(after) + ' after adding another item — the total ignores the quantity',
          follows, true);
        if (lineFollows !== null) {
          await step('inspect', 'Checked the line price for that item',
            lineFollows ? 'The line shows ' + money(expected) + ' for ' + (q0 + 1) + ' — price × quantity'
              : 'The line shows ' + (lineAfter.map(money).join(' and ') || 'no price') + ' for ' + (q0 + 1) + '; expected a line total of ' + money(expected),
            lineFollows, !lineFollows);
        }
        await qty.fill(String(q0)); await qty.press('Tab');
        await page.waitForTimeout(800);
        // Remove the item again: the line should leave the cart.
        const marked = await qty.evaluate((el) => {
          const row = el.closest('tr, li, [class*=item i], [class*=line i]');
          const c = row ? Array.from(row.querySelectorAll('button, a')) : [];
          const b = c.find((x) => /remove|delete|trash|danger|×|✕/i.test([x.textContent, x.getAttribute('aria-label'), x.getAttribute('data-test'), x.className, x.innerHTML.slice(0, 300)].join(' ')));
          if (b) b.setAttribute('data-vp-remove', '1');
          return !!b;
        }).catch(() => false);
        if (marked) {
          const n0 = await page.locator(QTY_SEL).count();
          await page.locator('[data-vp-remove]').first().click();
          let n1 = n0;
          for (let i = 0; i < 12 && n1 >= n0; i++) { await page.waitForTimeout(250); n1 = await page.locator(QTY_SEL).count(); }
          totalProbe.removed = n1 < n0;
          await step('click', 'Clicked "Remove" on the cart line', n1 < n0 ? 'The line left the cart (' + n0 + ' → ' + n1 + ')' : 'The line is still in the cart', n1 < n0, true);
        }
      } else {
        await step('inspect', 'Looked for a quantity field and an order total in the cart', 'Could not find both on the cart page', false, true);
      }
    } catch (e) { await step('type', 'Tried to change the cart quantity', 'Failed: ' + String(e).slice(0, 120), false, false); }
  }
}

// 7. Accessibility: images without alternative text, on every page visited
const altPages = pages.filter((p) => Number(p.signals.imagesMissingAlt) > 0);
const altMissing = altPages.reduce((m, p) => Math.max(m, Number(p.signals.imagesMissingAlt)), 0);
const altProbe = { missing: altMissing, url: altPages[0] ? altPages[0].url : null, pagesChecked: pages.length };
await step('inspect', 'Checked images for alternative text on the pages visited', altMissing ? altMissing + ' image(s) have no alt text (' + altProbe.url.replace(origin, '') + ')' : 'Every image has alt text', altMissing === 0, false);

return { pages, steps, errors, searchProbe, filterProbe, sortProbe, cartProbe, totalProbe, altProbe };
`;
}

interface JourneyResult {
  pages: KernelRun['pages']; steps: NonNullable<KernelRun['steps']>; errors: string[];
  searchProbe: any; filterProbe: any; cartProbe: any; totalProbe?: any; sortProbe?: any; altProbe?: any;
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
    if (r.searchProbe) first.signals.searchProbe = `${r.searchProbe.narrowed === false ? 'did not narrow' : 'narrowed'}: typed "${r.searchProbe.term}"${r.searchProbe.submitted ? ' + Enter' : ''}: ${r.searchProbe.before} → ${r.searchProbe.after} products in ${r.searchProbe.ms} ms`;
    const so = r.sortProbe;
    if (so) first.signals.sortPrice = `${so.ascending ? 'cheapest first' : 'not cheapest first'}: "${so.option}" → ${so.prices.map((x: number) => '$' + x.toFixed(2)).join(', ')}`;
    const al = r.altProbe;
    if (al) first.signals.altText = al.missing ? `missing: ${al.missing} image(s) without alt text on ${al.url}` : `complete: every image on ${al.pagesChecked} page(s) visited has alt text`;
    if (r.filterProbe?.option) first.signals.filterProbe = `${r.filterProbe.changed === false ? 'unchanged' : 'changed'}: "${r.filterProbe.option}": ${r.filterProbe.before} → ${r.filterProbe.after}`;
    const c = r.filterProbe?.combine;
    if (c) first.signals.filterCombine = `${c.combines ? 'combine' : 'do not combine'}: "${c.a}" alone ${c.onlyA}, "${c.b}" alone ${c.onlyB}, both ${c.both}`;
    if (r.cartProbe) first.signals.addToCart = r.cartProbe.changed ? `cart changed "${r.cartProbe.before}" → "${r.cartProbe.after}"` : 'no visible change';
    const t = r.totalProbe;
    if (t) first.signals.cartTotal = `${t.follows ? 'follows quantity' : 'ignores quantity'}: qty ${t.qtyFrom} → ${t.qtyTo}, total $${t.before} → $${t.after}`;
    if (t && t.lineFollows !== null && t.lineFollows !== undefined) first.signals.cartLine = `${t.lineFollows ? 'follows quantity' : 'ignores quantity'}: at qty ${t.qtyTo} the line shows ${t.lineAfter.map((x: number) => '$' + x.toFixed(2)).join(' / ') || 'no price'}, expected $${Number(t.expectedLine).toFixed(2)}`;
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

  // No term given: the journey picks a word shared by several product names on the page.
  const term = opts.searchTerm || '';
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
