const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROVIDERS = ['gemini', 'gpt'];
const CHAPTERS = {
  ch1: '1장 재난의 이해',
  ch2: '2장 재난의 분류',
  ch3: '3장 재난관리단계'
};
const PUBLIC_SETS = ['ch1', 'ch2', 'ch3', 'all'];

function isAllowedPublicSet(setId) {
  return PUBLIC_SETS.indexOf(setId) >= 0;
}

function parseQuestionId(questionId) {
  var match = String(questionId || '').match(/^(gemini|gpt)_(ch[1-3])_/);
  if (!match) return null;
  return {
    provider: match[1],
    chapter: match[2],
    source_set: match[1] + '_' + match[2]
  };
}

function sourceSetsForPublicSet(setId) {
  if (setId === 'all') {
    return Object.keys(CHAPTERS).flatMap(function(chapter) {
      return PROVIDERS.map(function(provider) { return provider + '_' + chapter; });
    });
  }
  if (!CHAPTERS[setId]) return [];
  return PROVIDERS.map(function(provider) { return provider + '_' + setId; });
}

function readSource(sourceSet) {
  var filePath = path.join(__dirname, 'data', 'sources', sourceSet + '.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function optionText(raw, index) {
  return String(raw || '').replace(new RegExp('^\\s*' + (index + 1) + '[.)]\\s*'), '');
}

function normalizeQuestion(raw, sourceSet) {
  var meta = parseQuestionId(sourceSet + '_' + String(raw['문항번호']).padStart(3, '0'));
  var id = sourceSet + '_' + String(raw['문항번호']).padStart(3, '0');
  return {
    id: id,
    question_no: raw['문항번호'],
    question_text: raw['본문'] || '',
    difficulty: raw['예상난이도'] || '',
    options: (raw['선택지'] || []).map(function(text, idx) {
      return { no: idx + 1, text: optionText(text, idx) };
    }),
    provider: meta.provider,
    chapter: meta.chapter,
    source_set: meta.source_set
  };
}

function getQuestionPool(chapter) {
  var sourceSets = sourceSetsForPublicSet(chapter);
  var pool = [];
  sourceSets.forEach(function(sourceSet) {
    var questions = readSource(sourceSet);
    questions.forEach(function(question) {
      pool.push(normalizeQuestion(question, sourceSet));
    });
  });
  return pool;
}

function shuffle(items) {
  var arr = items.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = crypto.randomInt(i + 1);
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function pickRandom(items, count) {
  return shuffle(items).slice(0, count);
}

function selectQuestions(setId) {
  if (setId === 'all') {
    return Object.keys(CHAPTERS).flatMap(function(chapter) {
      return pickRandom(getQuestionPool(chapter), 20);
    });
  }
  return pickRandom(getQuestionPool(setId), 20);
}

function getQuestionsByIds(questionIds) {
  var wanted = new Set(questionIds || []);
  var byId = {};
  Object.keys(CHAPTERS).forEach(function(chapter) {
    getQuestionPool(chapter).forEach(function(question) {
      if (wanted.has(question.id)) byId[question.id] = question;
    });
  });
  return (questionIds || []).map(function(id) { return byId[id]; }).filter(Boolean);
}

function getAnswer(questionId) {
  var meta = parseQuestionId(questionId);
  if (!meta) return null;
  var number = parseInt(String(questionId).slice(-3), 10);
  var source = readSource(meta.source_set);
  var raw = source.find(function(item) { return parseInt(item['문항번호'], 10) === number; });
  if (!raw) return null;
  return {
    provider: meta.provider,
    chapter: meta.chapter,
    source_set: meta.source_set,
    answer: {
      answer: raw['정답'],
      explanation: raw['문제해설'] || '',
      option_rationale: raw['선택지_근거'] || {}
    }
  };
}

function publicSetMeta(setId) {
  if (setId === 'all') {
    return { provider: 'mixed', chapter: 'all', title: '전체 과목 모의고사' };
  }
  return { provider: 'mixed', chapter: setId, title: CHAPTERS[setId] || setId };
}

module.exports = {
  CHAPTERS,
  PUBLIC_SETS,
  isAllowedPublicSet,
  parseQuestionId,
  selectQuestions,
  getQuestionsByIds,
  getAnswer,
  publicSetMeta
};
