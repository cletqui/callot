// ── Constants ────────────────────────────────────────────────────────────

// Change BASE_URL to "http://localhost:8787" for local development
const BASE_URL = "https://api.cybai.re";
const HARBOUR_ID = "71";
const API_URL = `${BASE_URL}/data/tide?id=${HARBOUR_ID}`;
const WEATHER_URL = `${BASE_URL}/data/weather?location=Carantec`;
const ROAD_THRESHOLD = 4.5; // metres — road floods above this level

// ── i18n ──────────────────────────────────────────────────────────────────

const LANGS = {
  fr: {
    accessible: "accessible",
    inaccessible: "inaccessible",
    opens_in: "ouvre dans",
    closes_in: "ferme dans",
    opens_at: "ouvre à",
    opens_verb: "ouvre",
    tide_rising: "▲ marée montante",
    tide_falling: "▼ marée descendante",
    coeff_abbr: "coeff.",
    coeff_labels: {
      "morte-eau": "morte-eau",
      normale: "normale",
      "vive-eau": "vive-eau",
      "vive-eau exceptionnelle": "vive-eau exceptionnelle",
    },
    upcoming_label: "fenêtres à venir",
    calendar_label: "semaine",
    schedule_label: "marées",
    opens_marker: "— accessible",
    closes_marker: "— inaccessible",
    date_locale: "fr-FR",
    toggle: "FR",
    bell_on: "Alertes activées",
    bell_off: "Activer les alertes",
    notify_closes: (t, m) =>
      `La route ferme dans ~${m} min — quittez l'île avant ${t}.`,
    notify_opens: (t, m) => `La route ouvre dans ~${m} min (${t}).`,
    about_label: "à propos",
  },
  en: {
    accessible: "accessible",
    inaccessible: "inaccessible",
    opens_in: "opens in",
    closes_in: "closes in",
    opense_at: "opens at",
    opens_verb: "opens",
    tide_rising: "▲ rising tide",
    tide_falling: "▼ falling tide",
    coeff_abbr: "coeff.",
    coeff_labels: {
      "morte-eau": "neap tide",
      normale: "average",
      "vive-eau": "spring tide",
      "vive-eau exceptionnelle": "exceptional spring",
    },
    upcoming_label: "upcoming windows",
    calendar_label: "week",
    schedule_label: "tides",
    opens_marker: "— accessible",
    closes_marker: "— inaccessible",
    date_locale: "en-GB",
    toggle: "EN",
    bell_on: "Alerts on",
    bell_off: "Enable alerts",
    notify_closes: (t, m) =>
      `Road closes in ~${m} min — leave the island before ${t}.`,
    notify_opens: (t, m) => `Road opens in ~${m} min (${t}).`,
    about_label: "about",
  },
};

let lang = localStorage.getItem("lang") ?? "fr";
let T = LANGS[lang];

// ── Theme ────────────────────────────────────────────────────────────────

const html = document.documentElement;
const themeBtn = document.getElementById("theme-btn");
const themeIcon = document.getElementById("theme-icon");

const stored = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme = stored ?? (prefersDark ? "dark" : "light");
html.setAttribute("data-theme", initialTheme);
themeIcon.src =
  initialTheme === "dark" ? "./icons/moon.svg" : "./icons/sun.svg";

themeBtn.addEventListener("click", () => {
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  themeIcon.src = next === "dark" ? "./icons/moon.svg" : "./icons/sun.svg";
});

// ── Notifications ────────────────────────────────────────────────────────

const NOTIFY_BEFORE_MS = 30 * 60 * 1000;
let notifyTimer = null;
let notifyEnabled = localStorage.getItem("notify") === "on";

function scheduleNotification(windows) {
  clearTimeout(notifyTimer);
  if (!notifyEnabled || Notification.permission !== "granted") return;
  const now = nowParis().getTime();
  for (const w of windows) {
    if (now >= w.opens.getTime() && now < w.closes.getTime()) {
      const delay = w.closes.getTime() - NOTIFY_BEFORE_MS - now;
      if (delay > 0) {
        notifyTimer = setTimeout(() => {
          const min = Math.round((w.closes.getTime() - Date.now()) / 60000);
          new Notification("🌊 Callot", {
            body: T.notify_closes(fmtTime(w.closes), min),
            icon: "./icons/icon.svg",
            tag: "callot-alert",
          });
        }, delay);
      }
      return;
    }
  }
  const next = windows.find((w) => w.opens.getTime() > now);
  if (next) {
    const delay = next.opens.getTime() - NOTIFY_BEFORE_MS - now;
    if (delay > 0) {
      notifyTimer = setTimeout(() => {
        const min = Math.round((next.opens.getTime() - Date.now()) / 60000);
        new Notification("🌊 Callot", {
          body: T.notify_opens(fmtTime(next.opens), min),
          icon: "./icons/icon.svg",
          tag: "callot-alert",
        });
      }, delay);
    }
  }
}

