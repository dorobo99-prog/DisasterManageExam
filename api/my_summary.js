const { getSession } = require('../lib/_auth');
const { query } = require('../lib/_db');

function emptySummary() {
  return {
    attempts: 0,
    total_score: 0,
    avg_score: 0,
    best_score: 0,
    completed_sets: 0,
    last_attempt_at: null
  };
}

function isMissingTableError(err) {
  const msg = String((err && (err.code || err.message)) || err || '').toLowerCase();

  return (
    msg.indexOf('does not exist') >= 0 ||
    msg.indexOf('undefined_table') >= 0 ||
    msg.indexOf('42p01') >= 0
  );
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
      res.json({
        ok: true,
        nickname: session.name,
        summary: emptySummary(),
        by_set: [],
        my_rank: null,
        leaderboard: [],
        source: 'no_user_id',
        debug_timings: {
          server_total_ms: Date.now() - started
        }
      });
      return;
    }

    const tQuery = Date.now();

    const result = await query(
      `
      with my_stats as (
        select
          attempts,
          total_score,
          avg_score,
          best_score,
          completed_sets,
          last_attempt_at
        from exam_user_stats
        where user_id = $1
        limit 1
      ),
      my_sets as (
        select
          coalesce(
            json_agg(
              json_build_object(
                'set_id', set_id,
                'attempts', attempts,
                'total_score', total_score,
                'avg_score', avg_score,
                'best_score', best_score,
                'latest_score', latest_score,
                'latest_correct_count', latest_correct_count,
                'latest_total_count', latest_total_count,
                'latest_at', latest_at
              )
              order by set_id
            ),
            '[]'::json
          ) as by_set
        from exam_user_set_stats
        where user_id = $1
      )
      select
        coalesce(
          (
            select json_build_object(
              'attempts', attempts,
              'total_score', total_score,
              'avg_score', avg_score,
              'best_score', best_score,
              'completed_sets', completed_sets,
              'last_attempt_at', last_attempt_at
            )
            from my_stats
          ),
          json_build_object(
            'attempts', 0,
            'total_score', 0,
            'avg_score', 0,
            'best_score', 0,
            'completed_sets', 0,
            'last_attempt_at', null
          )
        ) as summary,
        (select by_set from my_sets) as by_set
      `,
      [session.user_id]
    );

    debug.db_single_query_ms = Date.now() - tQuery;

    if (result.disabled) {
      res.json({
        ok: true,
        disabled: true,
        nickname: session.name,
        summary: emptySummary(),
        by_set: [],
        my_rank: null,
        leaderboard: [],
        source: 'db_disabled',
        debug_timings: {
          ...debug,
          server_total_ms: Date.now() - started
        }
      });
      return;
    }

    const row = result.rows && result.rows[0];

    const summary = row && row.summary
      ? {
          attempts: Number(row.summary.attempts || 0),
          total_score: Number(row.summary.total_score || 0),
          avg_score: Number(row.summary.avg_score || 0),
          best_score: Number(row.summary.best_score || 0),
          completed_sets: Number(row.summary.completed_sets || 0),
          last_attempt_at: row.summary.last_attempt_at || null
        }
      : emptySummary();

    const bySet = Array.isArray(row && row.by_set)
      ? row.by_set.map(function(item) {
          return {
            set_id: item.set_id,
            attempts: Number(item.attempts || 0),
            total_score: Number(item.total_score || 0),
            avg_score: item.avg_score == null ? null : Number(item.avg_score),
            best_score: item.best_score == null ? null : Number(item.best_score),
            latest_score: item.latest_score == null ? null : Number(item.latest_score),
            latest_correct_count:
              item.latest_correct_count == null ? null : Number(item.latest_correct_count),
            latest_total_count:
              item.latest_total_count == null ? null : Number(item.latest_total_count),
            latest_at: item.latest_at || null
          };
        })
      : [];

    res.json({
      ok: true,
      nickname: session.name,
      summary: summary,
      by_set: bySet,
      my_rank: null,
      leaderboard: [],
      source: 'precomputed_single_query',
      debug_timings: {
        ...debug,
        server_total_ms: Date.now() - started
      }
    });
  } catch (err) {
    console.error('my_summary failed:', err);

    if (isMissingTableError(err)) {
      res.json({
        ok: true,
        nickname: session.name,
        summary: emptySummary(),
        by_set: [],
        my_rank: null,
        leaderboard: [],
        source: 'stats_schema_missing',
        debug_timings: {
          server_total_ms: Date.now() - started,
          schema_missing: true
        }
      });
      return;
    }

    res.status(500).json({
      ok: false,
      error: '내 학습현황을 불러오지 못했습니다.',
      debug_timings: {
        server_total_ms: Date.now() - started,
        error: String((err && err.message) || err)
      }
    });
  }
};