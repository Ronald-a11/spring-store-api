/*
 * Tyrone Grocery Shop - a small storefront for the Tyrone Grocery Shop API.
 *
 * Vanilla ES2020, no framework, no build step. The page talks to the API on the same
 * origin (GET /products, /categories, /carts, /users, /auth/login, /checkout, /orders, admin writes).
 *
 * Ground rules:
 *  - Every piece of API data reaches the DOM through textContent (the el() helper below),
 *    never innerHTML, so product names, e-mails and error messages cannot inject markup.
 *  - The JWT payload is decoded ONLY to show the user's name and role; the server is the
 *    authority on what the token may do, and any 401 while logged in ends the session.
 *  - The cart id and the access token live in localStorage so a reload keeps them.
 */
'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// GET /products only returns categoryId. The names come from GET /categories (see loadProducts); this map is the
// fallback when that request fails, copied from the seed migration
// src/main/resources/db/migration/V5__populate_database.sql (ids are assigned in insert order).
const CATEGORY_NAMES = {
  1: 'Produce',
  2: 'Dairy',
  3: 'Bakery',
  4: 'Meat & Seafood',
  5: 'Pantry Staples',
  6: 'Beverages',
};

// Fix beyond the course: F2 one decorative emoji per category name (aria-hidden wherever it is rendered).
const CATEGORY_ICONS = {
  'Produce': '🥦',
  'Dairy': '🥛',
  'Bakery': '🍞',
  'Meat & Seafood': '🥩',
  'Pantry Staples': '🍚',
  'Beverages': '🧃',
};
const DEFAULT_CATEGORY_ICON = '🛒';

const STORAGE_TOKEN = 'store.token';
const STORAGE_CART = 'store.cartId';
const SESSION_EXPIRED = 'Session expired, please log in again.';
// POST /checkout answers 500 {"error": "Error creating a checkout session"} for any Stripe failure (on this demo: no
// key) and deletes the order first; the message below is shown for that body only, never for any other 500.
const PAYMENT_UNAVAILABLE = 'The payment provider could not create a checkout session (Stripe is not configured on this demo) — the order was not created.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_ID_RE = /^\d{1,19}$/; // an order id from the checkout return URL: digits only (a Java long), nothing else is shown
const WAKE_UP_AFTER_MS = 2000; // show "Waking up the server" if the first request takes longer than this
const QTY_DEBOUNCE_MS = 300;   // typing in the cart quantity box waits this long before PUT /carts/{id}/items/{productId}
const QTY_MAX = 1000;          // UpdateCartItemRequest: @Min(1) @Max(1000)

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtMoney = (value) => money.format(Number(value) || 0);
// Fix beyond the course: F1 the name comes from the /categories list when it loaded, else from the seed map above.
function categoryName(id) {
  const known = state.categories && state.categories.find((c) => c.id === id);
  return known ? known.name : (CATEGORY_NAMES[id] || `Category ${id}`);
}
const categoryIcon = (id) => CATEGORY_ICONS[categoryName(id)] || DEFAULT_CATEGORY_ICON;
/** Decorative icon node: hidden from assistive technology, the name next to it carries the meaning. */
const iconNode = (icon) => el('span', { class: 'icon', 'aria-hidden': 'true' }, icon);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  products: [],
  productsLoaded: false, // true once GET /products answered: an empty catalogue then reads "No products yet"
  categories: null,      // [{id, name}] from GET /categories, or null when that request failed (seed map fallback)
  search: '',
  categoryId: null, // null = all categories
  cartId: null,     // UUID from POST /carts, or null until the first "Add to cart"
  cart: null,       // {id, items: [{product, quantity, totalPrice}], totalPrice} or null
  token: null,      // access token (JWT) or null
  user: null,       // {id, name, email, role} decoded from the token, display only
  orders: [],
  highlightOrderId: null, // the order named by /checkout-success?orderId=<n>, highlighted in "My orders"
};

let sessionTimer = null; // fires logout(true) when the token's exp passes

