# Boring Bee Co.

Static site for Boring Bee Company, a family apiary in Deerfield Beach, FL.
No build step, no server, no dependencies.

```
index.html        markup
css/styles.css    all styles
js/main.js        all interaction (comb toggle, year wheel, hero jars)
images/           product and photo assets (webp)
```

## Preview locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening index.html straight from disk also works.)

## Deploy (GitHub Pages)

Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
For a custom domain, add it under Settings → Pages, point DNS at GitHub,
then tick **Enforce HTTPS**.

## Checkout and security notes

- Checkout uses **Stripe Payment Links**. Prices, quantity limits and shipping
  live in the Stripe Dashboard, not in this code. The `$25` on the page is display
  text only; editing it in the browser changes nothing at checkout.
- This repo holds **no API keys** and needs none. Never commit a Stripe secret key
  (`sk_live_…`, `sk_test_…`, `rk_…`) or webhook secret (`whsec_…`). Anything in a
  public repo or sent to the browser is public.
- To change a product link, edit the `data-buy-liquid` / `data-buy-comb` attributes
  in `index.html`. `js/main.js` only accepts `https://buy.stripe.com/…` URLs.
- `index.html` sets a Content-Security-Policy. Adding a third-party script, font,
  embed or form endpoint means adding its domain there too, or it will be blocked.
- Fulfil orders from the Stripe Dashboard (or webhooks), never from someone
  landing on a "thank you" page.
