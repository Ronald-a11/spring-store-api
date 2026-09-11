// The admin dashboard: an overview, every customer's orders, the products and their stock, and the product editor.
import {
  $, el, field, icon, toast, busy, fmtMoney, fmtMoneyCompact, formatDate, initialsOf, plural, productImage, emptyState,
  skeleton, statusBadge, confirmDialog, openDialog, closeDialog, wireDialog, wireTabs, FULFILLMENT_LABELS,
} from './ui.js';
import { api, ApiError, showError, session, isAdmin, onSessionChange, initPage } from './common.js';

const LOW_STOCK = 5;
const ORDERS_PAGE = 15;                  // orders shown before "Show more"
const MAX_STOCK = 1000000;               // UpdateStockRequest: @Max(1000000)
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // spring.servlet.multipart.max-file-size
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TABS = ['overview', 'orders', 'products'];

const ORDER_FILTERS = [
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELED', label: 'Cancelled' },
  { value: 'ALL', label: 'All' },
];

const GOODS_FILTERS = [
  { value: 'all', label: 'All', matches: () => true },
  { value: 'attention', label: 'Needs restocking', matches: (p) => p.stock <= LOW_STOCK },
  { value: 'low', label: 'Low stock', matches: (p) => p.stock > 0 && p.stock <= LOW_STOCK },
  { value: 'out', label: 'Sold out', matches: (p) => p.stock <= 0 },
];

const state = {
  orders: [],
  products: [],
  categories: [],
  loaded: false,
  loadFailed: false,
  orderFilter: 'PROCESSING',
  ordersShown: ORDERS_PAGE,
  ordersSearch: '',
  goodsFilter: 'all',
  goodsSearch: '',
  editing: null,    // the product in the editor, or null while adding a new one
  previewUrl: null, // object URL of the chosen photo, revoked when the preview changes
};

let selectTab = () => {};

function renderGate() {
  const admin = isAdmin();
  $('dashboard').hidden = !admin;
  $('dashboard-gate').hidden = admin;
  if (admin) {
    $('dashboard-greeting').textContent = `Welcome back, ${session.user.name}. Here is how the shop is doing.`;
    return;
  }
  $('gate-card').replaceChildren(session.user
    ? emptyState({
      icon: 'lock',
      tone: 'bg-amber-50 text-amber-600',
      title: 'This area is for shop admins',
      text: `You are logged in as ${session.user.email}, which is a customer account.`,
      action: el('a', { href: '/', class: 'btn btn-secondary' }, 'Back to the shop'),
    })
    : emptyState({
      icon: 'lock',
      tone: 'bg-brand-50 text-brand-700',
      title: 'Admins only',
      text: 'Log in with an admin account to manage orders, products and stock.',
      action: el('button', { type: 'button', class: 'btn btn-primary', 'data-auth': 'login' }, 'Log in'),
    }));
}

async function loadDashboard() {
  try {
    const [orders, products, categories] = await Promise.all([
      api('GET', '/admin/orders', undefined, true),
      api('GET', '/products'),
      api('GET', '/categories'),
    ]);
    state.orders = orders;
    state.products = products;
    state.categories = categories;
    state.loaded = true;
    state.loadFailed = false;
  } catch (err) {
    showError(err);
    if (!state.loaded) state.loadFailed = true;
  }
  renderCategoryOptions();
  renderAll();
}

async function loadOrders() {
  state.orders = await api('GET', '/admin/orders', undefined, true);
  renderOverview();
  renderOrders();
}

async function loadProducts() {
  state.products = await api('GET', '/products');
  renderOverview();
  renderGoods();
}

function renderAll() {
  renderOverview();
  renderOrders();
  renderGoods();
}

function chip(label, count, pressed, onclick) {
  return el('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), onclick },
    label, el('span', { class: 'chip-count' }, String(count)));
}

