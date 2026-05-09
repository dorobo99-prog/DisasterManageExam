// ═══ SELECT ══════════════════════════════════════════════
function enterSelectScreen() {
  document.getElementById("select-greeting").textContent =
    currentUser + "님, 과목을 선택하세요.";
  showScreen("select");
  setTimeout(function() {
    if (!currentUser) return;
    renderSetCards();
    loadDashboard();
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

async function onSelectSet(set) {
  pendingSet = set;
  const done = getCompletions(currentUser)[set.id] || null;

  if (done) {
    document.getElementById("modal-title").textContent = "완료한 과목";
    document.getElementById("modal-desc").textContent  =
      `${currentUser}님은 "${set.chapter}"을(를) 이미 완료했습니다 (${done.score}점).\n새로 다시 응시할 수 있습니다.`;
    document.getElementById("btn-modal-resume").style.display  = "none";
    document.getElementById("btn-modal-restart").textContent   = "다시 응시하기";
    modalRestartAction = () => { beginExam(false); closeModal(); };
    showModal();
  } else {
    beginExam(false);
  }
}
