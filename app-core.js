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
let remoteSaveTimer = null;
let queuedRemoteSave = null;
let lastRemoteProgressSignature = "";
let progressSyncPromise = null;
let progressSyncUser = "";
let dashboardCache = { user: "", data: null, fetchedAt: 0, promise: null };
let progressSummaryCache = { user: "", data: null, fetchedAt: 0, promise: null };
let progressCellMap = {};

// ═══ STORAGE ═════════════════════════════════════════════
const LAST_USER_KEY = "exam__last_user";
const DASHBOARD_CACHE_TTL_MS = 15000;
const PROGRESS_SUMMARY_CACHE_TTL_MS = 15000;

function isFreshCache(cache, ttlMs) {
  return !!(cache && cache.data && (Date.now() - cache.fetchedAt) < ttlMs);
}

function isFreshUserCache(cache, ttlMs, user) {
  return !!(cache && cache.user === user && isFreshCache(cache, ttlMs));
}

function invalidateSelectCaches() {
  dashboardCache = { user: "", data: null, fetchedAt: 0, promise: null };
  progressSummaryCache = { user: "", data: null, fetchedAt: 0, promise: null };
  progressSyncPromise = null;
  progressSyncUser = "";
}

function progressSignature(payload) {
  return JSON.stringify({
    set_id: payload?.set_id || "",
    answers: payload?.answers || {},
    graded: !!payload?.graded,
    question_ids: payload?.question_ids || [],
    started_at: payload?.started_at || null
  });
}

function saveProgress(options = {}) {
  if (!currentUser || !currentSet) return;
  const payload = {
    set_id: currentSet.id,
    answers: userAnswers,
    graded,
    question_ids: questions.map(q => q.id),
    started_at: examStart?.toISOString() ?? null,
    saved_at: new Date().toISOString()
  };
  setCachedProgress(currentUser, currentSet.id, payload);
  if (options.remote !== false) queueProgressRemote(payload);
}

function saveProgressRemote(payload, keepalive, expectedUser = currentUser) {
  if (!currentSet) return;
  if (!expectedUser || currentUser !== expectedUser) return;
  const setId = payload.set_id || currentSet.id;
  const signature = progressSignature(payload);
  if (signature === lastRemoteProgressSignature) return;
  lastRemoteProgressSignature = signature;
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: !!keepalive,
    body: JSON.stringify({
      set_id: setId,
      answers: payload.answers,
      question_ids: payload.question_ids,
      graded: payload.graded,
      started_at: payload.started_at
    })
  }).catch(function() {
    if (lastRemoteProgressSignature === signature) lastRemoteProgressSignature = "";
  });
}

function cancelQueuedProgressRemote() {
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = null;
  queuedRemoteSave = null;
  lastRemoteProgressSignature = "";
}

function queueProgressRemote(payload) {
  queuedRemoteSave = {
    payload: payload,
    user: currentUser
  };
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(function() {
    const latest = queuedRemoteSave;
    queuedRemoteSave = null;
    remoteSaveTimer = null;
    if (latest) saveProgressRemote(latest.payload, false, latest.user);
  }, 700);
}

function flushProgressOnLeave() {
  if (!currentUser || !currentSet || graded) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = null;
  queuedRemoteSave = null;
  const payload = {
    set_id: currentSet.id,
    answers: userAnswers,
    graded,
    question_ids: questions.map(q => q.id),
    started_at: examStart?.toISOString() ?? null
  };
  if (payload) saveProgressRemote(payload, true, currentUser);
}

function getCachedProgressMap(name) {
  if (!name || progressSummaryCache.user !== name || !progressSummaryCache.data) return {};
  return progressSummaryCache.data.progress || {};
}

function setCachedProgress(name, setId, progress) {
  if (!name || !setId) return;
  if (progressSummaryCache.user !== name || !progressSummaryCache.data) {
    progressSummaryCache = {
      user: name,
      data: { ok: true, progress: {} },
      fetchedAt: Date.now(),
      promise: null
    };
  }
  progressSummaryCache.data.progress[setId] = progress;
  progressSummaryCache.fetchedAt = Date.now();
}

function loadProgress(name, setId) {
  return getCachedProgressMap(name)[setId] || null;
}

function clearLocalProgress(name, setId) {
  if (progressSummaryCache.user === name && progressSummaryCache.data && progressSummaryCache.data.progress) {
    delete progressSummaryCache.data.progress[setId];
  }
}

function clearProgress(name, setId) {
  clearLocalProgress(name, setId);
  api('/api/progress?set=' + encodeURIComponent(setId), { method: 'DELETE' }).catch(function() {});
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
  setCachedProgress(name, setId, {
    set_id: setId,
    answers: Object.assign({}, userAnswers),
    graded: true,
    question_ids: questions.map(q => q.id),
    started_at: examStart?.toISOString() ?? null,
    saved_at: new Date().toISOString()
  });
  if (dashboardCache.user !== name || !dashboardCache.data) {
    dashboardCache = {
      user: name,
      data: { ok: true, by_set: [], progress: getCachedProgressMap(name) },
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
  if (progressSummaryCache.user === name) progressSummaryCache = { user: "", data: null, fetchedAt: 0, promise: null };
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
