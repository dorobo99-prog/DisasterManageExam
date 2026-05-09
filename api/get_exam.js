const { getUser } = require('./_auth');
const { getQuestionsByIds, isAllowedPublicSet, selectQuestions } = require('./_exam_sets');

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!getUser(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  var set_id = (req.query.set || '').trim();
  if (!isAllowedPublicSet(set_id)) {
    res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
    return;
  }

  var ids = String(req.query.ids || '').split(',').map(function(id) { return id.trim(); }).filter(Boolean);
  var questions = ids.length ? getQuestionsByIds(ids) : selectQuestions(set_id);

  res.json({ ok: true, questions: questions });
};
