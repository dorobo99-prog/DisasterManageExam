const { setAuth, readBody } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body   = await readBody(req);
  const params = new URLSearchParams(body);
  const name   = (params.get('name')     || '').trim();

  if (!name) {
    res.status(400).json({ ok: false, error: '이름을 입력하세요.' });
    return;
  }

  setAuth(res, name);
  res.json({ ok: true, name: name });
};
