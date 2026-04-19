<?php
require_once __DIR__ . '/../private/config.php';

session_name(SESSION_NAME);
session_set_cookie_params(SESSION_EXPIRE, '/', '', false, true);
session_start();

function require_auth() {
    if (empty($_SESSION['authenticated'])) {
        header('Content-Type: application/json; charset=utf-8');
        header('HTTP/1.1 401 Unauthorized');
        echo json_encode(array('ok' => false, 'error' => 'unauthorized'));
        exit;
    }
}
