// ═══ CONFIG ══════════════════════════════════════════════
const CHAPTER_EXAM_SETS = [
  { id:"ch1", group:"mixed", label:"일반 모의고사", chapter:"1장 재난의 이해", count:20, filePrefix:"일반_1장재난의이해", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch2", group:"mixed", label:"일반 모의고사", chapter:"2장 재난의 분류", count:20, filePrefix:"일반_2장재난의분류", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch3", group:"mixed", label:"일반 모의고사", chapter:"3장 재난관리단계", count:20, filePrefix:"일반_3장재난관리단계", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch4", group:"mixed", label:"일반 모의고사", chapter:"4장 재난관리 계획", count:20, filePrefix:"일반_4장재난관리계획", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch5", group:"mixed", label:"일반 모의고사", chapter:"5장 재난관리 행정체계 및 조직의 변천", count:20, filePrefix:"일반_5장재난관리행정체계및조직의변천", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch6", group:"mixed", label:"일반 모의고사", chapter:"6장 미래 재난 관리", count:20, filePrefix:"일반_6장미래재난관리", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch7", group:"mixed", label:"일반 모의고사", chapter:"7장 재난관리 핵심 교과목", count:20, filePrefix:"일반_7장재난관리핵심교과목", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch8", group:"mixed", label:"일반 모의고사", chapter:"8장 다학제적 접근", count:20, filePrefix:"일반_8장다학제적접근", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
  { id:"ch9", group:"mixed", label:"일반 모의고사", chapter:"9장 재난 및 안전관리 기본법", count:20, filePrefix:"일반_9장재난및안전관리기본법", modeLabel:"AI 생성 문제은행 · 과목별 20문항 랜덤 출제", cardMeta:"20문항 랜덤 출제" },
];

const DEEP_EXAM_SETS = [
  { id:"gemini_ch1", group:"gemini", label:"Gemini", chapter:"1장 재난의 이해", count:100, filePrefix:"Gemini_1장재난의이해", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch2", group:"gemini", label:"Gemini", chapter:"2장 재난의 분류", count:100, filePrefix:"Gemini_2장재난의분류", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch3", group:"gemini", label:"Gemini", chapter:"3장 재난관리단계", count:100, filePrefix:"Gemini_3장재난관리단계", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch4", group:"gemini", label:"Gemini", chapter:"4장 재난관리 계획", count:100, filePrefix:"Gemini_4장재난관리계획", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch5", group:"gemini", label:"Gemini", chapter:"5장 재난관리 행정체계 및 조직의 변천", count:100, filePrefix:"Gemini_5장재난관리행정체계및조직의변천", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch6", group:"gemini", label:"Gemini", chapter:"6장 미래 재난 관리", count:100, filePrefix:"Gemini_6장미래재난관리", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch7", group:"gemini", label:"Gemini", chapter:"7장 재난관리 핵심 교과목", count:100, filePrefix:"Gemini_7장재난관리핵심교과목", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch8", group:"gemini", label:"Gemini", chapter:"8장 다학제적 접근", count:100, filePrefix:"Gemini_8장다학제적접근", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gemini_ch9", group:"gemini", label:"Gemini", chapter:"9장 재난 및 안전관리 기본법", count:100, filePrefix:"Gemini_9장재난및안전관리기본법", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch1", group:"gpt", label:"ChatGPT", chapter:"1장 재난의 이해", count:100, filePrefix:"ChatGPT_1장재난의이해", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch2", group:"gpt", label:"ChatGPT", chapter:"2장 재난의 분류", count:100, filePrefix:"ChatGPT_2장재난의분류", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch3", group:"gpt", label:"ChatGPT", chapter:"3장 재난관리단계", count:100, filePrefix:"ChatGPT_3장재난관리단계", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch4", group:"gpt", label:"ChatGPT", chapter:"4장 재난관리 계획", count:100, filePrefix:"ChatGPT_4장재난관리계획", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch5", group:"gpt", label:"ChatGPT", chapter:"5장 재난관리 행정체계 및 조직의 변천", count:100, filePrefix:"ChatGPT_5장재난관리행정체계및조직의변천", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch6", group:"gpt", label:"ChatGPT", chapter:"6장 미래 재난 관리", count:100, filePrefix:"ChatGPT_6장미래재난관리", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch7", group:"gpt", label:"ChatGPT", chapter:"7장 재난관리 핵심 교과목", count:100, filePrefix:"ChatGPT_7장재난관리핵심교과목", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch8", group:"gpt", label:"ChatGPT", chapter:"8장 다학제적 접근", count:100, filePrefix:"ChatGPT_8장다학제적접근", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
  { id:"gpt_ch9", group:"gpt", label:"ChatGPT", chapter:"9장 재난 및 안전관리 기본법", count:100, filePrefix:"ChatGPT_9장재난및안전관리기본법", modeLabel:"심화 과정 · AI별 과목별 100문항 전체 출제", cardMeta:"100문항 전체 출제" },
];

const EXAM_SETS = CHAPTER_EXAM_SETS.concat(DEEP_EXAM_SETS);

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
