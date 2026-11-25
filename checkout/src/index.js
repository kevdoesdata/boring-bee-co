// Boring Bee Co. checkout + fulfillment function (Cloudflare Worker).
//
// Three routes:
//   POST /checkout         website -> here: { items, ship, tier? } -> Stripe Checkout URL
//   POST /webhook/stripe    Stripe -> here, the instant a payment succeeds
//   GET  /fulfill           you, from the order email -> buys the Shippo label
//
// Secrets (set in the Cloudflare dashboard, never in this code):
//   STRIPE_SECRET_KEY        sk_test_... while testing, sk_live_... when we go live
//   STRIPE_WEBHOOK_SECRET    whsec_... from the webhook's settings page
//   SHIPPO_TOKEN             from Shippo > Settings > API
//   FULFILL_SIGNING_SECRET   any long random string you make up once
//   SHIP_FROM_JSON           JSON string with your real pickup/ship-from address
//                            (kept out of the repo entirely, unlike everything
//                            else here, since this one is your home address)
//   TIER_CODES               optional JSON, e.g. {"wh-7f3k":"wholesale"}
//
// Bindings (wrangler.toml):
//   ORDERS     a KV namespace, holds each paid order between the webhook
//              firing and you clicking "Buy label" in its email.
//   EMAIL      Cloudflare's own Email Service — sends the order email with
//              no separate email vendor. See wrangler.toml for the one-time
//              domain setup this needs.

import { CATALOG, TIERS, FREE_SHIPPING_OVER, ZONE_RATES, STATE_ZONE, MAX_JARS, BOX_WEIGHT_LB } from './catalog.js';
import { verifyStripeSignature } from './stripeWebhook.js';
import { createShipment, pickRate, buyLabel } from './shippo.js';
import { sendOrderEmail, sendPickupEmail } from './email.js';
import { sign, verify } from './sign.js';

const SITE = 'https://boringbeeco.com';
const ALLOWED_ORIGINS = [SITE, 'https://www.boringbeeco.com', 'http://localhost:8080'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if ((request.method === 'POST' || request.method === 'OPTIONS') && url.pathname === '/checkout') return handleCheckout(request, env);
    if (request.method === 'POST' && url.pathname === '/webhook/stripe') return handleStripeWebhook(request, env);
    if (request.method === 'GET' && url.pathname === '/fulfill') return handleFulfill(request, env);

    return new Response('Not found', { status: 404 });
  },
};

async function handleCheckout(request, env) {
  const origin = request.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : SITE,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Forbidden' }, 403, cors);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }

  const order = buildOrder(body, env);
  if (order.error) return json({ error: order.error }, 400, cors);

  const session = await createCheckoutSession(order, env);
  if (!session.url) {
    console.error('Stripe error', session);
    return json({ error: 'Checkout is unavailable right now. Please email boringbeeco@gmail.com.' }, 502, cors);
  }
  return json({ url: session.url }, 200, cors);
}

// Turn what the browser sent into a trusted order. Rejects anything odd.
export function buildOrder(body, env = {}) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return { error: 'Your bag is empty.' };

  let prices = {};
  if (body.tier) {
    let codes = {};
    try { codes = JSON.parse(env.TIER_CODES || '{}'); } catch {}
    const tierName = codes[body.tier];
    if (!tierName || !TIERS[tierName]) return { error: 'That pricing code is not valid.' };
    prices = TIERS[tierName];
  }

  const lines = [];
  let jars = 0, subtotal = 0;
  for (const it of items) {
    const product = CATALOG[it?.sku];
    const qty = Number(it?.qty);
    if (!product) return { error: 'One of those items is no longer available.' };
    if (!Number.isInteger(qty) || qty < 1) return { error: 'Quantities must be whole numbers.' };
    const unit = prices[it.sku] ?? product.price;
    jars += qty; subtotal += unit * qty;
    lines.push({ sku: it.sku, name: product.name, image: product.image, unit, qty });
  }
  if (jars > MAX_JARS) return { error: `For more than ${MAX_JARS} jars, email boringbeeco@gmail.com and we'll sort you out.` };

  let shipping;
  if (body.ship === 'pickup') {
    shipping = { label: 'Pickup in Deerfield Beach, FL', amount: 0, pickup: true };
  } else {
    const state = String(body.ship || '').toUpperCase();
    const zone = STATE_ZONE[state];
    if (!zone) return { error: 'Choose the state we are shipping to, or pickup.' };
    const free = subtotal >= FREE_SHIPPING_OVER;
    shipping = {
      label: free ? 'Free shipping (USPS Ground Advantage)' : 'USPS Ground Advantage',
      amount: free ? 0 : ZONE_RATES[zone],
      state, zone, pickup: false,
    };
  }
  return { lines, subtotal, shipping, tier: body.tier ? 'custom' : 'retail' };
}

