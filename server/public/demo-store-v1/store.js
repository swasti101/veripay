// Inline SVG placeholder: a tinted card with the product name.
function swatch(name, i) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${(i * 47) % 360} 32% 84%)"/><text x="200" y="158" font-family="Georgia, serif" font-size="26" text-anchor="middle" fill="#2b2b2b">${name}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
// DEMO deliverable for the VeriPay walkthrough — a small static storefront.
const PRODUCTS = [
  ['Linen Overshirt', 'tops', 68], ['Merino Crew', 'tops', 89], ['Canvas Chore Jacket', 'outerwear', 145], ['Waxed Field Coat', 'outerwear', 210],
  ['Selvedge Denim', 'bottoms', 120], ['Linen Trousers', 'bottoms', 79], ['Trail Runner', 'shoes', 130], ['Leather Chukka', 'shoes', 165],
  ['Wool Beanie', 'accessories', 25], ['Canvas Tote', 'accessories', 35], ['Oxford Shirt', 'tops', 59], ['Fleece Vest', 'outerwear', 75],
].map(([name, category, price], i) => ({ id: i + 1, name, category, price, stock: i % 5 === 3 ? 0 : 8 - (i % 4), img: swatch(name, i) }));
// Product pictures are drawn locally so the store never depends on a third-party image host
// (an unreachable host would also stall any browser that waits for the network to go quiet).

const cart = {
  get: () => JSON.parse(localStorage.getItem('nw_cart') || '[]'),
  set: (c) => { localStorage.setItem('nw_cart', JSON.stringify(c)); renderCount(); },
};
function renderCount() { const el = document.getElementById('cart-count'); if (el) el.textContent = cart.get().reduce((a, i) => a + i.qty, 0); }
function card(p) {
  return `<article class="product-card" data-product="${p.id}" data-category="${p.category}" data-price="${p.price}"><a href="product.html?id=${p.id}"><img src="${p.img}" alt="${p.name}" loading="lazy"><h3>${p.name}</h3></a><p class="price">$${p.price}</p></article>`;
}
document.addEventListener('DOMContentLoaded', renderCount);
