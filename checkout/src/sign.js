// A short, URL-safe HMAC so the "Buy label" link in the order email can't be
// guessed or edited (e.g. swapping in someone else's order id) by anyone who
// doesn't have FULFILL_SIGNING_SECRET.

export async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64url(mac);
}

export async function verify(value, sig, secret) {
  const expected = await sign(value, secret);
  return expected.length === sig.length && timingSafeEqual(expected, sig);
}

function base64url(buf) {
  let s = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
