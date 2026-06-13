const { ensureAccountTables } = require('../lib/_account');
const { query } = require('../lib/_db');

const ADMIN_STATS_CACHE_TTL_MS = 60000;

let adminStatsCache = {
  fetchedAt: 0,
  data: null
};

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function withDebug(payload, debug) {
  if (isProduction()) return payload;

  return Object.assign({}, payload, {
    debug_timings: debug
  });
}

function getAdminToken(req) {
  var headerToken = req.headers['x-admin-token'];

  if (Array.isArray(headerToken)) {
    headerToken = headerToken[0];
  }

  try {
    var url = new URL(req.url || '/', 'http://localhost');
    return headerToken || url.searchParams.get('token') || '';
  } catch (e) {
    return headerToken || '';
  }
}

function isMissingTableError(err) {
  var msg = String((err && (err.code || err.message)) || err || '').toLowerCase();

  return (
    msg.indexOf('does not exist') >= 0 ||
    msg.indexOf('undefined_table') >= 0 ||
    msg.indexOf('42p01') >= 0
  );
}

async function run(sql, params) {
  return query(sql, params || []);
}

function rows(result) {
  return result && Array.isArray(result.rows) ? result.rows : [];
}

function firstRow(result, fallback) {
  var list = rows(result);
  return list[0] || fallback || {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const started = Date.now();
  const debug = {};

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!process.env.ADMIN_TOKEN) {
    res.status(503).json({
      ok: false,
      error: 'ADMIN_TOKEN 환경변수가 아직 설정되지 않았습니다.'
    });
    return;
  }

  if (getAdminToken(req) !== process.env.ADMIN_TOKEN) {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return;
  }

  try {
    if (
      adminStatsCache.data &&
      Date.now() - adminStatsCache.fetchedAt < ADMIN_STATS_CACHE_TTL_MS
    ) {
      res.json(
        withDebug(
          Object.assign({}, adminStatsCache.data, {
            cache: {
              hit: true,
              ttl_ms: ADMIN_STATS_CACHE_TTL_MS
            }
          }),
          {
            cache_hit: true,
            server_total_ms: Date.now() - started
          }
        )
      );
      return;
    }

    const tSchema = Date.now();

    await ensureAccountTables();

    debug.db_schema_ensure_ms = Date.now() - tSchema;

    const tQuery = Date.now();

    const results = await Promise.all([
      /*
       * 전체 요약
       * exam_user_stats는 사용자 단위 사전 계산 테이블이다.
       */
      run(
        `
        select
          count(*)::int as users,
          coalesce(sum(attempts), 0)::int as attempts,
          coalesce(sum(total_score), 0)::int as total_score,
          coalesce(
            round(
              sum(total_score)::numeric / nullif(sum(attempts), 0)
            )::int,
            0
          ) as avg_score,
          coalesce(max(best_score), 0)::int as best_score,
          coalesce(sum(completed_sets), 0)::int as completed_sets,
          max(last_attempt_at) as latest_at
        from exam_user_stats
        where attempts > 0
        `,
        []
      ),

      /*
       * 과목별 통계
       * exam_user_set_stats는 사용자-과목 단위 사전 계산 테이블이다.
       */
      run(
        `
        select
          set_id,
          count(*)::int as users,
          coalesce(sum(attempts), 0)::int as attempts,
          coalesce(sum(total_score), 0)::int as total_score,
          coalesce(
            round(
              sum(total_score)::numeric / nullif(sum(attempts), 0)
            )::int,
            0
          ) as avg_score,
          coalesce(max(best_score), 0)::int as best_score,
          coalesce(avg(best_score)::numeric(10, 2), 0)::float as avg_best_score,
          max(latest_score)::int as max_latest_score,
          max(latest_at) as latest_at
        from exam_user_set_stats
        where attempts > 0
        group by set_id
        order by
          case set_id
            when 'ch1' then 1
            when 'ch2' then 2
            when 'ch3' then 3
            when 'ch4' then 4
            when 'ch5' then 5
            when 'ch6' then 6
            when 'ch7' then 7
            when 'ch8' then 8
            when 'ch9' then 9
            when 'ch10' then 10
            when 'all' then 11
            else 99
          end,
          set_id
        `,
        []
      ),

      /*
       * 사용자별 요약
       */
      run(
        `
        select
          user_id,
          nickname,
          attempts::int,
          total_score::int,
          avg_score::int,
          best_score::int,
          completed_sets::int,
          last_attempt_at
        from exam_user_stats
        where attempts > 0
        order by
          avg_score desc,
          best_score desc,
          completed_sets desc,
          attempts desc,
          nickname asc
        limit 100
        `,
        []
      ),

      /*
       * 랭킹
       * 제출 시점에 미리 계산된 순위 스냅샷을 읽는다.
       */
      run(
        `
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
        limit 100
        `,
        []
      ),

      /*
       * 최근 활동
       */
      run(
        `
        select
          user_id,
          nickname,
          set_id,
          attempts::int,
          avg_score::int,
          best_score::int,
          latest_score::int,
          latest_correct_count::int,
          latest_total_count::int,
          latest_at
        from exam_user_set_stats
        where latest_at is not null
        order by latest_at desc
        limit 30
        `,
        []
      ),

      /*
       * progress 저장 현황
       * 오답노트/완료 기록 보조 점검용.
       */
      run(
        `
        select
          count(*)::int as progress_rows,
          count(distinct user_id)::int as users,
          count(*) filter (where graded)::int as graded_rows,
          count(*) filter (where not graded)::int as ungraded_rows,
          count(*) filter (where answers ? '__question_ids')::int as rows_with_question_ids,
          max(saved_at) as latest_saved_at
        from exam_progress
        `,
        []
      ),

      /*
       * 과목별 progress 저장 현황
       */
      run(
        `
        select
          set_id,
          count(*)::int as progress_rows,
          count(distinct user_id)::int as users,
          count(*) filter (where graded)::int as graded_rows,
          count(*) filter (where not graded)::int as ungraded_rows,
          count(*) filter (where answers ? '__question_ids')::int as rows_with_question_ids,
          max(saved_at) as latest_saved_at
        from exam_progress
        group by set_id
        order by
          case set_id
            when 'ch1' then 1
            when 'ch2' then 2
            when 'ch3' then 3
            when 'ch4' then 4
            when 'ch5' then 5
            when 'ch6' then 6
            when 'ch7' then 7
            when 'ch8' then 8
            when 'ch9' then 9
            when 'ch10' then 10
            when 'all' then 11
            else 99
          end,
          set_id
        `,
        []
      )
    ]);

    debug.db_query_total_ms = Date.now() - tQuery;

    var overallResult = results[0];
    var bySetResult = results[1];
    var byNicknameResult = results[2];
    var rankingResult = results[3];
    var recentActivityResult = results[4];
    var progressOverviewResult = results[5];
    var progressBySetResult = results[6];

    if (overallResult.disabled) {
      res.json(
        withDebug(
          {
            ok: true,
            disabled: true,
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

    var overall = firstRow(overallResult, {
      users: 0,
      attempts: 0,
      total_score: 0,
      avg_score: 0,
      best_score: 0,
      completed_sets: 0,
      latest_at: null
    });

    var progressOverview = firstRow(progressOverviewResult, {
      progress_rows: 0,
      users: 0,
      graded_rows: 0,
      ungraded_rows: 0,
      rows_with_question_ids: 0,
      latest_saved_at: null
    });

    var response = {
      ok: true,
      source: 'precomputed_admin_stats',
      generated_at: new Date().toISOString(),

      /*
       * 전체 요약
       */
      overall: {
        users: Number(overall.users || 0),
        attempts: Number(overall.attempts || 0),
        total_score: Number(overall.total_score || 0),
        avg_score: Number(overall.avg_score || 0),
        best_score: Number(overall.best_score || 0),
        completed_sets: Number(overall.completed_sets || 0),
        latest_at: overall.latest_at || null
      },

      /*
       * 과목별 통계
       */
      by_set: rows(bySetResult).map(function(row) {
        return {
          set_id: row.set_id,
          users: Number(row.users || 0),
          attempts: Number(row.attempts || 0),
          total_score: Number(row.total_score || 0),
          avg_score: Number(row.avg_score || 0),
          best_score: Number(row.best_score || 0),
          avg_best_score: Number(row.avg_best_score || 0),
          max_latest_score: row.max_latest_score == null ? null : Number(row.max_latest_score),
          latest_at: row.latest_at || null
        };
      }),

      /*
       * 사용자별 요약
       */
      by_nickname: rows(byNicknameResult).map(function(row) {
        return {
          user_id: row.user_id,
          nickname: row.nickname,
          attempts: Number(row.attempts || 0),
          total_score: Number(row.total_score || 0),
          avg_score: Number(row.avg_score || 0),
          best_score: Number(row.best_score || 0),
          completed_sets: Number(row.completed_sets || 0),
          last_attempt_at: row.last_attempt_at || null
        };
      }),

      /*
       * 랭킹
       */
      leaderboard: rows(rankingResult).map(function(row) {
        return {
          rank: Number(row.rank || 0),
          total_users: Number(row.total_users || 0),
          user_id: row.user_id,
          nickname: row.nickname,
          avg_best_score: Number(row.avg_best_score || 0),
          completed_sets: Number(row.completed_sets || 0),
          attempts: Number(row.attempts || 0),
          latest_at: row.latest_at || null
        };
      }),

      /*
       * 최근 활동
       */
      recent_activity: rows(recentActivityResult).map(function(row) {
        return {
          user_id: row.user_id,
          nickname: row.nickname,
          set_id: row.set_id,
          attempts: Number(row.attempts || 0),
          avg_score: Number(row.avg_score || 0),
          best_score: Number(row.best_score || 0),
          latest_score: row.latest_score == null ? null : Number(row.latest_score),
          latest_correct_count:
            row.latest_correct_count == null ? null : Number(row.latest_correct_count),
          latest_total_count:
            row.latest_total_count == null ? null : Number(row.latest_total_count),
          latest_at: row.latest_at || null
        };
      }),

      /*
       * 오답노트/진행 저장 상태
       */
      progress: {
        overview: {
          progress_rows: Number(progressOverview.progress_rows || 0),
          users: Number(progressOverview.users || 0),
          graded_rows: Number(progressOverview.graded_rows || 0),
          ungraded_rows: Number(progressOverview.ungraded_rows || 0),
          rows_with_question_ids: Number(progressOverview.rows_with_question_ids || 0),
          latest_saved_at: progressOverview.latest_saved_at || null
        },
        by_set: rows(progressBySetResult).map(function(row) {
          return {
            set_id: row.set_id,
            progress_rows: Number(row.progress_rows || 0),
            users: Number(row.users || 0),
            graded_rows: Number(row.graded_rows || 0),
            ungraded_rows: Number(row.ungraded_rows || 0),
            rows_with_question_ids: Number(row.rows_with_question_ids || 0),
            latest_saved_at: row.latest_saved_at || null
          };
        })
      },

      /*
       * 현재 구조에서는 문항별 오답률을 실시간 집계하지 않는다.
       * exam_answers 동기 저장을 꺼둔 상태라면 이 값을 별도 배치/별도 API로 분리하는 것이 안전하다.
       */
      question_stats: [],

      cache: {
        hit: false,
        ttl_ms: ADMIN_STATS_CACHE_TTL_MS
      }
    };

    adminStatsCache = {
      fetchedAt: Date.now(),
      data: response
    };

    res.json(
      withDebug(
        response,
        {
          ...debug,
          server_total_ms: Date.now() - started
        }
      )
    );
  } catch (err) {
    console.error('admin_stats failed:', err);

    if (isMissingTableError(err)) {
      res.status(500).json(
        withDebug(
          {
            ok: false,
            error: '관리자 통계 테이블을 찾지 못했습니다. setup 또는 스키마 생성을 확인하세요.',
            source: 'stats_schema_missing'
          },
          {
            server_total_ms: Date.now() - started,
            schema_missing: true,
            message: String((err && err.message) || err)
          }
        )
      );
      return;
    }

    res.status(500).json(
      withDebug(
        {
          ok: false,
          error: '통계를 불러오지 못했습니다.'
        },
        {
          server_total_ms: Date.now() - started,
          message: String((err && err.message) || err)
        }
      )
    );
  }
};
