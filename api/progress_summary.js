const { getSession } = require('../lib/_auth');
const { withSchemaFallback } = require('../lib/_account');
const { query } = require('../lib/_db');

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

  var session = getSession(req);
  if (!session || !session.user_id) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  var found = await withSchemaFallback(function() {
    return query(
      'select set_id, answers, graded, started_at, saved_at from exam_progress where user_id = $1',
      [session.user_id]
    );
  });
  var progress = {};
  (found.rows || []).forEach(function(row) {
    progress[row.set_id] = normalizeProgress(row);
  });

  res.json({ ok: true, progress: progress });
};
