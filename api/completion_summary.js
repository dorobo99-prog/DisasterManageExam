const { getSession } = require('./_auth');
const { withSchemaFallback } = require('./_account');
const { query } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const session = getSession(req);
  if (!session || !session.name) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const attemptResult = await query(
      'select set_id, count(*)::int as attempts, coalesce(round(avg(score))::int, 0) as avg_score, coalesce(max(score)::int, 0) as best_score, max(finished_at) as latest_at from exam_attempts where nickname = $1 group by set_id order by set_id',
      [session.name]
    );

    let progressResult = { rows: [] };
    if (session.user_id) {
      progressResult = await withSchemaFallback(function() {
        return query(
          'select set_id, saved_at from exam_progress where user_id = $1 and graded = true',
          [session.user_id]
        );
      });
    }

    if (attemptResult.error || progressResult.error) {
      res.status(500).json({ ok: false, error: '완료 과목 정보를 불러오지 못했습니다.' });
      return;
    }

    const bySetMap = {};
    (attemptResult.rows || []).forEach(function(row) {
      bySetMap[row.set_id] = {
        set_id: row.set_id,
        attempts: row.attempts,
        avg_score: row.avg_score,
        best_score: row.best_score,
        latest_at: row.latest_at || null
      };
    });

    (progressResult.rows || []).forEach(function(row) {
      if (bySetMap[row.set_id]) return;
      bySetMap[row.set_id] = {
        set_id: row.set_id,
        attempts: 1,
        avg_score: null,
        best_score: null,
        latest_at: row.saved_at || null
      };
    });

    res.json({
      ok: true,
      nickname: session.name,
      by_set: Object.keys(bySetMap).sort().map(function(setId) { return bySetMap[setId]; })
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: '완료 과목 정보를 불러오지 못했습니다.' });
  }
};
