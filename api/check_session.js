const { getSession } = require('./_auth');

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const session = getSession(req);
  if (session && session.name && session.user_id) {
    res.json({ ok: true, name: session.name });
  } else {
    res.json({ ok: false });
  }
};
