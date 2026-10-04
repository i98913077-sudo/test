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
