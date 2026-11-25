import worker, { buildOrder } from './src/index.js';
import assert from 'node:assert';
const one = s=>[{sku:'BBC-SPRING-LQ',qty:1}];
let o;
o=buildOrder({items:one(),ship:'FL'}); assert.equal(o.shipping.amount,1200);
o=buildOrder({items:one(),ship:'il'}); assert.equal(o.shipping.amount,1700);
o=buildOrder({items:one(),ship:'CA'}); assert.equal(o.shipping.amount,2300);
o=buildOrder({items:[{sku:'BBC-FALL-CB',qty:3}],ship:'WA'}); assert.equal(o.subtotal,7500); assert.equal(o.shipping.amount,0);
o=buildOrder({items:[{sku:'BBC-FALL-CB',qty:2}],ship:'WA'}); assert.equal(o.shipping.amount,2300);
o=buildOrder({items:one(),ship:'pickup'}); assert.equal(o.shipping.amount,0);
assert.ok(buildOrder({items:[],ship:'FL'}).error);
assert.ok(buildOrder({items:[{sku:'FAKE',qty:1}],ship:'FL'}).error);
assert.ok(buildOrder({items:[{sku:'BBC-FALL-CB',qty:1.5}],ship:'FL'}).error);
assert.ok(buildOrder({items:[{sku:'BBC-FALL-CB',qty:-2}],ship:'FL'}).error);
assert.ok(buildOrder({items:[{sku:'BBC-FALL-CB',qty:25}],ship:'FL'}).error);
assert.ok(buildOrder({items:one(),ship:'XX'}).error);
assert.ok(buildOrder({items:[{sku:'BBC-SPRING-LQ',qty:1,price:1}],ship:'FL'}).subtotal===2500); // client price ignored
assert.ok(buildOrder({items:one(),ship:'FL',tier:'guess'}).error);
// states coverage
const {STATE_ZONE}=await import('./src/catalog.js'); assert.equal(Object.keys(STATE_ZONE).length,51);
// end-to-end with a fake Stripe
let sent; globalThis.fetch=async(u,init)=>{sent=Object.fromEntries(new URLSearchParams(init.body));return {json:async()=>({url:'https://checkout.stripe.com/c/pay/test'})}};
const req=(b,origin='https://boringbeeco.com')=>new Request('https://x/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(b)});
let r=await worker.fetch(req({items:[{sku:'BBC-SPRING-LQ',qty:2}],ship:'NY'}),{STRIPE_SECRET_KEY:'sk_test_x'});
assert.equal(r.status,200); assert.equal((await r.json()).url,'https://checkout.stripe.com/c/pay/test');
assert.equal(sent['shipping_options[0][shipping_rate_data][fixed_amount][amount]'],'1700');
assert.equal(sent['line_items[0][quantity]'],'2');
r=await worker.fetch(req({items:one(),ship:'FL'},'https://evil.example'),{}); assert.equal(r.status,403);
// CORS preflight: the router must dispatch OPTIONS /checkout too, or the browser's
// preflight 404s and the real POST never goes out ("Failed to fetch").
const preflight = await worker.fetch(new Request('https://x/checkout',{method:'OPTIONS',headers:{Origin:'https://boringbeeco.com'}}),{});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://boringbeeco.com');
console.log('all checks pass');
