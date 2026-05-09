// ═══ SELECT ══════════════════════════════════════════════
function enterSelectScreen() {
  document.getElementById("select-greeting").textContent =
    currentUser + "님, 과목을 선택하세요.";
  showScreen("select");
  setTimeout(function() {
    if (!currentUser) return;
    const userAtEnter = currentUser;
    const grid = document.getElementById("grid-exams");
    if (isFreshUserCache(progressSummaryCache, PROGRESS_SUMMARY_CACHE_TTL_MS, userAtEnter)) {
      renderSetCards();
      loadDashboard();
      return;
    }
    if (grid) grid.innerHTML = "";
    loadDashboard().then(function(data) {
      if (!data && currentUser === userAtEnter) renderSetCards();
    });
  }, 0);
}

async function loadDashboard() {
  const requestUser = currentUser;
  const card = document.getElementById("dashboard-card");
  if (!card || !requestUser) return;
  card.classList.add("show");
  document.getElementById("dashboard-sub").textContent = "응시 기록을 불러오는 중...";
  document.getElementById("dashboard-rank").textContent = "순위 집계 중";

  if (isFreshUserCache(dashboardCache, DASHBOARD_CACHE_TTL_MS, requestUser)) {
    renderDashboard(dashboardCache.data, requestUser);
    return dashboardCache.data;
  }
  if (dashboardCache.promise && dashboardCache.user === requestUser) return dashboardCache.promise;

  const request = api('/api/dashboard')
    .then(function(data) {
      if (currentUser !== requestUser) return null;
      if (!data.ok || data.disabled) {
        card.classList.remove("show");
        return data;
      }
      if (data.nickname && data.nickname !== requestUser) return null;
      dashboardCache.user = requestUser;
      dashboardCache.data = data;
      dashboardCache.fetchedAt = Date.now();
      if (data.progress) {
        progressSummaryCache.user = requestUser;
        progressSummaryCache.data = { ok: true, progress: data.progress };
        progressSummaryCache.fetchedAt = Date.now();
        applyProgressSummary(progressSummaryCache.data, requestUser);
      }
      renderDashboard(data, requestUser);
      return data;
    })
    .catch(function(e) {
      if (e.message !== "unauthorized") card.classList.remove("show");
      return null;
    })
    .finally(function() {
      if (dashboardCache.promise === request) dashboardCache.promise = null;
      if (progressSyncPromise === request) progressSyncPromise = null;
      if (progressSyncPromise === null && progressSyncUser === requestUser) progressSyncUser = "";
    });
  dashboardCache.user = requestUser;
  dashboardCache.promise = request;
  progressSyncPromise = request;
  progressSyncUser = requestUser;
  return request;
}

function renderDashboard(data, userName = currentUser) {
  if (!data || currentUser !== userName) return;
  syncServerCompletions(data.by_set || [], data.progress || {}, userName);

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

function syncServerCompletions(rows, progressMap = {}, userName = currentUser) {
  if (!userName || !Array.isArray(rows)) return;
  if (dashboardCache.user === userName && dashboardCache.data) dashboardCache.data.by_set = rows;
  if (progressSummaryCache.user === userName && progressSummaryCache.data) progressSummaryCache.data.progress = progressMap;
}

function getProgressSnapshot(userName = currentUser) {
  const snapshot = {};
  EXAM_SETS.forEach(function(set) {
    snapshot[set.id] = loadProgress(userName, set.id);
  });
  return snapshot;
}

function renderSetCards() {
  const grid = document.getElementById("grid-exams");
  const renderUser = currentUser;
  const completions = getCompletions(renderUser);
  const progressMap = getProgressSnapshot(renderUser);
  grid.innerHTML = "";
  EXAM_SETS.forEach(set => {
    grid.appendChild(makeSetCard(set, completions, progressMap));
  });
}

function makeSetCard(set, completions, progressMap) {
  const card = document.createElement("div");
  card.className = "set-card";

  const prog  = progressMap[set.id];
  const inProg = prog && !prog.graded;
  const done  = prog && prog.graded
    ? (completions[set.id] || { score: "-", correct: null, total: null, at: prog.saved_at || null })
    : null;

  let badge = "";
  if (inProg) {
    const cnt = Object.keys(prog.answers || {}).length;
    const total = (prog.question_ids || []).length || set.count;
    badge = `<span class="set-card-status in-prog">${cnt}/${total} 진행중</span>`;
  } else if (done) {
    badge = `<span class="set-card-status done">완료 ${done.score}점</span>`;
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

function applyProgressSummary(data, userName = currentUser) {
  if (!data || !data.progress || !userName) return;
  progressSummaryCache.user = userName;
  progressSummaryCache.data = data;
  progressSummaryCache.fetchedAt = Date.now();
  if (currentUser === userName) renderSetCards();
}

async function getProgressForSet(setId) {
  const requestUser = currentUser;
  let progress = loadProgress(requestUser, setId);
  if (!progress && progressSyncPromise && progressSyncUser === requestUser) {
    try {
      await progressSyncPromise;
      if (currentUser !== requestUser) return null;
      progress = loadProgress(requestUser, setId);
    } catch(e) {}
  }
  if (!progress) {
    const state = await fetchServerProgressState(setId);
    if (currentUser !== requestUser) return null;
    if (state.found) {
      progress = state.progress;
      setCachedProgress(requestUser, setId, progress);
    } else if (!state.unknown) {
      clearLocalProgress(requestUser, setId);
    }
  }
  return progress;
}

async function onSelectSet(set) {
  const requestUser = currentUser;
  pendingSet = set;
  const prog = await getProgressForSet(set.id);
  if (currentUser !== requestUser) return;
  const done = prog && prog.graded
    ? (getCompletions(requestUser)[set.id] || { score: "-", correct: null, total: null, at: prog.saved_at || null })
    : null;

  if (prog && !prog.graded) {
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
  } else if (done) {
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
  } else {
    beginExam(false);
  }
}
