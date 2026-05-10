const { setAuth, readBody } = require('../lib/_auth');
const { query } = require('../lib/_db');
const {
  normalizeNickname,
  isValidPin,
  findUserByNickname,
  createUser,
  resetUserPinAndProgress,
  verifyPin
} = require('../lib/_account');

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function withDebug(payload, debug) {
  if (isProduction()) {
    return payload;
  }

  return Object.assign({}, payload, {
    debug_timings: debug
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const started = Date.now();
  const debug = {};

function finish(payload, statusCode) {
  debug.server_total_ms = Date.now() - started;

  res.status(statusCode || 200).json(
    withDebug(payload, debug)
  );
}

  /*
   * DB warm-up 전용 요청
   *
   * 로그인 화면이 뜰 때 프론트에서
   * GET /api/login?warm=1 을 한 번 호출하면
   * 실제 로그인 전에 DB 연결을 미리 만들어둘 수 있다.
   */
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const warm = url.searchParams.get('warm') === '1';

    if (!warm) {
      finish({ ok: false, error: 'Method not allowed' }, 405);
      return;
    }

    const tWarm = Date.now();

    try {
      const result = await query('select 1 as ok', []);

      debug.warm_query_ms = Date.now() - tWarm;
      debug.driver = result.driver || 'unknown';

      finish({
        ok: true,
        warm: true,
        driver: result.driver || 'unknown'
      });

      return;
    } catch (err) {
      debug.warm_query_ms = Date.now() - tWarm;
      debug.error = String((err && err.message) || err);

      finish({
        ok: false,
        warm: false,
        error: 'DB warm-up failed'
      }, 500);

      return;
    }
  }

  if (req.method !== 'POST') {
    finish({ ok: false, error: 'Method not allowed' }, 405);
    return;
  }

  try {
    const tBody = Date.now();

    const body = await readBody(req);
    const params = new URLSearchParams(body);

    debug.read_body_ms = Date.now() - tBody;

    const name = normalizeNickname(params.get('name'));
    const pin = (params.get('pin') || '').trim();
    const resetPin = params.get('reset_pin') === '1';

    if (!name) {
      finish({ ok: false, error: '닉네임을 입력하세요.' }, 400);
      return;
    }

    if (!isValidPin(pin)) {
      finish({ ok: false, error: '숫자 네 자리를 입력하세요.' }, 400);
      return;
    }

    const tFind = Date.now();

    let user = await findUserByNickname(name);

    debug.find_user_ms = Date.now() - tFind;

    if (!user) {
      const tCreate = Date.now();

      user = await createUser(name, pin);

      debug.create_user_ms = Date.now() - tCreate;

      const tAuth = Date.now();

      setAuth(res, user.nickname, user.id);

      debug.set_auth_ms = Date.now() - tAuth;

      finish({
        ok: true,
        name: user.nickname,
        is_new: true
      });

      return;
    }

    const tVerify = Date.now();

    const pinOk = await verifyPin(user, pin);

    debug.verify_pin_ms = Date.now() - tVerify;

    if (!pinOk) {
      if (resetPin) {
        const tReset = Date.now();

        user = await resetUserPinAndProgress(user, pin);

        debug.reset_user_ms = Date.now() - tReset;

        const tAuth = Date.now();

        setAuth(res, user.nickname, user.id);

        debug.set_auth_ms = Date.now() - tAuth;

        finish({
          ok: true,
          name: user.nickname,
          is_new: false,
          reset: true
        });

        return;
      }

      finish({
        ok: false,
        code: 'pin_mismatch',
        error:
          '이 닉네임으로 저장된 진행 기록이 있습니다.\n' +
          '숫자 네 자리가 다르면 기존 진행 기록을 정리하고 새로 시작해야 합니다.'
      }, 409);

      return;
    }

    const tAuth = Date.now();

    setAuth(res, user.nickname, user.id);

    debug.set_auth_ms = Date.now() - tAuth;

    finish({
      ok: true,
      name: user.nickname,
      is_new: false
    });
  } catch (err) {
    console.error('login failed:', err);

    debug.error = String((err && err.message) || err);

    finish({
      ok: false,
      error: '로그인 처리 중 오류가 발생했습니다.'
    }, 500);
  }
};