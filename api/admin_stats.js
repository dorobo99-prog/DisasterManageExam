const { query } = require('./_db');

function getAdminToken(req) {
  var headerToken = req.headers['x-admin-token'];
  if (Array.isArray(headerToken)) headerToken = headerToken[0];
  return headerToken || (req.query && req.query.token) || '';
}

async function run(sql, params) {
  return query(sql, params || []);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!process.env.ADMIN_TOKEN) {
    res.status(503).json({ ok: false, error: 'ADMIN_TOKEN 환경변수가 아직 설정되지 않았습니다.' });
    return;
  }

  if (getAdminToken(req) !== process.env.ADMIN_TOKEN) {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return;
  }

  try {
    var overall = await run(
      'select count(*)::int as attempts, count(distinct nickname)::int as users, coalesce(round(avg(score))::int, 0) as avg_score, coalesce(max(score)::int, 0) as best_score from exam_attempts',
      []
    );

    var bySet = await run(
      'select set_id, provider, chapter, count(*)::int as attempts, count(distinct nickname)::int as users, coalesce(round(avg(score))::int, 0) as avg_score, coalesce(max(score)::int, 0) as best_score from exam_attempts group by set_id, provider, chapter order by set_id',
      []
    );

    var byNickname = await run(
      'select nickname, count(*)::int as attempts, count(distinct set_id)::int as completed_sets, coalesce(round(avg(score))::int, 0) as avg_score, coalesce(max(score)::int, 0) as best_score from exam_attempts group by nickname order by avg_score desc, completed_sets desc, nickname limit 100',
      []
    );

    var questionStats = await run(
      'select set_id, question_id, count(*)::int as attempts, sum(case when is_correct then 1 else 0 end)::int as correct_count, sum(case when is_correct then 0 else 1 end)::int as wrong_count, round(avg(case when is_correct then 100.0 else 0.0 end))::int as correct_rate from exam_answers group by set_id, question_id order by correct_rate asc, attempts desc, set_id, question_id limit 300',
      []
    );

    var distribution = await run(
      "select case when score >= 90 then '90-100' when score >= 80 then '80-89' when score >= 70 then '70-79' when score >= 60 then '60-69' else '0-59' end as range, count(*)::int as count from exam_attempts group by range order by min(score)",
      []
    );

    if (overall.disabled) {
      res.json({ ok: true, disabled: true });
      return;
    }

    res.json({
      ok: true,
      overall: overall.rows[0] || { attempts: 0, users: 0, avg_score: 0, best_score: 0 },
      by_set: bySet.rows,
      by_nickname: byNickname.rows,
      question_stats: questionStats.rows,
      distribution: distribution.rows
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
  }
};
