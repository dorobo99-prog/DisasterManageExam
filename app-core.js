// ═══ CONFIG ══════════════════════════════════════════════
const EXAM_SETS = [
  { id:"gemini_ch1", group:"gemini", label:"Gemini", chapter:"1장 재난의 이해", count:100, filePrefix:"Gemini_1장재난의이해" },
  { id:"gemini_ch2", group:"gemini", label:"Gemini", chapter:"2장 재난의 분류", count:100, filePrefix:"Gemini_2장재난의분류" },
  { id:"gemini_ch3", group:"gemini", label:"Gemini", chapter:"3장 재난관리단계", count:100, filePrefix:"Gemini_3장재난관리단계" },
  { id:"gemini_ch4", group:"gemini", label:"Gemini", chapter:"4장 재난관리 계획", count:100, filePrefix:"Gemini_4장재난관리계획" },
  { id:"gemini_ch5", group:"gemini", label:"Gemini", chapter:"5장 재난관리 행정체계 및 조직의 변천", count:100, filePrefix:"Gemini_5장재난관리행정체계및조직의변천" },
  { id:"gemini_ch6", group:"gemini", label:"Gemini", chapter:"6장 미래 재난 관리", count:100, filePrefix:"Gemini_6장미래재난관리" },
  { id:"gpt_ch1", group:"gpt", label:"ChatGPT", chapter:"1장 재난의 이해", count:100, filePrefix:"ChatGPT_1장재난의이해" },
  { id:"gpt_ch2", group:"gpt", label:"ChatGPT", chapter:"2장 재난의 분류", count:100, filePrefix:"ChatGPT_2장재난의분류" },
  { id:"gpt_ch3", group:"gpt", label:"ChatGPT", chapter:"3장 재난관리단계", count:100, filePrefix:"ChatGPT_3장재난관리단계" },
  { id:"gpt_ch4", group:"gpt", label:"ChatGPT", chapter:"4장 재난관리 계획", count:100, filePrefix:"ChatGPT_4장재난관리계획" },
  { id:"gpt_ch5", group:"gpt", label:"ChatGPT", chapter:"5장 재난관리 행정체계 및 조직의 변천", count:100, filePrefix:"ChatGPT_5장재난관리행정체계및조직의변천" },
  { id:"gpt_ch6", group:"gpt", label:"ChatGPT", chapter:"6장 미래 재난 관리", count:100, filePrefix:"ChatGPT_6장미래재난관리" },
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
let directStartConsumed = false;
let modalResumeAction = () => { beginExam(true); closeModal(); };
let modalRestartAction = () => { beginExam(false); closeModal(); };
let mobileProgressOpen = false;
let completionCache = { user: "", data: null, fetchedAt: 0, promise: null };
let dashboardCache = { user: "", data: null, fetchedAt: 0, promise: null };
let progressCellMap = {};

// ═══ STORAGE ═════════════════════════════════════════════
const LAST_USER_KEY = "exam__last_user";
const DASHBOARD_CACHE_TTL_MS = 15000;

function isFreshCache(cache, ttlMs) {
  return !!(cache && cache.data && (Date.now() - cache.fetchedAt) < ttlMs);
}

function invalidateSelectCaches() {
  completionCache = { user: "", data: null, fetchedAt: 0, promise: null };
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
  if (!name) return {};
  const source = (
    dashboardCache.user === name && dashboardCache.data && Array.isArray(dashboardCache.data.by_set)
      ? dashboardCache.data.by_set
      : completionCache.user === name && completionCache.data && Array.isArray(completionCache.data.by_set)
        ? completionCache.data.by_set
        : null
  );
  if (!source) return {};
  const completions = {};
  source.forEach(function(row) {
    completions[row.set_id] = {
      score:
        row.latest_score != null
          ? row.latest_score
          : row.best_score != null
            ? row.best_score
            : row.avg_score,
      correct:
        row.latest_correct_count != null
          ? row.latest_correct_count
          : null,
      total:
        row.latest_total_count != null
          ? row.latest_total_count
          : null,
      at: row.latest_at || null
    };
  });
  return completions;
}

function markCompletion(name, setId, score, correct, total) {
  if (!name || !setId) return;

  const nowIso = new Date().toISOString();

  if (completionCache.user !== name || !completionCache.data) {
    completionCache = {
      user: name,
      data: { ok: true, by_set: [] },
      fetchedAt: Date.now(),
      promise: null
    };
  }

  const rows = completionCache.data.by_set;

  const row = rows.find(function(item) {
    return item.set_id === setId;
  });

  if (row) {
    row.attempts = Math.max(row.attempts || 0, 1);
    row.avg_score = score;
    row.best_score = Math.max(row.best_score || 0, score);
    row.latest_score = score;
    row.latest_correct_count = correct;
    row.latest_total_count = total;
    row.latest_at = nowIso;
  } else {
    rows.push({
      set_id: setId,
      attempts: 1,
      total_score: score,
      avg_score: score,
      best_score: score,
      latest_score: score,
      latest_correct_count: correct,
      latest_total_count: total,
      latest_at: nowIso
    });
  }

  completionCache.fetchedAt = Date.now();

  /*
   * 중요:
   * dashboardCache에는 summary가 필요하다.
   * 여기서 by_set만 있는 임시 데이터를 넣으면 대시보드가 0으로 뜬다.
   * 따라서 새 채점 후 대시보드는 서버의 /api/my_summary를 다시 불러오게 한다.
   */
  dashboardCache = {
    user: "",
    data: null,
    fetchedAt: 0,
    promise: null
  };
}

function clearLocalUserState(name) {
  if (completionCache.user === name) completionCache = { user: "", data: null, fetchedAt: 0, promise: null };
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
