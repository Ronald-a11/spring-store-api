// Session, API access and the page chrome (header, auth dialog, banner) shared by the Tyrone Grocery Shop pages.
import {
  $, field, icon, initialsOf, toast, busy, openDialog, closeDialog, wireDialog, wireTabs,
} from './ui.js';

const STORAGE_TOKEN = 'store.token';
export const STORAGE_CART = 'store.cartId';
const SESSION_EXPIRED = 'Session expired, please log in again.';
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// localStorage can throw (private mode, disabled storage); the pages must still work without it.
export const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not persisted */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* nothing to remove */ } },
};

export class ApiError extends Error {
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
    if (fields.length) return fields.map(([name, message]) => `${name}: ${message}`).join(' · ');
  }
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 200);
  if (status === 401) return 'Not authorized.';
  if (status === 403) return 'Access denied.';
  if (status === 404) return 'Not found.';
  return `Request failed (HTTP ${status}).`;
}

let pendingRequests = 0;
let progressTimer = null;

// The bar at the top of the page shows while any request is in flight, unless it answers within 150 ms.
function trackRequest(delta) {
  pendingRequests += delta;
  const bar = $('progress');
  if (pendingRequests > 0) {
    if (bar.hidden && !progressTimer) {
      progressTimer = setTimeout(() => {
        progressTimer = null;
        bar.hidden = pendingRequests === 0;
      }, 150);
    }
    return;
  }
  clearTimeout(progressTimer);
  progressTimer = null;
  bar.hidden = true;
}

/**
 * Request helper. The body is sent as JSON, or as multipart form data when it is a FormData.
 * Rejects with an ApiError for a non-2xx status and a TypeError when the server is unreachable.
 * With auth=true the access token is sent, and a 401 ends the session.
 */
export async function api(method, path, body, auth = false) {
  const headers = { Accept: 'application/json' };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'; // fetch sets the multipart boundary itself
  const sendToken = auth && session.token;
  if (sendToken) headers.Authorization = `Bearer ${session.token}`;

  trackRequest(1);
  let response;
  let text;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined || isForm ? body : JSON.stringify(body),
    });
    text = await response.text();
  } finally {
    trackRequest(-1);
  }

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
export function showError(err) {
  if (err instanceof ApiError) {
    if (!err.sessionExpired) toast(err.message, 'error');
  } else {
    toast(`Could not reach the server: ${err.message}`, 'error');
  }
}

export const session = {
  token: null, // access token (JWT) or null
  user: null,  // {id, name, email, role} decoded from the token, display only
};

const sessionListeners = [];
let sessionTimer = null; // fires logout(true) when the token's exp passes

// The role only decides what the page shows; the server checks the token on every admin request.
export const isAdmin = () => session.user !== null && session.user.role === 'ADMIN';

/** Calls listener(user) when the page restores the session and whenever someone logs in or out. */
export function onSessionChange(listener) {
  sessionListeners.push(listener);
}

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

/** Stores (or clears) the access token, derives the displayed user from it and tells the page. */
function setToken(token) {
  clearTimeout(sessionTimer);
  const payload = token ? decodeJwtPayload(token) : null;
  const expiresAt = payload && Number(payload.exp) * 1000;
  if (!payload || !(expiresAt > Date.now())) {
    session.token = null;
    session.user = null;
    storage.remove(STORAGE_TOKEN);
  } else {
    session.token = token;
    session.user = { id: payload.sub, name: payload.name, email: payload.email, role: payload.role };
    storage.set(STORAGE_TOKEN, token);
    // The UI follows the token's lifetime; the server enforces it regardless (see api()).
    sessionTimer = setTimeout(() => logout(true), Math.min(expiresAt - Date.now() + 500, 2147483647));
  }
  renderAuth();
  for (const listener of sessionListeners) listener(session.user);
}

export function logout(expired = false) {
  const wasLoggedIn = session.user !== null;
  setToken(null);
  if (expired && wasLoggedIn) toast(SESSION_EXPIRED, 'error');
}

async function login(email, password) {
  const result = await api('POST', '/auth/login', { email, password });
  setToken(result.token);
  if (!session.user) throw new Error('The server returned a token this page could not read.');
  toast(`Hi ${session.user.name}, you are logged in.`, 'success');
}

function renderAuth() {
  const user = session.user;
  $('guest-actions').hidden = user !== null;
  $('mobile-guest-actions').hidden = user !== null;
  $('user-menu').hidden = user === null;
  if (user) {
    const initials = initialsOf(user.name);
    $('user-initials').textContent = initials;
    $('menu-initials').textContent = initials;
    $('user-name').textContent = user.name;
    $('menu-user-name').textContent = user.name;
    $('menu-user-email').textContent = user.email;
    const role = $('user-role');
    role.textContent = isAdmin() ? 'Admin' : 'Customer';
    role.className = `badge ml-auto ${isAdmin() ? 'badge-amber' : 'badge-gray'}`;
  } else {
    setUserMenuOpen(false);
  }
  for (const node of document.querySelectorAll('[data-requires]')) {
    node.hidden = node.dataset.requires === 'admin' ? !isAdmin() : user === null;
  }
}

