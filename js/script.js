// ── Constants ────────────────────────────────────────────────────────────

const HARBOUR_ID = "71";
const API_URL = `https://api.cybai.re/data/tide?id=${HARBOUR_ID}`;

// ── Theme ────────────────────────────────────────────────────────────────

const html = document.documentElement;
const themeBtn = document.getElementById("theme-btn");
const themeIcon = document.getElementById("theme-icon");

// Apply stored or system preference on load
const stored = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme = stored ?? (prefersDark ? "dark" : "light");
html.setAttribute("data-theme", initialTheme);
themeIcon.src = initialTheme === "dark" ? "./icons/moon.svg" : "./icons/sun.svg";

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

function midpoint(a, b) {
  return new Date((a.getTime() + b.getTime()) / 2);
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

// The road to Callot is passable around low tide. It closes at approximately
// mid-tide (the time midpoint between each high↔low turning point).
// Access window = [midpoint(prev_high, low), midpoint(low, next_high)]
function computeWindows(entries) {
  const windows = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type !== "low_tide") continue;
    const low  = parseTimestamp(entries[i].timestamp);
    const prev = i > 0               ? parseTimestamp(entries[i - 1].timestamp) : null;
    const next = i < entries.length - 1 ? parseTimestamp(entries[i + 1].timestamp) : null;
    if (!prev || !next) continue;
    windows.push({ opens: midpoint(prev, low), closes: midpoint(low, next) });
  }
  return windows;
}

// Returns current accessibility status and when it next changes
function resolveStatus(windows, now) {
  for (const w of windows) {
    if (now >= w.opens && now < w.closes) {
      return { accessible: true, changesAt: w.closes };
    }
  }
  const next = windows.find(w => w.opens > now);
  return { accessible: false, changesAt: next ? next.opens : null };
}

// Build the entry list: last_tide + today + first 2 entries of tomorrow.
// We need 2 tomorrow entries so that a low tide near midnight has a "next"
// entry for window computation (cross-midnight case).
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

// ── Clock ────────────────────────────────────────────────────────────────

const clockEl = document.getElementById("clock");
const clockSec = document.getElementById("clock-sec");

function tickClock() {
  const now = nowParis();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  // Update only the text nodes to avoid disrupting the <span>
  clockEl.firstChild.textContent = `${hh}:${mm}`;
  clockSec.textContent = `:${ss}`;
}

setInterval(tickClock, 1000);
tickClock();

// ── Render ───────────────────────────────────────────────────────────────

const statusLabel = document.getElementById("status-label");
const statusSub   = document.getElementById("status-sub");
const statusTide  = document.getElementById("status-tide");
const tlWindows   = document.getElementById("timeline-windows");
const tlTicks     = document.getElementById("timeline-ticks");
const tlTickLabels = document.getElementById("timeline-tick-labels");
const tlNow       = document.getElementById("timeline-now");
const schedDate   = document.getElementById("schedule-date");
const schedRows   = document.getElementById("schedule-rows");

// Returns tide direction (montante/descendante) and coeff label for current moment
function getTideInfo(entries, now) {
  const nowTs = now.getTime();
  let lastBefore = null;
  let nextAfter  = null;
  for (const e of entries) {
    const ts = parseTimestamp(e.timestamp).getTime();
    if (ts <= nowTs) lastBefore = e;
    else if (!nextAfter) nextAfter = e;
  }
  const direction = lastBefore?.type === "low_tide"  ? "↑ montante"
                  : lastBefore?.type === "high_tide" ? "↓ descendante"
                  : "";
  // Coeff from the high tide bounding the current cycle
  const nearHigh = lastBefore?.type === "high_tide" ? lastBefore
                 : nextAfter?.type  === "high_tide" ? nextAfter
                 : entries.find(e => e.type === "high_tide" && e.coeff_label);
  const coeff = nearHigh?.coeff_label ?? null;
  return { direction, coeff };
}

function renderStatus(windows, entries) {
  const now = nowParis();
  const { accessible, changesAt } = resolveStatus(windows, now);

  statusLabel.textContent = accessible ? "accessible" : "inaccessible";
  statusLabel.classList.toggle("accessible",   accessible);
  statusLabel.classList.toggle("inaccessible", !accessible);

  if (changesAt) {
    const ms = changesAt.getTime() - now.getTime();
    const verb = accessible ? "ferme" : "ouvre";
    statusSub.innerHTML = `${verb} dans <strong>${fmtCountdown(ms)}</strong> · ${fmtTime(changesAt)}`;
  } else {
    statusSub.textContent = "";
  }

  // Tide direction + coeff
  const { direction, coeff } = getTideInfo(entries, now);
  statusTide.textContent = [direction, coeff].filter(Boolean).join(" · ");

  // Timeline cursor
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const pct = ((now.getTime() - dayStart.getTime()) / 86400000) * 100;
  tlNow.style.left = `${pct}%`;
}

