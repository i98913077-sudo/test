#!/usr/bin/env python3
"""상품 표(종목 목록)를 한 곳에서 관리해 Node판(simgame/lib/market.js)과 PHP판(simgame-php/lib/market.php)에 똑같이 써 넣는다.
사용법: 저장소 최상위에서 python3 scripts/gen-tickers.py"""
import re, json
FX = 1400  # 샘플 환율: 1달러 = 1,400P
edu = '(교육용 소개이며 투자 권유가 아닙니다. 가격은 샘플 기준가이며 실제 시세가 아닙니다)'
usd = f'미국 상장 기업이며, 게임 가격은 달러 가격에 샘플 환율(1달러={FX:,}P)을 곱해 환산한 값입니다. '
fut = '게임용 모의 선물입니다. 레버리지 10배: 주문금액(명목)의 1/10만 증거금으로 내고, 손익도 10배로 커집니다. 매수와 매도(매도 포지션) 모두 가능하며, 가격이 반대로 약 10% 움직이면(매수는 하락, 매도는 상승) 증거금을 모두 잃고 강제청산됩니다. 만기·롤오버는 없는 단순화된 상품입니다. (투자 권유가 아닙니다. 가격은 샘플이며 실제 시세가 아닙니다)'
kr = lambda t,n,b,vf,bv,sec,d: dict(ticker=t,name=n,group='kr',unit='주',base=b,volFactor=vf,baseVolume=bv,sector=sec,info=f'{d} {edu}')
us = lambda t,n,u,vf,bv,sec,d: dict(ticker=t,name=n,group='us',unit='주',base=u*FX,volFactor=vf,baseVolume=bv,sector=sec,info=f'{usd}{d} {edu}')
T = [
 kr('005930','삼성전자',70000,0.9,120000,'반도체·전자','반도체, 스마트폰, 가전 등을 만드는 기업입니다.'),
 kr('000660','SK하이닉스',180000,1.2,30000,'반도체','메모리 반도체를 주로 만드는 기업입니다.'),
 kr('373220','LG에너지솔루션',400000,1.1,4000,'2차전지','배터리를 만드는 기업입니다.'),
 kr('207940','삼성바이오로직스',1000000,0.9,1500,'바이오','바이오의약품 위탁생산(CDMO)을 하는 기업입니다.'),
 kr('005380','현대차',240000,0.85,12000,'자동차','자동차를 설계·생산·판매하는 기업입니다.'),
 kr('000270','기아',100000,0.9,40000,'자동차','자동차를 만들어 파는 기업입니다.'),
 kr('068270','셀트리온',180000,1.15,15000,'바이오','바이오 의약품을 개발·생산하는 기업입니다.'),
 kr('105560','KB금융',100000,0.8,25000,'금융','은행·보험·증권 등 금융 서비스를 제공하는 금융지주회사입니다.'),
 kr('035420','NAVER',200000,1.0,18000,'인터넷·플랫폼','검색, 커머스, 콘텐츠 등 온라인 서비스를 운영하는 기업입니다.'),
 kr('012450','한화에어로스페이스',800000,1.2,3000,'방산·항공','항공우주와 방위산업 관련 제품을 만드는 기업입니다.'),
 kr('034020','두산에너빌리티',60000,1.25,50000,'에너지설비','발전 설비와 에너지 관련 설비를 만드는 기업입니다.'),
 kr('005935','삼성전자우',58000,0.9,35000,'반도체·전자','삼성전자의 우선주입니다. 의결권 등 보통주와 권리가 다릅니다.'),
 kr('055550','신한지주',55000,0.8,30000,'금융','은행 등 금융 서비스를 제공하는 금융지주회사입니다.'),
 kr('035720','카카오',50000,1.25,60000,'인터넷·플랫폼','메신저를 바탕으로 여러 온라인 서비스를 운영하는 기업입니다.'),
 us('NVDA','엔비디아',180,1.3,90000,'반도체','AI 연산용 반도체(GPU) 등을 만드는 기업입니다.'),
 us('MSFT','마이크로소프트',500,0.8,40000,'소프트웨어·클라우드','소프트웨어와 클라우드 서비스를 제공하는 기업입니다.'),
 us('AAPL','애플',230,0.85,60000,'스마트폰·전자','스마트폰과 컴퓨터 등 전자제품과 서비스를 제공하는 기업입니다.'),
 us('GOOGL','알파벳(구글)',200,0.95,50000,'인터넷·광고','검색, 광고, 클라우드 등 온라인 서비스를 운영하는 기업입니다.'),
 us('AMZN','아마존',220,1.0,55000,'전자상거래·클라우드','온라인 쇼핑과 클라우드 서비스를 운영하는 기업입니다.'),
 us('META','메타',700,1.1,25000,'소셜미디어','소셜미디어와 메신저 서비스를 운영하는 기업입니다.'),
 us('AVGO','브로드컴',300,1.2,30000,'반도체','통신·데이터센터용 반도체와 소프트웨어를 제공하는 기업입니다.'),
 us('TSLA','테슬라',330,1.6,80000,'전기차','전기차와 에너지 저장장치를 만드는 기업입니다.'),
 us('BRKB','버크셔 해서웨이',480,0.6,15000,'지주·보험','보험 등 여러 사업에 투자하고 운영하는 지주회사입니다.'),
 us('LLY','일라이 릴리',800,0.9,8000,'제약','의약품을 개발·판매하는 기업입니다.'),
 us('JPM','JP모건',290,0.8,20000,'금융','은행과 투자은행 서비스를 제공하는 금융회사입니다.'),
 dict(ticker='SPACEX',name='스페이스엑스(SpaceX)',group='us',unit='주',base=200*FX,volFactor=1.5,baseVolume=40000,sector='우주·위성통신',info=f'로켓 발사체와 위성 인터넷(스타링크)을 운영하는 미국 우주 기업입니다. 거래소 상장 여부는 시점에 따라 다를 수 있으며, 이 게임에서는 교육용으로 만든 가상 가격으로만 표시됩니다. 게임 가격은 달러 가격에 샘플 환율(1달러={FX:,}P)을 곱한 값입니다. {edu}'),
 dict(ticker='K200F',name='코스피200 선물',group='idx',unit='계약',base=35000,volFactor=0.7,baseVolume=20000,sector='지수선물',tick=10,leverage=10,info=f'코스피200 지수(샘플 350포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. {fut}'),
 dict(ticker='KQ150F',name='코스닥150 선물',group='idx',unit='계약',base=90000,volFactor=0.85,baseVolume=12000,sector='지수선물',tick=10,leverage=10,info=f'코스닥150 지수(샘플 900포인트)를 따라가는 모의 선물입니다. 1계약 가격 = 지수 × 100P. {fut}'),
 dict(ticker='ESF',name='S&P500 선물',group='idx',unit='계약',base=670000,volFactor=0.6,baseVolume=15000,sector='지수선물',tick=100,leverage=10,info=f'S&P500 지수(샘플 6,700포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. {fut}'),
 dict(ticker='NQF',name='나스닥100 선물',group='idx',unit='계약',base=2400000,volFactor=0.8,baseVolume=10000,sector='지수선물',tick=500,leverage=10,info=f'나스닥100 지수(샘플 24,000포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. {fut}'),
 dict(ticker='YMF',name='다우존스 선물',group='idx',unit='계약',base=4500000,volFactor=0.55,baseVolume=6000,sector='지수선물',tick=500,leverage=10,info=f'다우존스 지수(샘플 45,000포인트)를 따라가는 단순 모의 상품입니다. 1계약 가격 = 지수 × 100P. {fut}'),
 dict(ticker='USDKRW',name='달러 선물(원/달러)',group='fx',unit='계약',base=140000,volFactor=0.25,baseVolume=80000,sector='환율선물',tick=10,leverage=10,info=f'원/달러 환율(샘플 1,400원)을 따라가는 모의 선물입니다. 1계약 가격 = 환율 × 100P(100달러 기준). 게임용이며 실제 환전·외환거래가 아닙니다. {fut}'),
 dict(ticker='DXY',name='달러인덱스 선물',group='fx',unit='계약',base=100000,volFactor=0.2,baseVolume=30000,sector='환율선물',tick=10,leverage=10,info=f'주요 통화 대비 달러의 가치를 나타내는 지수(샘플 100)를 따라가는 모의 선물입니다. 1계약 가격 = 지수 × 1,000P. {fut}'),
 dict(ticker='WTI',name='WTI 원유 선물',group='oil',unit='계약',base=65*FX,volFactor=1.3,baseVolume=50000,sector='원유선물',tick=10,leverage=10,info=f'서부텍사스산 원유(WTI, 샘플 65달러)를 따라가는 모의 선물입니다. 1계약 가격 = 달러 가격 × 샘플 환율({FX:,}P). 실제 원유 거래가 아닙니다. {fut}'),
 dict(ticker='BRENT',name='브렌트유 선물',group='oil',unit='계약',base=69*FX,volFactor=1.25,baseVolume=45000,sector='원유선물',tick=10,leverage=10,info=f'북해 브렌트유(샘플 69달러)를 따라가는 모의 선물입니다. 1계약 가격 = 달러 가격 × 샘플 환율({FX:,}P). 실제 원유 거래가 아닙니다. {fut}'),
 dict(ticker='BTC',name='비트코인',group='crypto',unit='mBTC',base=150000,volFactor=2.2,baseVolume=300000,sector='가상자산',tick=1,live=dict(provider='upbit',market='KRW-BTC',mult=0.001),
      info='대표적인 가상자산입니다. 1 mBTC = 0.001 BTC 단위로 거래합니다. 가격은 업비트 공개 시세(원화)를 0.001 BTC 단위로 환산해 보여주고, 시세 연결이 안 되면 샘플 가격으로 표시됩니다. 실제 가상자산 거래가 아니며 투자 권유가 아닙니다.'),
 dict(ticker='ETH',name='이더리움',group='crypto',unit='mETH',base=5000,volFactor=2.4,baseVolume=2000000,sector='가상자산',tick=1,live=dict(provider='upbit',market='KRW-ETH',mult=0.001),
      info='스마트 계약 플랫폼의 가상자산입니다. 1 mETH = 0.001 ETH 단위로 거래합니다. 가격은 업비트 공개 시세(원화)를 0.001 ETH 단위로 환산해 보여주고, 시세 연결이 안 되면 샘플 가격으로 표시됩니다. 실제 가상자산 거래가 아니며 투자 권유가 아닙니다.'),
]
assert len({t['ticker'] for t in T}) == len(T)
GROUPS = [('kr','국내주식'),('us','미국주식'),('idx','지수선물'),('fx','달러선물'),('oil','원유선물'),('crypto','가상자산')]

