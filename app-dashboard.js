// ═══ SELECT ══════════════════════════════════════════════
function enterSelectScreen() {
  document.getElementById("select-greeting").textContent =
    currentUser + "님, 과목을 선택하세요.";
  renderSetCards();
  loadDashboard();
  showScreen("select");
}

async function loadDashboard() {
  const card = document.getElementById("dashboard-card");
  if (!card) return;
  card.classList.add("show");
  document.getElementById("dashboard-sub").textContent = "응시 기록을 불러오는 중...";
  document.getElementById("dashboard-rank").textContent = "순위 집계 중";

  if (isFreshCache(dashboardCache, DASHBOARD_CACHE_TTL_MS)) {
    renderDashboard(dashboardCache.data);
    return dashboardCache.data;
  }
  if (dashboardCache.promise) return dashboardCache.promise;

  const request = api('/api/dashboard')
    .then(function(data) {
      if (!data.ok || data.disabled) {
        card.classList.remove("show");
        return data;
      }
      dashboardCache.data = data;
      dashboardCache.fetchedAt = Date.now();
      if (data.progress) {
        progressSummaryCache.data = { ok: true, progress: data.progress };
        progressSummaryCache.fetchedAt = Date.now();
        applyProgressSummary(progressSummaryCache.data);
      }
      renderDashboard(data);
      return data;
    })
    .catch(function(e) {
      if (e.message !== "unauthorized") card.classList.remove("show");
      return null;
    })
    .finally(function() {
      dashboardCache.promise = null;
      if (progressSyncPromise === request) progressSyncPromise = null;
    });
  dashboardCache.promise = request;
  progressSyncPromise = request;
  return request;
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
    const next = {
      score: row.best_score || row.avg_score || 0,
      correct: null,
      total: null,
      at: row.latest_at || new Date().toISOString()
    };
    const prev = completions[row.set_id];
    if (!prev || prev.score !== next.score || prev.at !== next.at) {
      completions[row.set_id] = next;
      changed = true;
    }
  });

  if (changed) {
    try { localStorage.setItem(completionKey(currentUser), JSON.stringify(completions)); } catch(e) {}
    renderSetCards();
  }
}

function getProgressSnapshot() {
  const snapshot = {};
  EXAM_SETS.forEach(function(set) {
    snapshot[set.id] = loadProgress(currentUser, set.id);
  });
  return snapshot;
}

function renderSetCards() {
  const grid = document.getElementById("grid-exams");
  const completions = getCompletions(currentUser);
  const progressMap = getProgressSnapshot();
  grid.innerHTML = "";
  EXAM_SETS.forEach(set => {
    grid.appendChild(makeSetCard(set, completions, progressMap));
  });
}

function makeSetCard(set, completions, progressMap) {
  const card = document.createElement("div");
  card.className = "set-card";

  const done  = completions[set.id];
  const prog  = progressMap[set.id];
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

function applyProgressSummary(data) {
  if (!data || !data.progress) return;
  let changed = false;
  EXAM_SETS.forEach(function(set) {
    const progress = data.progress[set.id] || null;
    if (progress) {
      try {
        const key = progressKey(currentUser, set.id);
        const next = JSON.stringify(progress);
        if (localStorage.getItem(key) !== next) {
          localStorage.setItem(key, next);
          changed = true;
        }
      } catch(e) {}
    } else if (loadProgress(currentUser, set.id)) {
      try {
        localStorage.removeItem(progressKey(currentUser, set.id));
        changed = true;
      } catch(e) {}
    }
  });
  if (changed) renderSetCards();
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
    beginExam(false);
  }
}