function updateBellState() {
  const b = document.getElementById("bell-btn");
  if (!b) return;
  const active = notifyEnabled && Notification.permission === "granted";
  b.classList.toggle("is-active", active);
  b.title = active ? T.bell_on : T.bell_off;
  b.setAttribute("aria-label", active ? T.bell_on : T.bell_off);
}

const bellBtn = document.getElementById("bell-btn");
if (bellBtn) {
  updateBellState();
  bellBtn.addEventListener("click", async () => {
    if (notifyEnabled) {
      notifyEnabled = false;
      localStorage.setItem("notify", "off");
      clearTimeout(notifyTimer);
    } else {
      if (!("Notification" in window)) return;
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm === "granted") {
        notifyEnabled = true;
        localStorage.setItem("notify", "on");
        if (appData) scheduleNotification(appData.allWindows);
      }
    }
    updateBellState();
  });
}

// ── About ─────────────────────────────────────────────────────────────────

function updateAbout() {
  const label = document.getElementById("about-label");
  const text = document.getElementById("about-text");
  if (label) label.textContent = T.about_label;
  if (!text) return;
  const thresh = String(ROAD_THRESHOLD).replace(".", lang === "fr" ? "," : ".");
  text.innerHTML =
    lang === "fr"
      ? `L'<strong>île Callot</strong> est une île bretonne accessible à pied via une route submersible lors des marées basses. Cette page indique en temps réel si la traversée est possible et combien de temps il reste. Le seuil d'accessibilité est à <strong>${thresh}\u00a0m</strong>.`
      : `<strong>Île Callot</strong> is a tidal island in Brittany accessible on foot via a tidal road during low tide. This page shows in real time whether crossing is possible and how much time remains. The road threshold is <strong>${thresh} m</strong>.`;
}

updateAbout();

// ── Lang ─────────────────────────────────────────────────────────────────

const langBtn = document.getElementById("lang-btn");
langBtn.textContent = T.toggle;

langBtn.addEventListener("click", () => setLang(lang === "fr" ? "en" : "fr"));

function setLang(newLang) {
  lang = newLang;
  T = LANGS[lang];
  localStorage.setItem("lang", lang);
  langBtn.textContent = T.toggle;
  updateBellState();
  updateAbout();
  if (appData) renderAll(appData);
}

// ── Time helpers ─────────────────────────────────────────────────────────

// Tide timestamps use Europe/Paris local time stored with a "Z" suffix
// (naive-UTC trick from the API). We mirror this for "now".
function nowParis() {
  const s = new Date().toLocaleString("sv", { timeZone: "Europe/Paris" });
  return new Date(s + "Z");
}

// Parse "DD/MM/YYYY HH:MM:SS" as naive-UTC (Paris local time)
function parseTimestamp(ts) {
  const [datePart, timePart] = ts.split(" ");
  const [day, month, year] = datePart.split("/");
  return new Date(`${year}-${month}-${day}T${timePart}Z`);
}

function fmtTime(d) {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}h${m}`;
}

function fmtCountdown(ms) {
  if (ms <= 0) return "maintenant";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h\u00a0${min}min`;
}

