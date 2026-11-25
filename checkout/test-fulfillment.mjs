import worker from './src/index.js';
import { sign, verify } from './src/sign.js';
import { pickRate } from './src/shippo.js';
import { verifyStripeSignature } from './src/stripeWebhook.js';
import assert from 'node:assert';

// --- sign.js ---
const s = await sign('order_123', 'secret-a');
assert.ok(await verify('order_123', s, 'secret-a'));
assert.ok(!(await verify('order_123', s, 'wrong-secret')));
assert.ok(!(await verify('order_456', s, 'secret-a')));
assert.ok(!(await verify('order_123', s + 'x', 'secret-a')));

// --- stripeWebhook.js signature check ---
async function fakeStripeSig(payload, secret, timestamp = Math.floor(Date.now()/1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const hex = [...new Uint8Array(mac)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `t=${timestamp},v1=${hex}`;
}
const payload = JSON.stringify({hello:'world'});
assert.ok(await verifyStripeSignature(payload, await fakeStripeSig(payload, 'whsec_test'), 'whsec_test'));
assert.ok(!(await verifyStripeSignature(payload, await fakeStripeSig(payload, 'whsec_test'), 'whsec_WRONG')));
assert.ok(!(await verifyStripeSignature(payload, await fakeStripeSig(payload, 'whsec_test', Math.floor(Date.now()/1000) - 600), 'whsec_test'))); // too old
assert.ok(!(await verifyStripeSignature('{"tampered":true}', await fakeStripeSig(payload, 'whsec_test'), 'whsec_test')));

// --- shippo.js rate picking ---
const rates = [
  {object_id:'r1', provider:'UPS', amount:'15.00', servicelevel:{token:'ups_ground'}},
  {object_id:'r2', provider:'USPS', amount:'9.80', servicelevel:{token:'usps_ground_advantage'}},
  {object_id:'r3', provider:'USPS', amount:'22.00', servicelevel:{token:'usps_priority'}},
];
assert.equal(pickRate(rates).object_id, 'r2');
assert.equal(pickRate([{object_id:'x', provider:'UPS', amount:'5', servicelevel:{token:'ups_ground'}}]).object_id, 'x'); // falls back to cheapest when no USPS ground advantage
assert.equal(pickRate([]), null);

// --- end-to-end: webhook -> email + KV write -> fulfill click -> label ---
const kvStore = new Map();
const fakeEnv = {
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  SHIPPO_TOKEN: 'shippo_test',
  FULFILL_SIGNING_SECRET: 'fulfill-secret',
  SHIP_FROM_JSON: JSON.stringify({name:'Boring Bee Co.', street1:'123 Hive Ln', city:'Deerfield Beach', state:'FL', zip:'33441', country:'US'}),
  WORKER_URL: 'https://boring-bee-checkout.example.workers.dev',
  ORDERS: {
    async put(k,v,opts){ kvStore.set(k, v); },
    async get(k){ return kvStore.has(k) ? kvStore.get(k) : null; },
  },
  EMAIL: {
    async send(msg){ emailCalls.push(msg); },
  },
};

let emailCalls = [], shippoCalls = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.goshippo.com/shipments')) {
    shippoCalls.push(JSON.parse(init.body));
    return { json: async () => ({ rates: [
      {object_id:'rate_abc', provider:'USPS', amount:'9.75', servicelevel:{token:'usps_ground_advantage', name:'USPS Ground Advantage'}},
    ]}) };
  }
  if (String(url).includes('api.goshippo.com/transactions')) {
    shippoCalls.push(JSON.parse(init.body));
    return { json: async () => ({ status:'SUCCESS', object_id:'tx_1', tracking_number:'9400111', label_url:'https://labels.goshippo.com/abc.pdf' }) };
  }
  throw new Error('unexpected fetch ' + url);
};

const session = {
  id: 'cs_test_123',
  amount_total: 4200,
  metadata: {
    fulfillment: 'ship',
    cart: JSON.stringify([['BBC-SPRING-LQ', 2]]),
    shipping_charged: '1200',
    subtotal: '5000',
  },
  shipping_details: { name: 'Jane Buyer', address: { line1: '1 Main St', line2:'', city:'Orlando', state:'FL', postal_code:'32801', country:'US' } },
  customer_details: { email: 'jane@example.com', name: 'Jane Buyer' },
};
const event = { type: 'checkout.session.completed', data: { object: session } };
const body = JSON.stringify(event);
const sigHeader = await fakeStripeSig(body, 'whsec_test');

