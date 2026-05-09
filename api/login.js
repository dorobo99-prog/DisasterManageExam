const { setAuth, readBody } = require('./_auth');
const {
  normalizeNickname,
  isValidPin,
  findUserByNickname,
  createUser,
  resetUserPinAndProgress,
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
  const resetPin = params.get('reset_pin') === '1';

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

  if (!(await verifyPin(user, pin))) {
    if (resetPin) {
      user = await resetUserPinAndProgress(user, pin);
      setAuth(res, user.nickname, user.id);
      res.json({ ok: true, name: user.nickname, is_new: false, reset: true });
      return;
    }

    res.status(409).json({
      ok: false,
      code: 'pin_mismatch',
      error: '이 닉네임으로 저장된 진행 기록이 있습니다. 숫자 네 자리가 다르면 기존 진행 기록을 정리하고 새로 시작해야 합니다.'
    });
    return;
  }

  setAuth(res, user.nickname, user.id);
  res.json({ ok: true, name: user.nickname, is_new: false });
};