// Format a date_index ("20260416") as a localised long date string.
function fmtDate(dateIndex) {
  const y = parseInt(dateIndex.slice(0, 4));
  const m = parseInt(dateIndex.slice(4, 6)) - 1;
  const d = parseInt(dateIndex.slice(6, 8));
  return new Date(Date.UTC(y, m, d)).toLocaleDateString(T.date_locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Increment a date_index by one day.
function nextDateIndex(dateIndex) {
  const y = parseInt(dateIndex.slice(0, 4));
  const m = parseInt(dateIndex.slice(4, 6)) - 1;
  const d = parseInt(dateIndex.slice(6, 8));
  const next = new Date(Date.UTC(y, m, d + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}`;
}

function sameUTCDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Abbreviated day names per language (indexed by getUTCDay(), 0 = Sunday)
const SHORT_DAYS = {
  fr: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  en: ["Sun.", "Mon.", "Tue.", "Wed.", "Thu.", "Fri.", "Sat."],
};

// Returns "HHhMM", appending a day abbreviation when d is not on the same
// day as refDate (e.g. "23h15 mer." for a cross-midnight marker).
function fmtTimeWithDay(d, refDate) {
  const time = fmtTime(d);
  if (sameUTCDay(d, refDate)) return time;
  return `${time}\u00a0${SHORT_DAYS[lang][d.getUTCDay()]}`;
}

// ── Access window computation ────────────────────────────────────────────

function parseHeight(h) {
  return parseFloat(String(h).replace(",", ".").replace("m", ""));
}

// Between two consecutive tide extremes the height follows a cosine curve:
//   H(t) = (h1+h2)/2 + (h1-h2)/2 · cos(π·(t−t1)/(t2−t1))
// This holds whether the tide is falling (h1>h2) or rising (h1<h2).
// Returns the ms timestamp when H(t) = threshold, or null if out of range.
function crossingTime(t1Ms, h1, t2Ms, h2, threshold) {
  const range = h1 - h2;
  if (Math.abs(range) < 0.001) return null; // flat — no crossing
  const cosVal = (2 * threshold - h1 - h2) / range;
  if (cosVal < -1 || cosVal > 1) return null; // threshold outside [h2, h1]
  return t1Ms + (Math.acos(cosVal) / Math.PI) * (t2Ms - t1Ms);
}

// For each low tide, compute the exact times when the road opens (falling
// tide crosses ROAD_THRESHOLD downward) and closes (rising tide crosses
// ROAD_THRESHOLD upward).
function computeWindows(entries) {
  const windows = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type !== "low_tide") continue;
    const prev = i > 0 ? entries[i - 1] : null;
    const next = i < entries.length - 1 ? entries[i + 1] : null;
    if (!prev || !next) continue;

    const tLow = parseTimestamp(entries[i].timestamp).getTime();
    const hLow = parseHeight(entries[i].high);
    const tPrev = parseTimestamp(prev.timestamp).getTime();
    const hPrev = parseHeight(prev.high);
    const tNext = parseTimestamp(next.timestamp).getTime();
    const hNext = parseHeight(next.high);

    if (isNaN(hLow) || isNaN(hPrev) || isNaN(hNext)) continue;

    // Low tide above threshold means road is permanently submerged this cycle
    if (hLow >= ROAD_THRESHOLD) continue;

    // Opens: falling tide (prev_high → low) crosses threshold downward
    const opensMs = crossingTime(tPrev, hPrev, tLow, hLow, ROAD_THRESHOLD);
    // Closes: rising tide (low → next_high) crosses threshold upward
    const closesMs = crossingTime(tLow, hLow, tNext, hNext, ROAD_THRESHOLD);

    if (opensMs === null || closesMs === null) continue;

    windows.push({ opens: new Date(opensMs), closes: new Date(closesMs) });
  }
  return windows;
}

function resolveStatus(windows, now) {
  for (const w of windows) {
    if (now >= w.opens && now < w.closes) {
      return { accessible: true, changesAt: w.closes };
    }
  }
  const next = windows.find((w) => w.opens > now);
  return { accessible: false, changesAt: next ? next.opens : null };
}

// ── Height interpolation ─────────────────────────────────────────────────

// Cosine-interpolate the tide height at any arbitrary timestamp.
function heightAt(entries, tMs) {
  let prev = null;
  let next = null;
  for (const e of entries) {
    const ts = parseTimestamp(e.timestamp).getTime();
    if (ts <= tMs) prev = e;
    else if (!next) next = e;
  }
  if (!prev || !next) return null;
  const t1 = parseTimestamp(prev.timestamp).getTime();
  const h1 = parseHeight(prev.high);
  const t2 = parseTimestamp(next.timestamp).getTime();
  const h2 = parseHeight(next.high);
  if (isNaN(h1) || isNaN(h2)) return null;
  return (
    (h1 + h2) / 2 +
    ((h1 - h2) / 2) * Math.cos((Math.PI * (tMs - t1)) / (t2 - t1))
  );
}

// ── Entry builder ────────────────────────────────────────────────────────

// Full multi-day list from the API response — deduplicated and sorted
// chronologically. Used for all window computation and the sparkline.
// Sorting ensures heightAt() and computeWindows() always see correct
// prev/next neighbours regardless of where last_tide falls.
function buildAllEntries(data) {
  const map = new Map();
  if (data.last_tide?.timestamp)
    map.set(data.last_tide.timestamp, data.last_tide);
  for (const day of Object.values(data.data)) {
    for (const e of day.tide_data) map.set(e.timestamp, e);
  }
  const sorted = [...map.values()].sort(
    (a, b) =>
      parseTimestamp(a.timestamp).getTime() -
      parseTimestamp(b.timestamp).getTime(),
  );

  // If the earliest known entry is a low tide, there is no preceding high tide
  // to anchor the cosine curve (the API only provides data from today onwards).
  // Extrapolate a virtual high tide by mirroring the half-period to the next
  // known high tide — a symmetric approximation accurate enough for rendering.
  if (sorted.length >= 2 && sorted[0].type === "low_tide") {
    const nextHigh = sorted.find((e) => e.type === "high_tide");
    if (nextHigh) {
      const tLowMs = parseTimestamp(sorted[0].timestamp).getTime();
      const tNextHighMs = parseTimestamp(nextHigh.timestamp).getTime();
      const tVirtualMs = tLowMs - (tNextHighMs - tLowMs);
      const d = new Date(tVirtualMs);
      const pad = (n) => String(n).padStart(2, "0");
      const ts = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      sorted.unshift({
        type: "high_tide",
        time: `${pad(d.getUTCHours())}h${pad(d.getUTCMinutes())}`,
        high: nextHigh.high,
        timestamp: ts,
      });
    }
  }

  return sorted;
}

// ── Clock ────────────────────────────────────────────────────────────────

const clockEl = document.getElementById("clock");
const clockSec = document.getElementById("clock-sec");

function tickClock() {
  const now = nowParis();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  clockEl.firstChild.textContent = `${hh}:${mm}`;
  clockSec.textContent = `:${ss}`;
}

setInterval(tickClock, 1000);
tickClock();

// ── Render ───────────────────────────────────────────────────────────────

const statusLabel = document.getElementById("status-label");
const statusSub = document.getElementById("status-sub");
const statusTide = document.getElementById("status-tide");
const statusWeather = document.getElementById("status-weather");
const tlWindows = document.getElementById("timeline-windows");
const tlTicks = document.getElementById("timeline-ticks");
const tlTickLabels = document.getElementById("timeline-tick-labels");
const tlNow = document.getElementById("timeline-now");
const tlTides = document.getElementById("timeline-tides");
const tlTideLabels = document.getElementById("timeline-tide-labels");
const tlSvg = document.getElementById("timeline-svg");
const schedDate = document.getElementById("schedule-date");
const schedRows = document.getElementById("schedule-rows");
const upcomingRows = document.getElementById("upcoming-rows");

// Returns tide direction, coeff label, and interpolated current height.
function getTideInfo(entries, now) {
  const nowTs = now.getTime();
  let lastBefore = null;
  let nextAfter = null;
  for (const e of entries) {
    const ts = parseTimestamp(e.timestamp).getTime();
    if (ts <= nowTs) lastBefore = e;
    else if (!nextAfter) nextAfter = e;
  }
  const direction =
    lastBefore?.type === "low_tide"
      ? T.tide_rising
      : lastBefore?.type === "high_tide"
        ? T.tide_falling
        : "";
  const nearHigh =
    lastBefore?.type === "high_tide"
      ? lastBefore
      : nextAfter?.type === "high_tide"
        ? nextAfter
        : entries.find((e) => e.type === "high_tide" && e.coeff_label);
  const coeffLabel = nearHigh?.coeff_label ?? null;
  const coeffNum = nearHigh?.coeff ?? null;
  const displayLabel = coeffLabel
    ? (T.coeff_labels[coeffLabel] ?? coeffLabel)
    : null;
  const coeff = displayLabel
    ? coeffNum
      ? `${displayLabel} (${T.coeff_abbr} ${coeffNum})`
      : displayLabel
    : null;
  const height = heightAt(entries, nowTs);
  return { direction, coeff, height };
}

function renderStatus(windows, entries) {
  const now = nowParis();
  const { accessible, changesAt } = resolveStatus(windows, now);

  statusLabel.textContent = accessible ? T.accessible : T.inaccessible;
  statusLabel.classList.toggle("accessible", accessible);
  statusLabel.classList.toggle("inaccessible", !accessible);

  if (changesAt) {
    const ms = changesAt.getTime() - now.getTime();
    const verb = accessible ? T.closes_in : T.opens_in;
    statusSub.innerHTML = `${verb} <strong>${fmtCountdown(ms)}</strong> (<strong>${fmtTime(changesAt)}</strong>)`;
  } else {
    statusSub.textContent = "";
  }

  const { direction, coeff, height } = getTideInfo(entries, now);
  const heightStr =
    height !== null ? `${height.toFixed(1).replace(".", ",")} m` : null;
  const mainStr = [direction, heightStr].filter(Boolean).join(" · ");
  statusTide.innerHTML = coeff
    ? `${mainStr}<span class="st-coeff">${coeff}</span>`
    : mainStr;

  // Page title reflects current status (useful in pinned/background tabs)
  document.title = accessible
    ? "✓ callot"
    : changesAt
      ? `callot · ${T.opens_at} ${fmtTime(changesAt)}`
      : "✗ callot";

  // Timeline cursor
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const pct = ((now.getTime() - dayStart.getTime()) / 86400000) * 100;
  tlNow.style.left = `${pct}%`;
}

function renderTimeline(windows, entries) {
  const now = nowParis();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEnd = dayStartMs + 86400000;

  function pct(d) {
    const t = Math.max(dayStartMs, Math.min(dayEnd, d.getTime()));
    return ((t - dayStartMs) / 86400000) * 100;
  }

  tlWindows.innerHTML = "";
  tlTides.innerHTML = "";
  tlTicks.innerHTML = "";
  tlTickLabels.innerHTML = "";
  tlTideLabels.innerHTML = "";

  // ── Sparkline ────────────────────────────────────────────────────────
  const SVG_W = 1000;
  const SVG_H = 100;
  const allHeights = entries
    .map((e) => parseHeight(e.high))
    .filter((h) => !isNaN(h));
  const maxH = Math.max(6, ...allHeights);

  const step = 10 * 60 * 1000; // sample every 10 min
  const parts = [];
  let penUp = true; // lift pen at null gaps so no straight lines are drawn
  for (let t = dayStartMs; t <= dayEnd; t += step) {
    const h = heightAt(entries, t);
    if (h === null) {
      penUp = true;
      continue;
    }
    const x = (((t - dayStartMs) / 86400000) * SVG_W).toFixed(1);
    const y = (SVG_H - (h / maxH) * SVG_H).toFixed(1);
    parts.push(`${penUp ? "M" : "L"} ${x} ${y}`);
    penUp = false;
  }
  const threshY = (SVG_H - (ROAD_THRESHOLD / maxH) * SVG_H).toFixed(1);
  tlSvg.innerHTML =
    `<path d="${parts.join(" ")}" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"/>` +
    `<line x1="0" y1="${threshY}" x2="${SVG_W}" y2="${threshY}" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.3"/>`;

  // ── Tide marks + PM/BM labels ─────────────────────────────────────────
  for (const e of entries) {
    const ts = parseTimestamp(e.timestamp);
    const x = pct(ts);
    if (x <= 0 || x >= 100) continue;
    const isHigh = e.type === "high_tide";

    const mark = document.createElement("div");
    mark.className = `tw-tide-mark ${isHigh ? "is-high" : "is-low"}`;
    mark.style.left = `${x}%`;
    tlTides.appendChild(mark);

    const label = document.createElement("span");
    label.className = `tw-tide-label${isHigh ? "" : " is-low"}`;
    label.style.left = `${Math.min(Math.max(x, 4), 96)}%`;
    label.textContent = isHigh ? "PM" : "BM";
    tlTideLabels.appendChild(label);
  }

  // ── Access window segments + ticks ───────────────────────────────────
  for (const w of windows) {
    const leftPct = pct(w.opens);
    const rightPct = pct(w.closes);

    if (rightPct <= 0 || leftPct >= 100) continue;

    const seg = document.createElement("div");
    seg.className = "tw-segment";
    seg.style.left = `${leftPct}%`;
    seg.style.right = `${100 - rightPct}%`;
    tlWindows.appendChild(seg);

    addTick(leftPct, w.opens, "is-opens");
    if (rightPct < 100) addTick(rightPct, w.closes, "is-closes");
  }

  function addTick(x, date, cls) {
    const tick = document.createElement("div");
    tick.className = "tw-tick";
    tick.style.left = `${x}%`;
    tlTicks.appendChild(tick);

    const label = document.createElement("span");
    label.className = `tw-tick-label ${cls}`;
    label.style.left = `${Math.min(Math.max(x, 6), 94)}%`;
    label.textContent = fmtTime(date);
    tlTickLabels.appendChild(label);
  }
}

// ── Upcoming windows ─────────────────────────────────────────────────────

function renderUpcoming(allWindows, now) {
  // Windows not yet fully closed, next 4
  const relevant = allWindows.filter((w) => w.closes > now).slice(0, 4);

  upcomingRows.innerHTML = "";
  for (const w of relevant) {
    const isActive = now >= w.opens;
    const durationMs = w.closes.getTime() - w.opens.getTime();

    const row = document.createElement("div");
    row.className = "upcoming-row" + (isActive ? " is-active" : "");

    // Always show a date prefix so it's clear which day the window belongs to
    const dateHtml = `<span class="upcoming-date">${String(w.opens.getUTCDate()).padStart(2, "0")}/${String(w.opens.getUTCMonth() + 1).padStart(2, "0")}</span>`;

    row.innerHTML =
      dateHtml +
      `<span class="upcoming-opens">${fmtTime(w.opens)}</span>` +
      `<span class="upcoming-sep">→</span>` +
      `<span class="upcoming-closes">${fmtTime(w.closes)}</span>` +
      `<span class="upcoming-dur">${fmtCountdown(durationMs)}</span>`;
    upcomingRows.appendChild(row);
  }
}

// ── Schedule ─────────────────────────────────────────────────────────────

// allEntries: the sorted, deduplicated full entry list (passed in so
// windowForEntry can correctly map overnight low tides to their windows).
function renderSchedule(data, windows, allEntries) {
  const now = nowParis();
  const nowTs = now.getTime();

  const todayDateIndex = data.forecast.date_index;
  const tomorrowDateIndex = nextDateIndex(todayDateIndex);

  document.getElementById("schedule-label").textContent = T.schedule_label;
  schedDate.textContent = fmtDate(todayDateIndex);
  schedRows.innerHTML = "";

  const todayEntries = data.forecast.tide_data;
  const days = Object.values(data.data);
  const tomorrowData = days.length > 1 ? days[1] : null;

  // Build a map from low-tide entry → its access window using the full
  // sorted entry list so cross-midnight low tides are found correctly.
  const windowForEntry = new Map(); // keyed by timestamp string
  for (const e of allEntries) {
    if (e.type !== "low_tide") continue;
    const lowTime = parseTimestamp(e.timestamp);
    const win = windows.find((w) => lowTime >= w.opens && lowTime <= w.closes);
    if (win) windowForEntry.set(e.timestamp, win);
  }

  const lastTodayTs = todayEntries.length
    ? parseTimestamp(todayEntries[todayEntries.length - 1].timestamp).getTime()
    : 0;
  const hasUpcomingWindowToday = windows.some(
    (w) => w.opens.getTime() > nowTs && w.opens.getTime() <= lastTodayTs,
  );

  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const tomorrowStart = dayStart.getTime() + 86400000;
  const tomorrowDate = new Date(tomorrowStart);

  // sectionDate: reference Date for the current schedule section, used to
  // detect cross-day access markers and append a day abbreviation to them.
  function renderEntries(entries, sectionDate, renderedOpens = new Set()) {
    for (const e of entries) {
      const isHigh = e.type === "high_tide";
      const isPast = parseTimestamp(e.timestamp).getTime() < nowTs;
      const win = windowForEntry.get(e.timestamp);

      // Before a low tide: insert an "opens" marker
      if (!isHigh && win && !renderedOpens.has(win)) {
        const m = document.createElement("div");
        m.className =
          "access-marker is-opens" +
          (win.opens.getTime() < nowTs ? " past" : "");
        m.innerHTML = `<span class="marker-time">${fmtTimeWithDay(win.opens, sectionDate)}</span> ${T.opens_marker}`;
        schedRows.appendChild(m);
      }

      // Tide row
      const row = document.createElement("div");
      row.className = "tide-row" + (isPast ? " past" : "");

      const arrow = document.createElement("span");
      arrow.className = "tide-arrow";
      arrow.textContent = isHigh ? "▲" : "▼";

      const time = document.createElement("span");
      time.className = "tide-time";
      time.textContent = e.time;

      const height = document.createElement("span");
      height.className = "tide-height" + (isHigh ? "" : " low");
      height.textContent = e.high.replace(",", ".");

      row.appendChild(arrow);
      row.appendChild(time);
      row.appendChild(height);

      if (isHigh && e.coeff_label) {
        const coeff = document.createElement("span");
        coeff.className = "tide-coeff";
        const displayLabel = T.coeff_labels[e.coeff_label] ?? e.coeff_label;
        coeff.textContent = e.coeff
          ? `${displayLabel} · ${T.coeff_abbr} ${e.coeff}`
          : displayLabel;
        row.appendChild(coeff);
      }

      schedRows.appendChild(row);

      // After a low tide: insert a "closes" marker
      if (!isHigh && win) {
        const m = document.createElement("div");
        m.className =
          "access-marker is-closes" +
          (win.closes.getTime() < nowTs ? " past" : "");
        m.innerHTML = `<span class="marker-time">${fmtTimeWithDay(win.closes, sectionDate)}</span> ${T.closes_marker}`;
        schedRows.appendChild(m);
      }
    }
  }

  renderEntries(todayEntries, now);

  if (!hasUpcomingWindowToday && tomorrowData) {
    // Cross-midnight windows: the "opens" marker falls in today's section
    // but the low tide is tomorrow. Render those opens markers before the
    // day separator, using `now` as reference (it's a today-section time).
    const preRendered = new Set();
    for (const e of tomorrowData.tide_data) {
      if (e.type !== "low_tide") continue;
      const win = windowForEntry.get(e.timestamp);
      if (win && win.opens.getTime() < tomorrowStart) {
        const m = document.createElement("div");
        m.className =
          "access-marker is-opens" +
          (win.opens.getTime() < nowTs ? " past" : "");
        m.innerHTML = `<span class="marker-time">${fmtTimeWithDay(win.opens, now)}</span> ${T.opens_marker}`;
        schedRows.appendChild(m);
        preRendered.add(win);
      }
    }

    const sep = document.createElement("div");
    sep.className = "schedule-day-sep";
    sep.textContent = fmtDate(tomorrowDateIndex);
    schedRows.appendChild(sep);

    renderEntries(tomorrowData.tide_data, tomorrowDate, preRendered);
  }
}

// ── Calendar ─────────────────────────────────────────────────────────────

function renderCalendar(allWindows, data) {
  const calRows = document.getElementById("calendar-rows");
  if (!calRows) return;
  document.getElementById("calendar-label").textContent = T.calendar_label;
  calRows.innerHTML = "";
  const now = nowParis();

  // Keys in data.data are YYYYMMDD + day-offset digit (e.g. "202604220" = April 22 +0)
  const baseIndex = data.forecast.date_index;
  const baseMs = Date.UTC(
    parseInt(baseIndex.slice(0, 4)),
    parseInt(baseIndex.slice(4, 6)) - 1,
    parseInt(baseIndex.slice(6, 8)),
  );

  for (const key of Object.keys(data.data)) {
    const offset = parseInt(key.slice(8));
    const dayStartMs = baseMs + offset * 86400000;
    const dayEndMs = dayStartMs + 86400000;
    const isToday = offset === 0;

    const dayWindows = allWindows.filter(
      (w) => w.opens.getTime() < dayEndMs && w.closes.getTime() > dayStartMs,
    );

    const row = document.createElement("div");
    row.className = "cal-row" + (isToday ? " is-today" : "");

    const dayEl = document.createElement("div");
    dayEl.className = "cal-day";
    const d = new Date(dayStartMs);
    const shortDay = d.toLocaleDateString(T.date_locale, {
      weekday: "short",
      timeZone: "UTC",
    });
    dayEl.textContent = `${shortDay} ${d.getUTCDate()}`;
    row.appendChild(dayEl);

    const bar = document.createElement("div");
    bar.className = "cal-bar";

    for (const w of dayWindows) {
      const opensMs = Math.max(w.opens.getTime(), dayStartMs);
      const closesMs = Math.min(w.closes.getTime(), dayEndMs);
      const leftPct = ((opensMs - dayStartMs) / 86400000) * 100;
      const rightPct = 100 - ((closesMs - dayStartMs) / 86400000) * 100;
      const widthPct = 100 - leftPct - rightPct;

      const seg = document.createElement("div");
      seg.className = "cal-segment";
      seg.style.left = `${leftPct}%`;
      seg.style.right = `${rightPct}%`;
      const lR = leftPct < 0.1 ? "3px" : "0";
      const rR = rightPct < 0.1 ? "3px" : "0";
      seg.style.borderRadius = `${lR} ${rR} ${rR} ${lR}`;

      const isContinuation = w.opens.getTime() < dayStartMs;
      const continuesNext = w.closes.getTime() > dayEndMs;

      let labelText = null;
      if (!isContinuation && widthPct > 13)
        labelText = continuesNext
          ? `${fmtTime(w.opens)}-`
          : `${fmtTime(w.opens)}-${fmtTime(w.closes)}`;
      else if (isContinuation && widthPct > 5)
        labelText = `-${fmtTime(w.closes)}`;
      else if (isContinuation) {
        const ext = document.createElement("span");
        ext.className = "cal-ext-label";
        ext.textContent = `-${fmtTime(w.closes)}`;
        ext.style.left = `${leftPct + widthPct}%`;
        bar.appendChild(ext);
      }

      if (labelText) {
        const lbl = document.createElement("span");
        lbl.className = "cal-time-label";
        lbl.textContent = labelText;
        seg.appendChild(lbl);
      }

      bar.appendChild(seg);
    }

    if (isToday) {
      const nowPct = ((now.getTime() - dayStartMs) / 86400000) * 100;
      if (nowPct > 0 && nowPct < 100) {
        const nowLine = document.createElement("div");
        nowLine.className = "cal-now";
        nowLine.style.left = `${nowPct}%`;
        bar.appendChild(nowLine);
      }
    }

    row.appendChild(bar);

    calRows.appendChild(row);
  }
}

// ── App state & init ──────────────────────────────────────────────────────

let appData = null; // retained for re-render on language change

function renderAll({ data, allEntries, allWindows }) {
  document.getElementById("upcoming-label").textContent = T.upcoming_label;
  document.getElementById("schedule-label").textContent = T.schedule_label;
  renderTimeline(allWindows, allEntries);
  renderCalendar(allWindows, data);
  renderSchedule(data, allWindows, allEntries);
  renderUpcoming(allWindows, nowParis());
}

// ── Fetch ─────────────────────────────────────────────────────────────────

// Weather — non-blocking, populates the status block when ready
fetch(WEATHER_URL)
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (!data) return;
    const cc = data.current_condition?.[0];
    if (!cc) return;
    // Inline SVG icons inherit currentColor — no filter tricks needed
    const tempIcon = `<svg class="wi" viewBox="0 0 6 12" aria-hidden="true"><rect x="2.2" y="0" width="1.6" height="7.5" rx="0.8" fill="currentColor"/><circle cx="3" cy="10" r="2" fill="currentColor"/></svg>`;
    const windIcon = `<svg class="wi" viewBox="0 0 12 6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><line x1="0.6" y1="1.5" x2="11.4" y2="1.5"/><line x1="0.6" y1="4.5" x2="7.5" y2="4.5"/></svg>`;
    statusWeather.innerHTML = `${tempIcon} ${cc.temp_C}°C · ${windIcon} ${parseInt(cc.windspeedKmph, 10)} km/h ${cc.winddir16Point}`;
    statusWeather.hidden = false;
  })
  .catch(() => {});

// Tide data
fetch(API_URL)
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    // Single sorted entry list used for everything — windows, sparkline,
    // height interpolation. Avoids the ordering bug where last_tide (e.g.
    // HT@06h15 today) sat before LT@00h30 and broke overnight windows.
    const allEntries = buildAllEntries(data);
    const allWindows = computeWindows(allEntries);

    appData = { data, allEntries, allWindows };
    renderAll(appData);
    scheduleNotification(allWindows);

    renderStatus(allWindows, allEntries);
    setInterval(() => renderStatus(allWindows, allEntries), 1000);
  })
  .catch((err) => {
    statusLabel.textContent = "erreur";
    statusSub.textContent = err.message;
  });

// ── Service worker ────────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
