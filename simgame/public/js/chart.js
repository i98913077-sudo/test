// 의존성 없는 캔들차트(+거래량). 한국식 색상: 상승=빨강, 하락=파랑. 터치/마우스로 십자선 표시.
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function drawCandles(canvas, candles, { onHover } = {}) {
  const box = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = box.clientWidth, H = box.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!candles.length) return;

  const up = css('--up') || '#d6342c', down = css('--down') || '#1c6fd1', line = css('--line') || '#e1e6ee', muted = css('--muted') || '#5b6678';
  const padR = 56, padT = 8, padB = 18;
  const volH = Math.round((H - padT - padB) * 0.2);
  const plotH = H - padT - padB - volH - 6;
  const plotW = W - padR - 4;
  let lo = Infinity, hi = -Infinity, vmax = 0;
  for (const c of candles) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); vmax = Math.max(vmax, c.v); }
  const span = hi - lo || hi * 0.01 || 1;
  lo -= span * 0.06; hi += span * 0.06;
  const y = (p) => padT + (hi - p) / (hi - lo) * plotH;
  const step = plotW / candles.length;
  const bw = Math.max(1, Math.min(14, step * 0.7));
  const x = (i) => 2 + step * i + step / 2;

  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const p = lo + (hi - lo) * (g / 4), yy = Math.round(y(p)) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW + 2, yy); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillText(Math.round(p).toLocaleString('ko-KR'), plotW + 6, yy);
  }
  candles.forEach((c, i) => {
    const col = c.c >= c.o ? up : down;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    const cx = Math.round(x(i)) + 0.5;
    ctx.beginPath(); ctx.moveTo(cx, y(c.h)); ctx.lineTo(cx, y(c.l)); ctx.stroke();
    const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
    ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bot - top));
    ctx.globalAlpha = 0.45;
    const vh = vmax ? (c.v / vmax) * volH : 0;
    ctx.fillRect(cx - bw / 2, H - padB - vh, bw, vh);
    ctx.globalAlpha = 1;
  });
  const last = candles[candles.length - 1];
  const ly = y(last.c);
  ctx.setLineDash([3, 3]); ctx.strokeStyle = last.c >= last.o ? up : down;
  ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW + 2, ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = last.c >= last.o ? up : down;
  ctx.fillRect(plotW + 2, ly - 8, padR - 2, 16);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText(last.c.toLocaleString('ko-KR'), plotW + 5, ly);

  // 십자선
  const showAt = (clientX) => {
    const r = canvas.getBoundingClientRect();
    const i = Math.max(0, Math.min(candles.length - 1, Math.floor((clientX - r.left - 2) / step)));
    drawCandles(canvas, candles, { onHover });
    const c2 = canvas.getContext('2d');
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.strokeStyle = muted; c2.setLineDash([2, 3]);
    const cx = Math.round(x(i)) + 0.5;
    c2.beginPath(); c2.moveTo(cx, padT); c2.lineTo(cx, H - padB); c2.stroke(); c2.setLineDash([]);
    onHover?.(candles[i]);
  };
  if (!canvas._bound) {
    canvas._bound = true;
    const handler = (e) => canvas._show?.(e.clientX);
    canvas.addEventListener('pointermove', handler);
    canvas.addEventListener('pointerdown', handler);
  }
  canvas._show = showAt;
}
