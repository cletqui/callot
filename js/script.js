// ── Constants ────────────────────────────────────────────────────────────

// Change BASE_URL to "http://localhost:8787" for local development
const BASE_URL = "https://api.cybai.re";
const HARBOUR_ID = "71";
const API_URL = `${BASE_URL}/data/tide?id=${HARBOUR_ID}`;
const WEATHER_URL = `${BASE_URL}/data/weather?location=Carantec`;

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

// ── Access window computation ────────────────────────────────────────────

// Height of the road — access is possible when tide is below this level.
const ROAD_THRESHOLD = 4.5; // metres

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

// ── Entry builders ───────────────────────────────────────────────────────

// Today + first 2 entries of tomorrow (for cross-midnight window computation).
function buildEntries(data) {
  const entries = [];
  if (data.last_tide) entries.push(data.last_tide);
  entries.push(...data.forecast.tide_data);
  const days = Object.values(data.data);
  if (days.length > 1) {
    entries.push(...days[1].tide_data.slice(0, 2));
  }
  return entries;
}

// Full multi-day list — all available days from the API response.
// Used for computing multi-day windows and the sparkline.
// Deduplicates by timestamp and sorts chronologically so that heightAt()
// always finds the correct prev/next neighbours regardless of last_tide position.
function buildAllEntries(data) {
  const map = new Map();
  if (data.last_tide?.timestamp) map.set(data.last_tide.timestamp, data.last_tide);
  for (const day of Object.values(data.data)) {
    for (const e of day.tide_data) map.set(e.timestamp, e);
  }
  return [...map.values()].sort(
    (a, b) => parseTimestamp(a.timestamp).getTime() - parseTimestamp(b.timestamp).getTime()
  );
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
      ? "↑ marée montante"
      : lastBefore?.type === "high_tide"
        ? "↓ marée descendante"
        : "";
  const nearHigh =
    lastBefore?.type === "high_tide"
      ? lastBefore
      : nextAfter?.type === "high_tide"
        ? nextAfter
        : entries.find((e) => e.type === "high_tide" && e.coeff_label);
  const coeffLabel = nearHigh?.coeff_label ?? null;
  const coeffNum = nearHigh?.coeff ?? null;
  const coeff = coeffLabel
    ? coeffNum
      ? `${coeffLabel} (coeff. ${coeffNum})`
      : coeffLabel
    : null;
  const height = heightAt(entries, nowTs);
  return { direction, coeff, height };
}

