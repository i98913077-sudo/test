<?php
// ★ 설치할 때 이 파일에서 관리자 비밀번호를 꼭 바꾸세요. ('CHANGE_ME' 상태에서는 관리자 로그인이 막혀 있습니다)
// 환경변수 SIMGAME_ADMIN_PASSWORD / SIMGAME_DATA_DIR 가 있으면 그 값이 우선합니다.
return [
    'admin_password' => 'CHANGE_ME',

    // DB가 저장되는 폴더. 가능하면 웹에서 접근할 수 없는 곳(public_html 바깥)을 권장합니다.
    'data_dir' => __DIR__ . '/data',

    // 샘플 가격의 출렁임 배율 (1.0 = 기본, 0.5 = 절반, 2.0 = 두 배)
    'demo_volatility' => 1.0,
];
