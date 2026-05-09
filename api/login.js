const { setAuth, readBody } = require('./_auth');
const {
  normalizeNickname,
  isValidPin,
  findUserByNickname,
  createUser,
  verifyPin
} = require('./_account');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body   = await readBody(req);
  const params = new URLSearchParams(body);
  const name   = normalizeNickname(params.get('name'));
  const pin    = (params.get('pin') || '').trim();

  if (!name) {
    res.status(400).json({ ok: false, error: '닉네임을 입력하세요.' });
    return;
  }
  if (!isValidPin(pin)) {
    res.status(400).json({ ok: false, error: '숫자 네 자리를 입력하세요.' });
    return;
  }

  var user = await findUserByNickname(name);
  if (!user) {
    user = await createUser(name, pin);
    setAuth(res, user.nickname, user.id);
    res.json({ ok: true, name: user.nickname, is_new: true });
    return;
  }

  if (!verifyPin(user, pin)) {
    res.status(409).json({
      ok: false,
      code: 'pin_mismatch',
      error: '이 닉네임으로 저장된 이어풀기 기록이 있습니다. 처음 설정한 숫자 네 자리를 입력해야 이어서 풀 수 있습니다.'
    });
    return;
  }

  setAuth(res, user.nickname, user.id);
  res.json({ ok: true, name: user.nickname, is_new: false });
};