# ---------- JS ----------
def js_obj(t):
    parts = [f"ticker: {json.dumps(t['ticker'])}", f"name: {json.dumps(t['name'],ensure_ascii=False)}", f"group: {json.dumps(t['group'])}",
             f"unit: {json.dumps(t['unit'],ensure_ascii=False)}", f"base: {t['base']}", f"volFactor: {t['volFactor']}", f"baseVolume: {t['baseVolume']}"]
    if 'tick' in t: parts.append(f"tick: {t['tick']}")
    parts.append(f"leverage: {t.get('leverage',1)}")
    if 'live' in t: parts.append('live: { provider: %s, market: %s, mult: %s }' % (json.dumps(t['live']['provider']), json.dumps(t['live']['market']), t['live']['mult']))
    parts += [f"sector: {json.dumps(t['sector'],ensure_ascii=False)}", f"info: {json.dumps(t['info'],ensure_ascii=False)}"]
    return '  { ' + ', '.join(parts) + ' },'
js_block = "export const TICKERS = [\n" + '\n'.join(js_obj(t) for t in T) + "\n];\n\nexport const GROUPS = " + json.dumps([{'id':a,'label':b} for a,b in GROUPS],ensure_ascii=False) + ";\n"
p='simgame/lib/market.js'; s=open(p,encoding='utf-8').read()
a=s.index("export const TICKERS = ["); b=s.index("export const TICKER_MAP")
s=s[:a]+js_block+"\n"+s[b:]
open(p,'w',encoding='utf-8').write(s)

