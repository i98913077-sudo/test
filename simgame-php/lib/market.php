<?php
// 샘플(DEMO) 시장 데이터 엔진 (PHP판).
// 실제 시세가 아니라 서버 비밀 시드로 만든 "가상 가격"이다.
// 공유 호스팅은 요청마다 PHP가 새로 시작되므로, 과거 가격을 누적 계산하지 않고
// "시간만 넣으면 바로 계산되는" 함수(여러 주기의 사인파 합 + 해시 노이즈)로 가격을 만든다.
if (!defined('SIMGAME')) { http_response_code(403); exit; }

class Market {
    public const TICKERS = [
        '005930' => ['name' => '삼성전자', 'group' => 'kr', 'unit' => '주', 'base' => 70000, 'volFactor' => 0.9, 'baseVolume' => 120000, 'leverage' => 1, 'sector' => '반도체·전자', 'info' => '반도체, 스마트폰, 가전 등을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '000660' => ['name' => 'SK하이닉스', 'group' => 'kr', 'unit' => '주', 'base' => 180000, 'volFactor' => 1.2, 'baseVolume' => 30000, 'leverage' => 1, 'sector' => '반도체', 'info' => '메모리 반도체를 주로 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '373220' => ['name' => 'LG에너지솔루션', 'group' => 'kr', 'unit' => '주', 'base' => 400000, 'volFactor' => 1.1, 'baseVolume' => 4000, 'leverage' => 1, 'sector' => '2차전지', 'info' => '배터리를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '207940' => ['name' => '삼성바이오로직스', 'group' => 'kr', 'unit' => '주', 'base' => 1000000, 'volFactor' => 0.9, 'baseVolume' => 1500, 'leverage' => 1, 'sector' => '바이오', 'info' => '바이오의약품 위탁생산(CDMO)을 하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '005380' => ['name' => '현대차', 'group' => 'kr', 'unit' => '주', 'base' => 240000, 'volFactor' => 0.85, 'baseVolume' => 12000, 'leverage' => 1, 'sector' => '자동차', 'info' => '자동차를 설계·생산·판매하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '000270' => ['name' => '기아', 'group' => 'kr', 'unit' => '주', 'base' => 100000, 'volFactor' => 0.9, 'baseVolume' => 40000, 'leverage' => 1, 'sector' => '자동차', 'info' => '자동차를 만들어 파는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '068270' => ['name' => '셀트리온', 'group' => 'kr', 'unit' => '주', 'base' => 180000, 'volFactor' => 1.15, 'baseVolume' => 15000, 'leverage' => 1, 'sector' => '바이오', 'info' => '바이오 의약품을 개발·생산하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '105560' => ['name' => 'KB금융', 'group' => 'kr', 'unit' => '주', 'base' => 100000, 'volFactor' => 0.8, 'baseVolume' => 25000, 'leverage' => 1, 'sector' => '금융', 'info' => '은행·보험·증권 등 금융 서비스를 제공하는 금융지주회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '035420' => ['name' => 'NAVER', 'group' => 'kr', 'unit' => '주', 'base' => 200000, 'volFactor' => 1.0, 'baseVolume' => 18000, 'leverage' => 1, 'sector' => '인터넷·플랫폼', 'info' => '검색, 커머스, 콘텐츠 등 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '012450' => ['name' => '한화에어로스페이스', 'group' => 'kr', 'unit' => '주', 'base' => 800000, 'volFactor' => 1.2, 'baseVolume' => 3000, 'leverage' => 1, 'sector' => '방산·항공', 'info' => '항공우주와 방위산업 관련 제품을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '034020' => ['name' => '두산에너빌리티', 'group' => 'kr', 'unit' => '주', 'base' => 60000, 'volFactor' => 1.25, 'baseVolume' => 50000, 'leverage' => 1, 'sector' => '에너지설비', 'info' => '발전 설비와 에너지 관련 설비를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '005935' => ['name' => '삼성전자우', 'group' => 'kr', 'unit' => '주', 'base' => 58000, 'volFactor' => 0.9, 'baseVolume' => 35000, 'leverage' => 1, 'sector' => '반도체·전자', 'info' => '삼성전자의 우선주입니다. 의결권 등 보통주와 권리가 다릅니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '055550' => ['name' => '신한지주', 'group' => 'kr', 'unit' => '주', 'base' => 55000, 'volFactor' => 0.8, 'baseVolume' => 30000, 'leverage' => 1, 'sector' => '금융', 'info' => '은행 등 금융 서비스를 제공하는 금융지주회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        '035720' => ['name' => '카카오', 'group' => 'kr', 'unit' => '주', 'base' => 50000, 'volFactor' => 1.25, 'baseVolume' => 60000, 'leverage' => 1, 'sector' => '인터넷·플랫폼', 'info' => '메신저를 바탕으로 여러 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'NVDA' => ['name' => '엔비디아', 'group' => 'us', 'unit' => '주', 'base' => 252000, 'volFactor' => 1.3, 'baseVolume' => 90000, 'leverage' => 1, 'sector' => '반도체', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. AI 연산용 반도체(GPU) 등을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'MSFT' => ['name' => '마이크로소프트', 'group' => 'us', 'unit' => '주', 'base' => 700000, 'volFactor' => 0.8, 'baseVolume' => 40000, 'leverage' => 1, 'sector' => '소프트웨어·클라우드', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 소프트웨어와 클라우드 서비스를 제공하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'AAPL' => ['name' => '애플', 'group' => 'us', 'unit' => '주', 'base' => 322000, 'volFactor' => 0.85, 'baseVolume' => 60000, 'leverage' => 1, 'sector' => '스마트폰·전자', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 스마트폰과 컴퓨터 등 전자제품과 서비스를 제공하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'GOOGL' => ['name' => '알파벳(구글)', 'group' => 'us', 'unit' => '주', 'base' => 280000, 'volFactor' => 0.95, 'baseVolume' => 50000, 'leverage' => 1, 'sector' => '인터넷·광고', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 검색, 광고, 클라우드 등 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'AMZN' => ['name' => '아마존', 'group' => 'us', 'unit' => '주', 'base' => 308000, 'volFactor' => 1.0, 'baseVolume' => 55000, 'leverage' => 1, 'sector' => '전자상거래·클라우드', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 온라인 쇼핑과 클라우드 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'META' => ['name' => '메타', 'group' => 'us', 'unit' => '주', 'base' => 980000, 'volFactor' => 1.1, 'baseVolume' => 25000, 'leverage' => 1, 'sector' => '소셜미디어', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 소셜미디어와 메신저 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'AVGO' => ['name' => '브로드컴', 'group' => 'us', 'unit' => '주', 'base' => 420000, 'volFactor' => 1.2, 'baseVolume' => 30000, 'leverage' => 1, 'sector' => '반도체', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 통신·데이터센터용 반도체와 소프트웨어를 제공하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'TSLA' => ['name' => '테슬라', 'group' => 'us', 'unit' => '주', 'base' => 462000, 'volFactor' => 1.6, 'baseVolume' => 80000, 'leverage' => 1, 'sector' => '전기차', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 전기차와 에너지 저장장치를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'BRKB' => ['name' => '버크셔 해서웨이', 'group' => 'us', 'unit' => '주', 'base' => 672000, 'volFactor' => 0.6, 'baseVolume' => 15000, 'leverage' => 1, 'sector' => '지주·보험', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 보험 등 여러 사업에 투자하고 운영하는 지주회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'LLY' => ['name' => '일라이 릴리', 'group' => 'us', 'unit' => '주', 'base' => 1120000, 'volFactor' => 0.9, 'baseVolume' => 8000, 'leverage' => 1, 'sector' => '제약', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 의약품을 개발·판매하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'JPM' => ['name' => 'JP모건', 'group' => 'us', 'unit' => '주', 'base' => 406000, 'volFactor' => 0.8, 'baseVolume' => 20000, 'leverage' => 1, 'sector' => '금융', 'info' => '미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 은행과 투자은행 서비스를 제공하는 금융회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'SPACEX' => ['name' => '스페이스엑스(SpaceX)', 'group' => 'us', 'unit' => '주', 'base' => 280000, 'volFactor' => 1.5, 'baseVolume' => 40000, 'leverage' => 1, 'sector' => '우주·위성통신', 'info' => '로켓 발사체와 위성 인터넷(스타링크)을 운영하는 미국 우주 기업입니다. 거래소 상장 여부는 시점에 따라 다를 수 있으며, 이 게임에서는 교육용으로 만든 가상 가격으로만 표시됩니다. 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱한 값입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'],
        'K200F' => ['name' => '코스피200 선물', 'group' => 'idx', 'unit' => '계약', 'base' => 35000, 'volFactor' => 0.7, 'baseVolume' => 20000, 'tick' => 10, 'leverage' => 10, 'sector' => '지수선물', 'info' => '코스피200 지수(샘플 350포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'KQ150F' => ['name' => '코스닥150 선물', 'group' => 'idx', 'unit' => '계약', 'base' => 90000, 'volFactor' => 0.85, 'baseVolume' => 12000, 'tick' => 10, 'leverage' => 10, 'sector' => '지수선물', 'info' => '코스닥150 지수(샘플 900포인트)를 따라가는 모의 선물입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'ESF' => ['name' => 'S&P500 선물', 'group' => 'idx', 'unit' => '계약', 'base' => 670000, 'volFactor' => 0.6, 'baseVolume' => 15000, 'tick' => 100, 'leverage' => 10, 'sector' => '지수선물', 'info' => 'S&P500 지수(샘플 6,700포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'NQF' => ['name' => '나스닥100 선물', 'group' => 'idx', 'unit' => '계약', 'base' => 2400000, 'volFactor' => 0.8, 'baseVolume' => 10000, 'tick' => 500, 'leverage' => 10, 'sector' => '지수선물', 'info' => '나스닥100 지수(샘플 24,000포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'YMF' => ['name' => '다우존스 선물', 'group' => 'idx', 'unit' => '계약', 'base' => 4500000, 'volFactor' => 0.55, 'baseVolume' => 6000, 'tick' => 500, 'leverage' => 10, 'sector' => '지수선물', 'info' => '다우존스 지수(샘플 45,000포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'USDKRW' => ['name' => '달러 선물(원/달러)', 'group' => 'fx', 'unit' => '계약', 'base' => 140000, 'volFactor' => 0.25, 'baseVolume' => 80000, 'tick' => 10, 'leverage' => 10, 'sector' => '환율선물', 'info' => '원/달러 환율(샘플 1,400원)을 따라가는 모의 선물입니다. 1계약 가격 = 환율 × 100P(100달러 기준). 게임용이며 실제 환전·외환거래가 아닙니다. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'DXY' => ['name' => '달러인덱스 선물', 'group' => 'fx', 'unit' => '계약', 'base' => 100000, 'volFactor' => 0.2, 'baseVolume' => 30000, 'tick' => 10, 'leverage' => 10, 'sector' => '환율선물', 'info' => '주요 통화 대비 달러의 가치를 나타내는 지수(샘플 100)를 따라가는 모의 선물입니다. 1계약 가격 = 지수 × 1,000P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'WTI' => ['name' => 'WTI 원유 선물', 'group' => 'oil', 'unit' => '계약', 'base' => 91000, 'volFactor' => 1.3, 'baseVolume' => 50000, 'tick' => 10, 'leverage' => 10, 'sector' => '원유선물', 'info' => '서부텍사스산 원유(WTI, 샘플 65달러)를 따라가는 모의 선물입니다. 1계약 가격 = 달러 가격 × 샘플 환율(1,400P). 실제 원유 거래가 아닙니다. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
        'BRENT' => ['name' => '브렌트유 선물', 'group' => 'oil', 'unit' => '계약', 'base' => 96600, 'volFactor' => 1.25, 'baseVolume' => 45000, 'tick' => 10, 'leverage' => 10, 'sector' => '원유선물', 'info' => '북해 브렌트유(샘플 69달러)를 따라가는 모의 선물입니다. 1계약 가격 = 달러 가격 × 샘플 환율(1,400P). 실제 원유 거래가 아닙니다. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'],
    ];
    public const GROUPS = [['id' => 'kr', 'label' => '국내주식'], ['id' => 'us', 'label' => '미국주식'], ['id' => 'idx', 'label' => '지수선물'], ['id' => 'fx', 'label' => '달러선물'], ['id' => 'oil', 'label' => '원유선물']];
    public const RANGES = [
        // 분봉 (최근 구간)
        'm1' => [1, 120], 'm3' => [3, 120], 'm5' => [5, 144], 'm10' => [10, 144], 'm30' => [30, 144],
        // 기간
        '1d' => [5, 288], '1w' => [60, 168], '1m' => [1440, 30], '3m' => [1440, 90],
    ];
    // 주의: PHP는 '373220' 같은 숫자 문자열 키를 정수로 바꾼다. 종목 코드는 항상 이 함수로 문자열로 꺼낼 것.
    public static function tickerList(): array { return array_map('strval', array_keys(self::TICKERS)); }

    private const MIN_MS = 60000;
    private const DAY_MIN = 1440;
    private const KST_OFFSET_MIN = 540;
    private const COMPONENTS = 14;

    private int $seed;
    private float $volatility;
    private array $comps = [];

    public function __construct(int $seed, float $volatility = 1.0) {
        $this->seed = $seed & 0xFFFFFFFF;
        $this->volatility = $volatility;
    }

    // ---- 32비트 해시 난수 ----
    private static function imul(int $a, int $b): int {
        $a &= 0xFFFFFFFF; $b &= 0xFFFFFFFF;
        return (($a & 0xFFFF) * $b + ((((($a >> 16) & 0xFFFF) * $b) & 0xFFFF) << 16)) & 0xFFFFFFFF;
    }
    private static function rnd(int $seed, int $i): float {
        $t = ($seed ^ self::imul($i & 0xFFFFFFFF, 0x9E3779B1)) & 0xFFFFFFFF;
        $t = self::imul($t ^ ($t >> 15), $t | 1);
        $t ^= ($t + self::imul($t ^ ($t >> 7), $t | 61)) & 0xFFFFFFFF;
        $t &= 0xFFFFFFFF;
        return (($t ^ ($t >> 14)) & 0xFFFFFFFF) / 4294967296.0;
    }
    private static function strHash(string $s): int {
        $h = 2166136261;
        for ($i = 0, $n = strlen($s); $i < $n; $i++) {
            $h = self::imul($h ^ ord($s[$i]), 16777619);
        }
        return $h;
    }
    private function tSeed(string $ticker): int {
        return ($this->seed ^ self::strHash($ticker)) & 0xFFFFFFFF;
    }

    public static function roundTick(float $p, ?int $fixedTick = null): int {
        $tick = $fixedTick ?? ($p < 2000 ? 1 : ($p < 5000 ? 5 : ($p < 20000 ? 10 : ($p < 50000 ? 50 : ($p < 200000 ? 100 : ($p < 500000 ? 500 : 1000))))));
        return (int)max($tick, round($p / $tick) * $tick);
    }
    private static function kstDayStartMin(int $m): int {
        return intdiv($m + self::KST_OFFSET_MIN, self::DAY_MIN) * self::DAY_MIN - self::KST_OFFSET_MIN;
    }

    // 종목별 사인파 성분: [진폭, 각주파수(1/분), 위상]
    private function components(string $ticker): array {
        if (isset($this->comps[$ticker])) return $this->comps[$ticker];
        $meta = self::TICKERS[$ticker];
        $sd = $this->tSeed($ticker);
        $list = [];
        $minP = 25.0; $maxP = 64800.0;
        for ($k = 0; $k < self::COMPONENTS; $k++) {
            $period = $minP * pow($maxP / $minP, $k / (self::COMPONENTS - 1));
            $period *= 0.85 + 0.3 * self::rnd($sd ^ 0xA5A5A5A5, $k);
            $amp = 0.0011 * pow($period, 0.34) * (0.6 + 0.8 * self::rnd($sd ^ 0x5A5A5A5A, $k + 100));
            $amp *= $meta['volFactor'] * $this->volatility;
            $phase = 2 * M_PI * self::rnd($sd ^ 0x3C3C3C3C, $k + 200);
            $list[] = [$amp, 2 * M_PI / $period, $phase];
        }
        // 분봉에서 실제 차트처럼 잔잔한 들쭉날쭉함이 보이도록 짧은 주기(3~16분)의 작은 움직임을 더한다
        foreach ([3.1, 5.3, 9.7, 15.5] as $j => $period) {
            $amp = 0.0007 * $meta['volFactor'] * $this->volatility * (0.6 + 0.8 * self::rnd($sd ^ 0x6B6B6B6B, $j + 300));
            $list[] = [$amp, 2 * M_PI / $period, 2 * M_PI * self::rnd($sd ^ 0x7C7C7C7C, $j + 400)];
        }
        return $this->comps[$ticker] = $list;
    }

    private function smoothLog(string $ticker, float $minutes): float {
        $x = 0.0;
        foreach ($this->components($ticker) as [$a, $w, $ph]) {
            $x += $a * sin($w * $minutes + $ph);
        }
        return $x;
    }

    private function minutePrice(string $ticker, int $minute): int {
        $meta = self::TICKERS[$ticker];
        $noise = (self::rnd($this->tSeed($ticker) ^ 0x2F2F2F2F, $minute) - 0.5) * 0.0010 * $meta['volFactor'] * $this->volatility;
        return self::roundTick($meta['base'] * exp($this->smoothLog($ticker, (float)$minute) + $noise), $meta['tick'] ?? null);
    }

    public function priceAt(string $ticker, int $ms): int {
        $meta = self::TICKERS[$ticker];
        $smooth = $this->smoothLog($ticker, $ms / self::MIN_MS);
        $jitter = (self::rnd($this->tSeed($ticker) ^ 0x5BD1E995, intdiv($ms, 10000)) - 0.5) * 0.0012 * $meta['volFactor'] * $this->volatility;
        return self::roundTick($meta['base'] * exp($smooth + $jitter), $meta['tick'] ?? null);
    }

    private function minuteVolume(string $ticker, int $minute): int {
        $meta = self::TICKERS[$ticker];
        $shape = 0.6 + 0.8 * self::rnd($this->tSeed($ticker) ^ 0x1234567, $minute);
        return (int)max(1, round(($meta['baseVolume'] / self::DAY_MIN) * $shape * 2));
    }

    public function prevClose(string $ticker, int $ms): int {
        return $this->minutePrice($ticker, self::kstDayStartMin(intdiv($ms, self::MIN_MS)));
    }

    // 오늘(한국시간 0시~현재) 누적 거래량. 종목이 많아져도 가볍도록 계산식으로 구한다.
    public function todayVolume(string $ticker, int $ms): int {
        $m = intdiv($ms, self::MIN_MS);
        $start = self::kstDayStartMin($m);
        $meta = self::TICKERS[$ticker];
        $dayShape = 0.85 + 0.3 * self::rnd($this->tSeed($ticker) ^ 0x7A7A7A7A, intdiv($start, self::DAY_MIN));
        return (int)max(1, round($meta['baseVolume'] * (($m - $start + 1) / self::DAY_MIN) * $dayShape));
    }

    public function candles(string $ticker, string $range, int $ms): ?array {
        if (!isset(self::RANGES[$range])) return null;
        [$bucketMin, $count] = self::RANGES[$range];
        $nowMin = intdiv($ms, self::MIN_MS);
        $align = $bucketMin === self::DAY_MIN ? self::kstDayStartMin($nowMin) : intdiv($nowMin, $bucketMin) * $bucketMin;
        $fine = $bucketMin <= 30; // 분봉은 10초 단위 가격으로 시가·고가·저가·종가를 만들어 윅(꼬리)이 보이게 한다
        $step = $bucketMin >= self::DAY_MIN ? 5 : 1; // 긴 기간은 5분 간격으로 표본 추출(속도)
        $out = [];
        for ($b = $align - ($count - 1) * $bucketMin; $b <= $align; $b += $bucketMin) {
            $last = min($b + $bucketMin - 1, $nowMin);
            $o = 0; $h = 0; $l = PHP_INT_MAX; $c = 0; $v = 0;
            if ($fine) {
                $t1 = min(($b + $bucketMin) * self::MIN_MS - 1, $ms);
                for ($t = $b * self::MIN_MS; $t <= $t1; $t += 10000) {
                    $p = $this->priceAt($ticker, $t);
                    if ($t === $b * self::MIN_MS) $o = $p;
                    if ($p > $h) $h = $p;
                    if ($p < $l) $l = $p;
                    $c = $p;
                }
                for ($m = $b; $m <= $last; $m++) $v += $this->minuteVolume($ticker, $m);
            } else {
                for ($m = $b; $m <= $last; $m += $step) {
                    $p = $this->minutePrice($ticker, $m);
                    if ($m === $b) $o = $p;
                    if ($p > $h) $h = $p;
                    if ($p < $l) $l = $p;
                    $c = $p;
                    $v += $this->minuteVolume($ticker, $m) * $step;
                }
            }
            if ($last === $nowMin) { // 진행 중인 마지막 캔들은 현재가로 마감
                $c = $this->priceAt($ticker, $ms);
                $h = max($h, $c);
                $l = min($l, $c);
            }
            if ($o === 0) $o = $c;
            $out[] = ['t' => $b * self::MIN_MS, 'o' => $o, 'h' => $h, 'l' => $l, 'c' => $c, 'v' => $v];
        }
        return $out;
    }
}
