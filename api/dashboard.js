const { getUser } = require('./_auth');
const { query } = require('./_db');

async function safeQuery(sql, params) {
  try {
    return await query(sql, params || []);
  } catch (err) {
    return { rows: [], disabled: false, error: err.message || 'query_failed' };
  }
}

function normalizeProgress(row) {
  if (!row) return null;
  var answers = row.answers || {};
  var questionIds = answers.__question_ids || [];
  if (answers.__question_ids) {
    answers = Object.assign({}, answers);
    delete answers.__question_ids;
  }
  return {
    set_id: row.set_id,
    answers: answers,
    question_ids: questionIds,
    graded: !!row.graded,
    started_at: row.started_at || null,
    saved_at: row.saved_at || null
  };
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

  var results = await Promise.all([
    safeQuery(
      'select count(*)::int as attempts, coalesce(round(avg(score))::int, 0) as avg_score, coalesce(max(score)::int, 0) as best_score from exam_attempts where nickname = $1',
      [user]
    ),
    safeQuery(
      'select set_id, count(*)::int as attempts, coalesce(round(avg(score))::int, 0) as avg_score, max(score)::int as best_score, max(finished_at) as latest_at from exam_attempts where nickname = $1 group by set_id order by set_id',
      [user]
    ),
    safeQuery(
      "select case when score >= 90 then '90-100' when score >= 80 then '80-89' when score >= 70 then '70-79' when score >= 60 then '60-69' else '0-59' end as range, count(*)::int as count from exam_attempts group by range order by min(score)",
      []
    ),
    safeQuery(
      'with best_by_set as (select nickname, set_id, max(score) as best_score from exam_attempts group by nickname, set_id), ranked as (select nickname, round(avg(best_score))::int as avg_best_score, count(*)::int as completed_sets, rank() over (order by avg(best_score) desc, count(*) desc, nickname asc)::int as rank from best_by_set group by nickname) select rank, nickname, avg_best_score, completed_sets, (nickname = $1) as is_me from ranked where rank <= 20 or nickname = $1 order by rank, nickname',
      [user]
    ),
    safeQuery(
      'select set_id, answers, graded, started_at, saved_at from exam_progress where nickname = $1',
      [user]
    )
  ]);

  var summary = results[0];
  var bySet = results[1];
  var distribution = results[2];
  var ranking = results[3];
  var progressRows = results[4];

  if (summary.disabled) {
    res.json({ ok: true, disabled: true });
    return;
  }
  if (summary.error) {
    res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
    return;
  }

  if (bySet.error || distribution.error || ranking.error || progressRows.error) {
    res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
    return;
  }

  var progress = {};
  (progressRows.rows || []).forEach(function(row) {
    progress[row.set_id] = normalizeProgress(row);
  });

  var rankingRows = ranking.rows || [];
  var leaderboard = rankingRows
    .filter(function(row) { return row.rank <= 20; })
    .map(function(row) {
      return {
        rank: row.rank,
        nickname: row.nickname,
        avg_best_score: row.avg_best_score,
        completed_sets: row.completed_sets
      };
    });
  var myRank = rankingRows.find(function(row) { return row.is_me; }) || null;
  if (myRank) {
    myRank = {
      rank: myRank.rank,
      avg_best_score: myRank.avg_best_score,
      completed_sets: myRank.completed_sets
    };
  }

  res.json({
    ok: true,
    nickname: user,
    summary: summary.rows[0] || { attempts: 0, avg_score: 0, best_score: 0 },
    by_set: bySet.rows,
    distribution: distribution.rows,
    leaderboard: leaderboard,
    my_rank: myRank,
    progress: progress,
    weak_questions: []
  });
};
