# Callot

Tide accessibility tracker for [Île Callot](https://fr.wikipedia.org/wiki/%C3%8Ele_Callot) — a tidal island in Brittany accessible by road at low tide.

## What it shows

- Live clock (Paris time)
- Current accessibility status + countdown to next change
- 24h timeline with access windows highlighted
- Today's tide schedule with access windows per low tide

## How it works

The road to Callot becomes impassable around mid-tide. Access windows are computed as the time interval between each pair of high↔low turning points — approximately ±3h around each low tide.

Tide data comes from [api.cybai.re](https://api.cybai.re) (harbour ID 71), which scrapes [maree.info](https://maree.info).

## Stack

Vanilla HTML · CSS · JavaScript — no build step.

## Deploy

Connect the repo to [Cloudflare Pages](https://pages.cloudflare.com) and set the build command to nothing (static site).