// localStorage can throw (private mode, disabled storage); the page must still work without it.
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not persisted */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* nothing to remove */ } },
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const field = (form, name) => form.elements.namedItem(name).value;

/** el('button', {class: 'x', onclick: fn}, 'text', childNode) - children are appended as text nodes or nodes. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined) node.append(child); // strings become text nodes
  }
  return node;
}

function toast(message, kind = 'info') {
  const node = el('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  $('toasts').append(node);
  setTimeout(() => node.remove(), kind === 'error' ? 7000 : 4000);
}

/** Disables a button (with an ellipsis) while the async work runs, then restores it. */
async function busy(button, work) {
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (!button.classList.contains('qty')) button.textContent = `${label}…`;
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = label;
  }
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(status, data, sessionExpired = false) {
    super(describeError(status, data));
    this.status = status;
    this.data = data;             // parsed JSON body, raw text, or null
    this.sessionExpired = sessionExpired; // already reported by api(); callers stay quiet
  }
}

/** Turns an error body into one readable line: {"error": "..."} or {field: message, ...}. */
function describeError(status, data) {
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    const fields = Object.entries(data).filter(([, value]) => typeof value === 'string');
    if (fields.length) return fields.map(([field, message]) => `${field}: ${message}`).join(' · ');
  }
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 200);
  if (status === 401) return 'Not authorized.';
  if (status === 403) return 'Access denied.';
  if (status === 404) return 'Not found.';
  return `Request failed (HTTP ${status}).`;
}

/**
 * api(method, path, body, auth): JSON in, JSON out. Resolves with the parsed body (null for 204),
 * rejects with an ApiError for any non-2xx status and with a TypeError when the server is unreachable.
 * With auth=true the access token is sent; a 401 on such a call means the token is no longer
 * accepted (it expires after 15 minutes), so the session is ended right here.
 */
async function api(method, path, body, auth = false) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const sendToken = auth && state.token;
  if (sendToken) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (response.ok) return data;

  if (response.status === 401 && sendToken) {
    logout(true);
    throw new ApiError(401, data, true);
  }
  throw new ApiError(response.status, data);
}

/** Reports an error from api() (or a network failure) as a toast. */
function showError(err) {
  if (err instanceof ApiError) {
    if (!err.sessionExpired) toast(err.message, 'error');
  } else {
    toast(`Could not reach the server: ${err.message}`, 'error');
  }
}

// ---------------------------------------------------------------------------
// Auth (register / login / logout)
// ---------------------------------------------------------------------------

/** Decodes the JWT payload without verifying it - for display only. */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Stores (or clears) the access token and derives the displayed user from it. */
function setToken(token) {
  clearTimeout(sessionTimer);
  const payload = token ? decodeJwtPayload(token) : null;
  const expiresAt = payload && Number(payload.exp) * 1000;
  if (!payload || !(expiresAt > Date.now())) {
    state.token = null;
    state.user = null;
    storage.remove(STORAGE_TOKEN);
  } else {
    state.token = token;
    state.user = { id: payload.sub, name: payload.name, email: payload.email, role: payload.role };
    storage.set(STORAGE_TOKEN, token);
    // The UI follows the token's lifetime; the server enforces it regardless (see api()).
    sessionTimer = setTimeout(() => logout(true), Math.min(expiresAt - Date.now() + 500, 2147483647));
  }
  renderAuth();
  renderProducts(); // admin delete buttons
  renderCart();     // checkout button state
}

function logout(expired = false) {
  const wasLoggedIn = Boolean(state.user);
  setToken(null);
  state.orders = [];
  renderOrders();
  if (expired && wasLoggedIn) toast(SESSION_EXPIRED, 'error');
}

async function login(email, password) {
  const result = await api('POST', '/auth/login', { email, password });
  setToken(result.token);
  if (!state.user) throw new Error('The server returned a token this page could not read.');
  toast(`Hi ${state.user.name}, you are logged in.`, 'success');
  loadOrders();
}