async function createCheckoutSession(order, env) {
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('success_url', `${SITE}/?order=thanks`);
  p.set('cancel_url', `${SITE}/#shop`);
  p.set('phone_number_collection[enabled]', 'true');
  p.set('billing_address_collection', 'auto');

  order.lines.forEach((l, i) => {
    p.set(`line_items[${i}][quantity]`, String(l.qty));
    p.set(`line_items[${i}][price_data][currency]`, 'usd');
    p.set(`line_items[${i}][price_data][unit_amount]`, String(l.unit));
    p.set(`line_items[${i}][price_data][product_data][name]`, l.name);
    p.set(`line_items[${i}][price_data][product_data][images][0]`, `${SITE}/${l.image}`);
    p.set(`line_items[${i}][price_data][product_data][metadata][sku]`, l.sku);
  });

  const s = order.shipping;
  p.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  p.set('shipping_options[0][shipping_rate_data][display_name]', s.label);
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(s.amount));
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');

  if (!s.pickup) {
    // Ask for the full address on Stripe's page (US only).
    p.set('shipping_address_collection[allowed_countries][0]', 'US');
    p.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
    p.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', '2');
    p.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
    p.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', '5');
    p.set('metadata[ship_state_chosen]', s.state);
  } else {
    p.set('custom_text[submit][message]', "We'll email you to set a pickup time in Deerfield Beach.");
  }
  p.set('metadata[fulfillment]', s.pickup ? 'pickup' : 'ship');
  p.set('metadata[pricing]', order.tier);
  // Stripe doesn't hand the webhook an easy cart breakdown, so we carry a
  // compact one ourselves: what to pack, and what the jars + shipping
  // actually billed, so the order email can show real margin.
  p.set('metadata[cart]', JSON.stringify(order.lines.map(l => [l.sku, l.qty])));
  p.set('metadata[shipping_charged]', String(s.amount));
  p.set('metadata[subtotal]', String(order.subtotal));

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: p,
  });
  return res.json();
}

// A couple of cheap, standard headers on every response this Worker sends:
// stops a browser from guessing a different content type for the body
// (MIME-sniffing), and stops the response being cached somewhere it shouldn't
// (order emails' /fulfill pages carry a customer's name and address).
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...headers, 'Content-Type': 'application/json' } });
}

// --- Stripe webhook: fires the instant a payment succeeds ------------------

async function handleStripeWebhook(request, env) {
  const payload = await request.text(); // raw body — signature is over the exact bytes
  const sig = request.headers.get('Stripe-Signature') || '';
  const ok = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('Bad signature', { status: 400 });

  let event;
  try { event = JSON.parse(payload); } catch { return new Response('Bad JSON', { status: 400 }); }

  if (event.type !== 'checkout.session.completed') {
    return new Response('ignored', { status: 200 }); // Stripe only retries on non-2xx
  }

  try {
    await onOrderPaid(event.data.object, env);
  } catch (err) {
    // Log and still return 200: the order is already paid, retrying the
    // webhook won't un-break whatever failed, and you'd rather see the
    // order late than have Stripe hammer this endpoint for a day.
    console.error('onOrderPaid failed', err, event.data.object?.id);
  }
  return new Response('ok', { status: 200 });
}