function setTabCount(id, count) {
  const badge = $(id);
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function loadError(retryLabel) {
  return emptyState({
    icon: 'alert-circle',
    tone: 'bg-red-50 text-red-500',
    title: 'The dashboard could not be loaded',
    text: 'Check your connection and try again.',
    action: el('button', { type: 'button', class: 'btn btn-secondary', onclick: (event) => busy(event.currentTarget, loadDashboard) }, icon('refresh'), retryLabel),
  });
}

function tableSkeleton(columns) {
  return el('div', { class: 'divide-y divide-stone-100', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4, 5].map(() =>
    el('div', { class: 'flex items-center gap-6 px-5 py-4' }, ...columns.map((width) => skeleton(`h-4 ${width}`)))));
}

// Overview

function kpiTile({ label, value, context, iconName, tone, share }, index) {
  return el('div', { class: 'card animate-fade-up p-5', style: `animation-delay: ${index * 60}ms` },
    el('div', { class: 'flex items-start justify-between gap-3' },
      el('p', { class: 'text-sm font-medium text-stone-500' }, label),
      el('span', { class: `grid size-9 place-items-center rounded-xl ${tone}` }, icon(iconName, 'size-[18px]'))),
    el('p', { class: 'mt-3 text-3xl font-bold tracking-tight text-stone-900' }, value),
    share === undefined ? null : el('div', { class: 'mt-3 h-1.5 overflow-hidden rounded-full bg-brand-100', 'aria-hidden': 'true' },
      el('div', { class: 'h-full origin-left animate-grow-x rounded-full bg-brand-600', style: `width: ${Math.round(share * 100)}%` })),
    el('p', { class: 'mt-2 text-sm text-stone-500' }, context));
}

function renderOverview() {
  const processing = state.orders.filter((o) => o.fulfillmentStatus === 'PROCESSING');
  const attention = state.products.filter((p) => p.stock <= LOW_STOCK);
  setTabCount('orders-tab-count', processing.length);
  setTabCount('products-tab-count', attention.length);

  if (!state.loaded) {
    if (state.loadFailed) {
      $('kpis').replaceChildren(el('div', { class: 'card sm:col-span-2 xl:col-span-4' }, loadError('Try again')));
      $('recent-orders').replaceChildren();
      $('restock-list').replaceChildren();
      return;
    }
    $('kpis').replaceChildren(...[0, 1, 2, 3].map(() => el('div', { class: 'card p-5', 'aria-hidden': 'true' },
      el('div', { class: 'flex items-start justify-between' }, skeleton('h-4 w-24'), skeleton('size-9 rounded-xl')),
      skeleton('mt-4 h-8 w-20'),
      skeleton('mt-3 h-3.5 w-32'))));
    const rows = () => [0, 1, 2, 3, 4].map(() => el('li', { class: 'flex items-center gap-4 px-5 py-3.5', 'aria-hidden': 'true' },
      skeleton('size-9 rounded-full'),
      el('span', { class: 'flex-1 space-y-2' }, skeleton('h-3.5 w-1/3'), skeleton('h-3 w-1/2')),
      skeleton('h-5 w-16 rounded-full')));
    $('recent-orders').replaceChildren(...rows());
    $('restock-list').replaceChildren(...rows());
    return;
  }

  const paid = state.orders.filter((o) => o.status === 'PAID' && o.fulfillmentStatus !== 'CANCELED');
  const sales = paid.reduce((sum, o) => sum + Number(o.totalPrice || 0), 0);
  const inStock = state.products.filter((p) => p.stock > 0).length;
  const soldOut = attention.filter((p) => p.stock <= 0).length;
  const processingPaid = processing.filter((o) => o.status === 'PAID').length;

  $('kpis').replaceChildren(...[
    {
      label: 'Paid sales',
      value: fmtMoneyCompact(sales),
      context: `From ${plural(paid.length, 'paid order')}`,
      iconName: 'dollar',
      tone: 'bg-brand-50 text-brand-700',
    },
    {
      label: 'Orders to ship',
      value: String(processing.length),
      context: `${processingPaid} paid, ${processing.length - processingPaid} not paid yet`,
      iconName: 'clipboard',
      tone: 'bg-brand-50 text-brand-700',
    },
    {
      label: 'Products in stock',
      value: String(inStock),
      context: `Of ${plural(state.products.length, 'product')} in the shop`,
      iconName: 'package',
      tone: 'bg-brand-50 text-brand-700',
      share: state.products.length ? inStock / state.products.length : 0,
    },
    attention.length
      ? {
        label: 'Needs restocking',
        value: String(attention.length),
        context: `${soldOut} sold out, ${attention.length - soldOut} running low`,
        iconName: 'alert-triangle',
        tone: 'bg-amber-50 text-amber-600',
      }
      : {
        label: 'Needs restocking',
        value: '0',
        context: 'Every product is well stocked',
        iconName: 'check-circle',
        tone: 'bg-brand-50 text-brand-700',
      },
  ].map(kpiTile));

  const recent = [...state.orders]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || Number(b.id) - Number(a.id))
    .slice(0, 6);
  $('recent-orders').replaceChildren(...(recent.length
    ? recent.map((order) => el('li', {},
      el('button', {
        type: 'button',
        class: 'flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-stone-50',
        onclick: () => showOrder(order),
      },
      el('span', { class: 'avatar size-9 ring-0' }, initialsOf(order.customer.name)),
      el('span', { class: 'min-w-0 flex-1' },
        el('span', { class: 'block truncate text-sm font-semibold text-stone-900' }, order.customer.name),
        el('span', { class: 'block truncate text-xs text-stone-500' }, `#${order.id} · ${formatDate(order.createdAt)}`)),
      el('span', { class: 'hidden text-sm font-semibold text-stone-900 tabular-nums sm:block' }, fmtMoney(order.totalPrice)),
      statusBadge('fulfillment', order.fulfillmentStatus))))
    : [el('li', {}, emptyState({ icon: 'inbox', title: 'No orders yet', text: 'Orders appear here as soon as customers check out.' }))]));

  const restock = [...attention].sort((a, b) => a.stock - b.stock || String(a.name).localeCompare(String(b.name))).slice(0, 6);
  $('restock-list').replaceChildren(...(restock.length
    ? restock.map((product) => el('li', {},
      el('button', {
        type: 'button',
        class: 'flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-stone-50',
        onclick: () => showProduct(product),
      },
      productImage(product, 'size-10 shrink-0 rounded-lg text-sm'),
      el('span', { class: 'min-w-0 flex-1' },
        el('span', { class: 'block truncate text-sm font-semibold text-stone-900' }, product.name),
        el('span', { class: 'block truncate text-xs text-stone-500' }, categoryName(product.categoryId))),
      stockBadge(product.stock))))
    : [el('li', {}, emptyState({ icon: 'check-circle', tone: 'bg-brand-50 text-brand-600', title: 'All stocked up', text: 'No product is low or sold out.' }))]));
}

