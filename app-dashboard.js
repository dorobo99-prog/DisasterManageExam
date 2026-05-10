// ═══ SELECT / DASHBOARD ═══════════════════════════════════

const completedReviewCache = {
  user: null,
  data: {},
  promise: {}
};

const leaderboardCache = {
  user: null,
  data: null,
  fetchedAt: 0,
  promise: null
};

function enterSelectScreen() {
  const greeting = document.getElementById("select-greeting");

  if (greeting) {
    greeting.textContent = currentUser + "님, 내 학습현황입니다.";
  }

  resetLearningHomePanels();
  showScreen("select");

  setTimeout(function() {
    if (!currentUser) return;
    loadMySummary();
  }, 0);
}

function resetLearningHomePanels() {
  const classroom = document.getElementById("classroom-panel");
  const leaderboard = document.getElementById("leaderboard-panel");

  if (classroom) classroom.hidden = true;
  if (leaderboard) leaderboard.hidden = true;

  const card = document.getElementById("dashboard-card");
  const sub = document.getElementById("dashboard-sub");
  const rank = document.getElementById("dashboard-rank");

  if (card) card.classList.add("show");
  if (sub) sub.textContent = "응시 기록을 불러오는 중...";

  if (rank) {
    rank.hidden = false;
    rank.textContent = "학습 현황 확인 중";
  }

  normalizeDashboardMetricGrid();
}

function isPanelOpen(id) {
  const el = document.getElementById(id);
  return !!(el && !el.hidden);
}