const webhookReq = new Request('https://x/webhook/stripe', { method: 'POST', headers: { 'Stripe-Signature': sigHeader }, body });
const webhookRes = await worker.fetch(webhookReq, fakeEnv);
assert.equal(webhookRes.status, 200);
assert.equal(shippoCalls.length, 1);
assert.equal(shippoCalls[0].parcels[0].weight, '3.7'); // 2 jars * 1.6lb + 0.5lb box
assert.equal(emailCalls.length, 1);
assert.match(emailCalls[0].html, /Jane Buyer/);
assert.match(emailCalls[0].html, /\$12\.00/); // shipping charged
assert.match(emailCalls[0].html, /\$9\.75/); // label cost
assert.ok(kvStore.has('cs_test_123'));

// bad signature on webhook is rejected
const badReq = new Request('https://x/webhook/stripe', { method:'POST', headers:{'Stripe-Signature': await fakeStripeSig(body,'wrong')}, body });
assert.equal((await worker.fetch(badReq, fakeEnv)).status, 400);

// extract buy link from the record stored
const record = JSON.parse(kvStore.get('cs_test_123'));
assert.equal(record.rateId, 'rate_abc');
const goodSig = await sign('cs_test_123', 'fulfill-secret');

// wrong signature refused, no purchase attempted
const before = shippoCalls.length;
const badFulfill = await worker.fetch(new Request(`https://x/fulfill?order=cs_test_123&sig=WRONG`), fakeEnv);
assert.equal(badFulfill.status, 403);
assert.equal(shippoCalls.length, before); // nothing purchased

// correct link buys the label
const fulfillRes = await worker.fetch(new Request(`https://x/fulfill?order=cs_test_123&sig=${goodSig}`), fakeEnv);
assert.equal(fulfillRes.status, 200);
const page1 = await fulfillRes.text();
assert.match(page1, /9400111/);
assert.equal(shippoCalls.length, before + 1);

// clicking the same link again does NOT buy a second label
const fulfillRes2 = await worker.fetch(new Request(`https://x/fulfill?order=cs_test_123&sig=${goodSig}`), fakeEnv);
assert.equal(fulfillRes2.status, 200);
assert.equal(shippoCalls.length, before + 1); // unchanged — no second purchase
assert.match(await fulfillRes2.text(), /9400111/);

// unknown/expired order
const missing = await worker.fetch(new Request(`https://x/fulfill?order=cs_nope&sig=${await sign('cs_nope','fulfill-secret')}`), fakeEnv);
assert.equal(missing.status, 404);

// pickup orders skip Shippo entirely and send the pickup email
const pickupSession = { ...session, id:'cs_pickup_1', metadata: { ...session.metadata, fulfillment:'pickup' } };
const pickupEvent = JSON.stringify({ type:'checkout.session.completed', data:{ object: pickupSession } });
const pickupSig = await fakeStripeSig(pickupEvent, 'whsec_test');
const before2 = shippoCalls.length, beforeResend = emailCalls.length;
await worker.fetch(new Request('https://x/webhook/stripe', {method:'POST', headers:{'Stripe-Signature':pickupSig}, body:pickupEvent}), fakeEnv);
assert.equal(shippoCalls.length, before2); // no Shippo call for pickup
assert.equal(emailCalls.length, beforeResend + 1);
assert.match(emailCalls[beforeResend].subject, /pickup/i);

console.log('all fulfillment checks pass');

// --- pickBox: weight-based, handles mixed/future sizes --------------------
const { pickBox } = await import('./src/catalog.js');
assert.deepEqual(pickBox(2.5), { maxWeightLb:3, length:8, width:6, height:6, approximate:false });
assert.deepEqual(pickBox(5), { maxWeightLb:7, length:10, width:8, height:6, approximate:false });
assert.deepEqual(pickBox(10), { maxWeightLb:14, length:12, width:10, height:8, approximate:false });
const huge = pickBox(25);
assert.equal(huge.approximate, true);
assert.equal(huge.length, 12); // clamped to the largest tier, flagged

console.log('all box-tier checks pass');