function renderStatus(windows, entries) {
  const now = nowParis();
  const { accessible, changesAt } = resolveStatus(windows, now);

  statusLabel.textContent = accessible ? "accessible" : "inaccessible";
  statusLabel.classList.toggle("accessible", accessible);
  statusLabel.classList.toggle("inaccessible", !accessible);

  if (changesAt) {
    const ms = changesAt.getTime() - now.getTime();
    const verb = accessible ? "ferme" : "ouvre";
    statusSub.innerHTML = `${verb} dans <strong>${fmtCountdown(ms)}</strong> (<strong>${fmtTime(changesAt)}</strong>)`;
  } else {
    statusSub.textContent = "";
  }

  const { direction, coeff, height } = getTideInfo(entries, now);
  const heightStr =
    height !== null ? `${height.toFixed(1).replace(".", ",")} m` : null;
  statusTide.textContent = [direction, heightStr, coeff]
    .filter(Boolean)
    .join(" · ");

  // Page title reflects current status (useful in pinned/background tabs)
  document.title = accessible
    ? "✓ callot"
    : changesAt
      ? `callot · ouvre ${fmtTime(changesAt)}`
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
  let penUp = true; // lift pen at null gaps so no straight lines are drawn across them
  for (let t = dayStartMs; t <= dayEnd; t += step) {
    const h = heightAt(entries, t);
    if (h === null) { penUp = true; continue; }
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

function sameUTCDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function renderUpcoming(allWindows, now) {
  // Windows not yet fully closed, next 4
  const relevant = allWindows.filter((w) => w.closes > now).slice(0, 4);

  upcomingRows.innerHTML = "";
  for (const w of relevant) {
    const isActive = now >= w.opens;
    const durationMs = w.closes.getTime() - w.opens.getTime();

    const row = document.createElement("div");
    row.className = "upcoming-row" + (isActive ? " is-active" : "");

    // Show date prefix when window is not today
    const dateHtml = !sameUTCDay(w.opens, now)
      ? `<span class="upcoming-date">${String(w.opens.getUTCDate()).padStart(2, "0")}/${String(w.opens.getUTCMonth() + 1).padStart(2, "0")}</span>`
      : "";

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

function renderSchedule(data, windows) {
  const now = nowParis();
  const nowTs = now.getTime();

  schedDate.textContent = data.forecast.date;
  schedRows.innerHTML = "";

  const todayEntries = data.forecast.tide_data;
  const days = Object.values(data.data);
  const tomorrowData = days.length > 1 ? days[1] : null;

  const allEntries = buildEntries(data);
  const windowForEntry = new Map();
  for (const e of allEntries) {
    if (e.type !== "low_tide") continue;
    const lowTime = parseTimestamp(e.timestamp);
    const win = windows.find((w) => lowTime >= w.opens && lowTime <= w.closes);
    if (win) windowForEntry.set(e, win);
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

  function renderEntries(entries, renderedOpens = new Set()) {
    for (const e of entries) {
      const isHigh = e.type === "high_tide";
      const isPast = parseTimestamp(e.timestamp).getTime() < nowTs;
      const win = windowForEntry.get(e);

      if (!isHigh && win && !renderedOpens.has(win)) {
        const m = document.createElement("div");
        m.className =
          "access-marker is-opens" +
          (win.opens.getTime() < nowTs ? " past" : "");
        m.innerHTML = `<span class="marker-time">${fmtTime(win.opens)}</span> — accessible`;
        schedRows.appendChild(m);
      }

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
        coeff.textContent = e.coeff
          ? `${e.coeff_label} · coeff. ${e.coeff}`
          : e.coeff_label;
        row.appendChild(coeff);
      }

      schedRows.appendChild(row);

      if (!isHigh && win) {
        const m = document.createElement("div");
        m.className =
          "access-marker is-closes" +
          (win.closes.getTime() < nowTs ? " past" : "");
        m.innerHTML = `<span class="marker-time">${fmtTime(win.closes)}</span> — inaccessible`;
        schedRows.appendChild(m);
      }
    }
  }

  renderEntries(todayEntries);

  if (!hasUpcomingWindowToday && tomorrowData) {
    const preRendered = new Set();
    for (const e of tomorrowData.tide_data) {
      if (e.type !== "low_tide") continue;
      const win = windowForEntry.get(e);
      if (win && win.opens.getTime() < tomorrowStart) {
        const m = document.createElement("div");
        m.className =
          "access-marker is-opens" +
          (win.opens.getTime() < nowTs ? " past" : "");
        m.innerHTML = `<span class="marker-time">${fmtTime(win.opens)}</span> — accessible`;
        schedRows.appendChild(m);
        preRendered.add(win);
      }
    }

    const sep = document.createElement("div");
    sep.className = "schedule-day-sep";
    sep.textContent = tomorrowData.date;
    schedRows.appendChild(sep);

    renderEntries(tomorrowData.tide_data, preRendered);
  }
}

// ── Fetch & init ─────────────────────────────────────────────────────────

// Weather — non-blocking, populates the status block when ready
fetch(WEATHER_URL)
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (!data) return;
    const cc = data.current_condition?.[0];
    if (!cc) return;
    const parts = [
      `${cc.temp_C}°C`,
      `${parseInt(cc.windspeedKmph, 10)} km/h ${cc.winddir16Point}`,
    ];
    statusWeather.textContent = parts.join(" · ");
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
    const entries = buildEntries(data);
    const allEntries = buildAllEntries(data);
    const windows = computeWindows(entries);
    const allWindows = computeWindows(allEntries);

    renderTimeline(windows, allEntries); // allEntries for a fuller sparkline
    renderSchedule(data, windows);
    renderUpcoming(allWindows, nowParis());

    renderStatus(windows, entries);
    setInterval(() => renderStatus(windows, entries), 1000);
  })
  .catch((err) => {
    statusLabel.textContent = "erreur";
    statusSub.textContent = err.message;
  });
