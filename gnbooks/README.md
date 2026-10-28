# 가나북스 홈페이지 리뉴얼

기존 gnbooks.co.kr의 메뉴 구성과 내용은 그대로 두고 디자인만 새로 만든 정적 웹사이트입니다. 빌드할 필요 없이 `index.html`을 브라우저에서 열면 바로 볼 수 있습니다.

| 기존 메뉴 | 새 파일 |
|---|---|
| 메인 (index.php) | `index.html` |
| 회사소개 (top_menu=1) | `company.html` |
| 판매영업대행 (top_menu=2) | `business.html` |
| 전국서점 (top_menu=3·4, 지역별) | `bookstore.html?region=서울` |
| 자료실 (KstBoard_Board2) | `dataroom.html?page=2`, `dataroom-view.html?no=519` (no.536~509, 3페이지 / 총판 도서리스트 표: 검색·정렬·CSV 받기) |
| 자유게시판 (KstBoard_Board3) | `board.html`, `board-view.html?no=548` (신간 도서 상세) |
| 대행문의 (top_menu=7) | `request.html` |
| 문헌번호센터 | https://www.nl.go.kr/seoji/ (외부 링크) |

## 브랜드
- 로고(마크 + 가나북스 워드마크)는 `js/common.js`의 `GN.mark()` / `GN.wordmark()` SVG로 그렸습니다. 원본 로고 파일(AI/PDF)이 있으면 교체하세요.
- 물류센터 그림 `img/warehouse.svg`는 벡터 일러스트라 어떤 화면에서도 선명합니다. 실제 사진을 쓰려면 이 파일만 바꾸면 됩니다.
- 회사 정보는 명함 기준입니다(찾아오실 때 율곡로 1404, 물건 보내실 때 율곡로 1406, 이메일 2개).

## 내용 교체
모든 글, 도서, 서점, 회사 정보는 `js/data.js` 한 곳에 모여 있습니다. 이 파일만 고치면 모든 페이지에 반영됩니다.
- 메인화면에 있던 신간 5종 제목, 자료실 글 제목, 회사 정보(주소, 전화, 사업자번호, 대표자)는 기존 사이트 그대로입니다.
- **저자, 가격, ISBN, 서점 목록, 총판 도서리스트의 도서는 예시 데이터입니다.** 실제 자료로 바꿔 주세요.
- 대행문의는 서버가 연결되기 전까지 메일 앱으로 내용을 보냅니다(`mailto:`).

## 구성
- `css/style.css`: 디자인 전체(반응형 포함)
- `js/common.js`: 공통 상단 메뉴와 하단 정보, 도서 표지 생성
- `js/board.js`: 게시판 목록과 페이지 넘김
