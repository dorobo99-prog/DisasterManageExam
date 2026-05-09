// ═══ MODAL ═══════════════════════════════════════════════
function showModal() { document.getElementById("modal-overlay").classList.add("show"); }

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("show");
  pendingSet = null;
}

// ═══ BEGIN EXAM ══════════════════════════════════════════
function beginExam(resume) {
  currentSet  = pendingSet;
  pendingSet  = null;
  graded      = false;
  document.getElementById("fab").classList.remove("show");
  document.getElementById("wrong-note-section").classList.remove("show");
  userAnswers = {};
  answeredCount = 0;
  examStart   = new Date();
  loadAndRenderExam(null);
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

  container.innerHTML = questions.map((q, idx) => {
    const opts = q.options.map(o => `
      <li class="opt-item" id="oi-${q.id}-${o.no}">
        <input type="radio" name="q_${q.id}" id="r_${q.id}_${o.no}" value="${o.no}">
        <label for="r_${q.id}_${o.no}" onclick="onPick('${q.id}',${o.no})">
          <span class="opt-no">${o.no}</span>
          <span class="opt-text">${o.text}</span>
        </label>
      </li>`).join("");

    return `
      <div class="q-card" id="qc-${q.id}">
      <div class="q-meta">
        <span class="q-num">문제 ${idx + 1}</span>
        <span class="q-difficulty">난이도 ${q.difficulty || "-"}</span>
      </div>
      <p class="q-text">${q.question_text}</p>
      <ul class="opts">${opts}</ul>
      <div class="exp-box" id="exp-${q.id}">
        <p class="exp-title">해설</p>
        <p class="exp-text"></p>
      </div>
      </div>`;
  }).join("");

  if (savedData) restoreAnswers();
  renderProgressTracker();
  syncProgressTracker();
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
  return answeredCount;
}

function renderProgressTracker() {
  const desktopGrid = document.getElementById("desktop-progress-grid");
  const mobileGrid = document.getElementById("mobile-progress-grid");
  const mobileBox = document.getElementById("mobile-progress");
  const mobileToggle = document.getElementById("mobile-progress-toggle");
  if (!desktopGrid || !mobileGrid) return;

  progressCellMap = {};

  const cells = questions.map((q, idx) => `
    <button class="progress-cell" type="button" data-qid="${q.id}" data-qidx="${idx}"
      onclick="scrollToQuestion(${idx})" aria-label="${idx + 1}번 문제로 이동">${idx + 1}</button>
  `).join("");

  desktopGrid.innerHTML = cells;
  mobileGrid.innerHTML = cells;
  if (mobileBox) mobileBox.classList.remove("open");
  if (mobileToggle) mobileToggle.textContent = "문항표 보기";

  [desktopGrid, mobileGrid].forEach(function(grid) {
    grid.querySelectorAll(".progress-cell").forEach(function(cell) {
      const qId = cell.dataset.qid;
      if (!progressCellMap[qId]) progressCellMap[qId] = [];
      progressCellMap[qId].push(cell);
    });
  });
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

}

function setProgressCellAnswered(qId, answered) {
  (progressCellMap[qId] || []).forEach(function(cell) {
    cell.classList.toggle("answered", answered);
  });
}

function syncProgressTracker() {
  questions.forEach(function(q) {
    setProgressCellAnswered(q.id, userAnswers[q.id] != null);
  });
  updateProgressTracker();
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
  if (userAnswers[qId] == null) answeredCount++;
  userAnswers[qId] = optNo;
  document.getElementById(`r_${qId}_${optNo}`).checked = true;
  setProgressCellAnswered(qId, true);
  updateProgressTracker();
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
      if (o.no === r.correct_answer) li.classList.add("opt-correct");
      else if (o.no === r.my_answer && !r.is_correct) li.classList.add("opt-wrong");
      li.querySelector("label").style.cursor = "default";
    });
    const expBox = document.getElementById("exp-" + r.id);
    if (expBox && r.explanation) {
      expBox.querySelector(".exp-text").textContent = r.explanation;
      expBox.classList.add("show");
    }
  });

  invalidateSelectCaches();
  markCompletion(currentUser, currentSet.id, score, correct, total);

  const fullResults = results.map(r => {
    const q = questionById[r.id];
    return {
      question_no: q?.question_no,
      id: r.id,
      question_text: q?.question_text,
      my_answer: r.my_answer,
      correct_answer: r.correct_answer,
      is_correct: r.is_correct,
      my_answer_text: q?.options.find(o => o.no === r.my_answer)?.text || "",
      correct_answer_text: q?.options.find(o => o.no === r.correct_answer)?.text || "",
      options: q?.options || [],
      explanation: r.explanation,
      option_rationale: r.option_rationale || {}
    };
  });

  window._resultData = {
    meta: {
      name: currentUser,
      set_id: currentSet.id,
      title: currentSet.chapter,
      total,
      correct,
      wrong,
      score,
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