function renderTimeline(windows) {
  const now = nowParis();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 86400000;

  // Clamp a date to [0 %, 100 %] of today's bar
  function pct(d) {
    const t = Math.max(dayStart.getTime(), Math.min(dayEnd, d.getTime()));
    return ((t - dayStart.getTime()) / 86400000) * 100;
  }

  tlWindows.innerHTML = "";
  tlTicks.innerHTML = "";
  tlTickLabels.innerHTML = "";

  for (const w of windows) {
    const leftPct  = pct(w.opens);
    const rightPct = pct(w.closes); // capped at 100 for cross-midnight windows

    if (rightPct <= 0 || leftPct >= 100) continue;

    // Blue accessible segment
    const seg = document.createElement("div");
    seg.className = "tw-segment";
    seg.style.left  = `${leftPct}%`;
    seg.style.right = `${100 - rightPct}%`;
    tlWindows.appendChild(seg);

    // Tick + label at opens (start of access window, between high→low)
    addTick(leftPct, w.opens, "is-opens");

    // Tick + label at closes (end of access window, between low→high)
    // Only draw if it falls within today's bar
    if (rightPct < 100) addTick(rightPct, w.closes, "is-closes");
  }

  function addTick(x, date, cls) {
    // Vertical cut on the bar
    const tick = document.createElement("div");
    tick.className = "tw-tick";
    tick.style.left = `${x}%`;
    tlTicks.appendChild(tick);

    // Time label below the bar
    const label = document.createElement("span");
    label.className = `tw-tick-label ${cls}`;
    // Clamp label position so text doesn't overflow the edges
    label.style.left = `${Math.min(Math.max(x, 6), 94)}%`;
    label.textContent = fmtTime(date);
    tlTickLabels.appendChild(label);
  }
}

function renderSchedule(data, windows) {
  const now = nowParis();
  const nowTs = now.getTime();
  const entries = data.forecast.tide_data;

  // Show coeff of first high tide (sets the range context for the day)
  const highWithCoeff = data.forecast.tide_data.find(e => e.type === "high_tide" && e.coeff_label);
  schedDate.innerHTML = highWithCoeff
    ? `${data.forecast.date} <span class="coeff-badge">${highWithCoeff.coeff_label}</span>`
    : data.forecast.date;
  schedRows.innerHTML = "";

  // Map each low-tide entry to its access window
  const windowForEntry = new Map();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type !== "low_tide") continue;
    const lowTime = parseTimestamp(entries[i].timestamp);
    const win = windows.find(w => lowTime >= w.opens && lowTime <= w.closes);
    if (win) windowForEntry.set(i, win);
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isHigh = e.type === "high_tide";
    const isPast = parseTimestamp(e.timestamp).getTime() < nowTs;

    // Before a low tide: insert a green "opens" separator
    if (!isHigh && windowForEntry.has(i)) {
      const win = windowForEntry.get(i);
      const m = document.createElement("div");
      m.className = "access-marker is-opens" + (win.opens.getTime() < nowTs ? " past" : "");
      m.textContent = `${fmtTime(win.opens)} — accès`;
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
      coeff.textContent = e.coeff_label;
      row.appendChild(coeff);
    }

    schedRows.appendChild(row);

    // After a low tide: insert a red "closes" separator
    if (!isHigh && windowForEntry.has(i)) {
      const win = windowForEntry.get(i);
      const m = document.createElement("div");
      m.className = "access-marker is-closes" + (win.closes.getTime() < nowTs ? " past" : "");
      m.textContent = `${fmtTime(win.closes)} — ferme`;
      schedRows.appendChild(m);
    }
  }
}

// ── Fetch & init ─────────────────────────────────────────────────────────

fetch(API_URL)
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(data => {
    const entries = buildEntries(data);
    const windows = computeWindows(entries);

    renderTimeline(windows);
    renderSchedule(data, windows);

    // Initial status render + refresh every second
    renderStatus(windows, entries);
    setInterval(() => renderStatus(windows, entries), 1000);
  })
  .catch(err => {
    statusLabel.textContent = "erreur";
    statusSub.textContent = err.message;
  });
