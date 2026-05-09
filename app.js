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
let examStart   = null;
let graded      = false;
let pendingSet  = null;  // set waiting for modal confirmation
let modalResumeAction = () => { beginExam(true); closeModal(); };
let modalRestartAction = () => { beginExam(false); closeModal(); };
let mobileProgressOpen = false;
let remoteSaveTimer = null;
let queuedRemoteSave = null;
let progressSyncPromise = null;

// ═══ STORAGE ═════════════════════════════════════════════
const LAST_USER_KEY = "exam__last_user";
function progressKey(name, setId)  { return `exam_prog__${setId}__${name}`; }
function completionKey(name)        { return `exam_done__${name}`; }

function saveProgress() {
  if (!currentUser || !currentSet) return;
  const payload = {
    set_id: currentSet.id,
    answers: userAnswers, graded,
    question_ids: questions.map(q => q.id),
    started_at: examStart?.toISOString() ?? null,
    saved_at: new Date().toISOString()
  };
  try {
    localStorage.setItem(progressKey(currentUser, currentSet.id), JSON.stringify(payload));
  } catch(e) {}
  queueProgressRemote(payload);
}
function saveProgressRemote(payload, keepalive) {
  if (!currentSet) return;
  const setId = payload.set_id || currentSet.id;
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
  }).catch(function() {});
}
function queueProgressRemote(payload) {
  queuedRemoteSave = payload;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(function() {
    const latest = queuedRemoteSave;
    queuedRemoteSave = null;
    remoteSaveTimer = null;
    if (latest) saveProgressRemote(latest, false);
  }, 700);
}
function flushProgressOnLeave() {
  if (!currentUser || !currentSet || graded) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = null;
  queuedRemoteSave = null;
  const payload = loadProgress(currentUser, currentSet.id);
  if (payload) saveProgressRemote(payload, true);
}
function loadProgress(name, setId) {
  try { return JSON.parse(localStorage.getItem(progressKey(name, setId))); } catch(e) { return null; }
}
function clearProgress(name, setId) {
  try { localStorage.removeItem(progressKey(name, setId)); } catch(e) {}
  api('/api/progress?set=' + encodeURIComponent(setId), { method: 'DELETE' }).catch(function() {});
}
function getCompletions(name) {
  try { return JSON.parse(localStorage.getItem(completionKey(name))) || {}; } catch(e) { return {}; }
}
function markCompletion(name, setId, score, correct, total) {
  const d = getCompletions(name);
  d[setId] = { score, correct, total, at: new Date().toISOString() };
  try { localStorage.setItem(completionKey(name), JSON.stringify(d)); } catch(e) {}
}
function clearLocalUserState(name) {
  try {
    EXAM_SETS.forEach(set => localStorage.removeItem(progressKey(name, set.id)));
    localStorage.removeItem(completionKey(name));
  } catch(e) {}
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

// ═══ LOGIN ═══════════════════════════════════════════════
async function login() {
  submitLogin(false);
}

async function submitLogin(resetPin) {
  const nameInp = document.getElementById("login-input");
  const pinInp = document.getElementById("pin-input");
  const errEl = document.getElementById("login-error");
  const name = nameInp.value.trim();
  const pin = pinInp.value.trim();

  errEl.style.display = "none";
  errEl.textContent = "";
  nameInp.style.borderColor = "";
  pinInp.style.borderColor = "";

  if (!name) { nameInp.focus(); nameInp.style.borderColor = "var(--red)"; return; }
  if (!/^[0-9]{4}$/.test(pin)) {
    pinInp.focus();
    pinInp.style.borderColor = "var(--red)";
    errEl.textContent = "숫자 네 자리를 입력하세요.";
    errEl.style.display = "block";
    return;
  }

  const btn = document.getElementById("btn-login");
  btn.disabled = true; btn.textContent = "확인 중...";

  try {
    const data = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=' + encodeURIComponent(name) +
        '&pin=' + encodeURIComponent(pin) +
        (resetPin ? '&reset_pin=1' : '')
    });
    if (!data.ok) {
      if (data.code === "pin_mismatch") {
        pinInp.style.borderColor = "var(--red)";
        pinInp.focus();
        const wantsReset = confirm(
          "입력한 숫자 네 자리가 기존 기록과 다릅니다.\n\n" +
          "확인을 누르면 이 닉네임의 기존 이어풀기 기록이 삭제되고, 방금 입력한 숫자 네 자리로 새로 시작합니다.\n\n" +
          "제출 완료된 점수 통계는 관리자 분석을 위해 유지됩니다.\n\n" +
          "정말 처음부터 시작할까요?"
        );
        if (wantsReset) {
          await submitLogin(true);
          return;
        }
        errEl.textContent = data.error || "처음 설정한 숫자 네 자리를 입력해야 이어서 풀 수 있습니다.";
      } else {
        nameInp.style.borderColor = "var(--red)";
        nameInp.focus();
        errEl.textContent = data.error || "입력값을 확인해주세요.";
      }
      errEl.style.display = "block";
      return;
    }
    nameInp.style.borderColor = "";
    pinInp.style.borderColor = "";
    if (data.reset) clearLocalUserState(name);
    currentUser = name;
    try { localStorage.setItem(LAST_USER_KEY, name); } catch(e) {}
    enterSelectScreen();
  } catch(e) {
    if (e.message !== "unauthorized") alert("서버 연결에 실패했습니다.");
  } finally {
    btn.disabled = false; btn.textContent = "시작하기";
  }
}