# ---------- PHP ----------
def php_str(x): return "'" + x.replace('\\','\\\\').replace("'","\\'") + "'"
def php_obj(t):
    parts = [f"'name' => {php_str(t['name'])}", f"'group' => '{t['group']}'", f"'unit' => {php_str(t['unit'])}", f"'base' => {t['base']}",
             f"'volFactor' => {t['volFactor']}", f"'baseVolume' => {t['baseVolume']}"]
    if 'tick' in t: parts.append(f"'tick' => {t['tick']}")
    parts.append(f"'leverage' => {t.get('leverage',1)}")
    if 'live' in t: parts.append("'live' => ['provider' => '%s', 'market' => '%s', 'mult' => %s]" % (t['live']['provider'], t['live']['market'], t['live']['mult']))
    parts += [f"'sector' => {php_str(t['sector'])}", f"'info' => {php_str(t['info'])}"]
    return f"        '{t['ticker']}' => [" + ', '.join(parts) + '],'
php_block = "    public const TICKERS = [\n" + '\n'.join(php_obj(t) for t in T) + "\n    ];\n    public const GROUPS = [" + ', '.join(f"['id' => '{a}', 'label' => '{b}']" for a,b in GROUPS) + "];\n"
p='simgame-php/lib/market.php'; s=open(p,encoding='utf-8').read()
a=s.index("    public const TICKERS = ["); b=s.index("    public const RANGES")
s=s[:a]+php_block+s[b:]
open(p,'w',encoding='utf-8').write(s)
print(len(T),'tickers')
