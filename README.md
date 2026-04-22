# Callot

Tide accessibility tracker for [Île Callot](https://fr.wikipedia.org/wiki/%C3%8Ele_Callot) — a tidal island in Brittany accessible by road at low tide.

## What it shows

- Live clock (Paris time)
- Current accessibility status (accessible / inaccessible) + countdown to next change
- Current tide height and direction (montante / descendante), tidal coefficient
- Current weather conditions (temperature, wind) from wttr.in
- 24h timeline with a cosine-interpolated tide height sparkline, dashed road threshold line, and access window segments
- Upcoming access windows (next 4), each with a `DD/MM` date prefix and duration
- Today's tide schedule with per-window access markers; extends to tomorrow when no window remains today
- 7-day calendar view: one bar per day showing all access windows with time labels and a live cursor
- About section with road threshold and data sources

## How it works

The road to Callot floods above a certain water level. Access windows are computed by cosine-interpolating the tide height between consecutive extremes and finding the exact crossing time at a configurable road threshold (default **4.5 m**):

```
H(t) = (h₁ + h₂) / 2  +  (h₁ − h₂) / 2 · cos(π · (t − t₁) / (t₂ − t₁))
```

**Opens** when the falling tide (high → low) crosses the threshold downward.  
**Closes** when the rising tide (low → high) crosses it upward.  
Cycles where the low tide stays above the threshold (no road access) are skipped.

When the first available tide entry is a low tide (no preceding high tide in the API data), a virtual high tide is extrapolated by mirroring the half-period before the first low, ensuring sparkline and windows are rendered correctly from midnight.

Tide data comes from [api.cybai.re](https://api.cybai.re) (harbour ID 71), which scrapes and caches [maree.info](https://maree.info). The page title updates every second to reflect the current state (`✓ callot` / `callot · ouvre à 23h15`), useful in pinned tabs.

## Features

### PWA

The app is installable as a progressive web app (manifest + service worker). The shell (HTML, CSS, JS, icons) is cached for offline use; tide and weather data always fetches fresh from the network.

### Notifications

The bell icon schedules a browser notification 30 minutes before an access window closes (or opens). Foreground-only — no push server required.

### Bilingual

Toggle between French and English with the `EN`/`FR` button. Language preference is persisted in `localStorage`.

### Dark / light theme

Toggles via the moon/sun button; persisted in `localStorage`.

## Stack

Vanilla HTML · CSS · JavaScript — no build step, no dependencies.

## Local development

Change `BASE_URL` at the top of `js/script.js`:

```js
const BASE_URL = "http://localhost:8787"; // local API
```

Then open `index.html` directly in a browser or serve it with any static server (e.g. `python3 -m http.server`). Note: the service worker only activates over HTTPS or `localhost`.

## Deploy

Connect the repo to [Cloudflare Pages](https://pages.cloudflare.com) — no build command, publish directory is the repo root.