async function changeUser() {
  try { await api('/api/logout', { method: 'POST' }); } catch(e) {}
  currentUser = "";
  const nameInp = document.getElementById("login-input");
  const pinInp = document.getElementById("pin-input");
  const errEl = document.getElementById("login-error");
  nameInp.value = "";
  pinInp.value = "";
  nameInp.style.borderColor = "";
  pinInp.style.borderColor = "";
  errEl.style.display = "none";
  showScreen("login");
  setTimeout(() => nameInp.focus(), 300);
}

// ═══ SELECT ══════════════════════════════════════════════
function enterSelectScreen() {
  document.getElementById("select-greeting").textContent =
    currentUser + "님, 과목을 선택하세요.";
  renderSetCards();
  loadDashboard();
  showScreen("select");
  syncServerProgressForCards();
}

async function loadDashboard() {
  const card = document.getElementById("dashboard-card");
  if (!card) return;
  card.classList.add("show");
  document.getElementById("dashboard-sub").textContent = "응시 기록을 불러오는 중...";
  document.getElementById("dashboard-rank").textContent = "순위 집계 중";

  try {
    const data = await api('/api/dashboard');
    if (!data.ok || data.disabled) {
      card.classList.remove("show");
      return;
    }
    renderDashboard(data);
  } catch(e) {
    if (e.message !== "unauthorized") card.classList.remove("show");
  }
}

function renderDashboard(data) {
  syncServerCompletions(data.by_set || []);

  const summary = data.summary || {};
  document.getElementById("dashboard-sub").textContent =
    summary.attempts > 0 ? "전체 응시자 기준 내 위치와 최근 통계입니다." : "아직 저장된 응시 기록이 없습니다.";
  document.getElementById("dash-attempts").textContent = summary.attempts || 0;
  document.getElementById("dash-avg").textContent = (summary.avg_score || 0) + "점";
  document.getElementById("dash-best").textContent = (summary.best_score || 0) + "점";

  const rank = data.my_rank;
  document.getElementById("dashboard-rank").textContent = rank
    ? `내 순위 ${rank.rank}위 · 평균최고 ${rank.avg_best_score}점`
    : "아직 순위 없음";
  document.getElementById("dash-rank").textContent = rank ? `${rank.rank}위` : "-";

  const leaderEl = document.getElementById("dashboard-leaderboard");
  const leaders = (data.leaderboard || []).slice(0, 5);
  leaderEl.innerHTML = leaders.length ? leaders.map(r => `
    <div class="dashboard-row">
      <span>${r.rank}위 ${escapeHtml(r.nickname)}</span>
      <span>${r.avg_best_score}점 · ${r.completed_sets}세트</span>
    </div>`).join("") : `<div class="dashboard-row"><span>랭킹 데이터 없음</span><span>-</span></div>`;

}