function openClassroom() {
  const classroom = document.getElementById("classroom-panel");
  const leaderboard = document.getElementById("leaderboard-panel");

  if (leaderboard) leaderboard.hidden = true;
  if (classroom) classroom.hidden = false;

  renderSetCards();

  loadCompletionSummary().then(function() {
    renderSetCards();
    prefetchCompletedReviews(currentUser);
  });

  prefetchCompletedReviews(currentUser);

  setTimeout(function() {
    if (classroom) {
      classroom.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, 50);
}

function closeClassroom() {
  const classroom = document.getElementById("classroom-panel");

  if (classroom) classroom.hidden = true;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleLeaderboard() {
  const leaderboard = document.getElementById("leaderboard-panel");
  const classroom = document.getElementById("classroom-panel");

  if (!leaderboard) return;

  const willOpen = leaderboard.hidden;

  if (classroom) classroom.hidden = true;
  leaderboard.hidden = !willOpen;

  if (willOpen) {
    loadLeaderboard();

    setTimeout(function() {
      leaderboard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
}

// 기존 코드 호환용 이름 유지.
// 이제 로그인 첫 화면에서는 /api/my_summary가 아니라 /api/my_summary를 사용한다.
function loadDashboard() {
  return loadMySummary();
}

async function loadMySummary() {
  const requestUser = currentUser;
  const card = document.getElementById("dashboard-card");

  if (!card || !requestUser) return null;

  card.classList.add("show");

  const sub = document.getElementById("dashboard-sub");
  const rankText = document.getElementById("dashboard-rank");

  if (sub) sub.textContent = "응시 기록을 불러오는 중...";
  if (rankText) rankText.textContent = "학습 현황 확인 중";

  if (
    dashboardCache.user === requestUser &&
    isFreshCache(dashboardCache, DASHBOARD_CACHE_TTL_MS)
  ) {
    renderDashboard(dashboardCache.data, requestUser);
    return dashboardCache.data;
  }

  if (dashboardCache.promise && dashboardCache.user === requestUser) {
    return dashboardCache.promise;
  }

  const request = api("/api/my_summary")
    .then(function(data) {
      if (currentUser !== requestUser) return null;

      if (!data.ok) {
        if (sub) sub.textContent = "학습현황을 불러오지 못했습니다.";
        return data;
      }

      if (data.nickname && data.nickname !== requestUser) return null;

      dashboardCache.user = requestUser;
      dashboardCache.data = data;
      dashboardCache.fetchedAt = Date.now();

      completionCache.user = requestUser;
      completionCache.data = data;
      completionCache.fetchedAt = Date.now();

      renderDashboard(data, requestUser);

      if (isPanelOpen("classroom-panel")) {
        renderSetCards();
        prefetchCompletedReviews(requestUser);
      }

      return data;
    })
    .catch(function(e) {
      if (e.message !== "unauthorized") {
        if (sub) sub.textContent = "학습현황을 불러오지 못했습니다.";
        if (rankText) rankText.textContent = "연결 확인 필요";
      }

      return null;
    })
    .finally(function() {
      if (dashboardCache.promise === request) {
        dashboardCache.promise = null;
      }
    });

  dashboardCache.user = requestUser;
  dashboardCache.promise = request;

  return request;
}

async function loadCompletionSummary() {
  const requestUser = currentUser;

  if (!requestUser) return null;

  if (
    completionCache.user === requestUser &&
    isFreshCache(completionCache, DASHBOARD_CACHE_TTL_MS)
  ) {
    renderSetCards();
    return completionCache.data;
  }

  if (
    dashboardCache.user === requestUser &&
    isFreshCache(dashboardCache, DASHBOARD_CACHE_TTL_MS)
  ) {
    completionCache.user = requestUser;
    completionCache.data = dashboardCache.data;
    completionCache.fetchedAt = Date.now();

    renderSetCards();

    return completionCache.data;
  }

  if (completionCache.promise && completionCache.user === requestUser) {
    return completionCache.promise;
  }

  const request = api("/api/my_summary")
    .then(function(data) {
      if (currentUser !== requestUser) return null;
      if (!data.ok) return data;
      if (data.nickname && data.nickname !== requestUser) return null;

      completionCache.user = requestUser;
      completionCache.data = data;
      completionCache.fetchedAt = Date.now();

      dashboardCache.user = requestUser;
      dashboardCache.data = data;
      dashboardCache.fetchedAt = Date.now();

      renderSetCards();

      return data;
    })
    .catch(function() {
      return null;
    })
    .finally(function() {
      if (completionCache.promise === request) {
        completionCache.promise = null;
      }
    });

  completionCache.user = requestUser;
  completionCache.promise = request;

  return request;
}

async function loadLeaderboard() {
  const requestUser = currentUser;
  const leaderEl = document.getElementById("dashboard-leaderboard");

  if (!requestUser || !leaderEl) return null;

  leaderEl.innerHTML = `
    <div class="dashboard-row">
      <span>상위 랭킹을 불러오는 중...</span>
      <span>-</span>
    </div>
  `;

  if (
    leaderboardCache.user === requestUser &&
    isFreshCache(leaderboardCache, DASHBOARD_CACHE_TTL_MS)
  ) {
    renderLeaderboard(leaderboardCache.data.leaderboard || []);
    renderRankOnly(leaderboardCache.data);
    return leaderboardCache.data;
  }

  if (leaderboardCache.promise && leaderboardCache.user === requestUser) {
    return leaderboardCache.promise;
  }

  /*
   * 임시 구조:
   * - 첫 화면에서는 /api/my_summary를 호출하지 않는다.
   * - 사용자가 "상위 랭킹 보기"를 눌렀을 때만 기존 /api/my_summary를 호출한다.
   * - 다음 단계에서 /api/leaderboard.js로 완전히 분리할 예정이다.
   */
  const request = api("/api/leaderboard")
    .then(function(data) {
      if (currentUser !== requestUser) return null;

      if (!data.ok || data.disabled) {
        renderLeaderboard([]);
        return data;
      }

      leaderboardCache.user = requestUser;
      leaderboardCache.data = data;
      leaderboardCache.fetchedAt = Date.now();

      renderLeaderboard(data.leaderboard || []);
      renderRankOnly(data);

      return data;
    })
    .catch(function(e) {
      if (e.message !== "unauthorized") {
        leaderEl.innerHTML = `
          <div class="dashboard-row">
            <span>랭킹을 불러오지 못했습니다.</span>
            <span>-</span>
          </div>
        `;
      }

      return null;
    })
    .finally(function() {
      if (leaderboardCache.promise === request) {
        leaderboardCache.promise = null;
      }
    });

  leaderboardCache.user = requestUser;
  leaderboardCache.promise = request;

  return request;
}

function normalizeDashboardMetricGrid() {
  const ids = ["dash-attempts", "dash-avg", "dash-best", "dash-rank"];

  const metricCards = ids
    .map(function(id) {
      const valueEl = document.getElementById(id);
      if (!valueEl) return null;

      return (
        valueEl.closest(".dashboard-stat") ||
        valueEl.closest(".stat-card") ||
        valueEl.closest(".metric-card") ||
        valueEl.parentElement
      );
    })
    .filter(Boolean);

  if (!metricCards.length) return;

  const grid = metricCards[0].parentElement;

  if (grid) {
    grid.classList.add("dashboard-metric-grid");
  }

  metricCards.forEach(function(card) {
    card.classList.add("dashboard-metric-card");
  });
}

function hideDashboardRankBadge() {
  const rankText = document.getElementById("dashboard-rank");

  if (!rankText) return;

  rankText.textContent = "";
  rankText.hidden = true;
}

function formatMyRank(data) {
  var rank = data && data.my_rank;

  if (
    rank &&
    Number(rank.rank) > 0 &&
    Number(rank.total_users) > 0
  ) {
    return Number(rank.rank) + '위 / ' + Number(rank.total_users) + '명';
  }

  return '확인 전';
}

function renderDashboard(data, userName = currentUser) {
  if (!data || currentUser !== userName) return;

  syncServerCompletions(data.by_set || [], userName);

  const summary = data.summary || {};
  const attempts = Number(summary.attempts || 0);
  const avgScore = Number(summary.avg_score || 0);
  const bestScore = Number(summary.best_score || 0);
  const completedSets = Number(summary.completed_sets || 0);

  const sub = document.getElementById("dashboard-sub");
  const attemptsEl = document.getElementById("dash-attempts");
  const avgEl = document.getElementById("dash-avg");
  const bestEl = document.getElementById("dash-best");
  const rankText = document.getElementById("dashboard-rank");
  const rankEl = document.getElementById("dash-rank");

  if (sub) {
    sub.textContent =
      attempts > 0
        ? "저장된 응시 기록을 기준으로 내 학습현황을 정리했습니다."
        : "아직 저장된 응시 기록이 없습니다. 과목별 모의고사를 시작하세요.";
  }

  if (attemptsEl) attemptsEl.textContent = attempts;
  if (avgEl) avgEl.textContent = avgScore + "점";
  if (bestEl) bestEl.textContent = bestScore + "점";

  const rank =
    data.my_rank ||
    (
      dashboardCache &&
      dashboardCache.data &&
      dashboardCache.data.my_rank
    ) ||
    null;

  hideDashboardRankBadge();
  normalizeDashboardMetricGrid();

  if (rankEl) {
    rankEl.textContent = formatMyRank(data);
  }

  renderLeaderboard(data.leaderboard || []);
}

function renderRankOnly(data) {
  if (!data) return;

  const rank =
    data.my_rank ||
    (
      dashboardCache &&
      dashboardCache.data &&
      dashboardCache.data.my_rank
    ) ||
    null;
  const rankText = document.getElementById("dashboard-rank");
  const rankEl = document.getElementById("dash-rank");

  if (rankText) {
    const summary =
      dashboardCache &&
      dashboardCache.data &&
      dashboardCache.data.summary
        ? dashboardCache.data.summary
        : {};

    const completedSets = Number(summary.completed_sets || 0);

    hideDashboardRankBadge();
    normalizeDashboardMetricGrid();
  }

  if (rankEl) {
    rankEl.textContent = formatMyRank({ my_rank: rank });
  }
}

function renderLeaderboard(rows) {
  const leaderEl = document.getElementById("dashboard-leaderboard");

  if (!leaderEl) return;

  const leaders = (rows || []).slice(0, 5);

  leaderEl.innerHTML = leaders.length
    ? leaders
        .map(function(r) {
          return `
            <div class="dashboard-row">
              <span>${r.rank}위 ${escapeHtml(r.nickname)}</span>
              <span>${r.avg_best_score}점 · ${r.completed_sets}세트</span>
            </div>
          `;
        })
        .join("")
    : `
      <div class="dashboard-row">
        <span>랭킹 데이터 없음</span>
        <span>-</span>
      </div>
    `;
}

function syncServerCompletions(rows, userName = currentUser) {
  if (!userName || !Array.isArray(rows)) return;

  if (dashboardCache.user === userName && dashboardCache.data) {
    dashboardCache.data.by_set = rows;
  }

  if (completionCache.user === userName && completionCache.data) {
    completionCache.data.by_set = rows;
  }
}

function renderSetCards() {
  const grid = document.getElementById("grid-exams");

  if (!grid) return;

  const renderUser = currentUser;
  const completions = getCompletions(renderUser);

  grid.innerHTML = "";

  EXAM_SETS.forEach(function(set) {
    grid.appendChild(makeSetCard(set, completions));
  });
}

function makeSetCard(set, completions) {
  const card = document.createElement("div");

  card.className = "set-card";

  const done = completions[set.id] || null;

  let badge = "";

  if (done) {
    badge =
      done.score != null
        ? `<span class="set-card-status done">완료 ${done.score}점</span>`
        : `<span class="set-card-status done">완료</span>`;
  }

  card.innerHTML = `
    ${badge}
    <p class="set-card-ai ${set.group}">${set.label}</p>
    <p class="set-card-title">${set.chapter}</p>
    <p class="set-card-count">${set.count}문항 랜덤 출제</p>
  `;

  card.onclick = function() {
    onSelectSet(set);
  };

  return card;
}

function getCompletedReviewKey(userName, setId) {
  return userName + "::" + setId;
}

function resetCompletedReviewCacheIfNeeded(userName) {
  if (completedReviewCache.user !== userName) {
    completedReviewCache.user = userName;
    completedReviewCache.data = {};
    completedReviewCache.promise = {};
  }
}

function prefetchCompletedReviews(userName = currentUser) {
  if (!userName) return;

  resetCompletedReviewCacheIfNeeded(userName);

  const completions = getCompletions(userName);

  EXAM_SETS.forEach(function(set) {
    if (completions[set.id]) {
      loadCompletedReview(set.id, userName);
    }
  });
}

async function loadCompletedReview(setId, userName) {
  if (!setId || !userName || currentUser !== userName) return null;

  resetCompletedReviewCacheIfNeeded(userName);

  const key = getCompletedReviewKey(userName, setId);

  if (completedReviewCache.data[key]) {
    return completedReviewCache.data[key];
  }

  if (completedReviewCache.promise[key]) {
    return completedReviewCache.promise[key];
  }

  const request = api("/api/progress?set=" + encodeURIComponent(setId))
    .then(function(data) {
      if (
        currentUser !== userName ||
        !data.ok ||
        !data.progress ||
        !data.progress.graded
      ) {
        return null;
      }

      const progress = data.progress;

      const ids = Array.isArray(progress.question_ids)
        ? progress.question_ids
        : [];

      if (!ids.length) return null;

      const reviewData = {
        answers: progress.answers || {},
        question_ids: ids,
        graded: true,
        started_at: progress.started_at || null,
        saved_at: progress.saved_at || null
      };

      completedReviewCache.data[key] = reviewData;

      return reviewData;
    })
    .catch(function() {
      return null;
    })
    .finally(function() {
      delete completedReviewCache.promise[key];
    });

  completedReviewCache.promise[key] = request;

  return request;
}

async function onSelectSet(set) {
  pendingSet = set;

  const requestUser = currentUser;
  const done = getCompletions(requestUser)[set.id] || null;

  if (done) {
    const resumeBtn = document.getElementById("btn-modal-resume");
    const restartBtn = document.getElementById("btn-modal-restart");

    document.getElementById("modal-title").textContent = "완료한 과목";

    document.getElementById("modal-desc").textContent =
      done.score != null
        ? `${requestUser}님은 "${set.chapter}"을(를) 이미 완료했습니다 (${done.score}점).\n재응시하거나 오답노트를 볼 수 있습니다.`
        : `${requestUser}님은 "${set.chapter}"을(를) 이미 완료했습니다.\n재응시하거나 오답노트를 볼 수 있습니다.`;

    resumeBtn.style.display = "";
    resumeBtn.disabled = true;
    resumeBtn.textContent = "오답노트 준비 중...";

    restartBtn.textContent = "다시 응시하기";

    modalResumeAction = function() {};

    modalRestartAction = function() {
      beginExam(false);
      closeModal();
    };

    showModal();

    const reviewData = await loadCompletedReview(set.id, requestUser);

    if (currentUser !== requestUser || pendingSet !== set) return;

    if (!reviewData) {
      resumeBtn.disabled = true;
      resumeBtn.textContent = "오답노트 없음";
      return;
    }

    resumeBtn.disabled = false;
    resumeBtn.textContent = "오답노트 보기";

    modalResumeAction = function() {
      reviewCompletedExam(reviewData);
      closeModal();
    };
  } else {
    beginExam(false);
  }
}