const { getSession } = require('../lib/_auth');
const { query } = require('../lib/_db');

function withDebug(payload, debug) {
  if (process.env.NODE_ENV === 'production') {
    return payload;
  }

  return Object.assign({}, payload, {
    debug_timings: debug
  });
}

function isMissingTableError(err) {
  const msg = String((err && (err.code || err.message)) || err || '').toLowerCase();

  return (
    msg.indexOf('does not exist') >= 0 ||
    msg.indexOf('undefined_table') >= 0 ||
    msg.indexOf('42p01') >= 0
  );
}

function normalizeRank(row) {
  if (!row) return null;

  return {
    rank: Number(row.rank || 0),
    total_users: Number(row.total_users || 0),
    user_id: row.user_id || null,
    nickname: row.nickname || '',
    avg_best_score: Number(row.avg_best_score || 0),
    completed_sets: Number(row.completed_sets || 0),
    attempts: Number(row.attempts || 0),
    latest_at: row.latest_at || null
  };
}

function normalizeLeaderboard(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map(function(row) {
    return {
      rank: Number(row.rank || 0),
      total_users: Number(row.total_users || 0),
      user_id: row.user_id || null,
      nickname: row.nickname || '',
      avg_best_score: Number(row.avg_best_score || 0),
      completed_sets: Number(row.completed_sets || 0),
      attempts: Number(row.attempts || 0),
      latest_at: row.latest_at || null
    };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const started = Date.now();
  const debug = {};

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
      res.json(
        withDebug(
          {
            ok: true,
            nickname: session.name,
            my_rank: null,
            leaderboard: [],
            source: 'no_user_id'
          },
          {
            server_total_ms: Date.now() - started
          }
        )
      );
      return;
    }

    const tQuery = Date.now();

    const result = await query(
      `
      with top_leaderboard as (
        select
          coalesce(
            json_agg(
              json_build_object(
                'rank', rank,
                'total_users', total_users,
                'user_id', user_id,
                'nickname', nickname,
                'avg_best_score', avg_best_score,
                'completed_sets', completed_sets,
                'attempts', attempts,
                'latest_at', latest_at
              )
              order by rank
            ),
            '[]'::json
          ) as rows
        from (
          select
            rank,
            total_users,
            user_id,
            nickname,
            avg_best_score,
            completed_sets,
            attempts,
            latest_at
          from exam_user_rank_stats
          order by rank
          limit 20
        ) t
      ),
      my_rank as (
        select
          json_build_object(
            'rank', rank,
            'total_users', total_users,
            'user_id', user_id,
            'nickname', nickname,
            'avg_best_score', avg_best_score,
            'completed_sets', completed_sets,
            'attempts', attempts,
            'latest_at', latest_at
          ) as value
        from exam_user_rank_stats
        where user_id = $1
        limit 1
      )
      select
        (select rows from top_leaderboard) as leaderboard,
        (select value from my_rank) as my_rank
      `,
      [session.user_id]
    );

    debug.db_query_ms = Date.now() - tQuery;
    debug.driver = result.driver || 'unknown';

    if (result.disabled) {
      res.json(
        withDebug(
          {
            ok: true,
            disabled: true,
            nickname: session.name,
            my_rank: null,
            leaderboard: [],
            source: 'db_disabled'
          },
          {
            ...debug,
            server_total_ms: Date.now() - started
          }
        )
      );
      return;
    }

    const row = result.rows && result.rows[0];

    res.json(
      withDebug(
        {
          ok: true,
          nickname: session.name,
          my_rank: normalizeRank(row && row.my_rank),
          leaderboard: normalizeLeaderboard(row && row.leaderboard),
          source: 'precomputed_rank_stats'
        },
        {
          ...debug,
          server_total_ms: Date.now() - started
        }
      )
    );
  } catch (err) {
    console.error('leaderboard failed:', err);

    if (isMissingTableError(err)) {
      res.json(
        withDebug(
          {
            ok: true,
            nickname: session.name,
            my_rank: null,
            leaderboard: [],
            source: 'stats_schema_missing'
          },
          {
            server_total_ms: Date.now() - started,
            schema_missing: true
          }
        )
      );
      return;
    }

    res.status(500).json(
      withDebug(
        {
          ok: false,
          error: '랭킹을 불러오지 못했습니다.'
        },
        {
          server_total_ms: Date.now() - started,
          error: String((err && err.message) || err)
        }
      )
    );
  }
};
