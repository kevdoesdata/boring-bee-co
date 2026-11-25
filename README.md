# Boring Bee Co.

Static site for Boring Bee Company, a family apiary in Deerfield Beach, FL.
No build step, no server, no dependencies.

```
index.html        markup
css/styles.css    all styles
js/main.js        all interaction (comb toggle, year wheel, hero jars)
js/hero-tier.js   picks which hero jars a device gets (see below)
js/hero-3d.js     the 3D hero jars
js/vendor/        three.js r160 (MIT), self-hosted so the CSP stays 'self'
images/           product and photo assets (webp)
```

## Hero jars (3D)

The hero photos load first for everyone. On devices that can take it, the 3D jars fade in over
them once ready: drag and fling, flick up or down to tumble, they float home on their own,
honey sloshes slowly, and a small arrow resets them.

`js/hero-tier.js` picks one of four versions:

| Version | Who | What |
|---|---|---|
| Desktop | mouse / big screens | full 3D, see-through honey |
| Phone | recent phones | same look, lower resolution, half frame rate while jars just float |
| Older phone | ~5+ years old, budget chips, low battery | lighter honey, 30 fps |
| Photos | data saver, reduce motion, no WebGL, 3D failed | the photos, as before |

On phones, up/down swipes always scroll the page; a sideways swipe grabs a jar; a tap flips it
and shows a shop link. The 3D stops completely when the hero is off screen or the tab is hidden.
If a phone runs slower than expected it steps down a version on its own.

To try a version on purpose, add `#tier=full`, `#tier=phone`, `#tier=lite` or `#tier=photo`
to the URL and reload. 3D material colours live in the token block (`--j3-*`).

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