function showOrder(order) {
  state.orderFilter = 'ALL';
  state.ordersSearch = `#${order.id}`;
  $('orders-search').value = state.ordersSearch;
  selectTab('orders');
}

function showProduct(product) {
  state.goodsFilter = 'all';
  state.goodsSearch = String(product.name).toLowerCase();
  $('goods-search').value = product.name;
  selectTab('products');
  const input = $('goods-table').querySelector(`tr[data-product-id="${product.id}"] input`);
  if (input) input.focus();
}

// Orders

function orderMatchesSearch(order) {
  const query = state.ordersSearch.trim().toLowerCase();
  if (!query) return true;
  const id = query.replace(/^#/, '');
  return String(order.id) === id
    || String(order.customer.name).toLowerCase().includes(query)
    || String(order.customer.email).toLowerCase().includes(query);
}

function renderOrders() {
  const counts = { ALL: state.orders.length };
  for (const order of state.orders) counts[order.fulfillmentStatus] = (counts[order.fulfillmentStatus] || 0) + 1;
  $('order-filters').replaceChildren(...ORDER_FILTERS.map(({ value, label }) => chip(label, counts[value] || 0, state.orderFilter === value, () => {
    state.orderFilter = value;
    state.ordersShown = ORDERS_PAGE;
    renderOrders();
  })));

  const container = $('orders-table');
  if (!state.loaded) {
    container.replaceChildren(state.loadFailed ? loadError('Try again') : tableSkeleton(['w-16', 'w-40', 'w-16', 'w-14', 'w-20', 'w-28']));
    return;
  }
  const orders = state.orders.filter((order) =>
    (state.orderFilter === 'ALL' || order.fulfillmentStatus === state.orderFilter) && orderMatchesSearch(order));
  if (!orders.length) {
    const filter = ORDER_FILTERS.find((f) => f.value === state.orderFilter);
    let text = 'Orders appear here as soon as customers check out.';
    if (state.ordersSearch.trim()) text = 'No order matches your search.';
    else if (state.orderFilter !== 'ALL') text = `No orders are ${filter.label.toLowerCase()} right now.`;
    container.replaceChildren(emptyState({ icon: 'inbox', title: 'No orders to show', text }));
    return;
  }
  const hidden = orders.length - state.ordersShown;
  container.replaceChildren(
    el('table', { class: 'table min-w-[56rem]' },
      el('thead', {}, el('tr', {}, ...['Order', 'Customer', 'Items', 'Total', 'Payment', 'Status'].map((heading) =>
        el('th', { scope: 'col', class: heading === 'Total' ? 'text-right' : null }, heading)))),
      el('tbody', {}, ...orders.slice(0, state.ordersShown).map(orderRow))),
    hidden > 0
      ? el('div', { class: 'border-t border-stone-100 px-5 py-3 text-center' }, el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        onclick: () => { state.ordersShown += ORDERS_PAGE; renderOrders(); },
      }, `Show more (${hidden} more)`))
      : null);
}

