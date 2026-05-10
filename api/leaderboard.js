const { getSession } = require('./_auth');
const { query } = require('./_db');
const { withSchemaFallback } = require('./_account');

function emptyResponse(nickname) {
  return {
    ok: true,
    nickname: nickname,
    my_rank: null,
    leaderboard: [],
    source: 'precomputed_leaderboard'
  };
}

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
    if (!session.user_id) {
      res.json(emptyResponse(session.name));
      return;
    }

    /*
     * 랭킹 산정 기준
     * 1. 사용자별 과목 최고점 평균(avg_best_score) 높은 순
     * 2. 완료 과목 수(completed_sets) 많은 순
     * 3. 총 응시 수(attempts) 많은 순
     * 4. 닉네임 오름차순
     *
     * 핵심:
     * - exam_attempts 전체를 훑지 않는다.
     * - 이미 계산된 exam_user_set_stats만 사용한다.
     */
    const leaderboardResult = await withSchemaFallback(function() {
      return query(
        `
        with user_scores as (
          select
            user_id,
            max(nickname) as nickname,
            round(avg(best_score))::integer as avg_best_score,
            count(*)::integer as completed_sets,
            sum(attempts)::integer as attempts,
            max(latest_at) as latest_at
          from exam_user_set_stats
          where attempts > 0
          group by user_id
        ),
        ranked as (
          select
            row_number() over (
              order by
                avg_best_score desc,
                completed_sets desc,
                attempts desc,
                nickname asc
            )::integer as rank,
            user_id,
            nickname,
            avg_best_score,
            completed_sets,
            attempts,
            latest_at
          from user_scores
        )
        select
          rank,
          user_id,
          nickname,
          avg_best_score,
          completed_sets,
          attempts,
          latest_at
        from ranked
        order by rank
        limit 20
        `,
        []
      );
    });

    const myRankResult = await withSchemaFallback(function() {
      return query(
        `
        with user_scores as (
          select
            user_id,
            max(nickname) as nickname,
            round(avg(best_score))::integer as avg_best_score,
            count(*)::integer as completed_sets,
            sum(attempts)::integer as attempts,
            max(latest_at) as latest_at
          from exam_user_set_stats
          where attempts > 0
          group by user_id
        ),
        ranked as (
          select
            row_number() over (
              order by
                avg_best_score desc,
                completed_sets desc,
                attempts desc,
                nickname asc
            )::integer as rank,
            user_id,
            nickname,
            avg_best_score,
            completed_sets,
            attempts,
            latest_at
          from user_scores
        )
        select
          rank,
          user_id,
          nickname,
          avg_best_score,
          completed_sets,
          attempts,
          latest_at
        from ranked
        where user_id = $1
        limit 1
        `,
        [session.user_id]
      );
    });

    if (leaderboardResult.disabled || myRankResult.disabled) {
      res.json({
        ok: true,
        disabled: true,
        nickname: session.name,
        my_rank: null,
        leaderboard: [],
        source: 'db_disabled'
      });
      return;
    }

    const leaderboard = (leaderboardResult.rows || []).map(function(row) {
      return {
        rank: Number(row.rank || 0),
        nickname: row.nickname,
        avg_best_score: Number(row.avg_best_score || 0),
        completed_sets: Number(row.completed_sets || 0),
        attempts: Number(row.attempts || 0),
        latest_at: row.latest_at || null
      };
    });

    const myRankRow = myRankResult.rows && myRankResult.rows[0];

    const myRank = myRankRow
      ? {
          rank: Number(myRankRow.rank || 0),
          nickname: myRankRow.nickname,
          avg_best_score: Number(myRankRow.avg_best_score || 0),
          completed_sets: Number(myRankRow.completed_sets || 0),
          attempts: Number(myRankRow.attempts || 0),
          latest_at: myRankRow.latest_at || null
        }
      : null;

    res.json({
      ok: true,
      nickname: session.name,
      my_rank: myRank,
      leaderboard: leaderboard,
      source: 'precomputed_leaderboard'
    });
  } catch (err) {
    console.error('leaderboard failed:', err);

    res.status(500).json({
      ok: false,
      error: '랭킹을 불러오지 못했습니다.'
    });
  }
};