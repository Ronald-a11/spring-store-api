// The shop page: hero, product catalogue, cart drawer and checkout.
import {
  $, el, icon, spinner, toast, dismissToasts, busy, flash, fmtMoney, plural, productImage, emptyState, openDialog, closeDialog,
  wireDialog,
} from './ui.js';
import {
  api, ApiError, showError, storage, session, onSessionChange, initPage, showBanner, setCartCount, countItems,
  STORAGE_CART, UUID_RE,
} from './common.js';

// Fallback names for when GET /categories fails (same ids and names as the seed data).
const CATEGORY_NAMES = {
  1: 'Produce',
  2: 'Dairy',
  3: 'Bakery',
  4: 'Meat & Seafood',
  5: 'Pantry Staples',
  6: 'Beverages',
};

// Shown only for the 500 that POST /checkout returns when Stripe is not configured.
const PAYMENT_UNAVAILABLE = 'Checkout is unavailable because Stripe is not configured on this demo. The order was not created.';
const WAKE_UP_AFTER_MS = 2000; // show "Waking up the server" if the first request takes longer than this
const QTY_DEBOUNCE_MS = 300;   // typing in the cart quantity box waits this long before PUT /carts/{id}/items/{productId}
const QTY_MAX = 1000;          // UpdateCartItemRequest: @Min(1) @Max(1000)
const LOW_STOCK = 5;           // product cards say "Only N left" at or below this

const SORTS = {
  featured: null,
  'price-asc': (a, b) => Number(a.price) - Number(b.price),
  'price-desc': (a, b) => Number(b.price) - Number(a.price),
  name: (a, b) => String(a.name).localeCompare(String(b.name)),
};

const state = {
  products: [],
  productsLoaded: false, // true once GET /products answered: an empty catalogue then reads "No products yet"
  categories: null,      // [{id, name}] from GET /categories, or null when that request failed (seed map fallback)
  search: '',
  categoryId: null, // null = all categories
  sort: 'featured',
  cartId: null,     // UUID from POST /carts, or null until the first "Add to cart"
  cart: null,       // {id, items: [{product, quantity, totalPrice}], totalPrice} or null
};

function categoryName(id) {
  const known = state.categories && state.categories.find((c) => c.id === id);
  return known ? known.name : (CATEGORY_NAMES[id] || `Category ${id}`);
}

const productById = (id) => state.products.find((p) => p.id === id) || null;

/** GET /categories -> [{id, name}] (ordered by id); anything malformed is dropped, a failed request leaves null. */
async function loadCategories() {
  try {
    const list = await api('GET', '/categories');
    return Array.isArray(list)
      ? list.filter((c) => c && Number.isInteger(Number(c.id)) && typeof c.name === 'string')
        .map((c) => ({ id: Number(c.id), name: c.name }))
      : null;
  } catch {
    return null; // the seed map in CATEGORY_NAMES names the categories instead
  }
}

function showProductsStatus(content) {
  $('products-status').replaceChildren(content || '');
}

async function loadProducts() {
  showProductsStatus(null);
  // Free hosting puts an idle server to sleep; the first request can take a while.
  const wakeTimer = setTimeout(() => showProductsStatus(el('div', {
    class: 'mt-6 flex animate-fade-in items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-600/20 ring-inset',
  }, spinner('text-amber-600'), 'Waking up the server. This can take up to a minute on a sleeping demo host.')), WAKE_UP_AFTER_MS);
  const categories = loadCategories();
  try {
    state.products = await api('GET', '/products');
    state.productsLoaded = true;
    state.categories = await categories;
    showProductsStatus(null);
    renderCatalogue(true);
    renderCart();
  } catch (err) {
    showProductsStatus(null);
    const reason = err instanceof ApiError ? err.message : 'The server could not be reached.';
    $('categories').replaceChildren();
    $('product-grid').setAttribute('aria-busy', 'false');
    $('product-grid').replaceChildren(el('div', { class: 'col-span-full card' }, emptyState({
      icon: 'alert-circle',
      tone: 'bg-red-50 text-red-500',
      title: 'We could not load the products',
      text: reason,
      action: el('button', { type: 'button', class: 'btn btn-secondary', onclick: (event) => busy(event.currentTarget, loadProducts) },
        icon('refresh'), 'Try again'),
    })));
  } finally {
    clearTimeout(wakeTimer);
  }
}

/** Reloads the catalogue quietly after the stock may have changed; on failure the page keeps what it has. */
async function refreshProducts() {
  try {
    state.products = await api('GET', '/products');
  } catch {
    return;
  }
  renderCatalogue(false);
  renderCart();
}