function orderRow(order) {
  const items = order.items || [];
  return el('tr', { class: 'animate-fade-in' },
    el('td', { class: 'whitespace-nowrap' },
      el('p', { class: 'font-semibold text-stone-900' }, `#${order.id}`),
      el('p', { class: 'text-xs text-stone-500' }, formatDate(order.createdAt))),
    el('td', {},
      el('div', { class: 'flex items-center gap-3' },
        el('span', { class: 'avatar ring-0' }, initialsOf(order.customer.name)),
        el('div', { class: 'min-w-0' },
          el('p', { class: 'truncate font-medium text-stone-900' }, order.customer.name),
          el('p', { class: 'truncate text-xs text-stone-500' }, order.customer.email)))),
    el('td', {}, el('details', { class: 'group' },
      el('summary', { class: 'inline-flex cursor-pointer items-center gap-1 text-sm font-medium whitespace-nowrap text-stone-700 hover:text-stone-900' },
        plural(items.length, 'item'), icon('chevron-down', 'size-3.5 text-stone-400 transition-transform group-open:rotate-180')),
      el('ul', { class: 'mt-2 space-y-1 text-xs text-stone-500' }, ...items.map((item) =>
        el('li', {}, `${item.quantity} x ${item.product ? item.product.name : 'product'}`))))),
    el('td', { class: 'text-right font-semibold whitespace-nowrap text-stone-900 tabular-nums' }, fmtMoney(order.totalPrice)),
    el('td', {}, statusBadge('payment', order.status)),
    el('td', {}, statusSelect(order)));
}

