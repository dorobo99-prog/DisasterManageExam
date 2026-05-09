const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || 'exam-secret-please-set-env-var';
const PW_HASH = process.env.PASSWORD_HASH || '2e71608399786b6178faa3681a877f300ef0ac1f4c07a70775abaa6497899434';
const COOKIE  = 'exam_auth';
const TTL_MS  = 8 * 3600 * 1000;

function encodePayload(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodePayload(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function makeToken(name, userId) {
  const exp     = Date.now() + TTL_MS;
  const payload = encodePayload({ name: name, user_id: userId || null }) + '.' + exp;
  return payload + '.' + sign(payload);
}

function verifyToken(token) {
  if (!token) return null;
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const sig     = token.slice(lastDot + 1);
  if (sig !== sign(payload)) return null;
  const dotIdx = payload.indexOf('.');
  if (dotIdx < 0) return null;
  const exp = parseInt(payload.slice(dotIdx + 1), 10);
  if (isNaN(exp) || Date.now() > exp) return null;
  try {
    var session = decodePayload(payload.slice(0, dotIdx));
    return {
      name: session.name || '',
      user_id: session.user_id || null
    };
  } catch (e) {
    return {
      name: decodeURIComponent(payload.slice(0, dotIdx)),
      user_id: null
    };
  }
}

function getSession(req) {
  const cookies = req.headers.cookie || '';
  const match   = cookies.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
  return match ? verifyToken(decodeURIComponent(match[1])) : null;
}

function getUser(req) {
  var session = getSession(req);
  return session ? session.name : null;
}

function setAuth(res, name, userId) {
  const token = makeToken(name, userId);
  res.setHeader('Set-Cookie',
    COOKIE + '=' + encodeURIComponent(token) +
    '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + (8 * 3600));
}

function clearAuth(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Max-Age=0');
}

function checkPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex') === PW_HASH;
}

function readBody(req) {
  return new Promise(function(resolve) {
    var data = '';
    req.on('data', function(chunk) { data += chunk; });
    req.on('end', function() { resolve(data); });
  });
}

module.exports = { getUser, getSession, setAuth, clearAuth, checkPassword, readBody };