/** Categories from GET /categories, plus any category id the products use that the list does not have. */
function categoryList() {
  const list = state.categories ? state.categories.map((c) => ({ id: c.id, name: c.name })) : [];
  for (const id of new Set(state.products.map((p) => p.categoryId))) {
    if (!list.some((c) => c.id === id)) list.push({ id, name: categoryName(id) });
  }
  return list.sort((a, b) => a.id - b.id);
}

function renderCatalogue(animate) {
  renderHero();
  renderCategories();
  renderProducts(animate);
}

function renderHero() {
  const setStat = (id, value) => $(id).replaceChildren(el('span', { class: 'inline-block animate-fade-in' }, String(value)));
  setStat('stat-products', state.products.length);
  setStat('stat-categories', categoryList().length);
  setStat('stat-in-stock', state.products.filter((p) => p.stock > 0).length);

  const picks = state.products.filter((p) => p.stock > 0).slice(0, 3);
  $('hero-picks').replaceChildren(...(picks.length
    ? picks.map((product, i) => el('li', { class: 'flex animate-fade-up items-center gap-3 py-3.5', style: `--i: ${i}` },
      productImage(product, 'size-12 rounded-xl text-base'),
      el('div', { class: 'min-w-0 flex-1' },
        el('p', { class: 'truncate text-sm font-semibold text-stone-900' }, product.name),
        el('p', { class: 'text-xs text-stone-500' }, categoryName(product.categoryId))),
      el('p', { class: 'text-sm font-bold text-stone-900' }, fmtMoney(product.price))))
    : [el('li', { class: 'py-8 text-center text-sm text-stone-500' }, 'New products are on their way.')]));
}

function renderCategories() {
  const categories = categoryList();
  // The selected category can disappear (an admin deleted its last product): fall back to "All".
  if (state.categoryId !== null && !categories.some((c) => c.id === state.categoryId)) state.categoryId = null;
  const count = (id) => state.products.filter((p) => id === null || p.categoryId === id).length;
  const chip = (id, label) => el('button', {
    type: 'button',
    class: 'chip',
    'aria-pressed': String(state.categoryId === id),
    onclick: () => {
      state.categoryId = id;
      renderCategories();
      renderProducts(true);
    },
  }, label, el('span', { class: 'chip-count' }, String(count(id))));
  $('categories').replaceChildren(chip(null, 'All'), ...categories.map((c) => chip(c.id, c.name)));
}

function visibleProducts() {
  const products = state.products.filter((p) =>
    (state.categoryId === null || p.categoryId === state.categoryId)
    && (!state.search || String(p.name).toLowerCase().includes(state.search)));
  const compare = SORTS[state.sort];
  return compare ? products.sort(compare) : products;
}

function renderProductCount(visible, total) {
  const text = visible === total ? plural(total, 'product') : `${visible} of ${plural(total, 'product')}`;
  $('product-count').textContent = state.productsLoaded ? text : '';
}

function clearFilters() {
  state.search = '';
  state.categoryId = null;
  $('search').value = '';
  renderCategories();
  renderProducts(true);
}

function renderProducts(animate) {
  const grid = $('product-grid');
  const products = visibleProducts();
  renderProductCount(products.length, state.products.length);
  grid.setAttribute('aria-busy', 'false');
  if (!products.length) {
    grid.replaceChildren(el('div', { class: 'col-span-full card' }, state.products.length
      ? emptyState({
        icon: 'search',
        title: 'No products match',
        text: 'Try a different search or pick another category.',
        action: el('button', { type: 'button', class: 'btn btn-secondary', onclick: clearFilters }, 'Clear filters'),
      })
      : emptyState({ icon: 'bag', title: 'No products yet', text: 'New products will show up here as soon as they are added.' })));
    return;
  }
  grid.replaceChildren(...products.map((product, i) => productCard(product, animate ? i : null)));
}

function stockBadge(stock) {
  if (stock <= 0) return el('span', { class: 'badge badge-gray absolute top-3 right-3 bg-white/95' }, 'Sold out');
  if (stock <= LOW_STOCK) return el('span', { class: 'badge badge-amber absolute top-3 right-3' }, `Only ${stock} left`);
  return null;
}

