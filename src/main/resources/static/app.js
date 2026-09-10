/*
 * Mosh's Grocery - a small storefront for the Store API.
 *
 * Vanilla ES2020, no framework, no build step. The page talks to the API on the same
 * origin (GET /products, /carts, /users, /auth/login, /checkout, /orders, admin writes).
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

// GET /products only returns categoryId. The names come from the seed migration
// src/main/resources/db/migration/V5__populate_database.sql (ids are assigned in insert order).
const CATEGORY_NAMES = {
  1: 'Produce',
  2: 'Dairy',
  3: 'Bakery',
  4: 'Meat & Seafood',
  5: 'Pantry Staples',
  6: 'Beverages',
};

const STORAGE_TOKEN = 'store.token';
const STORAGE_CART = 'store.cartId';
const SESSION_EXPIRED = 'Session expired, please log in again.';
const STRIPE_UNCONFIGURED = 'Payments are not configured on this demo (no Stripe key) — the order was not created.';
const WAKE_UP_AFTER_MS = 2000; // show "Waking up the server" if the first request takes longer than this

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtMoney = (value) => money.format(Number(value) || 0);
const categoryName = (id) => CATEGORY_NAMES[id] || `Category ${id}`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  products: [],
  search: '',
  categoryId: null, // null = all categories
  cartId: null,     // UUID from POST /carts, or null until the first "Add to cart"
  cart: null,       // {id, items: [{product, quantity, totalPrice}], totalPrice} or null
  token: null,      // access token (JWT) or null
  user: null,       // {id, name, email, role} decoded from the token, display only
  orders: [],
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

/** Opens the auth dialog on the "login" or "register" form. */
function openAuthDialog(which) {
  $('login-form').hidden = which !== 'login';
  $('register-form').hidden = which !== 'register';
  $('login-error').textContent = '';
  $('register-error').textContent = '';
  const dialog = $('auth-dialog');
  if (!dialog.open) dialog.showModal();
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

async function loadProducts() {
  showProductsStatus('Loading products…');
  // Free hosting puts an idle server to sleep; the first request can take a while.
  const wakeTimer = setTimeout(() => showProductsStatus('Waking up the server… this can take up to a minute on a sleeping demo host.'), WAKE_UP_AFTER_MS);
  try {
    state.products = await api('GET', '/products');
    $('products-status').hidden = true;
    renderCategories();
    renderProducts();
  } catch (err) {
    const retry = el('button', { type: 'button', class: 'secondary small', onclick: () => loadProducts() }, 'Retry');
    showProductsStatus(`Could not load products: ${err.message}`, retry);
  } finally {
    clearTimeout(wakeTimer);
  }
}

function renderCategories() {
  const ids = [...new Set(state.products.map((p) => p.categoryId))].sort((a, b) => a - b);
  // The selected category can disappear (an admin deleted its last product): fall back to "All".
  if (state.categoryId !== null && !ids.includes(state.categoryId)) state.categoryId = null;
  const button = (id, label) => el('button', {
    type: 'button',
    class: 'chip',
    'aria-pressed': String(state.categoryId === id),
    onclick: () => { state.categoryId = id; renderCategories(); renderProducts(); },
  }, label);
  $('categories').replaceChildren(button(null, 'All'), ...ids.map((id) => button(id, categoryName(id))));

  // The admin form's category select offers every seeded category plus any id seen in the catalogue.
  const selectIds = [...new Set([...Object.keys(CATEGORY_NAMES).map(Number), ...ids])].sort((a, b) => a - b);
  $('admin-category').replaceChildren(...selectIds.map((id) => el('option', { value: id }, `${id} – ${categoryName(id)}`)));
}

function visibleProducts() {
  return state.products.filter((p) =>
    (state.categoryId === null || p.categoryId === state.categoryId)
    && (!state.search || String(p.name).toLowerCase().includes(state.search)));
}

function renderProducts() {
  const grid = $('product-grid');
  const products = visibleProducts();
  if (!products.length) {
    grid.replaceChildren(el('p', { class: 'muted' }, state.products.length ? 'No products match.' : ''));
    return;
  }
  const isAdmin = state.user && state.user.role === 'ADMIN';
  grid.replaceChildren(...products.map((product) => {
    const addButton = el('button', { type: 'button' }, 'Add to cart');
    addButton.addEventListener('click', () => busy(addButton, () => addToCart(product).catch(showError)));
    const card = el('article', { class: 'card' },
      el('span', { class: 'category' }, categoryName(product.categoryId)),
      el('h3', {}, product.name),
      el('p', { class: 'desc' }, product.description),
      el('div', { class: 'card-footer' }, el('span', { class: 'price' }, fmtMoney(product.price)), addButton));
    if (isAdmin) {
      const deleteButton = el('button', { type: 'button', class: 'danger small' }, 'Delete');
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

/** Returns the cart id, creating the cart on the server the first time it is needed. */
async function ensureCart() {
  if (state.cartId) return state.cartId;
  const cart = await api('POST', '/carts');
  state.cartId = cart.id;
  state.cart = cart;
  storage.set(STORAGE_CART, cart.id);
  return cart.id;
}

/** Calls /carts/{id}{subPath}; a 404 means the stored id is stale (unknown cart), so it is dropped. */
async function cartCall(method, subPath, body) {
  const id = await ensureCart();
  try {
    return await api(method, `/carts/${id}${subPath}`, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) forgetCart();
    throw err;
  }
}

async function loadCart() {
  if (!state.cartId) { state.cart = null; renderCart(); return; }
  try {
    state.cart = await api('GET', `/carts/${state.cartId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) forgetCart(); // stale id: a new cart is created on the next add
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
  await cartCall('PUT', `/items/${productId}`, { quantity: Math.min(quantity, 1000) });
  await loadCart();
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
  list.replaceChildren(...items.map((item) => {
    const product = item.product || {};
    const minus = el('button', { type: 'button', class: 'secondary qty', 'aria-label': `Remove one ${product.name}` }, '−');
    const plus = el('button', { type: 'button', class: 'secondary qty', 'aria-label': `Add one ${product.name}` }, '+');
    const remove = el('button', { type: 'button', class: 'link small-text' }, 'Remove');
    minus.addEventListener('click', () => busy(minus, () => setQuantity(product.id, item.quantity - 1).catch(showError)));
    plus.addEventListener('click', () => busy(plus, () => setQuantity(product.id, item.quantity + 1).catch(showError)));
    remove.addEventListener('click', () => busy(remove, () => removeItem(product.id).catch(showError)));
    return el('li', { class: 'cart-item' },
      el('span', {}, product.name, ' ', el('span', { class: 'unit' }, `${fmtMoney(product.price)} each`)),
      el('span', { class: 'line-total' }, fmtMoney(item.totalPrice)),
      el('span', { class: 'controls' }, minus, el('span', { class: 'qty-value' }, String(item.quantity)), plus, remove));
  }));
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
    await loadCart();   // the server empties the cart on success
    await loadOrders();
    const opened = window.open(result.checkoutUrl, '_blank', 'noopener');
    if (!opened) window.location.assign(result.checkoutUrl); // pop-up blocked: go there directly
  } catch (err) {
    if (err instanceof ApiError && err.status === 500) toast(STRIPE_UNCONFIGURED, 'error');
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
  const orders = [...state.orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  list.replaceChildren(...orders.map((order) => {
    const status = String(order.status || '').toUpperCase();
    return el('article', { class: 'order' },
      el('div', { class: 'order-head' },
        el('strong', {}, `Order #${order.id}`),
        el('span', { class: `badge status-${status.toLowerCase()}` }, status),
        el('span', { class: 'muted' }, formatDate(order.createdAt)),
        el('span', { class: 'total' }, fmtMoney(order.totalPrice))),
      el('ul', {}, ...(order.items || []).map((item) =>
        el('li', {}, `${item.quantity} × ${item.product ? item.product.name : 'product'} — ${fmtMoney(item.totalPrice)}`))));
  }));
}

function wireOrders() {
  const button = $('refresh-orders-btn');
  button.addEventListener('click', () => busy(button, loadOrders));
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

function init() {
  wireAuthDialog();
  wireAdminForm();
  wireCart();
  wireOrders();
  $('search').addEventListener('input', (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderProducts();
  });

  state.cartId = storage.get(STORAGE_CART);
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