function renderAuth() {
  const loggedIn = Boolean(state.user);
  $('login-btn').hidden = loggedIn;
  $('register-btn').hidden = loggedIn;
  $('user-chip').hidden = !loggedIn;
  if (loggedIn) {
    $('user-name').textContent = state.user.name;
    const role = $('user-role');
    role.textContent = state.user.role;
    role.className = state.user.role === 'ADMIN' ? 'badge admin' : 'badge';
  }
  $('orders-section').hidden = !loggedIn;
  $('admin-section').hidden = !(loggedIn && state.user.role === 'ADMIN');
}

let dialogOpener = null; // the element that opened the auth dialog; focus goes back to it when the dialog closes

/** Opens the auth dialog on the "login" or "register" form. */
function openAuthDialog(which) {
  $('login-form').hidden = which !== 'login';
  $('register-form').hidden = which !== 'register';
  $('login-error').textContent = '';
  $('register-error').textContent = '';
  const dialog = $('auth-dialog');
  dialog.setAttribute('aria-labelledby', `${which}-heading`); // the visible form's <h2> names the dialog
  if (!dialog.open) {
    dialogOpener = document.activeElement; // remembered before showModal() moves the focus into the dialog
    dialog.showModal();                    // Escape closes it (the dialog's native "cancel" behaviour)
  }
  const first = $(`${which}-form`).querySelector('input');
  if (first) first.focus();
}