function syncServerCompletions(rows) {
  if (!currentUser || !Array.isArray(rows)) return;
  const allowed = new Set(EXAM_SETS.map(set => set.id));
  const completions = getCompletions(currentUser);
  let changed = false;

  rows.forEach(row => {
    if (!allowed.has(row.set_id)) return;
    completions[row.set_id] = {
      score: row.best_score || row.avg_score || 0,
      correct: null,
      total: null,
      at: row.latest_at || new Date().toISOString()
    };
    changed = true;
  });

  if (changed) {
    try { localStorage.setItem(completionKey(currentUser), JSON.stringify(completions)); } catch(e) {}
    renderSetCards();
  }
}

function renderSetCards() {
  const grid = document.getElementById("grid-exams");
  grid.innerHTML = "";
  EXAM_SETS.forEach(set => {
    grid.appendChild(makeSetCard(set));
  });
}

function makeSetCard(set) {
  const card = document.createElement("div");
  card.className = "set-card";

  const done  = getCompletions(currentUser)[set.id];
  const prog  = loadProgress(currentUser, set.id);
  const inProg = prog && !prog.graded;

  let badge = "";
  if (done) {
    badge = `<span class="set-card-status done">완료 ${done.score}점</span>`;
  } else if (inProg) {
    const cnt = Object.keys(prog.answers || {}).length;
    const total = (prog.question_ids || []).length || set.count;
    badge = `<span class="set-card-status in-prog">${cnt}/${total} 진행중</span>`;
  }

  card.innerHTML = `
    ${badge}
    <p class="set-card-ai ${set.group}">${set.label}</p>
    <p class="set-card-title">${set.chapter}</p>
    <p class="set-card-count">${set.count}문항 랜덤 출제</p>`;

  card.onclick = () => onSelectSet(set);
  return card;
}

async function fetchServerProgressState(setId) {
  try {
    const data = await api('/api/progress?set=' + encodeURIComponent(setId));
    if (data.ok && data.progress) {
      return {
        found: true,
        progress: {
          answers: data.progress.answers || {},
          question_ids: data.progress.question_ids || [],
          graded: !!data.progress.graded,
          started_at: data.progress.started_at || null,
          saved_at: data.progress.saved_at || null
        }
      };
    }
  } catch(e) {
    return { found: false, progress: null, unknown: true };
  }
  return { found: false, progress: null };
}

async function syncServerProgressForCards() {
  if (!currentUser) return;
  let changed = false;
  progressSyncPromise = api('/api/progress_summary')
    .then(function(data) {
      if (!data.ok || !data.progress) return;
      EXAM_SETS.forEach(function(set) {
        const progress = data.progress[set.id] || null;
        if (progress) {
          try {
            localStorage.setItem(progressKey(currentUser, set.id), JSON.stringify(progress));
            changed = true;
          } catch(e) {}
        } else if (loadProgress(currentUser, set.id)) {
          try {
            localStorage.removeItem(progressKey(currentUser, set.id));
            changed = true;
          } catch(e) {}
        }
      });
      if (changed) renderSetCards();
    })
    .catch(function(e) {
      if (e.message !== "unauthorized") return null;
    })
    .finally(function() {
      progressSyncPromise = null;
    });
  return progressSyncPromise;
}

async function getProgressForSet(setId) {
  let progress = loadProgress(currentUser, setId);
  if (!progress && progressSyncPromise) {
    try {
      await progressSyncPromise;
      progress = loadProgress(currentUser, setId);
    } catch(e) {}
  }
  if (!progress) {
    const state = await fetchServerProgressState(setId);
    if (state.found) {
      progress = state.progress;
      try { localStorage.setItem(progressKey(currentUser, setId), JSON.stringify(progress)); } catch(e) {}
    } else if (!state.unknown) {
      try { localStorage.removeItem(progressKey(currentUser, setId)); } catch(e) {}
    }
  }
  return progress;
}