function statusSelect(order) {
  const select = el('select', {
    class: 'input w-auto py-1.5 pr-9 text-[13px] font-medium',
    'aria-label': `Status of order #${order.id}`,
    disabled: order.fulfillmentStatus === 'CANCELED', // cancelling is final
  }, ...Object.entries(FULFILLMENT_LABELS).map(([value, label]) =>
    el('option', { value, selected: value === order.fulfillmentStatus }, label)));
  select.addEventListener('change', () => changeStatus(order, select));
  return select;
}

async function changeStatus(order, select) {
  const status = select.value;
  if (status === 'CANCELED') {
    const refund = order.status === 'PAID' ? ' It was paid, so refund it in the Stripe dashboard.' : '';
    const confirmed = await confirmDialog({
      title: `Cancel order #${order.id}?`,
      message: `Its items go back into stock and the order can't be reopened.${refund}`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
    });
    if (!confirmed) {
      select.value = order.fulfillmentStatus;
      return;
    }
  }
  select.disabled = true;
  try {
    const updated = await api('PUT', `/admin/orders/${order.id}/fulfillment`, { status }, true);
    state.orders = state.orders.map((o) => (o.id === updated.id ? updated : o));
    toast(`Order #${updated.id} is now ${FULFILLMENT_LABELS[updated.fulfillmentStatus].toLowerCase()}.`, 'success');
    renderOverview();
    renderOrders();
    if (status === 'CANCELED') await loadProducts(); // its items are back in stock
  } catch (err) {
    select.value = order.fulfillmentStatus;
    select.disabled = false;
    showError(err);
    if (err instanceof ApiError && (err.status === 404 || err.status === 409)) loadOrders().catch(showError);
  }
}

// Products

function categoryName(id) {
  const category = state.categories.find((c) => c.id === id);
  return category ? category.name : `Category ${id}`;
}

function stockBadge(stock) {
  if (stock <= 0) return el('span', { class: 'badge badge-red' }, 'Sold out');
  if (stock <= LOW_STOCK) return el('span', { class: 'badge badge-amber' }, `${stock} left`);
  return el('span', { class: 'badge badge-green' }, 'In stock');
}

function renderGoodsFilters() {
  $('goods-filters').replaceChildren(...GOODS_FILTERS.map(({ value, label, matches }) =>
    chip(label, state.products.filter(matches).length, state.goodsFilter === value, () => {
      state.goodsFilter = value;
      renderGoods();
    })));
}

function renderGoods() {
  renderGoodsFilters();
  const container = $('goods-table');
  if (!state.loaded) {
    container.replaceChildren(state.loadFailed ? loadError('Try again') : tableSkeleton(['w-48', 'w-14', 'w-28', 'w-16', 'w-20']));
    return;
  }
  const filter = GOODS_FILTERS.find((f) => f.value === state.goodsFilter);
  const products = state.products
    .filter((p) => filter.matches(p) && (!state.goodsSearch || String(p.name).toLowerCase().includes(state.goodsSearch)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!products.length) {
    container.replaceChildren(state.products.length
      ? emptyState({ icon: 'search', title: 'No products match', text: 'Try another search or stock filter.' })
      : emptyState({
        icon: 'package',
        title: 'No products yet',
        text: 'Add the first product and it shows up in the shop straight away.',
        action: el('button', { type: 'button', class: 'btn btn-primary', onclick: () => startAdding() }, icon('plus'), 'Add product'),
      }));
    return;
  }
  container.replaceChildren(el('table', { class: 'table min-w-[48rem]' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col' }, 'Product'),
      el('th', { scope: 'col', class: 'text-right' }, 'Price'),
      el('th', { scope: 'col' }, 'Units in stock'),
      el('th', { scope: 'col' }, 'Status'),
      el('th', { scope: 'col' }, el('span', { class: 'sr-only' }, 'Actions')))),
    el('tbody', {}, ...products.map(goodsRow))));
}

