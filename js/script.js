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

// Build the entry list: last_tide + today + first entry of tomorrow
function buildEntries(data) {
  const entries = [];
  if (data.last_tide) entries.push(data.last_tide);
  entries.push(...data.forecast.tide_data);
  const days = Object.values(data.data);
  if (days.length > 1 && days[1].tide_data.length > 0) {
    entries.push(days[1].tide_data[0]);
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
const tlWindows   = document.getElementById("timeline-windows");
const tlNow       = document.getElementById("timeline-now");
const schedDate   = document.getElementById("schedule-date");
const schedRows   = document.getElementById("schedule-rows");

function renderStatus(windows) {
  // Re-evaluate every second (called from tick)
  const now = nowParis();
  const { accessible, changesAt } = resolveStatus(windows, now);

  statusLabel.textContent = accessible ? "accessible" : "inaccessible";
  statusLabel.classList.toggle("accessible", accessible);

  if (changesAt) {
    const ms = changesAt.getTime() - now.getTime();
    const verb = accessible ? "ferme" : "ouvre";
    statusSub.innerHTML = `${verb} dans <strong>${fmtCountdown(ms)}</strong> · ${fmtTime(changesAt)}`;
  } else {
    statusSub.textContent = "";
  }

  // Update timeline cursor
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

  function pct(d) {
    const t = Math.max(dayStart.getTime(), Math.min(dayEnd, d.getTime()));
    return ((t - dayStart.getTime()) / 86400000) * 100;
  }

  tlWindows.innerHTML = "";
  for (const w of windows) {
    const left  = pct(w.opens);
    const right = 100 - pct(w.closes);
    if (left >= 100 || right >= 100) continue;
    const seg = document.createElement("div");
    seg.className = "tw-segment";
    seg.style.left  = `${left}%`;
    seg.style.right = `${right}%`;
    tlWindows.appendChild(seg);
  }
}

function renderSchedule(data, windows) {
  const now = nowParis();
  const nowTs = now.getTime();
  const entries = data.forecast.tide_data;

  schedDate.textContent = data.forecast.date;
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

    const row = document.createElement("div");
    row.className = "tide-row" + (isPast ? " past" : "");

    const arrow  = document.createElement("span");
    arrow.className = "tide-arrow";
    arrow.textContent = isHigh ? "▲" : "▼";

    const time   = document.createElement("span");
    time.className = "tide-time";
    time.textContent = e.time;

    const height = document.createElement("span");
    height.className = "tide-height" + (isHigh ? "" : " low");
    height.textContent = e.high.replace(",", ".");

    row.appendChild(arrow);
    row.appendChild(time);
    row.appendChild(height);

    if (!isHigh && windowForEntry.has(i)) {
      const win = windowForEntry.get(i);
      const acc = document.createElement("span");
      acc.className = "tide-access";
      acc.textContent = `accès ${fmtTime(win.opens)} → ${fmtTime(win.closes)}`;
      row.appendChild(acc);
    }

    if (isHigh && e.coeff_label) {
      const coeff = document.createElement("span");
      coeff.className = "tide-coeff";
      coeff.textContent = e.coeff_label;
      row.appendChild(coeff);
    }

    schedRows.appendChild(row);
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
    renderStatus(windows);
    setInterval(() => renderStatus(windows), 1000);
  })
  .catch(err => {
    statusLabel.textContent = "erreur";
    statusSub.textContent = err.message;
  });