async function onSelectSet(set) {
  pendingSet = set;
  const prog = await getProgressForSet(set.id);
  const done = getCompletions(currentUser)[set.id];

  if (done) {
    // 완료한 과목 — 재응시 또는 오답노트 확인
    const canReview = prog && prog.graded && (prog.question_ids || []).length;
    document.getElementById("modal-title").textContent = "완료한 과목";
    document.getElementById("modal-desc").textContent  =
      canReview
        ? `${currentUser}님은 "${set.chapter}"을(를) 이미 완료했습니다 (${done.score}점).\n오답노트를 다시 보거나 새로 응시할 수 있습니다.`
        : `${currentUser}님은 "${set.chapter}"을(를) 이미 완료했습니다 (${done.score}점).\n이전 상세 답안 기록이 없어 재응시만 가능합니다.`;
    document.getElementById("btn-modal-resume").style.display  = canReview ? "" : "none";
    document.getElementById("btn-modal-resume").textContent    = "오답노트 보기 / 결과 다운로드";
    document.getElementById("btn-modal-restart").textContent   = "다시 응시하기";
    modalResumeAction = () => { reviewCompletedExam(prog); closeModal(); };
    modalRestartAction = () => { beginExam(false); closeModal(); };
    showModal();
  } else if (prog && !prog.graded) {
    // 진행 중인 과목 — 이어서/처음부터
    const cnt = Object.keys(prog.answers || {}).length;
    document.getElementById("modal-title").textContent = "이어서 풀기";
    document.getElementById("modal-desc").textContent  =
      `${currentUser}님의 저장된 진행 기록이 있습니다.\n(${cnt}문제 완료)`;
    document.getElementById("btn-modal-resume").style.display = "";
    document.getElementById("btn-modal-resume").textContent   = "이어서 풀기";
    document.getElementById("btn-modal-restart").textContent  = "처음부터 다시";
    modalResumeAction = () => { beginExam(true); closeModal(); };
    modalRestartAction = () => { beginExam(false); closeModal(); };
    showModal();
  } else {
    // 처음 응시
    beginExam(false);
  }
}

// ═══ MODAL ═══════════════════════════════════════════════
function showModal() { document.getElementById("modal-overlay").classList.add("show"); }
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("show");
  pendingSet = null;
}

// modal button wiring
wireTouch("btn-modal-resume",  () => modalResumeAction());
wireTouch("btn-modal-restart", () => modalRestartAction());

document.getElementById("modal-overlay").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

// ═══ BEGIN EXAM ══════════════════════════════════════════
function beginExam(resume) {
  currentSet  = pendingSet;
  pendingSet  = null;
  graded      = false;
  document.getElementById("fab").classList.remove("show");
  document.getElementById("wrong-note-section").classList.remove("show");

  const saved = loadProgress(currentUser, currentSet.id);

  if (resume && saved && !saved.graded) {
    userAnswers = saved.answers || {};
    examStart   = saved.started_at ? new Date(saved.started_at) : new Date();
  } else {
    clearProgress(currentUser, currentSet.id);
    userAnswers = {};
    examStart   = new Date();
  }

  loadAndRenderExam(resume && saved && !saved.graded ? saved : null);
}

// ═══ LOAD JSON ════════════════════════════════════════════
async function loadAndRenderExam(savedData) {
  showScreen("loading");
  document.getElementById("loading-text").textContent =
    currentSet.chapter + " 문제를 불러오는 중...";
  try {
    const savedIds = savedData && savedData.question_ids ? savedData.question_ids : [];
    const idQuery = savedIds.length ? '&ids=' + encodeURIComponent(savedIds.join(',')) : '';
    const data = await api('/api/get_exam?set=' + currentSet.id + idQuery);
    if (!data.ok) throw new Error(data.error || "문제 로드 실패");
    questions = data.questions;
    if (!savedData) saveProgress();
  } catch(e) {
    if (e.message !== "unauthorized") {
      document.getElementById("loading-text").textContent =
        "문제 파일을 불러오지 못했습니다. 다시 시도해주세요.";
    }
    return;
  }
  renderExam(savedData);
  showScreen("exam");
}

