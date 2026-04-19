const { getUser } = require('./_auth');
const fs   = require('fs');
const path = require('path');

const ALLOWED = ['gemini_ch1','gemini_ch2','gemini_ch3','gpt_ch1','gpt_ch2','gpt_ch3'];

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!getUser(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  var set_id = (req.query.set || '').trim();
  if (ALLOWED.indexOf(set_id) < 0) {
    res.status(400).json({ ok: false, error: '유효하지 않은 세트입니다.' });
    return;
  }

  var filePath = path.join(__dirname, 'data', 'questions', set_id + '.json');
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, error: '문제 파일을 찾을 수 없습니다.' });
    return;
  }

  var questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json({ ok: true, questions: questions });
};
