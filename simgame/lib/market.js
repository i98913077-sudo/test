// 샘플(DEMO) 시장 데이터 엔진.
// 실제 시세가 아니라 서버 비밀 시드로 만든 "가상 가격"이다. 같은 시드면 항상 같은 가격이 나온다.
// 시드는 DB에 저장되므로 소스코드(공개 저장소)를 읽어도 미래 가격을 계산할 수 없다.

export const TICKERS = [
  { ticker: "005930", name: "삼성전자", group: "kr", unit: "주", base: 70000, volFactor: 0.9, baseVolume: 120000, leverage: 1, sector: "반도체·전자", info: "반도체, 스마트폰, 가전 등을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "000660", name: "SK하이닉스", group: "kr", unit: "주", base: 180000, volFactor: 1.2, baseVolume: 30000, leverage: 1, sector: "반도체", info: "메모리 반도체를 주로 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "373220", name: "LG에너지솔루션", group: "kr", unit: "주", base: 400000, volFactor: 1.1, baseVolume: 4000, leverage: 1, sector: "2차전지", info: "배터리를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "207940", name: "삼성바이오로직스", group: "kr", unit: "주", base: 1000000, volFactor: 0.9, baseVolume: 1500, leverage: 1, sector: "바이오", info: "바이오의약품 위탁생산(CDMO)을 하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "005380", name: "현대차", group: "kr", unit: "주", base: 240000, volFactor: 0.85, baseVolume: 12000, leverage: 1, sector: "자동차", info: "자동차를 설계·생산·판매하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "000270", name: "기아", group: "kr", unit: "주", base: 100000, volFactor: 0.9, baseVolume: 40000, leverage: 1, sector: "자동차", info: "자동차를 만들어 파는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "068270", name: "셀트리온", group: "kr", unit: "주", base: 180000, volFactor: 1.15, baseVolume: 15000, leverage: 1, sector: "바이오", info: "바이오 의약품을 개발·생산하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "105560", name: "KB금융", group: "kr", unit: "주", base: 100000, volFactor: 0.8, baseVolume: 25000, leverage: 1, sector: "금융", info: "은행·보험·증권 등 금융 서비스를 제공하는 금융지주회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "035420", name: "NAVER", group: "kr", unit: "주", base: 200000, volFactor: 1.0, baseVolume: 18000, leverage: 1, sector: "인터넷·플랫폼", info: "검색, 커머스, 콘텐츠 등 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "012450", name: "한화에어로스페이스", group: "kr", unit: "주", base: 800000, volFactor: 1.2, baseVolume: 3000, leverage: 1, sector: "방산·항공", info: "항공우주와 방위산업 관련 제품을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "034020", name: "두산에너빌리티", group: "kr", unit: "주", base: 60000, volFactor: 1.25, baseVolume: 50000, leverage: 1, sector: "에너지설비", info: "발전 설비와 에너지 관련 설비를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "005935", name: "삼성전자우", group: "kr", unit: "주", base: 58000, volFactor: 0.9, baseVolume: 35000, leverage: 1, sector: "반도체·전자", info: "삼성전자의 우선주입니다. 의결권 등 보통주와 권리가 다릅니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "055550", name: "신한지주", group: "kr", unit: "주", base: 55000, volFactor: 0.8, baseVolume: 30000, leverage: 1, sector: "금융", info: "은행 등 금융 서비스를 제공하는 금융지주회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "035720", name: "카카오", group: "kr", unit: "주", base: 50000, volFactor: 1.25, baseVolume: 60000, leverage: 1, sector: "인터넷·플랫폼", info: "메신저를 바탕으로 여러 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "NVDA", name: "엔비디아", group: "us", unit: "주", base: 252000, volFactor: 1.3, baseVolume: 90000, leverage: 1, sector: "반도체", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. AI 연산용 반도체(GPU) 등을 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "MSFT", name: "마이크로소프트", group: "us", unit: "주", base: 700000, volFactor: 0.8, baseVolume: 40000, leverage: 1, sector: "소프트웨어·클라우드", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 소프트웨어와 클라우드 서비스를 제공하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "AAPL", name: "애플", group: "us", unit: "주", base: 322000, volFactor: 0.85, baseVolume: 60000, leverage: 1, sector: "스마트폰·전자", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 스마트폰과 컴퓨터 등 전자제품과 서비스를 제공하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "GOOGL", name: "알파벳(구글)", group: "us", unit: "주", base: 280000, volFactor: 0.95, baseVolume: 50000, leverage: 1, sector: "인터넷·광고", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 검색, 광고, 클라우드 등 온라인 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "AMZN", name: "아마존", group: "us", unit: "주", base: 308000, volFactor: 1.0, baseVolume: 55000, leverage: 1, sector: "전자상거래·클라우드", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 온라인 쇼핑과 클라우드 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "META", name: "메타", group: "us", unit: "주", base: 980000, volFactor: 1.1, baseVolume: 25000, leverage: 1, sector: "소셜미디어", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 소셜미디어와 메신저 서비스를 운영하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "AVGO", name: "브로드컴", group: "us", unit: "주", base: 420000, volFactor: 1.2, baseVolume: 30000, leverage: 1, sector: "반도체", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 통신·데이터센터용 반도체와 소프트웨어를 제공하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "TSLA", name: "테슬라", group: "us", unit: "주", base: 462000, volFactor: 1.6, baseVolume: 80000, leverage: 1, sector: "전기차", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 전기차와 에너지 저장장치를 만드는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "BRKB", name: "버크셔 해서웨이", group: "us", unit: "주", base: 672000, volFactor: 0.6, baseVolume: 15000, leverage: 1, sector: "지주·보험", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 보험 등 여러 사업에 투자하고 운영하는 지주회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "LLY", name: "일라이 릴리", group: "us", unit: "주", base: 1120000, volFactor: 0.9, baseVolume: 8000, leverage: 1, sector: "제약", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 의약품을 개발·판매하는 기업입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "JPM", name: "JP모건", group: "us", unit: "주", base: 406000, volFactor: 0.8, baseVolume: 20000, leverage: 1, sector: "금융", info: "미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱해 환산한 값입니다. 은행과 투자은행 서비스를 제공하는 금융회사입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "SPACEX", name: "스페이스엑스(SpaceX)", group: "us", unit: "주", base: 280000, volFactor: 1.5, baseVolume: 40000, leverage: 1, sector: "우주·위성통신", info: "로켓 발사체와 위성 인터넷(스타링크)을 운영하는 미국 우주 기업입니다. 거래소 상장 여부는 시점에 따라 다를 수 있으며, 이 게임에서는 교육용으로 만든 가상 가격으로만 표시됩니다. 게임 가격은 달러 가격에 샘플 환율(1달러=1,400P)을 곱한 값입니다. (교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)" },
  { ticker: "K200F", name: "코스피200 선물", group: "idx", unit: "계약", base: 35000, volFactor: 0.7, baseVolume: 20000, tick: 10, leverage: 10, sector: "지수선물", info: "코스피200 지수(샘플 350포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "KQ150F", name: "코스닥150 선물", group: "idx", unit: "계약", base: 90000, volFactor: 0.85, baseVolume: 12000, tick: 10, leverage: 10, sector: "지수선물", info: "코스닥150 지수(샘플 900포인트)를 따라가는 모의 선물입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "ESF", name: "S&P500 선물", group: "idx", unit: "계약", base: 670000, volFactor: 0.6, baseVolume: 15000, tick: 100, leverage: 10, sector: "지수선물", info: "S&P500 지수(샘플 6,700포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "NQF", name: "나스닥100 선물", group: "idx", unit: "계약", base: 2400000, volFactor: 0.8, baseVolume: 10000, tick: 500, leverage: 10, sector: "지수선물", info: "나스닥100 지수(샘플 24,000포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "YMF", name: "다우존스 선물", group: "idx", unit: "계약", base: 4500000, volFactor: 0.55, baseVolume: 6000, tick: 500, leverage: 10, sector: "지수선물", info: "다우존스 지수(샘플 45,000포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "USDKRW", name: "달러 선물(원/달러)", group: "fx", unit: "계약", base: 140000, volFactor: 0.25, baseVolume: 80000, tick: 10, leverage: 10, sector: "환율선물", info: "원/달러 환율(샘플 1,400원)을 따라가는 모의 선물입니다. 1계약 가격 = 환율 × 100P(100달러 기준). 게임용이며 실제 환전·외환거래가 아닙니다. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "DXY", name: "달러인덱스 선물", group: "fx", unit: "계약", base: 100000, volFactor: 0.2, baseVolume: 30000, tick: 10, leverage: 10, sector: "환율선물", info: "주요 통화 대비 달러의 가치를 나타내는 지수(샘플 100)를 따라가는 모의 선물입니다. 1계약 가격 = 지수 × 1,000P. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "WTI", name: "WTI 원유 선물", group: "oil", unit: "계약", base: 91000, volFactor: 1.3, baseVolume: 50000, tick: 10, leverage: 10, sector: "원유선물", info: "서부텍사스산 원유(WTI, 샘플 65달러)를 따라가는 모의 선물입니다. 1계약 가격 = 달러 가격 × 샘플 환율(1,400P). 실제 원유 거래가 아닙니다. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
  { ticker: "BRENT", name: "브렌트유 선물", group: "oil", unit: "계약", base: 96600, volFactor: 1.25, baseVolume: 45000, tick: 10, leverage: 10, sector: "원유선물", info: "북해 브렌트유(샘플 69달러)를 따라가는 모의 선물입니다. 1계약 가격 = 달러 가격 × 샘플 환율(1,400P). 실제 원유 거래가 아닙니다. 게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 가격이 매수가 대비 약 10% 내려가면 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버·공매도(매도 포지션)는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)" },
];

export const GROUPS = [{"id": "kr", "label": "국내주식"}, {"id": "us", "label": "미국주식"}, {"id": "idx", "label": "지수선물"}, {"id": "fx", "label": "달러선물"}, {"id": "oil", "label": "원유선물"}];

export const TICKER_MAP = new Map(TICKERS.map((t) => [t.ticker, t]));

const MIN = 60000;
const DAY_MIN = 1440;
const KST_OFFSET_MIN = 540;
const ANCHOR = Math.floor(Date.UTC(2026, 5, 1) / MIN); // 샘플 시장 시작 시점
const BASE_VOL = 0.001; // 1분당 변동폭(교육 효과를 위해 실제보다 크게)
const REVERSION = 0.00002; // 기준가로 되돌아가려는 힘 (가격이 무한정 벗어나지 않게)

const RANGES = {
  '1d': { bucketMin: 5, count: 288 },
  '1w': { bucketMin: 60, count: 168 },
  '1m': { bucketMin: DAY_MIN, count: 30 },
  '3m': { bucketMin: DAY_MIN, count: 90 },
};

function rnd(seed, i) {
  let t = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function normal(seed, i) {
  // 균등분포 4개의 합으로 정규분포 근사
  return (rnd(seed, i * 4) + rnd(seed, i * 4 + 1) + rnd(seed, i * 4 + 2) + rnd(seed, i * 4 + 3) - 2) * Math.sqrt(3);
}
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function roundTick(p, fixedTick) {
  const tick = fixedTick ?? (p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000);
  return Math.max(tick, Math.round(p / tick) * tick);
}
const kstDayStartMin = (m) => Math.floor((m + KST_OFFSET_MIN) / DAY_MIN) * DAY_MIN - KST_OFFSET_MIN;

export function createMarket({ seed, volatility = 1 }) {
  const state = new Map(); // ticker -> { logs: number[] }
  const seeds = new Map();
  const tSeed = (ticker) => {
    if (!seeds.has(ticker)) seeds.set(ticker, (seed ^ strHash(ticker)) >>> 0);
    return seeds.get(ticker);
  };

  function logAt(ticker, minute) {
    const meta = TICKER_MAP.get(ticker);
    let s = state.get(ticker);
    const lb = Math.log(meta.base);
    if (!s) { s = { logs: [lb] }; state.set(ticker, s); }
    const idx = Math.max(0, minute - ANCHOR);
    const sd = tSeed(ticker);
    const vol = BASE_VOL * meta.volFactor * volatility;
    for (let j = s.logs.length; j <= idx; j++) {
      const prev = s.logs[j - 1];
      s.logs.push(prev - REVERSION * (prev - lb) + vol * normal(sd, j));
    }
    return s.logs[idx];
  }
  const minutePrice = (ticker, minute) => roundTick(Math.exp(logAt(ticker, minute)), TICKER_MAP.get(ticker).tick);

  function priceAt(ticker, ms) {
    const exact = ms / MIN;
    const m = Math.floor(exact);
    const a = Math.exp(logAt(ticker, m));
    const b = Math.exp(logAt(ticker, m + 1));
    let p = a + (b - a) * (exact - m);
    const meta = TICKER_MAP.get(ticker);
    const jitter = (rnd(tSeed(ticker) ^ 0x5bd1e995, Math.floor(ms / 10000)) - 0.5) * BASE_VOL * meta.volFactor * volatility;
    return roundTick(p * (1 + jitter), meta.tick);
  }

  const minuteVolume = (ticker, minute) => {
    const meta = TICKER_MAP.get(ticker);
    const dayShape = 0.6 + 0.8 * rnd(tSeed(ticker) ^ 0x1234567, minute);
    return Math.max(1, Math.round((meta.baseVolume / DAY_MIN) * dayShape * 2));
  };

  function prevClose(ticker, ms) {
    return minutePrice(ticker, kstDayStartMin(Math.floor(ms / MIN)));
  }
  // 오늘(한국시간 0시~현재) 누적 거래량. 종목이 많아져도 가볍도록 계산식으로 구한다.
  function todayVolume(ticker, ms) {
    const m = Math.floor(ms / MIN);
    const start = kstDayStartMin(m);
    const meta = TICKER_MAP.get(ticker);
    const dayShape = 0.85 + 0.3 * rnd(tSeed(ticker) ^ 0x7a7a7a7a, Math.floor(start / DAY_MIN));
    return Math.max(1, Math.round(meta.baseVolume * ((m - start + 1) / DAY_MIN) * dayShape));
  }

  function candles(ticker, range, ms) {
    const spec = RANGES[range];
    if (!spec) return null;
    const nowMin = Math.floor(ms / MIN);
    const align = (m) => (spec.bucketMin === DAY_MIN ? kstDayStartMin(m) : Math.floor(m / spec.bucketMin) * spec.bucketMin);
    const endStart = align(nowMin);
    const out = [];
    for (let b = endStart - (spec.count - 1) * spec.bucketMin; b <= endStart; b += spec.bucketMin) {
      const last = Math.min(b + spec.bucketMin - 1, nowMin);
      let o = 0, h = 0, l = Infinity, c = 0, v = 0;
      for (let m = b; m <= last; m++) {
        const p = minutePrice(ticker, m);
        if (m === b) o = p;
        if (p > h) h = p;
        if (p < l) l = p;
        c = p;
        v += minuteVolume(ticker, m);
      }
      if (last === nowMin) { // 진행 중인 마지막 캔들은 현재가로 마감
        c = priceAt(ticker, ms);
        h = Math.max(h, c);
        l = Math.min(l, c);
      }
      out.push({ t: b * MIN, o, h, l, c, v });
    }
    return out;
  }

  return { priceAt, prevClose, todayVolume, candles, ranges: Object.keys(RANGES) };
}
