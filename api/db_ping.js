const { query } = require('./_db');

function isAllowed(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || '';

  if (process.env.NODE_ENV !== 'production') {
    return token === 'local-dev';
  }

  const expected = process.env.DB_PING_TOKEN || '';
  return expected && token === expected;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!isAllowed(req)) {
    res.status(403).json({
      ok: false,
      error: 'forbidden'
    });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const nickname = url.searchParams.get('nickname') || '';

  const started = Date.now();
  const timings = {};

  async function measure(name, fn) {
    const t = Date.now();
    const result = await fn();
    timings[name] = Date.now() - t;
    return result;
  }

  try {
    const one = await measure('select_one_ms', function() {
      return query('select 1 as ok', []);
    });

    const driver = one.driver || 'unknown';

    let user = null;

    if (nickname) {
      const result = await measure('select_user_ms', function() {
        return query(
          'select id, nickname from exam_users where nickname = $1 limit 1',
          [nickname]
        );
      });

      user = result.rows && result.rows[0]
        ? {
            id: result.rows[0].id,
            nickname: result.rows[0].nickname
          }
        : null;
    }

    const secondOne = await measure('select_one_second_ms', function() {
      return query('select 1 as ok', []);
    });

    res.json({
      ok: true,
      driver: driver,
      nickname: nickname || null,
      user_found: !!user,
      user: user,
      timings: Object.assign({}, timings, {
        server_total_ms: Date.now() - started
      })
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String((err && err.message) || err),
      timings: Object.assign({}, timings, {
        server_total_ms: Date.now() - started
      })
    });
  }
};