function setUserMenuOpen(open) {
  $('user-menu-panel').hidden = !open;
  $('user-menu-btn').setAttribute('aria-expanded', String(open));
}

function wireHeader() {
  const header = $('site-header');
  const onScroll = () => header.toggleAttribute('data-scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menu = $('user-menu');
  $('user-menu-btn').addEventListener('click', () => setUserMenuOpen($('user-menu-panel').hidden));
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) setUserMenuOpen(false);
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('user-menu-panel').hidden) {
      setUserMenuOpen(false);
      $('user-menu-btn').focus();
    }
  });
  menu.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) setUserMenuOpen(false);
  });
  $('logout-btn').addEventListener('click', () => {
    logout();
    toast('You are logged out.');
  });

  const menuButton = $('menu-btn');
  const mobileNav = $('mobile-nav');
  const setMobileNavOpen = (open) => {
    mobileNav.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.replaceChildren(icon(open ? 'x' : 'menu'));
  };
  menuButton.addEventListener('click', () => setMobileNavOpen(mobileNav.hidden));
  mobileNav.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) setMobileNavOpen(false);
  });
  window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
    if (event.matches) setMobileNavOpen(false);
  });

  // Any element with data-auth="login" or data-auth="register" opens the auth dialog on that tab.
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-auth]');
    if (trigger) openAuthDialog(trigger.dataset.auth);
  });
}

/** Shows the number of units in the cart on the header's cart button, with a little bump when it grows. */
export function setCartCount(count, bump = false) {
  const badge = $('cart-count');
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.hidden = count <= 0;
  $('cart-button').setAttribute('aria-label', count > 0 ? `Open cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Open cart');
  if (bump && count > 0) {
    badge.classList.remove('animate-bump');
    void badge.offsetWidth; // restart the animation
    badge.classList.add('animate-bump');
  }
}

export const countItems = (cart) => (cart && Array.isArray(cart.items) ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0);

async function loadCartCount() {
  const cartId = storage.get(STORAGE_CART);
  if (!cartId || !UUID_RE.test(cartId)) return;
  try {
    setCartCount(countItems(await api('GET', `/carts/${cartId}`)));
  } catch {
    // a stale cart is cleaned up by the shop page
  }
}

const AUTH_COPY = {
  login: { title: 'Welcome back', subtitle: 'Log in to check out and follow your orders.' },
  register: { title: 'Create your account', subtitle: 'It takes a minute, and you can check out straight after.' },
};

let selectAuthTab = () => {};

/** Opens the auth dialog on the "login" or "register" tab. */
export function openAuthDialog(which) {
  selectAuthTab(which);
  openDialog($('auth-dialog'));
  $(`${which}-panel`).querySelector('input').focus();
}

function showAuthTab(which) {
  $('auth-title').textContent = AUTH_COPY[which].title;
  $('auth-subtitle').textContent = AUTH_COPY[which].subtitle;
  $('login-error').textContent = '';
  $('register-error').textContent = '';
}

function wireAuthDialog() {
  const dialog = $('auth-dialog');
  selectAuthTab = wireTabs($('auth-tabs'), showAuthTab);
  wireDialog(dialog, {
    fallbackFocus: () => (session.user ? $('user-menu-btn') : null),
    onClose: () => {
      for (const button of dialog.querySelectorAll('[data-toggle-password][aria-pressed="true"]')) button.click();
    },
  });

  for (const button of dialog.querySelectorAll('[data-toggle-password]')) {
    const input = button.parentElement.querySelector('input');
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.replaceChildren(icon(show ? 'eye-off' : 'eye', 'size-4'));
    });
  }

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
        closeDialog(dialog);
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
        closeDialog(dialog);
      } catch (err) {
        errorBox.textContent = err instanceof ApiError ? err.message : `Could not reach the server: ${err.message}`;
      }
    });
  });
}

const BANNER_TONES = {
  success: { classes: 'bg-brand-50 text-brand-900 ring-brand-600/20', icon: 'check-circle' },
  info: { classes: 'bg-sky-50 text-sky-900 ring-sky-600/20', icon: 'info' },
  error: { classes: 'bg-red-50 text-red-900 ring-red-600/20', icon: 'alert-circle' },
};

export function showBanner(message, kind) {
  const tone = BANNER_TONES[kind] || BANNER_TONES.info;
  const banner = $('checkout-banner');
  banner.className = `mt-4 flex animate-fade-up items-start gap-3 rounded-2xl p-4 ring-1 ring-inset ${tone.classes}`;
  $('banner-icon').replaceChildren(icon(tone.icon));
  $('banner-text').textContent = message;
  banner.hidden = false;
}

/** Wires the header, banner and dialogs, then restores the saved session. The shop page loads its cart itself. */
export function initPage({ cartCount = true } = {}) {
  wireHeader();
  wireAuthDialog();
  wireDialog($('confirm-dialog'));
  $('banner-dismiss').addEventListener('click', () => { $('checkout-banner').hidden = true; });
  // Logging in or out in another tab updates this one.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_TOKEN && event.newValue !== session.token) setToken(event.newValue);
  });
  setToken(storage.get(STORAGE_TOKEN));
  if (cartCount) loadCartCount();
}
