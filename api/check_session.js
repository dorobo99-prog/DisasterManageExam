const { getUser } = require('./_auth');

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const name = getUser(req);
  if (name) {
    res.json({ ok: true, name: name });
  } else {
    res.json({ ok: false });
  }
};
