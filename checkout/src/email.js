// Sends the "someone ordered" email through Cloudflare's own Email Service —
// no separate email vendor. This needs boringbeeco.com's DNS moved onto
// Cloudflare and the domain "onboarded" as a sending domain there (see
// wrangler.toml for the one-time setup). It only touches sending records on
// a cf-bounce subdomain, so it does NOT touch the site's existing records or
// the MX records that deliver mail to boringbeeco@gmail.com — receiving stays
// exactly as it is today.
// Docs: https://developers.cloudflare.com/email-service/

const FROM = 'orders@boringbeeco.com';
const TO = 'boringbeeco@gmail.com';

export async function sendOrderEmail({ order, addr, rate, buyUrl, boxIsApproximate }, env) {
  const jars = order.lines.reduce((n, l) => n + l.qty, 0);
  const items = order.lines.map(l => `${l.qty} × ${l.name}`).join('<br>');
  const margin = order.shippingCharged - Math.round(Number(rate.amount) * 100);

  const warn = boxIsApproximate
    ? `<p style="color:#b45309"><b>Heads up:</b> ${jars} jars is bigger than this auto-quote is really built for (it assumes one small box). Check the box size and rate in Shippo by hand before trusting this number.</p>`
    : '';

  await send(env, {
    subject: `New order — ${order.customerName} — ${jars} jar${jars === 1 ? '' : 's'}`,
    html: `
      <p><b>${escapeHtml(order.customerName)}</b> (${escapeHtml(order.customerEmail || 'no email on file')}) just paid $${(order.totalPaid / 100).toFixed(2)}.</p>
      <p>${items}</p>
      <p>Shipping to:<br>${escapeHtml(addr.line1)}${addr.line2 ? '<br>' + escapeHtml(addr.line2) : ''}<br>${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} ${escapeHtml(addr.postal_code)}</p>
      <p>Customer paid $${(order.shippingCharged / 100).toFixed(2)} for shipping. The USPS label Shippo quoted costs $${Number(rate.amount).toFixed(2)} (${escapeHtml(rate.servicelevel?.name || rate.provider)}) — about $${(margin / 100).toFixed(2)} left over.</p>
      ${warn}
      <p><a href="${buyUrl}" style="display:inline-block;background:#4a7a32;color:#fff;padding:.6em 1.2em;border-radius:6px;text-decoration:none">Buy this label — $${Number(rate.amount).toFixed(2)}</a></p>
      <p style="color:#666;font-size:.9em">One click buys the label from Shippo and shows you the PDF to print. Nothing is charged until you click.</p>
    `,
  });
}

export async function sendPickupEmail(order, env) {
  const jars = order.lines.reduce((n, l) => n + l.qty, 0);
  const items = order.lines.map(l => `${l.qty} × ${l.name}`).join('<br>');
  await send(env, {
    subject: `New pickup order — ${order.customerName} — ${jars} jar${jars === 1 ? '' : 's'}`,
    html: `
      <p><b>${escapeHtml(order.customerName)}</b> (${escapeHtml(order.customerEmail || 'no email on file')}) just paid $${(order.totalPaid / 100).toFixed(2)} for pickup — no shipping needed.</p>
      <p>${items}</p>
      <p>Email them to set up a pickup time.</p>
    `,
  });
}

async function send(env, { subject, html }) {
  try {
    await env.EMAIL.send({ to: TO, from: FROM, subject, html });
  } catch (err) {
    // Same reasoning as the webhook handler: the order already happened,
    // so log it and move on rather than fail the whole webhook over an email.
    console.error('Cloudflare Email Service send failed', err?.code ?? err);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