function wireAuthDialog() {
  const dialog = $('auth-dialog');
  $('login-btn').addEventListener('click', () => openAuthDialog('login'));
  $('register-btn').addEventListener('click', () => openAuthDialog('register'));
  $('logout-btn').addEventListener('click', () => { logout(); toast('You are logged out.'); });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog.querySelectorAll('[data-switch]').forEach((b) => b.addEventListener('click', () => openAuthDialog(b.dataset.switch)));
  // Fix beyond the course: F7 Escape closes the dialog explicitly as well (the native "cancel" already does in most
  // browsers, but Chrome can swallow it for a dialog opened without user activation), and focus returns to the button
  // that opened it (Cancel, Escape or a successful login all end here); after a login that button is hidden, so the
  // "Log out" button in the user chip takes it.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); dialog.close(); }
  });
  dialog.addEventListener('close', () => {
    const target = dialogOpener && dialogOpener.isConnected && !dialogOpener.hidden ? dialogOpener : $('logout-btn');
    dialogOpener = null;
    if (target && !target.hidden && typeof target.focus === 'function') target.focus();
  });

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const errorBox = $('login-error');
    errorBox.textContent = '';
    if (!form.reportValidity()) return;
    const email = field(form, 'email').trim().toLowerCase();
    const password = field(form, 'password');
    await busy(form.querySelector('button[type="submit"]'), async () => {
      try {
        await login(email, password);
        form.reset();
        dialog.close();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) errorBox.textContent = 'Wrong e-mail or password.';
        else errorBox.textContent = err instanceof ApiError ? err.message : `Could not reach the server: ${err.message}`;
      }
    });
  });

  $('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const errorBox = $('register-error');
    errorBox.textContent = '';
    if (!form.reportValidity()) return;
    const body = {
      name: field(form, 'name').trim(),
      email: field(form, 'email').trim().toLowerCase(), // the API requires a lowercase e-mail
      password: field(form, 'password'),
    };
    await busy(form.querySelector('button[type="submit"]'), async () => {
      try {
        const user = await api('POST', '/users', body);
        toast(`Welcome, ${user.name}! Your account was created.`, 'success');
        await login(body.email, body.password); // straight in: same credentials
        form.reset();
        dialog.close();
      } catch (err) {
        errorBox.textContent = err instanceof ApiError ? err.message : `Could not reach the server: ${err.message}`;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Products (catalogue, search, category filter, admin add/delete)
// ---------------------------------------------------------------------------

function showProductsStatus(message, ...extra) {
  const status = $('products-status');
  status.replaceChildren(message, ...extra);
  status.hidden = false;
}

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

async function loadProducts() {
  showProductsStatus('Loading products…');
  // Free hosting puts an idle server to sleep; the first request can take a while.
  const wakeTimer = setTimeout(() => showProductsStatus('Waking up the server… this can take up to a minute on a sleeping demo host.'), WAKE_UP_AFTER_MS);
  // Fix beyond the course: F1 the category list is fetched in parallel with the catalogue; it never fails the page.
  const categories = loadCategories();
  try {
    state.products = await api('GET', '/products');
    state.productsLoaded = true;
    state.categories = await categories;
    $('products-status').hidden = true;
    renderCategories();
    renderProducts();
  } catch (err) {
    // Fix beyond the course: F6 an unreachable API (or a non-2xx) on the first load leaves a Retry button, not a blank page.
    const retry = el('button', { type: 'button', class: 'secondary small', onclick: () => loadProducts() }, 'Retry');
    const reason = err instanceof ApiError ? err.message : 'the server could not be reached.';
    showProductsStatus(`Could not load products: ${reason}`, retry);
  } finally {
    clearTimeout(wakeTimer);
  }
}

/**
 * The categories to offer: the /categories list when it loaded (every category, in id order), plus any id the
 * catalogue uses that the list does not know; without the list, the ids present in the catalogue named by the seed map.
 */
function categoryList() {
  const list = state.categories ? state.categories.map((c) => ({ id: c.id, name: c.name })) : [];
  for (const id of new Set(state.products.map((p) => p.categoryId))) {
    if (!list.some((c) => c.id === id)) list.push({ id, name: categoryName(id) });
  }
  return list.sort((a, b) => a.id - b.id);
}

function renderCategories() {
  // Fix beyond the course: F1/F2 chips come from GET /categories (label = name) with the category's icon.
  const categories = categoryList();
  const ids = categories.map((c) => c.id);
  // The selected category can disappear (an admin deleted its last product): fall back to "All".
  if (state.categoryId !== null && !ids.includes(state.categoryId)) state.categoryId = null;
  const button = (id, ...label) => el('button', {
    type: 'button',
    class: 'chip',
    'aria-pressed': String(state.categoryId === id),
    onclick: () => { state.categoryId = id; renderCategories(); renderProducts(); },
  }, ...label);
  $('categories').replaceChildren(button(null, 'All'), ...categories.map((c) => button(c.id, iconNode(categoryIcon(c.id)), ' ', c.name)));

  // The admin form's category select offers the same list; without /categories it also offers every seeded id.
  const selectIds = [...new Set([...ids, ...(state.categories ? [] : Object.keys(CATEGORY_NAMES).map(Number))])].sort((a, b) => a - b);
  $('admin-category').replaceChildren(...selectIds.map((id) => el('option', { value: id }, `${id} – ${categoryName(id)}`)));
}

function visibleProducts() {
  return state.products.filter((p) =>
    (state.categoryId === null || p.categoryId === state.categoryId)
    && (!state.search || String(p.name).toLowerCase().includes(state.search)));
}

// Fix beyond the course: F7 "10 products" in the toolbar, "3 of 10 products" while a search or a category filters.
function renderProductCount(visible, total) {
  const noun = (n) => `${n} ${n === 1 ? 'product' : 'products'}`;
  $('product-count').textContent = !state.productsLoaded ? '' : visible === total ? noun(total) : `${visible} of ${noun(total)}`;
}

function renderProducts() {
  const grid = $('product-grid');
  const products = visibleProducts();
  renderProductCount(products.length, state.products.length);
  if (!products.length) {
    // Fix beyond the course: F6 an empty catalogue says so; before the first answer the status line speaks instead.
    const message = state.products.length ? 'No products match.' : state.productsLoaded ? 'No products yet.' : '';
    grid.replaceChildren(el('p', { class: 'muted empty' }, message));
    return;
  }
  const isAdmin = state.user && state.user.role === 'ADMIN';
  grid.replaceChildren(...products.map((product) => {
    const addButton = el('button', { type: 'button' }, 'Add to cart');
    addButton.addEventListener('click', () => busy(addButton, () => addToCart(product).catch(showError)));
    const card = el('article', { class: 'card' },
      el('span', { class: 'category' }, iconNode(categoryIcon(product.categoryId)), ' ', categoryName(product.categoryId)),
      el('h3', {}, product.name),
      el('p', { class: 'desc' }, product.description),
      el('div', { class: 'card-footer' }, el('span', { class: 'price' }, fmtMoney(product.price)), addButton));
    if (isAdmin) {
      const deleteButton = el('button', { type: 'button', class: 'danger small', 'aria-label': `Delete ${product.name}` }, 'Delete');
      deleteButton.addEventListener('click', () => busy(deleteButton, () => deleteProduct(product).catch(showError)));
      card.append(el('div', { class: 'admin-actions' }, deleteButton));
    }
    return card;
  }));
}

async function deleteProduct(product) {
  if (!window.confirm(`Delete "${product.name}" from the catalogue?`)) return;
  await api('DELETE', `/products/${product.id}`, undefined, true); // 204; 409 when an order references it
  toast(`${product.name} deleted.`, 'success');
  await loadProducts();
}

function wireAdminForm() {
  $('add-product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    const body = {
      name: field(form, 'name').trim(),
      description: field(form, 'description').trim(),
      price: Number(field(form, 'price')),
      categoryId: Number(field(form, 'categoryId')),
    };
    await busy(form.querySelector('button[type="submit"]'), async () => {
      try {
        const created = await api('POST', '/products', body, true);
        toast(`${created.name} added to the catalogue.`, 'success');
        form.reset();
        await loadProducts();
      } catch (err) {
        showError(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

function forgetCart() {
  state.cartId = null;
  state.cart = null;
  storage.remove(STORAGE_CART);
}

/**
 * True when the server says the stored cart id is unusable: an unknown cart (404) or a value that is
 * not a UUID at all (400 "Invalid request parameter."), which would otherwise fail on every call forever.
 */
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
  toast(`${product.name} added to your cart.`, 'success');
}

async function setQuantity(productId, quantity) {
  if (quantity < 1) return removeItem(productId);
  await cartCall('PUT', `/items/${productId}`, { quantity: Math.min(quantity, QTY_MAX) });
  await loadCart();
}

// Fix beyond the course: F5 the quantity is an editable number box. Typing waits QTY_DEBOUNCE_MS, leaving the box
// (change) commits at once; the value is clamped to 1..QTY_MAX and sent with PUT /carts/{id}/items/{productId}.
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
    .catch((err) => { showError(err); input.value = String(current); })
    .finally(() => input.removeAttribute('aria-busy'));
}

function quantityInput(product, current) {
  const input = el('input', {
    type: 'number', class: 'qty-input', min: 1, max: QTY_MAX, step: 1, inputmode: 'numeric',
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

function renderCart() {
  const items = (state.cart && state.cart.items) || [];
  const list = $('cart-items');
  // The list is rebuilt from scratch; a quantity box being typed in keeps the focus on its replacement.
  const active = document.activeElement;
  const editing = active && active.classList && active.classList.contains('qty-input') ? active : null;
  const focusedProductId = editing ? editing.dataset.productId : null;
  const typed = editing ? editing.value : null;
  list.replaceChildren(...items.map((item) => {
    const product = item.product || {};
    const minus = el('button', { type: 'button', class: 'secondary qty', 'aria-label': `Remove one ${product.name}` }, '−');
    const plus = el('button', { type: 'button', class: 'secondary qty', 'aria-label': `Add one ${product.name}` }, '+');
    const remove = el('button', { type: 'button', class: 'link small-text', 'aria-label': `Remove ${product.name}` }, 'Remove');
    minus.addEventListener('click', () => busy(minus, () => setQuantity(product.id, item.quantity - 1).catch(showError)));
    plus.addEventListener('click', () => busy(plus, () => setQuantity(product.id, item.quantity + 1).catch(showError)));
    remove.addEventListener('click', () => busy(remove, () => removeItem(product.id).catch(showError)));
    return el('li', { class: 'cart-item' },
      el('span', {}, product.name, ' ', el('span', { class: 'unit' }, `${fmtMoney(product.price)} each`)),
      el('span', { class: 'line-total' }, fmtMoney(item.totalPrice)),
      el('span', { class: 'controls' }, minus, quantityInput(product, item.quantity), plus, remove));
  }));
  if (focusedProductId !== null) {
    for (const input of list.querySelectorAll('input.qty-input')) {
      if (input.dataset.productId === focusedProductId) {
        // Fix beyond the course: a value still being typed (a digit entered while the previous commit was in flight)
        // is carried over to the replacement instead of being wiped by the server's value, the caret goes back to the
        // end (a bare focus() may leave it at the start), and re-dispatching "input" re-arms the debounce on the new
        // box against the new current quantity - which also cancels the stale timer of the detached box (one per product).
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
  $('cart-total').textContent = fmtMoney(state.cart ? state.cart.totalPrice : 0);
  $('clear-cart-btn').disabled = items.length === 0;

  const checkout = $('checkout-btn');
  const hint = $('checkout-hint');
  if (!items.length) {
    checkout.disabled = true;
    hint.textContent = 'Add something to your cart to check out.';
  } else if (!state.user) {
    checkout.disabled = true;
    hint.textContent = 'Log in to check out.';
  } else {
    checkout.disabled = false;
    hint.textContent = '';
  }
}

async function checkout() {
  try {
    const result = await api('POST', '/checkout', { cartId: state.cartId }, true);
    toast(`Order #${result.orderId} created — opening Stripe Checkout.`, 'success');
    // Open Stripe straight away, while the click's user activation is still fresh: awaiting the refreshes
    // first could push window.open() past the activation window and get it blocked as a pop-up.
    // Not with the 'noopener' feature: window.open() then returns null by spec (Chrome, Firefox, Safari), which
    // would make the pop-up-blocked fallback below fire every time (Stripe twice when pop-ups are allowed).
    // Open plainly, then cut the opener link by hand so Stripe's tab cannot reach this window.
    const opened = window.open(result.checkoutUrl, '_blank');
    if (!opened) { window.location.assign(result.checkoutUrl); return; } // pop-up blocked: go there directly
    opened.opener = null;
    await loadCart();   // the server empties the cart on success
    await loadOrders();
  } catch (err) {
    if (err instanceof ApiError && err.status === 500 && err.message === 'Error creating a checkout session') toast(PAYMENT_UNAVAILABLE, 'error');
    else if (err instanceof ApiError && err.status === 400 && /cart/i.test(err.message)) { toast(err.message, 'error'); await loadCart(); }
    else showError(err);
  }
}

function wireCart() {
  const clearButton = $('clear-cart-btn');
  clearButton.addEventListener('click', () => busy(clearButton, () => clearCart().catch(showError)).then(renderCart));
  const checkoutButton = $('checkout-btn');
  checkoutButton.addEventListener('click', () => busy(checkoutButton, checkout).then(renderCart));
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

async function loadOrders() {
  if (!state.user) return;
  try {
    state.orders = await api('GET', '/orders', undefined, true);
  } catch (err) {
    showError(err);
    return;
  }
  renderOrders();
}

function formatDate(value) {
  const date = new Date(value); // LocalDateTime such as "2026-09-10T12:34:56" (no zone: read as local time)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderOrders() {
  const list = $('orders-list');
  if (!state.user) { list.replaceChildren(); return; }
  if (!state.orders.length) {
    list.replaceChildren(el('p', { class: 'muted' }, 'No orders yet.'));
    return;
  }
  // Fix beyond the course: F4 newest first (createdAt, then id), status badge, local date, items behind a <details>;
  // the order named by the /checkout-success return URL is highlighted and opened.
  const orders = [...state.orders].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)) || Number(b.id) - Number(a.id));
  list.replaceChildren(...orders.map((order) => {
    const status = String(order.status || '').toUpperCase();
    const items = order.items || [];
    const highlighted = state.highlightOrderId !== null && String(order.id) === state.highlightOrderId;
    if (highlighted && status === 'PAID') confirmPaymentBanner(order.id); // the webhook has landed: "confirmed"
    return el('article', { class: highlighted ? 'order highlight' : 'order' },
      el('div', { class: 'order-head' },
        el('strong', {}, `Order #${order.id}`),
        el('span', { class: `badge status-${status.toLowerCase()}` }, status),
        el('span', { class: 'muted' }, formatDate(order.createdAt)),
        el('span', { class: 'total' }, fmtMoney(order.totalPrice))),
      el('details', { class: 'order-items', open: highlighted },
        el('summary', {}, `${items.length} ${items.length === 1 ? 'item' : 'items'}`),
        el('ul', {}, ...items.map((item) =>
          el('li', {}, `${item.quantity} × ${item.product ? item.product.name : 'product'} — ${fmtMoney(item.totalPrice)}`)))));
  }));
}

function wireOrders() {
  const button = $('refresh-orders-btn');
  button.addEventListener('click', () => busy(button, loadOrders));
}

// ---------------------------------------------------------------------------
// Checkout return (Stripe sends the customer back to /checkout-success?orderId=<n> or /checkout-cancel)
// ---------------------------------------------------------------------------

function showBanner(message, kind) {
  const banner = $('checkout-banner');
  banner.className = `banner banner-${kind}`;
  $('banner-text').textContent = message;
  banner.hidden = false;
}

// Fix beyond the course: the return URL only proves that Stripe sent the customer back; the order becomes PAID when
// Stripe's payment_intent.succeeded webhook lands (CheckoutService), which can be late or, without
// STRIPE_WEBHOOK_SECRET_KEY, never - so the banner says "being confirmed" until GET /orders shows the order as PAID
// and renderOrders() turns it into the confirmation here. A dismissed banner stays dismissed.
function confirmPaymentBanner(orderId) {
  const message = `Payment received — order #${orderId} is confirmed. Thank you!`;
  if (!$('checkout-banner').hidden && $('banner-text').textContent !== message) showBanner(message, 'success');
}

// Fix beyond the course: F3 both return URLs serve this page; the banner is filled in from the URL, which is then
// rewritten back to "/" so a reload (or a bookmark) does not announce the payment twice.
function wireCheckoutReturn() {
  $('banner-dismiss').addEventListener('click', () => { $('checkout-banner').hidden = true; });
  const path = location.pathname.replace(/\/+$/, ''); // tolerate a trailing slash
  if (path === '/checkout-success') {
    const orderId = new URLSearchParams(location.search).get('orderId');
    if (orderId !== null && ORDER_ID_RE.test(orderId)) {
      state.highlightOrderId = orderId; // renderOrders() highlights it once GET /orders answers
      showBanner(`Thanks — your payment is being confirmed; order #${orderId} will show as PAID in My orders.`, 'info');
    } else {
      showBanner('Thanks — your payment is being confirmed; your order will show as PAID in My orders.', 'info');
    }
  } else if (path === '/checkout-cancel') {
    showBanner('Checkout cancelled — your cart is still here.', 'info');
  } else {
    return;
  }
  history.replaceState(null, '', '/');
}

// Fix beyond the course: F7 the header is sticky on wide screens (app.css); the sticky cart panel sits below it,
// so the header's rendered height is published as --header-h (it changes when the toolbar wraps).
function wireStickyHeader() {
  const header = document.querySelector('.site-header');
  const update = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(header);
  else window.addEventListener('resize', update);
  update();
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

function init() {
  wireAuthDialog();
  wireAdminForm();
  wireCart();
  wireOrders();
  wireCheckoutReturn();
  wireStickyHeader();
  $('search').addEventListener('input', (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderProducts();
  });

  const storedCartId = storage.get(STORAGE_CART);
  if (storedCartId && UUID_RE.test(storedCartId)) state.cartId = storedCartId;
  else storage.remove(STORAGE_CART); // anything else would only ever get 400 from /carts/{id}
  setToken(storage.get(STORAGE_TOKEN)); // restores the session; an expired token is dropped
  renderOrders();

  loadProducts();
  loadCart();
  if (state.user) loadOrders();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