function productCard(product, index) {
  const soldOut = product.stock <= 0;
  const addButton = el('button', {
    type: 'button',
    class: 'btn btn-primary btn-sm',
    disabled: soldOut,
    'aria-label': soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`,
  }, soldOut ? 'Sold out' : [icon('plus'), 'Add']);
  addButton.addEventListener('click', async () => {
    const added = await busy(addButton, () => addToCart(product).then(() => true, (err) => {
      showCartError(err);
      return false;
    }));
    if (added && addButton.isConnected) flash(addButton, 'Added');
  });

  return el('article', {
    class: `group flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-stone-200/80 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-stone-900/[0.06] ${index === null ? '' : 'animate-fade-up'}`,
    style: index === null ? null : `--i: ${index}`,
  },
  el('div', { class: 'relative aspect-[4/3] overflow-hidden bg-stone-100' },
    productImage(product, `size-full text-5xl transition duration-500 group-hover:scale-105 ${soldOut ? 'opacity-60 grayscale' : ''}`),
    el('span', { class: 'badge absolute top-3 left-3 bg-white/90 text-stone-700 ring-stone-900/5 backdrop-blur' }, categoryName(product.categoryId)),
    stockBadge(product.stock)),
  el('div', { class: 'flex flex-1 flex-col p-4' },
    el('h3', { class: 'line-clamp-1 font-semibold text-stone-900', title: product.name }, product.name),
    el('p', { class: 'mt-1 line-clamp-2 flex-1 text-sm text-stone-500' }, product.description),
    el('div', { class: 'mt-4 flex flex-wrap items-center justify-between gap-2' },
      el('p', { class: 'text-lg font-bold tracking-tight text-stone-900' }, fmtMoney(product.price)),
      addButton)));
}

/** Shows a cart or checkout error. A 400 there usually means the stock changed, so the catalogue is reloaded. */
function showCartError(err) {
  showError(err);
  if (err instanceof ApiError && err.status === 400) refreshProducts();
}

function forgetCart() {
  state.cartId = null;
  state.cart = null;
  storage.remove(STORAGE_CART);
}

/** True when the stored cart id is unusable: an unknown cart (404) or a value that is not a UUID (400). */
function isStaleCartError(err) {
  return err instanceof ApiError
    && (err.status === 404 || (err.status === 400 && Boolean(err.data) && err.data.error === 'Invalid request parameter.'));
}

let cartCreation = null; // the in-flight POST /carts, shared so two quick first adds do not create two carts
let cartLoadSeq = 0;     // loadCart() drops an answer that arrives after a newer load was started

/** Returns the cart id, creating the cart on the server the first time it is needed. */
async function ensureCart() {
  if (state.cartId) return state.cartId;
  if (!cartCreation) {
    cartCreation = api('POST', '/carts').then((cart) => {
      state.cartId = cart.id;
      state.cart = cart;
      storage.set(STORAGE_CART, cart.id);
      return cart.id;
    }).finally(() => { cartCreation = null; });
  }
  return cartCreation;
}

/** Calls /carts/{id}{subPath}; a 404 (or a 400 for a non-UUID id) means the stored id is stale, so it is dropped. */
async function cartCall(method, subPath, body) {
  const id = await ensureCart();
  try {
    return await api(method, `/carts/${id}${subPath}`, body);
  } catch (err) {
    if (isStaleCartError(err)) forgetCart();
    throw err;
  }
}

async function loadCart() {
  if (!state.cartId) { state.cart = null; renderCart(); return; }
  const seq = ++cartLoadSeq;
  try {
    const cart = await api('GET', `/carts/${state.cartId}`);
    if (seq !== cartLoadSeq) return; // a newer load answered first: keep it, do not render this older cart
    state.cart = cart;
  } catch (err) {
    if (seq !== cartLoadSeq) return;
    if (isStaleCartError(err)) forgetCart(); // stale id: a new cart is created on the next add
    else showError(err);
  }
  renderCart();
}

async function addToCart(product) {
  try {
    await cartCall('POST', '/items', { productId: product.id });
  } catch (err) {
    if (!(err instanceof ApiError) || state.cartId) throw err;
    await cartCall('POST', '/items', { productId: product.id }); // the stale cart was dropped: retry once on a fresh one
  }
  await loadCart();
  toast(`${product.name} added to your cart.`, 'success', { label: 'View cart', onClick: openCart });
}

async function setQuantity(productId, quantity) {
  if (quantity < 1) return removeItem(productId);
  await cartCall('PUT', `/items/${productId}`, { quantity: Math.min(quantity, QTY_MAX) });
  await loadCart();
}

// The quantity box commits after a short pause in typing, or right away when it loses focus.
const qtyTimers = new Map(); // productId -> pending timer, so fast typing ends in one PUT per line

function clampQuantity(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), QTY_MAX) : 1;
}

function commitQuantity(input, product, current) {
  clearTimeout(qtyTimers.get(product.id));
  qtyTimers.delete(product.id);
  if (input.value.trim() === '') { input.value = String(current); return; } // emptied and left: back to what the cart has
  const wanted = clampQuantity(input.value);
  input.value = String(wanted);
  if (wanted === current) return;
  input.setAttribute('aria-busy', 'true');
  setQuantity(product.id, wanted)
    .catch((err) => { showCartError(err); input.value = String(current); })
    .finally(() => input.removeAttribute('aria-busy'));
}

function quantityInput(product, current, max) {
  const input = el('input', {
    type: 'number', class: 'qty-input aria-busy:opacity-50', min: 1, max, step: 1, inputmode: 'numeric',
    value: current, 'data-product-id': product.id, 'aria-label': `Quantity of ${product.name}`,
  });
  input.addEventListener('input', () => {
    if (input.value.trim() === '') return; // mid-edit: wait for a number
    clearTimeout(qtyTimers.get(product.id));
    qtyTimers.set(product.id, setTimeout(() => commitQuantity(input, product, current), QTY_DEBOUNCE_MS));
  });
  input.addEventListener('change', () => commitQuantity(input, product, current));
  return input;
}

async function removeItem(productId) {
  await cartCall('DELETE', `/items/${productId}`);
  await loadCart();
}

async function clearCart() {
  if (!state.cartId) return;
  await cartCall('DELETE', '/items');
  await loadCart();
  toast('Cart cleared.');
}

let shownCartCount = null;         // units shown on the header badge; it bumps when the number grows
let renderedLines = new Set();     // product ids already in the drawer, so only new lines animate in

function cartLine(item) {
  const product = item.product || {};
  const listed = productById(product.id);
  const stock = listed ? listed.stock : null;
  const max = stock === null ? QTY_MAX : Math.min(QTY_MAX, stock);
  const stepClass = 'grid size-8 place-items-center text-stone-500 transition hover:text-stone-900 disabled:opacity-30';
  const minus = el('button', { type: 'button', class: stepClass, 'aria-label': `Remove one ${product.name}` }, icon('minus', 'size-4'));
  const plus = el('button', { type: 'button', class: stepClass, 'aria-label': `Add one ${product.name}`, disabled: item.quantity >= max }, icon('plus', 'size-4'));
  const remove = el('button', { type: 'button', class: 'btn-icon size-8 text-stone-400 hover:bg-red-50 hover:text-red-600', 'aria-label': `Remove ${product.name}` }, icon('trash', 'size-4'));
  minus.addEventListener('click', () => busy(minus, () => setQuantity(product.id, item.quantity - 1).catch(showCartError)));
  plus.addEventListener('click', () => busy(plus, () => setQuantity(product.id, item.quantity + 1).catch(showCartError)));
  remove.addEventListener('click', () => busy(remove, () => removeItem(product.id).catch(showError)));

  return el('li', { class: `flex gap-4 py-4 ${renderedLines.has(product.id) ? '' : 'animate-fade-in'}` },
    productImage({ ...product, categoryId: listed && listed.categoryId, imageUrl: listed && listed.imageUrl }, 'size-18 shrink-0 rounded-xl text-xl'),
    el('div', { class: 'flex min-w-0 flex-1 flex-col' },
      el('div', { class: 'flex items-start justify-between gap-3' },
        el('div', { class: 'min-w-0' },
          el('p', { class: 'truncate text-sm font-semibold text-stone-900' }, product.name),
          el('p', { class: 'mt-0.5 text-xs text-stone-500' }, `${fmtMoney(product.price)} each`)),
        el('p', { class: 'text-sm font-bold text-stone-900' }, fmtMoney(item.totalPrice))),
      stock !== null && item.quantity > stock
        ? el('p', { class: 'mt-1 text-xs font-semibold text-amber-700' }, stock <= 0 ? 'Out of stock' : `Only ${stock} left`)
        : null,
      el('div', { class: 'mt-auto flex items-center justify-between pt-2' },
        el('div', { class: 'inline-flex items-center rounded-lg bg-white ring-1 ring-stone-300 focus-within:ring-2 focus-within:ring-brand-600' },
          minus, quantityInput(product, item.quantity, max), plus),
        remove)));
}

function renderCart() {
  const items = (state.cart && state.cart.items) || [];
  const count = countItems(state.cart);
  setCartCount(count, shownCartCount !== null && count > shownCartCount);
  shownCartCount = count;
  $('cart-summary').textContent = count ? plural(count, 'item') : 'No items yet';

  const list = $('cart-items');
  // The list is rebuilt from scratch; a quantity box being typed in keeps the focus on its replacement.
  const active = document.activeElement;
  const editing = active && active.classList && active.classList.contains('qty-input') ? active : null;
  const focusedProductId = editing ? editing.dataset.productId : null;
  const typed = editing ? editing.value : null;
  list.replaceChildren(...items.map(cartLine));
  renderedLines = new Set(items.map((item) => item.product && item.product.id));
  if (focusedProductId !== null) {
    for (const input of list.querySelectorAll('input.qty-input')) {
      if (input.dataset.productId === focusedProductId) {
        // Keep a value that is still being typed when the cart re-renders.
        const fromServer = input.value;
        input.focus({ preventScroll: true });
        input.value = '';
        input.value = typed;
        if (typed !== fromServer) input.dispatchEvent(new Event('input'));
        break;
      }
    }
  }
  $('cart-empty').hidden = items.length > 0;
  $('cart-footer').hidden = items.length === 0;
  $('cart-total').textContent = fmtMoney(state.cart ? state.cart.totalPrice : 0);
  $('clear-cart-btn').disabled = items.length === 0;

  const checkout = $('checkout-btn');
  const hint = $('checkout-hint');
  if (!items.length) {
    checkout.disabled = true;
    hint.replaceChildren();
  } else if (!session.user) {
    checkout.disabled = true;
    hint.replaceChildren(el('button', { type: 'button', class: 'link', 'data-auth': 'login' }, 'Log in'), ' to check out.');
  } else {
    checkout.disabled = false;
    hint.replaceChildren();
  }
}

function openCart() {
  dismissToasts(); // on a phone they would cover the drawer's checkout button
  openDialog($('cart-drawer'));
}

async function checkout() {
  try {
    const result = await api('POST', '/checkout', { cartId: state.cartId }, true);
    toast(`Order #${result.orderId} created. Opening Stripe Checkout...`, 'success');
    // Open Stripe before awaiting anything else, or the pop-up blocker may no longer see the click.
    // No 'noopener' here: window.open() would then return null, so the opener is cleared by hand instead.
    const opened = window.open(result.checkoutUrl, '_blank');
    if (!opened) { window.location.assign(result.checkoutUrl); return; } // pop-up blocked: go there directly
    opened.opener = null;
    await loadCart();        // the server empties the cart on success
    await refreshProducts(); // and takes the items out of stock
    closeDialog($('cart-drawer'));
  } catch (err) {
    if (err instanceof ApiError && err.status === 500 && err.message === 'Error creating a checkout session') {
      toast(PAYMENT_UNAVAILABLE, 'error');
    } else if (err instanceof ApiError && err.status === 400) {
      toast(err.message, 'error');
      await loadCart();
      await refreshProducts();
    } else {
      showError(err);
    }
  }
}

function wireCart() {
  const drawer = $('cart-drawer');
  wireDialog(drawer);
  $('cart-button').addEventListener('click', (event) => {
    event.preventDefault();
    openCart();
  });
  const clearButton = $('clear-cart-btn');
  clearButton.addEventListener('click', () => busy(clearButton, () => clearCart().catch(showError)).then(renderCart));
  const checkoutButton = $('checkout-btn');
  checkoutButton.addEventListener('click', () => busy(checkoutButton, checkout).then(renderCart));
}

function wireCatalogue() {
  const search = $('search');
  search.addEventListener('input', () => {
    state.search = search.value.trim().toLowerCase();
    renderProducts(false);
  });
  $('sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderProducts(true);
  });
  // "/" jumps to the search box, as on most shops.
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest('input, textarea, select, [contenteditable]');
    if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      search.focus();
    }
  });
}

// Stripe's cancel URL serves this page. The URL is reset to / so a reload does not show the banner again.
function showCheckoutCancelled() {
  if (location.pathname.replace(/\/+$/, '') !== '/checkout-cancel') return;
  showBanner('Checkout cancelled. The order was not paid; you can find it under My orders.', 'info');
  history.replaceState(null, '', '/');
}

function init() {
  wireCart();
  wireCatalogue();

  const storedCartId = storage.get(STORAGE_CART);
  if (storedCartId && UUID_RE.test(storedCartId)) state.cartId = storedCartId;
  else storage.remove(STORAGE_CART); // anything else would only ever get 400 from /carts/{id}

  onSessionChange(() => renderCart()); // checking out needs a logged-in user
  initPage({ cartCount: false });
  showCheckoutCancelled();
  // The cart button on the other pages links to /#cart.
  if (location.hash === '#cart') {
    history.replaceState(null, '', location.pathname + location.search);
    openCart();
  }

  loadProducts();
  loadCart();
}

init();
