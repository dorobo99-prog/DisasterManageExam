// ═══ CONFIG ══════════════════════════════════════════════
const EXAM_SETS = [
  { id:"ch1", group:"chapter", label:"과목", chapter:"1장 재난의 이해",  count:20, filePrefix:"1장재난의이해" },
  { id:"ch2", group:"chapter", label:"과목", chapter:"2장 재난의 분류",  count:20, filePrefix:"2장재난의분류" },
  { id:"ch3", group:"chapter", label:"과목", chapter:"3장 재난관리단계", count:20, filePrefix:"3장재난관리단계" },
  { id:"all", group:"all",     label:"전체", chapter:"전체 과목 모의고사", count:60, filePrefix:"전체과목모의고사" },
];

// ═══ STATE ═══════════════════════════════════════════════
let currentUser = "";
let currentSet  = null;
let questions   = [];
let questionById = {};
let userAnswers = {};
let answeredCount = 0;
let examStart   = null;
let graded      = false;
let pendingSet  = null;
let modalResumeAction = () => { beginExam(true); closeModal(); };
let modalRestartAction = () => { beginExam(false); closeModal(); };
let mobileProgressOpen = false;
let dashboardCache = { user: "", data: null, fetchedAt: 0, promise: null };
let progressCellMap = {};

// ═══ STORAGE ═════════════════════════════════════════════
const LAST_USER_KEY = "exam__last_user";
const DASHBOARD_CACHE_TTL_MS = 15000;

function isFreshCache(cache, ttlMs) {
  return !!(cache && cache.data && (Date.now() - cache.fetchedAt) < ttlMs);
}

function invalidateSelectCaches() {
  dashboardCache = { user: "", data: null, fetchedAt: 0, promise: null };
}

function saveProgress(options = {}) {
}

function flushProgressOnLeave() {
}

function cancelQueuedProgressRemote() {
}

function loadProgress(name, setId) {
  return null;
}

function clearLocalProgress(name, setId) {
}

function clearProgress(name, setId) {
}

function getCompletions(name) {
  if (!name || dashboardCache.user !== name || !dashboardCache.data) return {};
  const completions = {};
  (dashboardCache.data.by_set || []).forEach(function(row) {
    completions[row.set_id] = {
      score: row.best_score || row.avg_score || 0,
      correct: null,
      total: null,
      at: row.latest_at || null
    };
  });
  return completions;
}

function markCompletion(name, setId, score, correct, total) {
  if (!name || !setId) return;
  if (dashboardCache.user !== name || !dashboardCache.data) {
    dashboardCache = {
      user: name,
      data: { ok: true, by_set: [] },
      fetchedAt: Date.now(),
      promise: null
    };
  }
  const rows = dashboardCache.data.by_set || [];
  const row = rows.find(function(item) { return item.set_id === setId; });
  if (row) {
    row.attempts = Math.max(row.attempts || 0, 1);
    row.avg_score = score;
    row.best_score = Math.max(row.best_score || 0, score);
    row.latest_at = new Date().toISOString();
  } else {
    rows.push({ set_id: setId, attempts: 1, avg_score: score, best_score: score, latest_at: new Date().toISOString() });
    dashboardCache.data.by_set = rows;
  }
  dashboardCache.fetchedAt = Date.now();
}

function clearLocalUserState(name) {
  if (dashboardCache.user === name) dashboardCache = { user: "", data: null, fetchedAt: 0, promise: null };
}

// ═══ SCREEN ══════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");

  const navUser = document.getElementById("nav-user");
  const navBack = document.getElementById("nav-back");
  const isDeep  = name === "exam" || name === "results";

  navUser.textContent = currentUser ? currentUser + "님" : "";
  navBack.style.display = isDeep ? "inline" : "none";

  window.scrollTo({ top: 0, behavior: "instant" });
}

// ═══ API 헬퍼 ════════════════════════════════════════════
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (res.status === 401) {
    currentUser = "";
    showScreen("login");
    throw new Error("unauthorized");
  }
  return res.json();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

// ═══ TOUCH HELPER ════════════════════════════════════════
function wireTouch(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  let tf = false;
  el.addEventListener("touchend", function(e) {
    e.preventDefault(); tf = true; fn();
  }, { passive: false });
  el.addEventListener("click", function() {
    if (tf) { tf = false; return; } fn();
  });
}
