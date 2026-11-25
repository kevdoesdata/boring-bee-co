// Checks that a webhook request really came from Stripe, using the
// Stripe-Signature header: "t=<timestamp>,v1=<hex hmac>".
// Hand-rolled with the Web Crypto API (no Stripe SDK) so this stays a plain
// Worker with no build step. Reference: https://docs.stripe.com/webhooks#verify-manually

export async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  // Reject anything more than 5 minutes old — stops a captured request being replayed later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const computedSig = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(computedSig, expectedSig);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