function goodsRow(product) {
  const stockInput = el('input', {
    type: 'number', class: 'input w-24 py-1.5 tabular-nums', min: 0, max: MAX_STOCK, step: 1, inputmode: 'numeric', required: true,
    value: product.stock, 'aria-label': `Units of ${product.name} in stock`,
  });
  const saveButton = el('button', { type: 'submit', class: 'btn btn-secondary btn-sm', disabled: true }, 'Save');
  stockInput.addEventListener('input', () => { saveButton.disabled = stockInput.value === String(product.stock); });
  const stockForm = el('form', { class: 'flex items-center gap-2', novalidate: true }, stockInput, saveButton);
  stockForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!saveButton.disabled) saveStock(product, stockInput, saveButton);
  });

  const editButton = el('button', { type: 'button', class: 'btn-icon size-9', 'aria-label': `Edit ${product.name}`, title: 'Edit' }, icon('pencil', 'size-4'));
  editButton.addEventListener('click', () => startEditing(product));
  const deleteButton = el('button', { type: 'button', class: 'btn-icon size-9 hover:bg-red-50 hover:text-red-600', 'aria-label': `Delete ${product.name}`, title: 'Delete' }, icon('trash', 'size-4'));
  deleteButton.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: `Delete ${product.name}?`,
      message: 'It will be removed from the shop. This cannot be undone.',
      confirmLabel: 'Delete product',
    });
    if (confirmed) busy(deleteButton, () => deleteProduct(product));
  });

  return el('tr', { 'data-product-id': product.id },
    el('td', {},
      el('div', { class: 'flex items-center gap-3' },
        productImage(product, 'size-11 shrink-0 rounded-lg text-sm'),
        el('div', { class: 'min-w-0' },
          el('p', { class: 'max-w-64 truncate font-semibold text-stone-900' }, product.name),
          el('p', { class: 'text-xs text-stone-500' }, categoryName(product.categoryId))))),
    el('td', { class: 'text-right font-semibold whitespace-nowrap text-stone-900 tabular-nums' }, fmtMoney(product.price)),
    el('td', {}, stockForm),
    el('td', {}, stockBadge(product.stock)),
    el('td', {}, el('div', { class: 'flex justify-end gap-1' }, editButton, deleteButton)));
}

async function saveStock(product, input, button) {
  const stock = Number(input.value);
  if (input.value.trim() === '' || !Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
    toast(`Stock must be a whole number from 0 to ${MAX_STOCK}.`, 'error');
    input.focus();
    return;
  }
  await busy(button, async () => {
    try {
      const updated = await api('PUT', `/products/${product.id}/stock`, { stock }, true);
      replaceProduct(updated);
      toast(`${updated.name}: ${updated.stock} in stock.`, 'success');
    } catch (err) {
      showError(err);
    }
  });
}

/** Swaps in the saved product and redraws only its row, so the admin can move on to the next stock box. */
function replaceProduct(updated) {
  state.products = state.products.map((p) => (p.id === updated.id ? updated : p));
  if (state.editing && state.editing.id === updated.id) state.editing = updated;
  renderGoodsFilters();
  renderOverview();
  const row = $('goods-table').querySelector(`tr[data-product-id="${updated.id}"]`);
  if (!row) return;
  const hadFocus = row.contains(document.activeElement);
  const newRow = goodsRow(updated);
  row.replaceWith(newRow);
  if (hadFocus) newRow.querySelector('input').focus();
}

async function deleteProduct(product) {
  try {
    await api('DELETE', `/products/${product.id}`, undefined, true);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      toast(`${product.name} is part of past orders, so it can't be deleted. Set its stock to 0 to stop selling it.`, 'error');
    } else {
      showError(err);
    }
    return;
  }
  toast(`${product.name} deleted.`, 'success');
  if (state.editing && state.editing.id === product.id) closeDialog($('product-editor'));
  await loadProducts().catch(showError);
}

// Product editor