async function onOrderPaid(session, env) {
  const meta = session.metadata || {};
  const cart = JSON.parse(meta.cart || '[]'); // [[sku, qty], ...]
  const lines = cart.map(([sku, qty]) => ({ sku, qty, ...CATALOG[sku] }));
  const customerName = session.shipping_details?.name || session.customer_details?.name || 'Customer';
  const customerEmail = session.customer_details?.email || '';

  const order = {
    sessionId: session.id,
    lines,
    customerName,
    customerEmail,
    shippingCharged: Number(meta.shipping_charged || 0),
    subtotal: Number(meta.subtotal || 0),
    totalPaid: session.amount_total,
  };

  if (meta.fulfillment === 'pickup') {
    await sendPickupEmail(order, env);
    return;
  }

  const addr = session.shipping_details?.address;
  if (!addr) throw new Error('Paid order has no shipping address on file');

  const weightLb = lines.reduce((lb, l) => lb + l.weightLb * l.qty, BOX_WEIGHT_LB);

  const shipment = await createShipment({
    env,
    name: customerName,
    address: addr,
    weightLb,
  });
  const rate = pickRate(shipment.rates);
  if (!rate) throw new Error('Shippo returned no usable rate for ' + session.id);
  const boxIsApproximate = shipment.boxIsApproximate;

  // Stash everything /fulfill needs so clicking the email button, later,
  // doesn't need to recompute or re-trust anything from the browser.
  await env.ORDERS.put(session.id, JSON.stringify({
    rateId: rate.object_id,
    labelCost: rate.amount,
    order,
    boxIsApproximate,
    status: 'ready',
  }), { expirationTtl: 60 * 60 * 24 * 14 }); // 2 weeks is plenty

  const base = FULFILL_BASE(env).replace(/\/+$/, '');
  const buyUrl = `${base}/fulfill?order=${encodeURIComponent(session.id)}&sig=${await sign(session.id, env.FULFILL_SIGNING_SECRET)}`;
  await sendOrderEmail({ order, addr, rate, buyUrl, boxIsApproximate }, env);
}

function FULFILL_BASE(env) {
  // The Worker's own URL isn't available at runtime, so it's set once as a var.
  return env.WORKER_URL || 'https://boring-bee-checkout.YOUR-SUBDOMAIN.workers.dev';
}

// --- One click from the order email: actually buy the label ----------------

async function handleFulfill(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order') || '';
  const sig = url.searchParams.get('sig') || '';

  if (!orderId || !(await verify(orderId, sig, env.FULFILL_SIGNING_SECRET))) {
    return html('<p>This link isn\'t valid. If you copy-pasted it, copy the whole thing.</p>', 403);
  }

  const raw = await env.ORDERS.get(orderId);
  if (!raw) return html('<p>This order has expired or was already handled, and there\'s no record of it left.</p>', 404);
  const record = JSON.parse(raw);

  if (record.status === 'bought') {
    // Already clicked once — show the same label again instead of buying a second one.
    return html(labelPage(record), 200);
  }

  const tx = await buyLabel({ env, rateId: record.rateId });
  if (tx.status !== 'SUCCESS') {
    console.error('Shippo purchase failed', tx);
    return html(`<p>Shippo couldn't issue the label: ${escapeHtml((tx.messages || []).map(m => m.text).join('; ') || 'unknown error')}. Nothing was charged — try again, or buy it by hand in the Shippo dashboard.</p>`, 502);
  }

  record.status = 'bought';
  record.labelUrl = tx.label_url;
  record.trackingNumber = tx.tracking_number;
  await env.ORDERS.put(orderId, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 30 });

  return html(labelPage(record), 200);
}

function labelPage(record) {
  const o = record.order;
  return `
    <p>Label bought for <b>${escapeHtml(o.customerName)}</b> — ${o.lines.reduce((n, l) => n + l.qty, 0)} jar(s).</p>
    <p>Tracking number: <b>${escapeHtml(record.trackingNumber)}</b></p>
    <p><a href="${record.labelUrl}" target="_blank" rel="noopener">Open the label to print</a></p>
    <p style="color:#666">If you've enabled tracking emails in Shippo's settings, ${escapeHtml(o.customerEmail || 'the customer')} gets their tracking number automatically — nothing else to send.</p>
  `;
}

function html(body, status) {
  return new Response(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;max-width:32em;margin:3em auto;padding:0 1em">${body}</body>`, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      // Not meant to be framed by anything — it's only ever opened from a link
      // in your own email, and it shows a customer's name and address.
      'X-Frame-Options': 'DENY',
    },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
