const { getUser } = require('./_auth');
const { query } = require('./_db');

async function safeQuery(sql, params) {
  try {
    return await query(sql, params || []);
  } catch (err) {
    return { rows: [], disabled: false, error: err.message || 'query_failed' };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  var user = getUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  var summary = await safeQuery(
    'select count(*)::int as attempts, coalesce(round(avg(score))::int, 0) as avg_score, coalesce(max(score)::int, 0) as best_score from exam_attempts where nickname = $1',
    [user]
  );

  if (summary.disabled) {
    res.json({ ok: true, disabled: true });
    return;
  }
  if (summary.error) {
    res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
    return;
  }

  var bySet = await safeQuery(
    'select set_id, count(*)::int as attempts, coalesce(round(avg(score))::int, 0) as avg_score, max(score)::int as best_score, max(finished_at) as latest_at from exam_attempts where nickname = $1 group by set_id order by set_id',
    [user]
  );

  var distribution = await safeQuery(
    "select case when score >= 90 then '90-100' when score >= 80 then '80-89' when score >= 70 then '70-79' when score >= 60 then '60-69' else '0-59' end as range, count(*)::int as count from exam_attempts group by range order by min(score)",
    []
  );

  var leaderboard = await safeQuery(
    'with best_by_set as (select nickname, set_id, max(score) as best_score from exam_attempts group by nickname, set_id), ranked as (select nickname, round(avg(best_score))::int as avg_best_score, count(*)::int as completed_sets, rank() over (order by avg(best_score) desc, count(*) desc, nickname asc)::int as rank from best_by_set group by nickname) select rank, nickname, avg_best_score, completed_sets from ranked order by rank, nickname limit 20',
    []
  );

  var myRank = await safeQuery(
    'with best_by_set as (select nickname, set_id, max(score) as best_score from exam_attempts group by nickname, set_id), ranked as (select nickname, round(avg(best_score))::int as avg_best_score, count(*)::int as completed_sets, rank() over (order by avg(best_score) desc, count(*) desc, nickname asc)::int as rank from best_by_set group by nickname) select rank, avg_best_score, completed_sets from ranked where nickname = $1',
    [user]
  );

  if (bySet.error || distribution.error || leaderboard.error || myRank.error) {
    res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
    return;
  }

  res.json({
    ok: true,
    nickname: user,
    summary: summary.rows[0] || { attempts: 0, avg_score: 0, best_score: 0 },
    by_set: bySet.rows,
    distribution: distribution.rows,
    leaderboard: leaderboard.rows,
    my_rank: myRank.rows[0] || null,
    weak_questions: []
  });
};
