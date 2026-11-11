// DEMO deliverable for the VeriPay walkthrough — a small static storefront.
const PRODUCTS = [
  ['Linen Overshirt', 'tops', 68], ['Merino Crew', 'tops', 89], ['Canvas Chore Jacket', 'outerwear', 145], ['Waxed Field Coat', 'outerwear', 210],
  ['Selvedge Denim', 'bottoms', 120], ['Linen Trousers', 'bottoms', 79], ['Trail Runner', 'shoes', 130], ['Leather Chukka', 'shoes', 165],
  ['Wool Beanie', 'accessories', 25], ['Canvas Tote', 'accessories', 35], ['Oxford Shirt', 'tops', 59], ['Fleece Vest', 'outerwear', 75],
].map(([name, category, price], i) => ({ id: i + 1, name, category, price, stock: i % 5 === 3 ? 0 : 8 - (i % 4), img: `https://picsum.photos/seed/nw${i + 1}/400/300` }));

const cart = {
  get: () => JSON.parse(localStorage.getItem('nw_cart') || '[]'),
  set: (c) => { localStorage.setItem('nw_cart', JSON.stringify(c)); renderCount(); },
};
function renderCount() { const el = document.getElementById('cart-count'); if (el) el.textContent = cart.get().reduce((a, i) => a + i.qty, 0); }
function card(p) {
  return `<article class="product-card" data-product="${p.id}" data-category="${p.category}" data-price="${p.price}"><a href="product.html?id=${p.id}"><img src="${p.img}" alt="${p.name}" loading="lazy"><h3>${p.name}</h3></a><p class="price">$${p.price}</p></article>`;
}
document.addEventListener('DOMContentLoaded', renderCount);
