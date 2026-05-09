// ═══ SELECT ══════════════════════════════════════════════
function enterSelectScreen() {
  document.getElementById("select-greeting").textContent =
    currentUser + "님, 과목을 선택하세요.";
  showScreen("select");
  setTimeout(function() {
    if (!currentUser) return;
    renderSetCards();
    loadCompletionSummary();
    setTimeout(function() {
      if (currentUser) loadDashboard();
    }, 50);
  }, 0);
}

async function loadCompletionSummary() {
  const requestUser = currentUser;
  if (!requestUser) return null;
  if (completionCache.user === requestUser && isFreshCache(completionCache, DASHBOARD_CACHE_TTL_MS)) {
    renderSetCards();
    return completionCache.data;
  }
  if (completionCache.promise && completionCache.user === requestUser) return completionCache.promise;

  const request = api('/api/completion_summary')
    .then(function(data) {
      if (currentUser !== requestUser) return null;
      if (!data.ok) return data;
      if (data.nickname && data.nickname !== requestUser) return null;
      completionCache.user = requestUser;
      completionCache.data = data;
      completionCache.fetchedAt = Date.now();
      renderSetCards();
      return data;
    })
    .catch(function() {
      return null;
    })
    .finally(function() {
      if (completionCache.promise === request) completionCache.promise = null;
    });

  completionCache.user = requestUser;
  completionCache.promise = request;
  return request;
}

async function loadDashboard() {
  const requestUser = currentUser;
  const card = document.getElementById("dashboard-card");
  if (!card || !requestUser) return;
  card.classList.add("show");
  document.getElementById("dashboard-sub").textContent = "응시 기록을 불러오는 중...";
  document.getElementById("dashboard-rank").textContent = "순위 집계 중";

  if (dashboardCache.user === requestUser && isFreshCache(dashboardCache, DASHBOARD_CACHE_TTL_MS)) {
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
      renderDashboard(data, requestUser);
      return data;
    })
    .catch(function(e) {
      if (e.message !== "unauthorized") card.classList.remove("show");
      return null;
    })
    .finally(function() {
      if (dashboardCache.promise === request) dashboardCache.promise = null;
    });
  dashboardCache.user = requestUser;
  dashboardCache.promise = request;
  return request;
}

function renderDashboard(data, userName = currentUser) {
  if (!data || currentUser !== userName) return;
  syncServerCompletions(data.by_set || [], userName);

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

function syncServerCompletions(rows, userName = currentUser) {
  if (!userName || !Array.isArray(rows)) return;
  if (dashboardCache.user === userName && dashboardCache.data) dashboardCache.data.by_set = rows;
  if (completionCache.user === userName && completionCache.data) completionCache.data.by_set = rows;
}

function renderSetCards() {
  const grid = document.getElementById("grid-exams");
  const renderUser = currentUser;
  const completions = getCompletions(renderUser);
  grid.innerHTML = "";
  EXAM_SETS.forEach(set => {
    grid.appendChild(makeSetCard(set, completions));
  });
}

function makeSetCard(set, completions) {
  const card = document.createElement("div");
  card.className = "set-card";

  const done  = completions[set.id] || null;

  let badge = "";
  if (done) {
    badge = done.score != null
      ? `<span class="set-card-status done">완료 ${done.score}점</span>`
      : `<span class="set-card-status done">완료</span>`;
  }

  card.innerHTML = `
    ${badge}
    <p class="set-card-ai ${set.group}">${set.label}</p>
    <p class="set-card-title">${set.chapter}</p>
    <p class="set-card-count">${set.count}문항 랜덤 출제</p>`;

  card.onclick = () => onSelectSet(set);
  return card;
}

async function loadCompletedReview(setId, userName) {
  if (!setId || !userName || currentUser !== userName) return null;
  try {
    const data = await api('/api/progress?set=' + encodeURIComponent(setId));
    if (currentUser !== userName || !data.ok || !data.progress || !data.progress.graded) return null;
    const progress = data.progress;
    const ids = Array.isArray(progress.question_ids) ? progress.question_ids : [];
    if (!ids.length) return null;
    return {
      answers: progress.answers || {},
      question_ids: ids,
      graded: true,
      started_at: progress.started_at || null,
      saved_at: progress.saved_at || null
    };
  } catch (e) {
    return null;
  }
}

async function onSelectSet(set) {
  pendingSet = set;
  const requestUser = currentUser;
  const done = getCompletions(requestUser)[set.id] || null;

  if (done) {
    const resumeBtn = document.getElementById("btn-modal-resume");
    const restartBtn = document.getElementById("btn-modal-restart");
    document.getElementById("modal-title").textContent = "완료한 과목";
    document.getElementById("modal-desc").textContent  =
      done.score != null
        ? `${requestUser}님은 "${set.chapter}"을(를) 이미 완료했습니다 (${done.score}점).\n재응시하거나 오답노트를 볼 수 있습니다.`
        : `${requestUser}님은 "${set.chapter}"을(를) 이미 완료했습니다.\n재응시하거나 오답노트를 볼 수 있습니다.`;
    resumeBtn.style.display = "none";
    resumeBtn.textContent = "오답노트 보기";
    restartBtn.textContent = "다시 응시하기";
    modalResumeAction = () => {};
    modalRestartAction = () => { beginExam(false); closeModal(); };
    showModal();

    const reviewData = await loadCompletedReview(set.id, requestUser);
    if (currentUser !== requestUser || pendingSet !== set) return;
    if (!reviewData) return;

    resumeBtn.style.display = "";
    modalResumeAction = () => { reviewCompletedExam(reviewData); closeModal(); };
  } else {
    beginExam(false);
  }
}
