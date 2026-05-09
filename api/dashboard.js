const { getSession } = require('./_auth');
const { ensureAccountTables } = require('./_account');
const { query, exec } = require('./_db');

const GLOBAL_DASHBOARD_CACHE_TTL_MS = 60000;
const GLOBAL_DASHBOARD_DB_CACHE_KEY = 'dashboard_global_v1';
const GLOBAL_DASHBOARD_DB_CACHE_TTL_SECONDS = 120;
let globalDashboardCache = {
  fetchedAt: 0,
  distributionRows: null,
  rankingRows: null
};
let userRankCache = {};

async function safeQuery(sql, params) {
  try {
    return await query(sql, params || []);
  } catch (err) {
    return { rows: [], disabled: false, error: err.message || 'query_failed' };
  }
}

async function safeExec(sql, params) {
  try {
    return await exec(sql, params || []);
  } catch (err) {
    return { affected: 0, disabled: false, error: err.message || 'exec_failed' };
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

async function readGlobalDashboardDbCache() {
  var cached = await safeQuery(
    'select payload from exam_cache where cache_key = $1 and expires_at > now() limit 1',
    [GLOBAL_DASHBOARD_DB_CACHE_KEY]
  );
  if (cached.error || !cached.rows[0] || !cached.rows[0].payload) return null;
  return cached.rows[0].payload;
}

async function writeGlobalDashboardDbCache(payload) {
  await safeExec(
    'insert into exam_cache (cache_key, payload, expires_at, updated_at) values ($1, $2::jsonb, now() + ($3 || \' seconds\')::interval, now()) on conflict (cache_key) do update set payload = excluded.payload, expires_at = excluded.expires_at, updated_at = now()',
    [GLOBAL_DASHBOARD_DB_CACHE_KEY, JSON.stringify(payload), String(GLOBAL_DASHBOARD_DB_CACHE_TTL_SECONDS)]
  );
}

function isFreshGlobalDashboardCache() {
  return !!(
    globalDashboardCache.distributionRows &&
    globalDashboardCache.rankingRows &&
    (Date.now() - globalDashboardCache.fetchedAt) < GLOBAL_DASHBOARD_CACHE_TTL_MS
  );
}

async function getGlobalDashboardStats() {
  if (isFreshGlobalDashboardCache()) {
    return {
      distributionRows: globalDashboardCache.distributionRows,
      rankingRows: globalDashboardCache.rankingRows,
      error: null
    };
  }

  var dbCached = await readGlobalDashboardDbCache();
  if (dbCached && Array.isArray(dbCached.distributionRows) && Array.isArray(dbCached.rankingRows)) {
    globalDashboardCache = {
      fetchedAt: Date.now(),
      distributionRows: dbCached.distributionRows,
      rankingRows: dbCached.rankingRows
    };
    return {
      distributionRows: globalDashboardCache.distributionRows,
      rankingRows: globalDashboardCache.rankingRows,
      error: null
    };
  }

  var results = await Promise.all([
    safeQuery(
      "select case when score >= 90 then '90-100' when score >= 80 then '80-89' when score >= 70 then '70-79' when score >= 60 then '60-69' else '0-59' end as range, count(*)::int as count from exam_attempts group by range order by min(score)",
      []
    ),
    safeQuery(
      'with best_by_set as (select nickname, set_id, max(score) as best_score from exam_attempts group by nickname, set_id), ranked as (select nickname, round(avg(best_score))::int as avg_best_score, count(*)::int as completed_sets, rank() over (order by avg(best_score) desc, count(*) desc, nickname asc)::int as rank from best_by_set group by nickname) select rank, nickname, avg_best_score, completed_sets from ranked order by rank, nickname limit 20',
      []
    )
  ]);

  var distribution = results[0];
  var ranking = results[1];

  if (distribution.error || ranking.error) {
    return {
      distributionRows: distribution.rows || [],
      rankingRows: ranking.rows || [],
      error: distribution.error || ranking.error
    };
  }

  globalDashboardCache = {
    fetchedAt: Date.now(),
    distributionRows: distribution.rows || [],
    rankingRows: ranking.rows || []
  };
  await writeGlobalDashboardDbCache({
    distributionRows: globalDashboardCache.distributionRows,
    rankingRows: globalDashboardCache.rankingRows
  });

  return {
    distributionRows: globalDashboardCache.distributionRows,
    rankingRows: globalDashboardCache.rankingRows,
    error: null
  };
}

function getCachedUserRank(user) {
  var cached = userRankCache[user];
  if (!cached || (Date.now() - cached.fetchedAt) >= GLOBAL_DASHBOARD_CACHE_TTL_MS) return null;
  return { hit: true, row: cached.row };
}

function setCachedUserRank(user, row) {
  userRankCache[user] = {
    fetchedAt: Date.now(),
    row: row || null
  };
}

async function getUserRank(user, topRows) {
  var topRank = (topRows || []).find(function(row) { return row.nickname === user; });
  if (topRank) {
    setCachedUserRank(user, topRank);
    return { row: topRank, error: null };
  }

  var cached = getCachedUserRank(user);
  if (cached) return { row: cached.row, error: null };

  var result = await safeQuery(
    'with best_by_set as (select nickname, set_id, max(score) as best_score from exam_attempts group by nickname, set_id), ranked as (select nickname, round(avg(best_score))::int as avg_best_score, count(*)::int as completed_sets, rank() over (order by avg(best_score) desc, count(*) desc, nickname asc)::int as rank from best_by_set group by nickname) select rank, avg_best_score, completed_sets from ranked where nickname = $1',
    [user]
  );
  if (result.error) return { row: null, error: result.error };
  var row = result.rows[0] || null;
  setCachedUserRank(user, row);
  return { row: row, error: null };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  var session = getSession(req);
  if (!session || !session.name) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  var user = session.name;

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  await ensureAccountTables();

  var queries = [
    safeQuery(
      'select set_id, count(*)::int as attempts, coalesce(round(avg(score))::int, 0) as avg_score, coalesce(max(score)::int, 0) as best_score, max(finished_at) as latest_at, grouping(set_id)::int as is_summary from exam_attempts where nickname = $1 group by grouping sets ((set_id), ()) order by is_summary desc, set_id',
      [user]
    ),
    safeQuery(
      'select set_id, answers, graded, started_at, saved_at from exam_progress where user_id = $1',
      [session.user_id]
    ),
    getGlobalDashboardStats()
  ];

  var results = await Promise.all(queries);

  var userStats = results[0];
  var progressRows = results[1];
  var globalStats = results[2];
  var distributionRows = globalStats.distributionRows || [];
  var rankingRows = globalStats.rankingRows || [];

  if (!session.user_id) {
    var fallbackProgressRows = await safeQuery(
      'select set_id, answers, graded, started_at, saved_at from exam_progress where nickname = $1',
      [user]
    );
    progressRows = fallbackProgressRows;
  }

  if (userStats.disabled) {
    res.json({ ok: true, disabled: true });
    return;
  }
  if (userStats.error) {
    res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
    return;
  }

  if (progressRows.error || globalStats.error) {
    res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
    return;
  }

  var summaryRow = (userStats.rows || []).find(function(row) { return row.is_summary === 1; });
  var bySetRows = (userStats.rows || []).filter(function(row) { return row.is_summary === 0; });
  var summary = summaryRow || { attempts: 0, avg_score: 0, best_score: 0 };
  var myRankRow = null;
  if ((summary.attempts || 0) > 0) {
    var myRank = await getUserRank(user, rankingRows);
    if (myRank.error) {
      res.status(500).json({ ok: false, error: '통계를 불러오지 못했습니다.' });
      return;
    }
    myRankRow = myRank.row;
  }

  var progress = {};
  (progressRows.rows || []).forEach(function(row) {
    progress[row.set_id] = normalizeProgress(row);
  });

  var leaderboard = rankingRows.map(function(row) {
    return {
      rank: row.rank,
      nickname: row.nickname,
      avg_best_score: row.avg_best_score,
      completed_sets: row.completed_sets
    };
  });
  if (myRankRow) {
    myRankRow = {
      rank: myRankRow.rank,
      avg_best_score: myRankRow.avg_best_score,
      completed_sets: myRankRow.completed_sets
    };
  }

  res.json({
    ok: true,
    nickname: user,
    summary: summary,
    by_set: bySetRows,
    distribution: distributionRows,
    leaderboard: leaderboard,
    my_rank: myRankRow,
    progress: progress,
    weak_questions: []
  });
};
