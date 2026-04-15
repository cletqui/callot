# Callot

Tide accessibility tracker for [Île Callot](https://fr.wikipedia.org/wiki/%C3%8Ele_Callot) — a tidal island in Brittany accessible by road at low tide.

## What it shows

- Live clock (Paris time)
- Current accessibility status (accessible / inaccessible) + countdown to next change
- Current tide height and direction (montante / descendante), tidal coefficient
- Current weather conditions (temperature, wind) from wttr.in
- 24h timeline with a cosine-interpolated tide height sparkline, dashed road threshold line, and access window segments
- Upcoming access windows (next 4), with duration and date when not today
- Today's tide schedule with per-window access markers; extends to tomorrow when no window remains today

## How it works

The road to Callot floods above a certain water level. Access windows are computed by cosine-interpolating the tide height between consecutive extremes and finding the exact crossing time at a configurable road threshold (default **4.5 m**):

```
H(t) = (h₁ + h₂) / 2  +  (h₁ − h₂) / 2 · cos(π · (t − t₁) / (t₂ − t₁))
```

**Opens** when the falling tide (high → low) crosses the threshold downward.  
**Closes** when the rising tide (low → high) crosses it upward.  
Cycles where the low tide stays above the threshold (no road access) are skipped.

Tide data comes from [api.cybai.re](https://api.cybai.re) (harbour ID 71), which scrapes and caches [maree.info](https://maree.info). The page title updates every second to reflect the current state (`✓ callot` / `callot · ouvre 23h15`), useful in pinned tabs.

## Stack

Vanilla HTML · CSS · JavaScript — no build step, no dependencies.

## Local development

Change `BASE_URL` at the top of `js/script.js`:

```js
const BASE_URL = "http://localhost:8787"; // local API
```

Then open `index.html` directly in a browser or serve it with any static server.

## Deploy

Connect the repo to [Cloudflare Pages](https://pages.cloudflare.com) — no build command, publish directory is the repo root.
