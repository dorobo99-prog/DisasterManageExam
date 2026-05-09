// ═══ BUTTON WIRING ═══════════════════════════════════════
wireTouch("btn-login", login);
wireTouch("btn-submit", submitExam);
wireTouch("btn-modal-resume", () => modalResumeAction());
wireTouch("btn-modal-restart", () => modalRestartAction());

document.getElementById("modal-overlay").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

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
