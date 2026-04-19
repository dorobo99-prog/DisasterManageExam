<?php
require_once __DIR__ . '/../private/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

session_name(SESSION_NAME);
session_set_cookie_params(SESSION_EXPIRE, '/', '', false, true);
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 405 Method Not Allowed');
    echo json_encode(array('ok' => false, 'error' => 'Method not allowed'));
    exit;
}

$name = isset($_POST['name'])     ? trim($_POST['name'])     : '';
$pw   = isset($_POST['password']) ? trim($_POST['password']) : '';

if ($name === '') {
    echo json_encode(array('ok' => false, 'error' => '이름을 입력하세요.'));
    exit;
}

if (hash('sha256', $pw) !== EXAM_PASSWORD_HASH) {
    header('HTTP/1.1 401 Unauthorized');
    echo json_encode(array('ok' => false, 'error' => '비밀번호가 올바르지 않습니다.'));
    exit;
}

session_regenerate_id(true);
$_SESSION['authenticated'] = true;
$_SESSION['name']          = $name;
$_SESSION['login_at']      = time();

echo json_encode(array('ok' => true, 'name' => $name));
