const { getSession, readBody } = require('./_auth');
const { ensureAccountTables } = require('./_account');
const { query, exec } = require('./_db');

const ALLOWED = ['gemini_ch1','gemini_ch2','gemini_ch3','gpt_ch1','gpt_ch2','gpt_ch3'];

function validSet(setId) {
  return ALLOWED.indexOf(setId) >= 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  var session = getSession(req);
  if (!session || !session.user_id) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  await ensureAccountTables();

  if (req.method === 'GET') {
    var getSet = (req.query.set || '').trim();
    if (!validSet(getSet)) {
      res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
      return;
    }
    var found = await query(
      'select set_id, answers, graded, started_at, saved_at from exam_progress where user_id = $1 and set_id = $2 limit 1',
      [session.user_id, getSet]
    );
    res.json({ ok: true, progress: found.rows[0] || null });
    return;
  }

  if (req.method === 'DELETE') {
    var deleteSet = (req.query.set || '').trim();
    if (!validSet(deleteSet)) {
      res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
      return;
    }
    await exec(
      'delete from exam_progress where user_id = $1 and set_id = $2',
      [session.user_id, deleteSet]
    );
    res.json({ ok: true });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  var payload = JSON.parse(await readBody(req));
  var setId = (payload.set_id || '').trim();
  if (!validSet(setId)) {
    res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
    return;
  }

  await exec(
    'insert into exam_progress (user_id, nickname, set_id, answers, graded, started_at, saved_at) values ($1, $2, $3, $4::jsonb, $5, $6, now()) on conflict (user_id, set_id) do update set answers = excluded.answers, graded = excluded.graded, started_at = coalesce(excluded.started_at, exam_progress.started_at), saved_at = now()',
    [
      session.user_id,
      session.name,
      setId,
      JSON.stringify(payload.answers || {}),
      !!payload.graded,
      payload.started_at || null
    ]
  );
  res.json({ ok: true });
};
