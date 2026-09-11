// The "My orders" page: the logged-in customer's order history.
import {
  $, el, icon, busy, fmtMoney, formatDate, plural, emptyState, skeleton, statusBadge, wireTabs, FULFILLMENT_LABELS,
} from './ui.js';
import { api, showError, showBanner, session, onSessionChange, initPage } from './common.js';

const ORDER_ID_RE = /^\d{1,19}$/; // an order id from the checkout return URL: digits only (a Java long), nothing else is shown
const DELIVERY_STEPS = [
  { status: 'PROCESSING', icon: 'package' },
  { status: 'SHIPPED', icon: 'truck' },
  { status: 'DELIVERED', icon: 'house' },
];
const UNPAID = ['FAILED', 'CANCELED'];

const TABS = {
  all: () => true,
  active: (order) => ['PROCESSING', 'SHIPPED'].includes(order.fulfillmentStatus) && !UNPAID.includes(order.status),
  delivered: (order) => order.fulfillmentStatus === 'DELIVERED',
  cancelled: (order) => order.fulfillmentStatus === 'CANCELED' || UNPAID.includes(order.status),
};

const state = {
  orders: [],
  loaded: false,          // true once GET /orders answered for the current user
  tab: 'all',
  highlightOrderId: null, // the order named by /checkout-success?orderId=<n>, highlighted and expanded
  scrolledToHighlight: false,
};

let selectTab = () => {};

async function loadOrders() {
  if (!session.user) return;
  try {
    state.orders = await api('GET', '/orders', undefined, true);
    state.loaded = true;
  } catch (err) {
    showError(err);
    if (!state.loaded) renderLoadError();
    return;
  }
  renderOrders();
}

function renderLoadError() {
  $('orders-list').replaceChildren(el('div', { class: 'card' }, emptyState({
    icon: 'alert-circle',
    tone: 'bg-red-50 text-red-500',
    title: 'We could not load your orders',
    text: 'Check your connection and try again.',
    action: el('button', { type: 'button', class: 'btn btn-secondary', onclick: (event) => busy(event.currentTarget, loadOrders) }, icon('refresh'), 'Try again'),
  })));
}

function renderSkeleton() {
  $('orders-list').replaceChildren(...[0, 1, 2].map(() => el('div', { class: 'card overflow-hidden', 'aria-hidden': 'true' },
    el('div', { class: 'flex items-center gap-3 border-b border-stone-100 px-5 py-4' },
      skeleton('size-10 rounded-xl'),
      el('span', { class: 'flex-1 space-y-2' }, skeleton('h-4 w-28'), skeleton('h-3 w-40')),
      skeleton('h-6 w-20 rounded-full')),
    el('div', { class: 'grid grid-cols-3 gap-4 px-5 py-6' }, skeleton('h-8'), skeleton('h-8'), skeleton('h-8')))));
}

function renderOrders() {
  const list = $('orders-list');
  const loggedIn = session.user !== null;
  $('refresh-orders-btn').hidden = !loggedIn;
  $('orders-tabs').hidden = !loggedIn || !state.loaded || !state.orders.length;

  if (!loggedIn) {
    list.replaceChildren(el('div', { class: 'card' }, emptyState({
      icon: 'lock',
      tone: 'bg-brand-50 text-brand-700',
      title: 'Log in to see your orders',
      text: 'Your order history, payments and deliveries are all in one place once you are logged in.',
      action: [
        el('button', { type: 'button', class: 'btn btn-primary', 'data-auth': 'login' }, 'Log in'),
        el('button', { type: 'button', class: 'btn btn-secondary', 'data-auth': 'register' }, 'Create account'),
      ],
    })));
    return;
  }
  if (!state.loaded) {
    renderSkeleton();
    return;
  }
  if (!state.orders.length) {
    list.replaceChildren(el('div', { class: 'card' }, emptyState({
      icon: 'bag',
      title: 'No orders yet',
      text: 'When you check out, your orders will show up here so you can follow them.',
      action: el('a', { href: '/', class: 'btn btn-primary' }, 'Start shopping', icon('arrow-right')),
    })));
    return;
  }

  for (const [name, matches] of Object.entries(TABS)) {
    document.querySelector(`[data-count="${name}"]`).textContent = String(state.orders.filter(matches).length);
  }
  const orders = state.orders.filter(TABS[state.tab]).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)) || Number(b.id) - Number(a.id));
  if (!orders.length) {
    list.replaceChildren(el('div', { class: 'card' }, emptyState({
      icon: 'inbox',
      title: 'Nothing here',
      text: 'No orders match this tab.',
      action: el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => selectTab('all') }, 'Show all orders'),
    })));
    return;
  }
  list.replaceChildren(...orders.map(renderOrder));
  const highlighted = list.querySelector('[data-highlight]');
  if (highlighted && !state.scrolledToHighlight) {
    state.scrolledToHighlight = true;
    highlighted.scrollIntoView({ block: 'center' });
  }
}

