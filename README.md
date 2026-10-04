# 주식법전: 스피드런

웹소설 《주식시장에 나와서는 안 될 소설: 주식법전 스피드런》과 영화화(Higgsfield) 대본 프로젝트.

- `novel/` 프롤로그·1장 원고 (md, pdf)
- `screenplay/` 영화대본 PDF (정식본, 병맛 B급본, 완결본 + 41컷 컷리스트)
- `src/` 대본 원본 텍스트와 PDF 제작 스크립트
- `assets/` 영상 링크 등

## 영상
- 20초 연결본(한글 자막): https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/e1848dc9-5fe4-4441-956f-6a343f6a30f1.mp4

## 모션코믹 풀버전 (5분 5초)
https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/696a2303-37ff-4c42-aa57-036de9a8fccd.mp4
- 구성: 타이틀 → 한국어 음성 클립(10초) → 키프레임 16장 × 컷 48개(줌/팬 + 한글 자막) → 엔딩
- 재생성: `assets/motioncomic/build.py` (키프레임 URL은 `manifest.tsv`, 24시간 후 만료)

### 음성 포함 버전 (5분 5초)
https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/d78e4e57-3c03-473b-aba9-191f5d80d5db.mp4
- 대사·내레이션 44컷에 한국어 음성(edge-tts) 추가. 화자: 내레이터 / 너굴 / 몰빵 / 저승사자·직원 / 미래의 너굴

## 대본 충실판 모션코믹 (전 5편, 약 30분 44초)
대본(`src/script_body_c.txt`)의 `@`대사 313줄 + 화면 자막(`^`) + 퀘스트창(`~[`)을 순서 그대로 사용. 막별 1편.
1. 제1막 (7:35) https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/c1a84763-44a7-45e1-b5be-25b1eb3473e0.mp4
2. 제2막 (3:08) https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/c12cac95-c94f-4e28-9ac9-3c6c908978f1.mp4
3. 제3막 (7:28) https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/a23cbb53-5cee-445f-b29d-26288e5a337a.mp4
4. 제4막 (4:55) https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/ef59c25f-c64f-41b2-90cd-3a1715b17f13.mp4
5. 제5막 (7:38) https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/9abd09e7-f8ee-4d07-bf8c-05fe83ca2be7.mp4
- 재생성: `assets/motioncomic/build2.py <막번호>`

## 철학 뼈대판 (5분 38초) — 이어서 살을 붙이는 기준본
https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/05bd9a8d-7b3d-4403-85cc-cc739400980e.mp4
- 구성: 5막(확신 → 반복 → 가격은 이야기다 → 남의 몸으로 → 곁에 있다는 것). 내레이션은 새로 쓴 글, 대사는 대본 원문(자동 검증).
- 비트시트: `assets/motioncomic/beats.json`, 클립 슬롯: `assets/motioncomic/SLOTS.md`, 빌드: `build3.py`

- 웹소설 연재판 (11화, 9:39, 효과음·조문카드·독자댓글·다음화 예고): https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/f3b2e9c6-b74e-4207-9f88-9c04e9df2d8b.mp4  (assets/motioncomic/beats4.json, build4.py)

- 단순 스토리판 (5덩어리, 3:25): https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/a6a49f83-db23-4642-b845-3e3813e20add.mp4  (assets/motioncomic/beats5.json, build3.py)

- 단순 스토리판 v2 (자막·음성 싱크 수정, 3:42): https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/2c6599f9-14a8-40ef-95e7-e710d3c59199.mp4

- 《주식너굴: 사실 그 가격은 처음부터 없었다》 코드 애니메이션 (4:01, 크레딧 0): https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/08ff642b-76e0-422f-ae49-104ec0a105d4.mp4  (assets/motioncomic/nugul/build_nugul.py)

- 《주식법전 스피드런》 코드 애니메이션 (3:47, 크레딧 0): https://d2ol7oe51mr4n9.cloudfront.net/user_3CZ4NxhrcqKYJP84LKj5qzklUJg/8d813105-6f91-4aa4-8701-20b824fa941c.mp4  (assets/motioncomic/nugul/build_beop.py)