function renderCategoryOptions() {
  const select = $('product-category');
  const selected = select.value;
  select.replaceChildren(...state.categories.map((c) => el('option', { value: c.id }, c.name)));
  if (selected) select.value = selected;
}

/** Why a photo can't be uploaded, or null when it can. The server checks the same rules. */
function photoProblem(file) {
  if (!PHOTO_TYPES.includes(file.type)) return 'The photo must be a JPEG, PNG or WebP image.';
  if (file.size > MAX_PHOTO_BYTES) return 'The photo must be 2 MB or smaller.';
  return null;
}

function showPhotoPreview(url) {
  if (state.previewUrl && state.previewUrl !== url) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  $('photo-preview').replaceChildren(url
    ? el('img', { src: url, alt: 'Photo preview', class: 'size-full animate-fade-in object-cover' })
    : icon('package', 'size-8 opacity-60'));
}

/** Sets the heading and buttons for adding or editing; busy() restores the old button label, so this runs after it. */
function renderFormMode() {
  const editing = state.editing;
  $('product-form-heading').textContent = editing ? `Edit ${editing.name}` : 'Add product';
  $('product-form-subtitle').textContent = editing
    ? 'Changes show up in the shop as soon as you save.'
    : 'New products show up in the shop straight away.';
  $('product-submit-btn').textContent = editing ? 'Save changes' : 'Add product';
  $('remove-photo-btn').hidden = !(editing && editing.imageUrl);
}

function startAdding() {
  resetForm();
  openDialog($('product-editor'));
  $('product-name').focus();
}

function startEditing(product) {
  state.editing = product;
  const form = $('product-form');
  form.elements.namedItem('name').value = product.name;
  form.elements.namedItem('price').value = product.price;
  form.elements.namedItem('stock').value = product.stock;
  form.elements.namedItem('categoryId').value = product.categoryId;
  form.elements.namedItem('description').value = product.description;
  $('photo-input').value = '';
  $('product-form-error').textContent = '';
  showPhotoPreview(product.imageUrl);
  renderFormMode();
  openDialog($('product-editor'));
  $('product-name').focus();
}

function resetForm() {
  state.editing = null;
  $('product-form').reset();
  $('product-form-error').textContent = '';
  showPhotoPreview(null);
  renderFormMode();
}

function uploadPhoto(productId, file) {
  const data = new FormData();
  data.append('file', file);
  return api('PUT', `/products/${productId}/image`, data, true);
}

async function submitProduct(event) {
  event.preventDefault();
  const form = event.target;
  const errorBox = $('product-form-error');
  errorBox.textContent = '';
  if (!form.reportValidity()) return;
  const photo = $('photo-input').files[0] || null;
  const problem = photo && photoProblem(photo);
  if (problem) {
    errorBox.textContent = problem;
    return;
  }

  const body = {
    name: field(form, 'name').trim(),
    description: field(form, 'description').trim(),
    price: Number(field(form, 'price')),
    categoryId: Number(field(form, 'categoryId')),
    stock: Number(field(form, 'stock')),
  };
  await busy($('product-submit-btn'), async () => {
    const editing = state.editing;
    let saved = null;
    let step = 'product';
    try {
      if (editing) {
        saved = await api('PUT', `/products/${editing.id}`, body, true);
        step = 'stock';
        if (body.stock !== editing.stock) saved = await api('PUT', `/products/${editing.id}/stock`, { stock: body.stock }, true);
      } else {
        saved = await api('POST', '/products', body, true);
      }
      step = 'photo';
      if (photo) saved = await uploadPhoto(saved.id, photo);
      toast(editing ? `${saved.name} saved.` : `${saved.name} added to the shop.`, 'success');
      closeDialog($('product-editor'));
    } catch (err) {
      const reason = err instanceof ApiError ? err.message : `Could not reach the server: ${err.message}`;
      if (saved) {
        // The product itself was saved: keep editing it so trying again doesn't add it a second time.
        state.editing = saved;
        errorBox.textContent = `${saved.name} was saved, but ${step === 'photo' ? 'the photo could not be uploaded' : 'the stock could not be changed'}: ${reason}`;
      } else {
        errorBox.textContent = reason;
      }
    }
    await loadProducts().catch(showError);
  });
  renderFormMode();
}