async function reviewCompletedExam(savedData) {
  currentSet = pendingSet;
  pendingSet = null;
  graded = true;
  userAnswers = savedData.answers || {};
  examStart = savedData.started_at ? new Date(savedData.started_at) : new Date();
  document.getElementById("fab").classList.remove("show");
  document.getElementById("wrong-note-section").classList.remove("show");

  showScreen("loading");
  document.getElementById("loading-text").textContent = "오답노트를 불러오는 중...";

  try {
    const ids = savedData.question_ids || [];
    const review = await api('/api/review_exam', {
      method: 'POST',
      body: JSON.stringify({
        set_id: currentSet.id,
        answers: userAnswers,
        question_ids: ids,
        include_questions: true
      })
    });
    if (!review.ok) throw new Error(review.error || "오답노트 로드 실패");
    questions = review.questions || [];
    renderExam(savedData);
    gradeExam(review, { review: true });
  } catch(e) {
    if (e.message !== "unauthorized") {
      document.getElementById("loading-text").textContent =
        "오답노트를 불러오지 못했습니다. 다시 시도해주세요.";
    }
  }
}

// ═══ RENDER ══════════════════════════════════════════════
function renderExam(savedData) {
  mobileProgressOpen = false;
  const aiLbl = document.getElementById("exam-ai-label");
  aiLbl.textContent = "AI 혼합 랜덤 출제";
  aiLbl.className = "exam-header-ai " + currentSet.group;
  document.getElementById("exam-title").textContent = currentSet.chapter;
  document.getElementById("exam-meta").textContent  =
    currentUser + "님 · " + questions.length + "문항";
  questionById = Object.fromEntries(questions.map(q => [q.id, q]));

  const container = document.getElementById("questions-container");
  container.innerHTML = "";

  questions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "q-card";
    card.id = "qc-" + q.id;

    const opts = q.options.map(o => `
      <li class="opt-item" id="oi-${q.id}-${o.no}">
        <input type="radio" name="q_${q.id}" id="r_${q.id}_${o.no}" value="${o.no}">
        <label for="r_${q.id}_${o.no}" onclick="onPick('${q.id}',${o.no})">
          <span class="opt-no">${o.no}</span>
          <span class="opt-text">${o.text}</span>
        </label>
      </li>`).join("");

    card.innerHTML = `
      <div class="q-meta">
        <span class="q-num">문제 ${idx + 1}</span>
        <span class="q-difficulty">난이도 ${q.difficulty || "-"}</span>
      </div>
      <p class="q-text">${q.question_text}</p>
      <ul class="opts">${opts}</ul>
      <div class="exp-box" id="exp-${q.id}">
        <p class="exp-title">해설</p>
        <p class="exp-text"></p>
      </div>`;
    container.appendChild(card);
  });

  if (savedData) restoreAnswers();
  renderProgressTracker();
  updateProgressTracker();
}

function restoreAnswers() {
  Object.entries(userAnswers).forEach(([qId, optNo]) => {
    const r = document.getElementById(`r_${qId}_${optNo}`);
    if (!r) return;
    r.checked = true;
    const lbl = r.nextElementSibling;
    if (lbl) {
      lbl.style.borderColor = "var(--blue)";
      lbl.style.background  = "rgba(0,113,227,0.08)";
      const num = lbl.querySelector(".opt-no");
      if (num) { num.style.background = "var(--blue)"; num.style.color = "var(--white)"; }
    }
  });
}

// ═══ PROGRESS TRACKER ═══════════════════════════════════
function getAnsweredCount() {
  return questions.filter(q => userAnswers[q.id] != null).length;
}

function renderProgressTracker() {
  const desktopGrid = document.getElementById("desktop-progress-grid");
  const mobileGrid = document.getElementById("mobile-progress-grid");
  const mobileBox = document.getElementById("mobile-progress");
  const mobileToggle = document.getElementById("mobile-progress-toggle");
  if (!desktopGrid || !mobileGrid) return;

  const cells = questions.map((q, idx) => `
    <button class="progress-cell" type="button" data-qid="${q.id}" data-qidx="${idx}"
      onclick="scrollToQuestion(${idx})" aria-label="${idx + 1}번 문제로 이동">${idx + 1}</button>
  `).join("");

  desktopGrid.innerHTML = cells;
  mobileGrid.innerHTML = cells;
  if (mobileBox) mobileBox.classList.remove("open");
  if (mobileToggle) mobileToggle.textContent = "문항표 보기";
}

