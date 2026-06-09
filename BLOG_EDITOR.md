# 블로그 글쓰기 페이지 (/admin) — 가이드 & 인계 문서

> `blog.retwork.jp/admin` = 비개발자(민우)용 블로그 글쓰기 CMS.
> 브라우저에서 글 쓰고 "발행" 누르면 → GitHub 자동 커밋 → Vercel 재빌드 → 블로그 반영.
> 최종 업데이트: 2026-06-09

---

## 0. 지금 상태 (중요)

- ✅ **코드 완성 & 배포됨** — /admin + API 4개
- ✅ **기능**: 새 글 작성 · 글 목록 · 수정 · 삭제 · 이미지 업로드 · SEO 자동 점검/적용
- ✅ **Vercel 환경변수 설정됨** (retwork-blog 프로젝트, Production, Sensitive)
  - `GITHUB_TOKEN` (retwork-blog Contents 읽기/쓰기, 만료 2027-06-09)
  - `ADMIN_PASSWORD` (작성 페이지 비번)
- ⏳ **남은 일: 실제 발행 end-to-end 테스트** ← 아직 검증 안 함 (아래 체크리스트)

---

## 1. 사용법 (어느 PC·폰에서든, 브라우저만 있으면 됨)

```
1. blog.retwork.jp/admin 접속
2. 관리자 비밀번호 입력 (= Vercel 의 ADMIN_PASSWORD 값)
3. 글 쓰기 → 🚀 발행하기
   또는 📋 글 목록 → 수정 / 삭제
```
> 글쓰기는 **개발 PC가 필요 없어요.** 웹에서 바로 됩니다.

### 화면 구성
- **상단 탭**: [✍️ 새 글] / [📋 글 목록]
- **① 기본 정보**: 제목 · 주소(슬러그) · 검색설명 · 태그 · 대표이미지 → SEO 자동
- **② 본문 블록**: ＋소제목 / ＋본문 / ＋강조카드 / ＋인용 / ＋이미지 (↑↓ 순서, ✕ 삭제)
- **오른쪽**: 실시간 미리보기 + SEO 자동 점검(100점)

---

## 2. ⏳ 남은 테스트 체크리스트 (다른 PC에서 이어서 할 일)

`blog.retwork.jp/admin` 에서:

- [ ] **발행**: 제목 `テスト投稿`, 주소 `test-post`, 검색설명 한 줄, 본문 블록 50자+ → 🚀발행
      → ✅ 초록 배너 + 1분 후 `blog.retwork.jp/posts/test-post` 열리면 성공
- [ ] **목록**: 📋글 목록에 test-post + 기존 글들 보이는지
- [ ] **수정**: 수정 눌러 내용 불러와지고, 재발행되는지
- [ ] **삭제**: 삭제하면 목록·사이트에서 사라지는지
- [ ] 잘 되면 **test-post 삭제**해서 정리

### 에러가 나면 (배너 메시지로 진단)
| 메시지 | 원인 |
|--------|------|
| `서버 설정 미완료(환경변수)` | Vercel 에 GITHUB_TOKEN / ADMIN_PASSWORD 없음 → 추가 후 Redeploy |
| `발행 실패: GitHub 401/403` | 토큰 권한 부족/만료 → Contents 쓰기 권한 재확인 |
| `비밀번호가 틀렸어요` | 게이트 비번 ≠ Vercel ADMIN_PASSWORD |

---

## 3. 구조 (개발 이어서 할 때)

**레포**: `SMW-Code/retwork-blog` (Next.js 15, Vercel, blog.retwork.jp)

| 파일 | 역할 |
|------|------|
| `app/admin/page.tsx` | 에디터 UI (클라이언트 컴포넌트) |
| `app/api/publish/route.ts` | 발행/수정 → GitHub 커밋 |
| `app/api/posts/route.ts` | 글 목록 |
| `app/api/post/route.ts` | 글 원문 불러오기 (수정용) |
| `app/api/delete/route.ts` | 글 삭제 |
| `lib/github.ts` | GitHub API 공용 (listPosts/getRawPost/commitFiles/deletePost) |
| `app/layout.tsx` | 전역 CSS (.callout 카드 등) |

**발행 흐름**:
```
에디터 → /api/publish → lib/github commitFiles
  → posts/<slug>.md + public/images/<slug>/* 를 "단일 커밋"으로 push
  → Vercel 자동 재빌드 (~1분) → blog.retwork.jp 반영
```
글 = `posts/*.md` (frontmatter: title/date/description/image/tags/author) → SEO·사이트맵 **자동**.

---

## 4. 다른 PC에서 개발 이어서 하기

```bash
git clone https://github.com/SMW-Code/retwork-blog.git
cd retwork-blog
npm ci
npm run dev      # http://localhost:3001/admin
```
수정 후:
```bash
git add -A
git commit -m "작업 내용"
git push origin main     # → blog.retwork.jp 자동 반영
```

### 로컬에서 "발행"까지 테스트하려면 — `.env.local`
retwork-blog 루트에 `.env.local` 파일 생성 (⚠️ git 에 올리지 말 것, .gitignore 확인):
```
ADMIN_PASSWORD=원하는비번
GITHUB_TOKEN=github_pat_...
```
> 없으면 글쓰기 화면은 보이지만 "발행"은 "서버 설정 미완료" 에러가 나요 (로컬 한정).
> 실서비스(blog.retwork.jp)는 Vercel 환경변수로 이미 작동.

---

## 5. 보안 메모

- `GITHUB_TOKEN` 은 **서버(API 라우트)에서만** 사용 → 브라우저에 노출 안 됨. Vercel 에서 Sensitive.
- `/admin` 은 비번 게이트(클라) + **모든 발행/수정/삭제 API 가 서버에서 ADMIN_PASSWORD 재검증**.
- `robots.txt` 에서 `/admin`, `/api` 색인 제외.
- 토큰은 retwork-blog **한 레포에만** 권한 (다른 레포 못 건드림).

---

## 6. 나중 아이디어 (선택)

- 절약 블로그(`retwork.jp/blog`)에도 같은 작성 페이지 적용 (현재 손HTML → 마크다운/생성기로 통합 필요)
- 임시저장(draft), 자동 이미지 압축, 발행 전 미리보기 링크
- 글 목록 검색/정렬