async function removePhoto(product) {
  try {
    await api('DELETE', `/products/${product.id}/image`, undefined, true);
  } catch (err) {
    showError(err);
    return;
  }
  state.editing = { ...product, imageUrl: null };
  $('photo-input').value = '';
  showPhotoPreview(null);
  toast(`Photo of ${product.name} removed.`, 'success');
  await loadProducts().catch(showError);
}

function choosePhoto(file) {
  const problem = file ? photoProblem(file) : null;
  $('product-form-error').textContent = problem || '';
  if (!file || problem) {
    $('photo-input').value = '';
    showPhotoPreview(state.editing ? state.editing.imageUrl : null);
    return;
  }
  const url = URL.createObjectURL(file);
  showPhotoPreview(url);
  state.previewUrl = url;
}

function wireProductEditor() {
  const editor = $('product-editor');
  wireDialog(editor, { onClose: resetForm });
  $('product-form').addEventListener('submit', submitProduct);
  $('add-product-btn').addEventListener('click', startAdding);
  const removeButton = $('remove-photo-btn');
  removeButton.addEventListener('click', async () => {
    const product = state.editing;
    if (!product) return;
    const confirmed = await confirmDialog({
      title: 'Remove this photo?',
      message: `${product.name} will show its placeholder in the shop until you upload a new photo.`,
      confirmLabel: 'Remove photo',
    });
    if (confirmed) await busy(removeButton, () => removePhoto(product));
    renderFormMode();
  });

  const input = $('photo-input');
  input.addEventListener('change', () => choosePhoto(input.files[0]));
  const drop = $('photo-drop');
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.dataset.dragging = '';
    });
  }
  drop.addEventListener('dragleave', () => { delete drop.dataset.dragging; });
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    delete drop.dataset.dragging;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const files = new DataTransfer();
    files.items.add(file);
    input.files = files.files;
    choosePhoto(file);
  });
  showPhotoPreview(null);
}

function tabFromHash() {
  const name = location.hash.slice(1);
  return TABS.includes(name) ? name : 'overview';
}

function wireDashboardTabs() {
  selectTab = wireTabs($('dashboard-tabs'), (name) => {
    history.replaceState(null, '', name === 'overview' ? location.pathname : `#${name}`);
    if (name === 'orders') renderOrders();
    if (name === 'products') renderGoods();
  });
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-go-tab]');
    if (!link) return;
    if (link.dataset.goodsFilter) {
      state.goodsFilter = link.dataset.goodsFilter;
      state.goodsSearch = '';
      $('goods-search').value = '';
    }
    selectTab(link.dataset.goTab);
  });
  window.addEventListener('hashchange', () => selectTab(tabFromHash(), { silent: true }));
  selectTab(tabFromHash(), { silent: true });
}

function init() {
  wireProductEditor();
  wireDashboardTabs();
  const refresh = $('refresh-btn');
  refresh.addEventListener('click', () => busy(refresh, loadDashboard));
  $('orders-search').addEventListener('input', (event) => {
    state.ordersSearch = event.target.value;
    state.ordersShown = ORDERS_PAGE;
    renderOrders();
  });
  $('goods-search').addEventListener('input', (event) => {
    state.goodsSearch = event.target.value.trim().toLowerCase();
    renderGoods();
  });

  onSessionChange(() => {
    renderGate();
    if (!isAdmin()) {
      state.loaded = false;
      state.loadFailed = false;
      state.orders = [];
      state.products = [];
      closeDialog($('product-editor'));
      return;
    }
    if (!state.loaded) {
      renderAll();
      loadDashboard();
    }
  });
  initPage();
}

init();