function updateProgressTracker() {
  const total = questions.length;
  const answered = getAnsweredCount();
  const pct = total ? (answered / total) * 100 : 0;

  const desktopCount = document.getElementById("desktop-progress-count");
  const mobileCount = document.getElementById("mobile-progress-count");
  const desktopFill = document.getElementById("desktop-progress-fill");
  const mobileFill = document.getElementById("mobile-progress-fill");

  if (desktopCount) desktopCount.textContent = `응답 ${answered} / ${total}`;
  if (mobileCount) mobileCount.textContent = `응답 ${answered} / ${total}`;
  if (desktopFill) desktopFill.style.width = pct + "%";
  if (mobileFill) mobileFill.style.width = pct + "%";

  document.querySelectorAll(".progress-cell").forEach(cell => {
    const qId = cell.dataset.qid;
    cell.classList.toggle("answered", userAnswers[qId] != null);
  });
}

function scrollToQuestion(index) {
  const q = questions[index];
  if (!q) return;
  document.getElementById("qc-" + q.id)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function toggleMobileProgress() {
  mobileProgressOpen = !mobileProgressOpen;
  const mobileBox = document.getElementById("mobile-progress");
  const mobileToggle = document.getElementById("mobile-progress-toggle");
  if (mobileBox) mobileBox.classList.toggle("open", mobileProgressOpen);
  if (mobileToggle) mobileToggle.textContent = mobileProgressOpen ? "문항표 닫기" : "문항표 보기";
}

// ═══ PICK / SUBMIT / GRADE ═══════════════════════════════
function onPick(qId, optNo) {
  if (graded) return;
  userAnswers[qId] = optNo;
  document.getElementById(`r_${qId}_${optNo}`).checked = true;
  updateProgressTracker();
  saveProgress();
}

async function submitExam() {
  const missing = questions.filter(q => userAnswers[q.id] == null);
  const warn = document.getElementById("warning-text");
  if (missing.length) {
    warn.style.display = "block";
    warn.textContent = `아직 ${missing.length}문제가 미답입니다. 모두 답한 후 채점해주세요.`;
    document.getElementById("qc-" + missing[0].id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  warn.style.display = "none";

  const btn = document.getElementById("btn-submit");
  btn.disabled = true; btn.textContent = "채점 중...";

  try {
    const data = await api('/api/submit_exam', {
      method: 'POST',
      body: JSON.stringify({
        set_id: currentSet.id,
        answers: userAnswers,
        question_ids: questions.map(q => q.id),
        started_at: examStart.toISOString()
      })
    });
    if (!data.ok) throw new Error(data.error || "채점 실패");
    graded = true;
    gradeExam(data);
  } catch(e) {
    if (e.message !== "unauthorized") {
      warn.style.display = "block";
      warn.textContent = "채점 중 오류가 발생했습니다. 다시 시도해주세요.";
    }
  } finally {
    btn.disabled = false; btn.textContent = "채점하기";
  }
}

function gradeExam(serverData, options = {}) {
  const { score, correct, wrong, total, results } = serverData;

  results.forEach(r => {
    const q = questionById[r.id];
    if (!q) return;
    q.options.forEach(o => {
      const li = document.getElementById(`oi-${r.id}-${o.no}`);
      if (!li) return;
      if (o.no === r.correct_answer)                   li.classList.add("opt-correct");
      else if (o.no === r.my_answer && !r.is_correct)  li.classList.add("opt-wrong");
      li.querySelector("label").style.cursor = "default";
    });
    const expBox = document.getElementById("exp-" + r.id);
    if (expBox && r.explanation) {
      expBox.querySelector(".exp-text").textContent = r.explanation;
      expBox.classList.add("show");
    }
  });

  markCompletion(currentUser, currentSet.id, score, correct, total);
  if (!options.review) saveProgress();

  const fullResults = results.map(r => {
    const q = questionById[r.id];
    return {
      question_no: q?.question_no, id: r.id,
      question_text: q?.question_text,
      my_answer: r.my_answer, correct_answer: r.correct_answer, is_correct: r.is_correct,
      my_answer_text:      q?.options.find(o => o.no === r.my_answer)?.text || "",
      correct_answer_text: q?.options.find(o => o.no === r.correct_answer)?.text || "",
      options: q?.options || [],
      explanation: r.explanation,
      option_rationale: r.option_rationale || {}
    };
  });

  window._resultData = {
    meta: {
      name: currentUser, set_id: currentSet.id,
      title: currentSet.chapter,
      total, correct, wrong, score,
      started_at: examStart.toISOString(),
      finished_at: new Date().toISOString()
    },
    answers: fullResults
  };

  document.getElementById("result-score").innerHTML = `${score}<span>점</span>`;
  document.getElementById("result-msg").textContent =
    score >= 80 ? "합격권입니다. 훌륭해요!" :
    score >= 60 ? "조금 더 공부하면 합격할 수 있어요." : "기초부터 다시 복습해보세요.";
  document.getElementById("stat-c").textContent = correct;
  document.getElementById("stat-w").textContent = wrong;
  document.getElementById("stat-t").textContent = total;

  buildWrongCards(fullResults);
  showScreen("results");
  if (options.review) {
    document.getElementById("wrong-note-section").classList.add("show");
    setTimeout(() => document.getElementById("wrong-note-section")
      .scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
  document.getElementById("fab").classList.add("show");
  renderSetCards();
}

// ═══ WRONG NOTE ══════════════════════════════════════════
function buildWrongCards(results) {
  const container = document.getElementById("wrong-cards");
  container.innerHTML = "";
  const wrong = results.filter(r => !r.is_correct);
  document.getElementById("wrong-sub").textContent =
    wrong.length === 0 ? "오답 없음" : `총 ${wrong.length}문제 오답`;

  if (!wrong.length) {
    container.innerHTML = `<p style="font-size:17px;color:var(--body-text);letter-spacing:-0.374px;">모든 문제를 맞혔습니다!</p>`;
    return;
  }
  wrong.forEach(r => {
    const rationale = r.option_rationale?.[String(r.correct_answer)] || "";
    const card = document.createElement("div");
    card.className = "wrong-card";
    card.innerHTML = `
      <div class="wrong-card-top">
        <span class="badge-wrong">오답</span>
        <span class="wrong-qnum">문제 ${r.question_no}</span>
      </div>
      <p class="wrong-qtext">${r.question_text}</p>
      <div class="answer-rows">
        <div class="answer-row"><span class="ar-label mine">내 답 →</span><span class="ar-text">${r.my_answer}번. ${r.my_answer_text}</span></div>
        <div class="answer-row"><span class="ar-label correct">정답 →</span><span class="ar-text">${r.correct_answer}번. ${r.correct_answer_text}</span></div>
      </div>
      <div class="wrong-exp">
        ${rationale ? `<p><strong>해설:</strong> ${rationale}</p><p style="margin-top:5px;opacity:.8">${r.explanation}</p>` : `<p>${r.explanation}</p>`}
      </div>`;
    container.appendChild(card);
  });
}

// ═══ DOWNLOAD ════════════════════════════════════════════
function downloadResult() {
  if (!window._resultData) return;
  const blob = new Blob([JSON.stringify(window._resultData, null, 2)],
    { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url;
  a.download = `${currentSet.filePrefix}_${currentUser}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══ NAVIGATION ══════════════════════════════════════════
function goToSelect() {
  document.getElementById("fab").classList.remove("show");
  document.getElementById("wrong-note-section").classList.remove("show");
  enterSelectScreen();
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

// ═══ BUTTON WIRING ═══════════════════════════════════════
wireTouch("btn-login",  login);
wireTouch("btn-submit", submitExam);

document.getElementById("login-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") login();
  this.style.borderColor = "";
});
document.getElementById("pin-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") login();
  this.style.borderColor = "";
});
document.getElementById("pin-input").addEventListener("input", function() {
  this.value = this.value.replace(/\D/g, "").slice(0, 4);
});
window.addEventListener("pagehide", flushProgressOnLeave);
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "hidden") flushProgressOnLeave();
});

// ═══ INIT ════════════════════════════════════════════════
(async function() {
  const last = (() => { try { return localStorage.getItem(LAST_USER_KEY) || ""; } catch(e) { return ""; } })();
  if (last) document.getElementById("login-input").value = last;

  try {
    const data = await api('/api/check_session');
    if (data.ok && data.name) {
      currentUser = data.name;
      document.getElementById("login-input").value = data.name;
      enterSelectScreen();
      return;
    }
  } catch(e) {}

  showScreen("login");
  setTimeout(() => { if (!last) document.getElementById("login-input").focus(); }, 300);
})();
