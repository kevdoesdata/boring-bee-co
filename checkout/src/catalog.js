// The single source of truth for what we sell and what it costs.
// The website can only send a SKU and a quantity; prices always come from here,
// so nobody can change a price by editing the page in their browser.
//
// To add a product: copy a block, give it a new SKU, set the price in cents.
// To add a size — the planned 2 lb and 5 lb jars included — it's just another
// SKU with its own `weightLb` (e.g. BBC-SPRING-LQ-2LB, weightLb: 2.9). Nothing
// else here needs to change: a cart can mix any SKUs and quantities, the
// total weight is summed across all of them, and the box size below is picked
// from that total — one 5 lb jar and five 1 lb jars that weigh the same get
// the same box tier. The one thing worth a second look when a bigger jar
// arrives is BOX_TIERS' dimensions, since a single tall 5 lb jar may not
// physically fit a box sized for several small ones even at the same weight.
//
// `weightLb` is the packed weight of ONE unit of that item, glass + lid +
// honey (+ comb, where it applies), with some padding for the padding itself.
// The liquid figure started from a real USPS receipt (the Chicago order: the
// counter scale read 1 lb 14.80 oz = 1.925 lb for one jar + box, which backs
// out to ~1.4 lb for the jar alone) and then added ~0.2 lb of headroom since
// that receipt was one dark, denser batch — lighter batches would otherwise
// under-ship. The comb weight is still a guess (no receipt for one yet) —
// weigh one on a kitchen scale the first time you ship one and tighten this.
export const CATALOG = {
  'BBC-SPRING-LQ': { name: 'Spring Flow Raw Honey, Liquid (1 lb)',    price: 2500, image: 'images/spring.webp',      weightLb: 1.6 },
  'BBC-SPRING-CB': { name: 'Spring Flow Raw Honey, With Comb (1 lb)', price: 2500, image: 'images/spring-comb.webp', weightLb: 1.7 },
  'BBC-FALL-LQ':   { name: 'Fall Flow Raw Honey, Liquid (1 lb)',      price: 2500, image: 'images/fall.webp',        weightLb: 1.6 },
  'BBC-FALL-CB':   { name: 'Fall Flow Raw Honey, With Comb (1 lb)',   price: 2500, image: 'images/fall-comb.webp',   weightLb: 1.7 },
};

// The box itself, empty, plus packing material. Backed out from the same
// receipt above. One flat number for every box size is an approximation —
// a box built for a 5-jar order uses a bit more cardboard than one for a
// single jar — but it's a small, roughly-constant fraction of the total
// weight either way, so one number is fine here.
export const BOX_WEIGHT_LB = 0.5;

// Which box to use, picked by the order's TOTAL weight (every SKU and
// quantity in the cart, added together) so a mixed cart of different jars
// and sizes still gets a sensible box — not just "how many jars." Tiers are
// checked in order and the first one the weight fits under wins. An order
// heavier than the last tier still goes through — the fulfillment email just
// flags it, since beyond this the auto-quote is a guess and the box and rate
// are worth checking by hand in Shippo.
//
// Add a tier here (not a wider MAX_JARS) once the 2 lb / 5 lb jars exist and
// real orders start landing in the next weight class up.
export const BOX_TIERS = [
  { maxWeightLb: 3,  length: 8,  width: 6,  height: 6  }, // ~1-2 one-pound jars
  { maxWeightLb: 7,  length: 10, width: 8,  height: 6  }, // ~3-4 one-pound jars, or a single 5 lb jar
  { maxWeightLb: 14, length: 12, width: 10, height: 8  }, // a full case
];

// Picks a box for a given total weight. Always returns a box — for anything
// heavier than every tier, it returns the largest one and says so, rather
// than guessing a size that definitely doesn't fit.
export function pickBox(totalWeightLb) {
  const tier = BOX_TIERS.find(t => totalWeightLb <= t.maxWeightLb);
  if (tier) return { ...tier, approximate: false };
  const largest = BOX_TIERS[BOX_TIERS.length - 1];
  return { ...largest, approximate: true };
}

// Optional price lists for specific customers (wholesale, friends & family...).
// Each tier maps SKU -> price in cents. Anything not listed uses the normal price.
// A tier only applies when the request carries its secret code, so the public
// can't guess their way into it. Codes live in the Worker's environment
// variables (TIER_CODES), not in this file.
export const TIERS = {
  // wholesale: { 'BBC-SPRING-LQ': 1600, 'BBC-FALL-LQ': 1600 },
};

// Shipping, in cents. Flat by region, 15% buffer over 2026 USPS Ground Advantage.
export const FREE_SHIPPING_OVER = 7500; // free on subtotals of $75 or more
export const ZONE_RATES = { A: 1200, B: 1700, C: 2300 };

// Ship-from: Deerfield Beach, FL.
//   A ($12): the Southeast
//   B ($17): East Coast, Midwest, South-central
//   C ($23): Mountain West, West Coast, Alaska, Hawaii
export const STATE_ZONE = {
  FL:'A', GA:'A', AL:'A', SC:'A', NC:'A', TN:'A', MS:'A',

  VA:'B', WV:'B', KY:'B', OH:'B', IN:'B', MI:'B', IL:'B', WI:'B', MN:'B',
  IA:'B', MO:'B', AR:'B', LA:'B', TX:'B', OK:'B', KS:'B', NE:'B', SD:'B',
  ND:'B', PA:'B', NY:'B', NJ:'B', DE:'B', MD:'B', DC:'B', CT:'B', RI:'B',
  MA:'B', VT:'B', NH:'B', ME:'B',

  MT:'C', WY:'C', CO:'C', NM:'C', AZ:'C', UT:'C', NV:'C', ID:'C', WA:'C',
  OR:'C', CA:'C', AK:'C', HI:'C',
};

export const MAX_JARS = 24; // per order; bigger orders email us

// Above this many jars, the fixed box size is a bad approximation. The order
// still goes through — the fulfillment email just flags it so you pick the
// box and rate by hand in Shippo instead of trusting the auto-quote.
export const SINGLE_BOX_MAX_JARS = 6;
