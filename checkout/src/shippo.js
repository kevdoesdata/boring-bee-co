// Talks to Shippo: get a real postage rate for an address, then buy it.
// Docs: https://docs.goshippo.com

import { pickBox } from './catalog.js';

export async function createShipment({ env, name, address, weightLb }) {
  const shipFrom = JSON.parse(env.SHIP_FROM_JSON); // never in the repo — see index.js header comment
  const box = pickBox(weightLb); // sized off the order's total weight, not a fixed guess

  const res = await shippoFetch(env, '/shipments/', {
    address_from: shipFrom,
    address_to: {
      name,
      street1: address.line1,
      street2: address.line2 || '',
      city: address.city,
      state: address.state,
      zip: address.postal_code,
      country: address.country || 'US',
    },
    parcels: [{
      length: String(box.length),
      width: String(box.width),
      height: String(box.height),
      distance_unit: 'in',
      weight: String(weightLb),
      mass_unit: 'lb',
    }],
    async: false,
  });
  if (!res.rates) throw new Error('Shippo shipment creation failed: ' + JSON.stringify(res).slice(0, 500));
  return { ...res, boxIsApproximate: box.approximate };
}

// Pick USPS Ground Advantage if it's there; otherwise the cheapest rate Shippo offers.
// (If address validation flagged a problem, Shippo still returns rates but you'll
// want to glance at the order email's address before clicking Buy — it's shown there.)
export function pickRate(rates) {
  if (!rates?.length) return null;
  const usps = rates.filter(r => r.provider === 'USPS' && /ground_advantage/i.test(r.servicelevel?.token || ''));
  const pool = usps.length ? usps : rates;
  return pool.slice().sort((a, b) => Number(a.amount) - Number(b.amount))[0];
}

export async function buyLabel({ env, rateId }) {
  return shippoFetch(env, '/transactions/', {
    rate: rateId,
    label_file_type: 'PDF',
    async: false,
  });
}

async function shippoFetch(env, path, body) {
  const res = await fetch(`https://api.goshippo.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${env.SHIPPO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