function renderOrder(order, index) {
  const payment = String(order.status || '').toUpperCase();
  const fulfillment = String(order.fulfillmentStatus || '').toUpperCase();
  const items = order.items || [];
  const highlighted = state.highlightOrderId !== null && String(order.id) === state.highlightOrderId;
  // Once the webhook has marked the order PAID or FAILED, update the checkout banner.
  if (highlighted && (payment === 'PAID' || UNPAID.includes(payment))) confirmPaymentBanner(order.id, payment);

  return el('article', {
    class: `card animate-fade-up overflow-hidden ${highlighted ? 'ring-2 ring-brand-500' : ''}`,
    style: `animation-delay: ${Math.min(index, 8) * 50}ms`,
    'data-highlight': highlighted ? '' : null,
    'aria-labelledby': `order-${order.id}-title`,
  },
  el('div', { class: 'flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-5 py-4' },
    el('div', { class: 'flex items-center gap-3' },
      el('span', { class: 'grid size-10 place-items-center rounded-xl bg-white text-brand-700 shadow-xs ring-1 ring-stone-200' }, icon('receipt')),
      el('div', {},
        el('h2', { id: `order-${order.id}-title`, class: 'font-semibold text-stone-900' }, `Order #${order.id}`),
        el('p', { class: 'text-sm text-stone-500' }, `Placed ${formatDate(order.createdAt)}`))),
    el('div', { class: 'flex items-center gap-3' },
      statusBadge('payment', payment),
      el('span', { class: 'text-lg font-bold tracking-tight text-stone-900' }, fmtMoney(order.totalPrice)))),
  el('div', { class: 'px-5 py-6' }, progressFor(payment, fulfillment)),
  el('details', { class: 'group border-t border-stone-100', open: highlighted },
    el('summary', { class: 'flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50' },
      plural(items.length, 'item'),
      icon('chevron-down', 'size-4 text-stone-400 transition-transform duration-300 group-open:rotate-180')),
    el('ul', { class: 'divide-y divide-stone-100 px-5 pb-2' }, ...items.map((item) => el('li', { class: 'flex items-center justify-between gap-4 py-3 text-sm' },
      el('span', { class: 'min-w-0 text-stone-700' },
        el('span', { class: 'mr-2 inline-grid min-w-7 place-items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-stone-600 tabular-nums' }, `${item.quantity}x`),
        item.product ? item.product.name : 'Product'),
      el('span', { class: 'font-semibold text-stone-900 tabular-nums' }, fmtMoney(item.totalPrice)))))));
}

function progressFor(payment, fulfillment) {
  if (fulfillment === 'CANCELED' || UNPAID.includes(payment)) {
    const reason = fulfillment === 'CANCELED'
      ? 'This order was cancelled and its items went back into stock.'
      : 'The payment did not go through, so this order will not be delivered.';
    return el('div', { class: 'flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-600/10 ring-inset' },
      icon('x-circle', 'mt-px text-red-500'),
      el('p', {}, el('span', { class: 'font-semibold' }, fulfillment === 'CANCELED' ? 'Cancelled. ' : 'Payment failed. '), reason));
  }
  return deliverySteps(fulfillment);
}

function deliverySteps(current) {
  const reached = DELIVERY_STEPS.findIndex((step) => step.status === current);
  return el('ol', { class: 'grid grid-cols-3', 'aria-label': 'Delivery progress' }, ...DELIVERY_STEPS.map((step, i) => {
    const done = i < reached || (i === reached && step.status === 'DELIVERED');
    const isCurrent = i === reached && !done;
    const circle = done
      ? 'bg-brand-600 text-white'
      : isCurrent ? 'bg-white text-brand-700 ring-2 ring-brand-600' : 'bg-stone-100 text-stone-400';
    return el('li', { class: 'relative flex flex-col items-center text-center', 'aria-current': i === reached ? 'step' : null },
      i > 0 ? el('span', { class: 'absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2 bg-stone-200', 'aria-hidden': 'true' },
        i <= reached ? el('span', { class: 'block h-full origin-left animate-grow-x bg-brand-600', style: `animation-delay: ${i * 180}ms` }) : null)
        : null,
      el('span', { class: `relative grid size-8 place-items-center rounded-full ${circle}` },
        isCurrent ? el('span', { class: 'absolute inset-0 animate-ping rounded-full bg-brand-400 opacity-20', 'aria-hidden': 'true' }) : null,
        icon(done ? 'check' : step.icon, 'relative size-4')),
      el('span', { class: `mt-2 text-xs font-semibold sm:text-sm ${i <= reached ? 'text-stone-900' : 'text-stone-400'}` }, FULFILLMENT_LABELS[step.status]));
  }));
}

// Coming back from Stripe doesn't mean the payment went through; the order is PAID once the webhook arrives.
function confirmPaymentBanner(orderId, status) {
  const paid = status === 'PAID';
  const message = paid
    ? `Payment received. Order #${orderId} is confirmed, thank you!`
    : `Payment for order #${orderId} did not go through.`;
  if (!$('checkout-banner').hidden && $('banner-text').textContent !== message) showBanner(message, paid ? 'success' : 'error');
}

// Stripe's success URL serves this page. The URL is reset to /my-orders so a reload does not show the banner again.
function showCheckoutSuccess() {
  if (location.pathname.replace(/\/+$/, '') !== '/checkout-success') return;
  const orderId = new URLSearchParams(location.search).get('orderId');
  if (orderId !== null && ORDER_ID_RE.test(orderId)) {
    state.highlightOrderId = orderId;
    showBanner(`Thanks! Your payment is being confirmed. Order #${orderId} will show as paid below.`, 'info');
  } else {
    showBanner('Thanks! Your payment is being confirmed. Your order will show as paid below.', 'info');
  }
  history.replaceState(null, '', '/my-orders');
}

function init() {
  const refresh = $('refresh-orders-btn');
  refresh.addEventListener('click', () => busy(refresh, loadOrders));
  selectTab = wireTabs($('orders-tabs'), (name) => {
    state.tab = name;
    $('orders-panel').setAttribute('aria-labelledby', `tab-${name}`);
    renderOrders();
  });

  showCheckoutSuccess();
  onSessionChange((user) => {
    state.orders = [];
    state.loaded = false;
    selectTab('all', { silent: true });
    state.tab = 'all';
    renderOrders();
    if (user) loadOrders();
  });
  initPage();
}

init();
