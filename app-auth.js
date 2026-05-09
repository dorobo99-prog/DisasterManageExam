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
    const loggedInName = data.name || name;
    if (data.reset) clearLocalUserState(loggedInName);
    invalidateSelectCaches();
    currentUser = loggedInName;
    try { localStorage.setItem(LAST_USER_KEY, loggedInName); } catch(e) {}
    enterSelectScreen();
  } catch(e) {
    if (e.message !== "unauthorized") alert("서버 연결에 실패했습니다.");
  } finally {
    btn.disabled = false; btn.textContent = "시작하기";
  }
}

async function changeUser() {
  flushProgressOnLeave();
  cancelQueuedProgressRemote();
  try { await api('/api/logout', { method: 'POST' }); } catch(e) {}
  invalidateSelectCaches();
  currentUser = "";
  currentSet = null;
  pendingSet = null;
  graded = false;
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
