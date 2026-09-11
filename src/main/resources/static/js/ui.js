// DOM helpers and UI building blocks shared by the pages: icons, toasts, dialogs, tabs and loading states.

export const $ = (id) => document.getElementById(id);
export const field = (form, name) => form.elements.namedItem(name).value;

/** el('button', {class: 'x', onclick: fn}, 'text', childNode) - children are appended as text nodes or nodes. */
export function el(tag, attrs = {}, ...children) {
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

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An icon from the sprite in fragments.html: icon('cart', 'size-4'). */
export function icon(name, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export const spinner = (className = '') => el('span', { class: `spinner ${className}`.trim(), 'aria-hidden': 'true' });
export const skeleton = (className) => el('span', { class: `skeleton ${className}`, 'aria-hidden': 'true' });
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const compactMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
export const fmtMoney = (value) => money.format(Number(value) || 0);
export const fmtMoneyCompact = (value) => (Math.abs(Number(value)) >= 10000 ? compactMoney : money).format(Number(value) || 0);

export function formatDate(value) {
  const date = new Date(value); // LocalDateTime such as "2026-09-10T12:34:56" (no zone: read as local time)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase() || '?';
}

export const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

export const PAYMENT_LABELS = {
  PENDING: 'Awaiting payment',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  CANCELED: 'Payment cancelled',
};

export const FULFILLMENT_LABELS = {
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELED: 'Cancelled',
};

const BADGE_TONES = {
  payment: { PENDING: 'badge-amber', PAID: 'badge-green', FAILED: 'badge-red', CANCELED: 'badge-gray' },
  fulfillment: { PROCESSING: 'badge-amber', SHIPPED: 'badge-blue', DELIVERED: 'badge-green', CANCELED: 'badge-red' },
};

/** A badge for an order's payment or fulfillment status: statusBadge('payment', 'PAID'). */
export function statusBadge(kind, status) {
  const value = String(status || '').toUpperCase();
  const labels = kind === 'payment' ? PAYMENT_LABELS : FULFILLMENT_LABELS;
  return el('span', { class: `badge ${BADGE_TONES[kind][value] || 'badge-gray'}` },
    el('span', { class: 'size-1.5 rounded-full bg-current', 'aria-hidden': 'true' }),
    labels[value] || value);
}

// Placeholder colours for products without a photo, picked by category id so a category keeps its colour.
const TINTS = [
  'bg-linear-to-br from-lime-100 to-green-200 text-green-700',
  'bg-linear-to-br from-sky-100 to-blue-200 text-blue-700',
  'bg-linear-to-br from-amber-100 to-orange-200 text-orange-700',
  'bg-linear-to-br from-rose-100 to-red-200 text-rose-700',
  'bg-linear-to-br from-yellow-100 to-amber-200 text-amber-700',
  'bg-linear-to-br from-violet-100 to-purple-200 text-violet-700',
  'bg-linear-to-br from-teal-100 to-cyan-200 text-teal-700',
  'bg-linear-to-br from-stone-100 to-stone-200 text-stone-600',
];

/** The product's photo, or its initial on a tinted background. The photo fades in once loaded. */
export function productImage(product, className) {
  const index = Math.max(Number(product.categoryId) || 1, 1) - 1;
  const initial = (Array.from(String(product.name || '').trim())[0] || '').toUpperCase();
  const placeholder = el('div', { class: `grid place-items-center font-bold ${TINTS[index % TINTS.length]} ${className}`, 'aria-hidden': 'true' }, initial);
  if (!product.imageUrl) return placeholder;
  const img = el('img', { class: `img-fade bg-stone-100 object-cover ${className}`, alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('load', () => { img.dataset.loaded = ''; });
  img.addEventListener('error', () => img.replaceWith(placeholder));
  img.src = product.imageUrl;
  return img;
}

export function emptyState({ icon: iconName, title, text, action, tone = 'bg-stone-100 text-stone-400' }) {
  return el('div', { class: 'flex animate-fade-in flex-col items-center px-6 py-14 text-center' },
    el('span', { class: `grid size-14 place-items-center rounded-2xl ${tone}` }, icon(iconName, 'size-7')),
    el('h3', { class: 'mt-4 text-base font-semibold text-stone-900' }, title),
    text ? el('p', { class: 'mt-1.5 max-w-sm text-sm text-stone-500' }, text) : null,
    action ? el('div', { class: 'mt-6 flex flex-wrap justify-center gap-2' }, action) : null);
}

const restingContent = new WeakMap(); // button -> its normal content while flash() shows a confirmation

/** Shows a spinner in the button while the async work runs, then restores its content. */
export async function busy(button, work) {
  const children = restingContent.get(button) || [...button.childNodes];
  const label = button.hasAttribute('aria-label') ? '' : button.textContent.trim();
  button.style.minWidth = `${button.offsetWidth}px`;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.replaceChildren(spinner(), label);
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.style.minWidth = '';
    button.replaceChildren(...children);
  }
}

/** Briefly swaps a button's content for a confirmation such as "Added". */
export function flash(button, label) {
  if (!restingContent.has(button)) restingContent.set(button, [...button.childNodes]);
  button.replaceChildren(icon('check'), label);
  clearTimeout(button.flashTimer);
  button.flashTimer = setTimeout(() => {
    if (button.getAttribute('aria-busy') !== 'true') button.replaceChildren(...restingContent.get(button));
    restingContent.delete(button);
  }, 1400);
}

const TOAST_STYLES = {
  success: { icon: 'check-circle', tone: 'text-brand-600' },
  error: { icon: 'alert-circle', tone: 'text-red-600' },
  info: { icon: 'info', tone: 'text-sky-600' },
};

// The toast region is a manual popover so it sits in the top layer, above an open modal dialog.
const supportsPopover = () => typeof HTMLElement.prototype.showPopover === 'function';

function showToasts(raise = false) {
  const region = $('toasts');
  if (!supportsPopover()) return;
  const open = region.matches(':popover-open');
  if (open && raise) region.hidePopover();
  if (!open || raise) region.showPopover();
}

/** toast('Saved.', 'success'), optionally with an action: toast('Added.', 'success', {label: 'View cart', onClick}). */
export function toast(message, kind = 'info', action = null) {
  const region = $('toasts');
  const style = TOAST_STYLES[kind] || TOAST_STYLES.info;
  const node = el('div', {
    class: 'toast pointer-events-auto flex items-start gap-3 rounded-2xl bg-white p-4 text-sm shadow-lg shadow-stone-900/10 ring-1 ring-stone-900/10',
    role: kind === 'error' ? 'alert' : 'status',
  });
  let timer = null;
  const dismiss = () => {
    if (node.dataset.leaving !== undefined) return;
    clearTimeout(timer);
    node.dataset.leaving = '';
    const remove = () => {
      if (!node.isConnected) return;
      node.remove();
      if (!region.childElementCount && supportsPopover() && region.matches(':popover-open')) region.hidePopover();
    };
    node.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, reducedMotion() ? 0 : 300);
  };
  node.dismiss = dismiss;
  node.append(
    icon(style.icon, `mt-px ${style.tone}`),
    el('div', { class: 'min-w-0 flex-1' },
      el('p', { class: 'font-medium break-words text-stone-800' }, message),
      action ? el('button', { type: 'button', class: 'link mt-1', onclick: () => { dismiss(); action.onClick(); } }, action.label) : null),
    el('button', { type: 'button', class: 'btn-icon -mt-1.5 -mr-1.5 size-8 text-stone-400', 'aria-label': 'Dismiss', onclick: dismiss }, icon('x', 'size-4')));
  region.append(node);
  showToasts();
  timer = setTimeout(dismiss, kind === 'error' ? 7000 : 4500);
}

export function dismissToasts() {
  for (const node of [...$('toasts').children]) node.dismiss();
}

const openers = new WeakMap(); // dialog -> the element that had the focus before it opened

export function openDialog(dialog) {
  if (dialog.open) return;
  openers.set(dialog, document.activeElement);
  delete dialog.dataset.closing;
  dialog.showModal();
  if ($('toasts').childElementCount) showToasts(true);
}

/** Closes a dialog after its exit animation. */
export function closeDialog(dialog) {
  if (!dialog.open || dialog.dataset.closing !== undefined) return;
  if (reducedMotion()) {
    dialog.close();
    return;
  }
  dialog.dataset.closing = '';
  const finish = (event) => {
    if (event && event.target !== dialog) return;
    dialog.removeEventListener('animationend', finish);
    clearTimeout(fallback);
    if (dialog.dataset.closing !== undefined) dialog.close();
  };
  const fallback = setTimeout(finish, 320);
  dialog.addEventListener('animationend', finish);
}

/**
 * Standard dialog behaviour: [data-close] buttons, Escape and a click on the backdrop close it,
 * and the focus goes back to the element that opened it (or to fallbackFocus() when that one is gone).
 */
export function wireDialog(dialog, { onClose, fallbackFocus } = {}) {
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if ((pressedBackdrop && event.target === dialog) || event.target.closest('[data-close]')) closeDialog(dialog);
  });
  // Escape is handled here too: Chrome can swallow the native cancel event for a dialog opened from script.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog.open) {
      event.preventDefault();
      event.stopPropagation();
      closeDialog(dialog);
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener('close', () => {
    delete dialog.dataset.closing;
    const opener = openers.get(dialog);
    openers.delete(dialog);
    const visible = opener && opener.isConnected && opener.getClientRects().length > 0;
    const target = visible ? opener : fallbackFocus && fallbackFocus();
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    if (onClose) onClose();
  });
}

