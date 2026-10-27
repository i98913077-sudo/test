/* 가나북스 공통 레이아웃 & 유틸 */
(function () {
  const C = GN.company;

  GN.menu = [
    { key: "company", href: "company.html", ko: "회사소개", en: "Company" },
    { key: "business", href: "business.html", ko: "판매영업대행", en: "Business" },
    { key: "bookstore", href: "bookstore.html", ko: "전국서점", en: "Bookstore" },
    { key: "dataroom", href: "dataroom.html", ko: "자료실", en: "Data Room" },
    { key: "board", href: "board.html", ko: "자유게시판", en: "Board" },
    { key: "request", href: "request.html", ko: "대행문의", en: "Request" },
    { key: "isbn", href: "https://www.nl.go.kr/seoji/", ko: "문헌번호센터", en: "ISBN Center", ext: true }
  ];

  GN.esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  GN.param = k => new URLSearchParams(location.search).get(k);
  GN.won = n => n.toLocaleString("ko-KR") + "원";
  GN.dot = d => d.replace(/-/g, ".");

  GN.logo = () => `
    <a class="logo" href="index.html" aria-label="가나북스 홈">
      <svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="4" y="6" width="9" height="28" rx="2" fill="#d92b2b"/>
        <rect x="15.5" y="10" width="9" height="24" rx="2" fill="#f39a1e"/>
        <rect x="27" y="4" width="9" height="30" rx="2" fill="#2f74d8" transform="rotate(8 31.5 19)"/>
        <rect x="2" y="34" width="36" height="3" rx="1.5" fill="currentColor" opacity=".25"/>
      </svg>
      <span><span class="logo-text">가나<em>북</em>스</span><span class="logo-sub">GANA BOOKS</span></span>
    </a>`;

  GN.cover = (b, opts = {}) => {
    const [c1, c2] = b.color || ["#2f74d8", "#183a6e"];
    return `<div class="book-cover" style="background:linear-gradient(155deg, ${c1}, ${c2})">
      <span class="bc-cat">${GN.esc(b.category || "GANA BOOKS")}</span>
      <span class="bc-title">${GN.esc(b.title)}</span>
      <span class="bc-deco"><svg viewBox="0 0 100 40" width="70%" aria-hidden="true">
        <circle cx="20" cy="22" r="14" fill="rgba(255,255,255,.18)"/>
        <path d="M0 40 Q30 10 60 28 T100 18 V40Z" fill="rgba(255,255,255,.14)"/></svg></span>
      <span class="bc-author">${GN.esc(b.author || "")}</span>
      <span class="bc-pub">${GN.esc(b.publisher || "가나북스")}</span>
    </div>`;
  };

  // 지역 타일맵 (대략적인 지리 배치, 5열)
  const TILES = [
    "인천", "서울", "경기", "강원", "",
    "", "충남", "세종", "충북", "경북",
    "", "전북", "대전", "대구", "울산",
    "", "광주", "전남", "경남", "부산",
    "제주", "", "", "", ""
  ];
  const METRO = ["서울", "인천", "대전", "세종", "대구", "울산", "광주", "부산"];
  GN.regionTiles = (on, layout = TILES) => layout.map(k => k
    ? `<a href="bookstore.html?region=${encodeURIComponent(k)}" data-region="${k}" class="${METRO.includes(k) ? "metro" : ""}${k === on ? " on" : ""}">${k}<small>${GN.stores.filter(s => s.region === k).length}곳</small></a>`
    : `<span class="empty"></span>`).join("");

  function header(active) {
    const nav = GN.menu.map(m => `<a href="${m.href}"${m.ext ? ' target="_blank" rel="noopener" class="ext"' : ""}${m.key === active ? ' class="active" aria-current="page"' : ""}>${m.ko}<small>${m.en}</small></a>`).join("");
    return `
      <div class="topbar"><div class="container">
        <div class="tb-left"><span>출판사 도서 <strong>유통 · 제작 · 보관</strong> 전문</span><span>${C.address}</span></div>
        <div class="tb-right"><a href="tel:${C.tel}">TEL ${C.tel}</a><span>FAX ${C.fax}</span></div>
      </div></div>
      <header class="site-header"><div class="container">
        ${GN.logo()}
        <nav class="gnb" aria-label="주 메뉴">${nav}</nav>
        <button class="menu-btn" aria-label="메뉴 열기" aria-expanded="false"><span></span></button>
      </div></header>`;
  }

  function footer() {
    const links = GN.menu.map(m => `<li><a href="${m.href}"${m.ext ? ' target="_blank" rel="noopener"' : ""}>${m.ko}</a></li>`).join("");
    return `
      <footer class="site-footer">
        <div class="container footer-top">
          <div>
            ${GN.logo()}
            <p>저희 가나북스는 출판사 여러분의 소중한 도서를<br>${C.slogan}.</p>
          </div>
          <div><h5>바로가기</h5><ul>${links}</ul></div>
          <div>
            <h5>고객센터</h5>
            <div class="footer-tel">${C.tel}</div>
            <p style="margin-top:6px">평일 ${C.hours} · FAX ${C.fax}<br>원고투고 및 문의 <a href="mailto:${C.email}">${C.email}</a></p>
          </div>
        </div>
        <div class="footer-bottom"><div class="container">
          <span>상호 ${C.name}</span><span>대표자 ${C.ceo}</span><span>사업자등록번호 ${C.bizNo}</span><span>통신판매신고 ${C.mailOrder}</span>
          <span>본사 ${C.address}</span><span>물류사무실 ${C.logistics}</span>
          <span class="copy">© ${C.name}. All rights reserved.</span>
        </div></div>
      </footer>
      <button class="to-top" aria-label="맨 위로">↑</button>
      <div class="toast" role="status" aria-live="polite"></div>`;
  }

  GN.toast = msg => {
    const t = document.querySelector(".toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2600);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const active = document.body.dataset.page;
    document.body.insertAdjacentHTML("afterbegin", header(active));
    document.body.insertAdjacentHTML("beforeend", footer());

    const btn = document.querySelector(".menu-btn");
    btn.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open);
    });

    const top = document.querySelector(".to-top");
    top.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
    addEventListener("scroll", () => top.classList.toggle("show", scrollY > 600), { passive: true });

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
      document.querySelectorAll(".reveal").forEach(el => io.observe(el));
    } else {
      document.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
    }
  });
})();
