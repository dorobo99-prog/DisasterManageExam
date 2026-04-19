<?php
require_once __DIR__ . '/_session.php';
header('Content-Type: application/json; charset=utf-8');

session_destroy();
setcookie(SESSION_NAME, '', time() - 3600, '/');

echo json_encode(array('ok' => true));