/** A styled replacement for window.confirm(); resolves to true when the action is confirmed. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  const dialog = $('confirm-dialog');
  const ok = $('confirm-ok');
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  ok.textContent = confirmLabel;
  $('confirm-cancel').textContent = cancelLabel;
  return new Promise((resolve) => {
    let confirmed = false;
    const onOk = () => {
      confirmed = true;
      closeDialog(dialog);
    };
    ok.addEventListener('click', onOk);
    dialog.addEventListener('close', () => {
      ok.removeEventListener('click', onOk);
      resolve(confirmed);
    }, { once: true });
    openDialog(dialog);
    $('confirm-cancel').focus();
  });
}

/**
 * Wires a WAI-ARIA tablist: a click or the arrow, Home and End keys select a tab, and the panel named by its
 * aria-controls is shown while the other panels are hidden (tabs may share a panel).
 * Returns select(name, {focus, silent}) where name is a tab's data-tab.
 */
export function wireTabs(tablist, onSelect) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));

  function select(tab, { focus = false, silent = false } = {}) {
    if (!tab) return;
    const panel = panelOf(tab);
    for (const other of tabs) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      const otherPanel = panelOf(other);
      if (otherPanel && otherPanel !== panel) otherPanel.hidden = true;
    }
    if (panel) panel.hidden = false;
    if (focus) tab.focus();
    if (onSelect && !silent) onSelect(tab.dataset.tab);
  }

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab && tabs.includes(tab)) select(tab);
  });
  tablist.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(document.activeElement);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (index < 0 || target === undefined) return;
    event.preventDefault();
    select(tabs[(target + tabs.length) % tabs.length], { focus: true });
  });

  return (name, options) => select(tabs.find((tab) => tab.dataset.tab === name), options);
}
