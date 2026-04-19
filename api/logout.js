const { clearAuth } = require('./_auth');

module.exports = function handler(req, res) {
  clearAuth(res);
  res.json({ ok: true });
};
