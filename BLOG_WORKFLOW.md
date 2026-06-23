# RetWork 그루메 블로그 — 작업 핸드오프 / 워크플로우

> 다른 PC에서 이어서 작업 시 이 파일 먼저 읽기. (blog.retwork.jp = Next.js, Vercel `retwork-blog` 프로젝트)
> 최종 업데이트: 2026-06-23 · 글 16편 (실방문 리뷰 6 + 정보형 가이드 등)

---

## 0. 한 줄 요약
맛집 리뷰 = **`posts/<slug>.md` 작성(place 좌표 포함) → 사진을 `public/images/<slug>/`에 넣기 → GPS추출+EXIF제거+리사이즈 → commit/push.** 끝나면 글 목록·사이트맵·홈 카드 썸네일 전부 자동.

## 1. 구조
- **글**: `posts/*.md` (gray-matter frontmatter + 마크다운 본문). 파일만 추가하면 자동 목록/사이트맵.
- **이미지**: `public/images/<slug>/*.jpg` → URL `/images/<slug>/x.jpg`.
- **파서**: `lib/posts.ts` (`getAllPosts`, `getPostBySlug`, `PostMeta`/`PlaceMeta`).
- **글 페이지**: `app/posts/[slug]/page.tsx` (BlogPosting + place→Restaurant JSON-LD).
- **홈/記事一覧**: `app/page.tsx` (카드 목록).
- **카드 스타일**: `app/layout.tsx` 내 `.post-card …` CSS.

## 2. frontmatter 포맷
```yaml
---
title: "..."
date: "2026-06-23"
description: "~120자"
image: "/images/<slug>/main.jpg"   # 대표(음식) 사진 = 홈 카드 썸네일
tags: ["...", "..."]
author: "RetWork編集部"
place:                              # 실방문 리뷰면 추가(좌표 SEO 핵심)
  name: "가게명"
  address: "주소"
  lat: 35.xxxx                      # 사진 GPS 또는 구글맵
  lng: 139.xxxx
  cuisine: "中華料理"
---
```
- `place` 있으면 → 글 페이지 JSON-LD `BlogPosting.contentLocation`에 **Restaurant + GeoCoordinates** 자동 출력. (이미지 EXIF GPS는 SEO 효과 없음 → 구조화 데이터가 정공법)

## 3. 신규 맛집 리뷰 워크플로우 (확립됨)
1. 사용자가 정보+사진 제공 → `posts/<slug>.md` 작성 (위 frontmatter + 본문, 일본어).
2. `mkdir public/images/<slug>` 하고, 사용자에게 **파일명 매핑** 안내(main/exterior/menu/receipt 등).
3. 사용자가 사진 넣음 → **GPS 추출 + EXIF제거 + 1400px 리사이즈**(아래 스크립트).
   - 좌표는 가게 내부 사진들 **클러스터** 사용(영수증 등 outlier 제외).
   - frontmatter `lat`/`lng`에 입력.
4. `git add posts/<slug>.md public/images/<slug>/ && commit && push`.
5. 검증: 글 200 / 사이트맵 +1 / `GeoCoordinates` 포함 / 이미지 200 (엣지 전파 지연이면 몇 초 후 재확인).

### 이미지 처리 스크립트 (Python Pillow — `pip install pillow`)
```python
from PIL import Image, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS
import os
d='public/images/<slug>'
def dms(v): return float(v[0])+float(v[1])/60+float(v[2])/3600
for p in [...파일명...]:
    fn=f'{d}/{p}.jpg'
    ex=Image.open(fn)._getexif() or {}
    t={TAGS.get(k,k):v for k,v in ex.items()}; g=t.get('GPSInfo')
    if g:
        gg={GPSTAGS.get(k,k):v for k,v in g.items()}
        print(p, dms(gg['GPSLatitude']), dms(gg['GPSLongitude']))   # 좌표
    im=ImageOps.exif_transpose(Image.open(fn)).convert('RGB')       # 회전 반영
    w,h=im.size; m=max(w,h)
    if m>1400: s=1400/m; im=im.resize((int(w*s),int(h*s)))
    im.save(fn,'JPEG',quality=85,optimize=True)                     # EXIF 제거+압축
```
- **왜 EXIF 제거**: 위치정보(집 등) 노출 방지. SEO 효과 없음(구글이 어차피 떼어냄). 용량도 16MB→1MB대로.

## 4. 카드 레이아웃 (현재 확정)
- 구조: **[제목 + 우측 정사각 썸네일] 헤더 / 그 아래 [본문·태그] 전체 폭**. (PC·모바일 공통)
- 썸네일 = frontmatter `image`. PC 116px / 모바일 84px. (`app/layout.tsx` `.post-head`·`.post-thumb`)

## 5. AdSense / 광고 (중요)
- `components/AdSlot.tsx`: **`slot` ID 비어 있으면 `null` 반환**(빈 광고 박스 안 생김). 글 페이지(`app/posts/[slug]/page.tsx`)에 `<AdSlot slot="" />` 2개 있음.
- **AdSense 승인 후**: AdSense에서 광고 단위 만들고 그 **slot ID를 `<AdSlot slot="XXXX" />`에 넣으면** 그 자리에 광고 자동 노출.
- env: Vercel `retwork-blog` → `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-6495876616577319` (대시보드로 설정됨). ads.txt 있음.
- ⚠️ **AdSense는 retwork.jp 도메인 단위 심사** → blog.retwork.jp는 그 안에 포함. (자세한 수익 전략은 receiptiq 레포 `MONETIZATION_REALITY.md`)

## 6. 현재 글 (16편)
- 실방문 리뷰: きたかた食堂 / 凪 / 豚大学 / チョゴリ / 銀座 篝 / 餃子福袋 / 錦秀菜館(神保町) / こうや(伊東) / 金子半之助(大手町)
- 정보형/가이드: 神保町コスパまとめ, ラーメンジャンル, 外食費コスパ, レシートで店探し, 가계부 관련 등
- (정확한 목록: `ls posts/`)

## 7. 작업 규칙
- 변경은 `main` 직접 push (Vercel 자동 배포). TS 변경 시 `npx tsc --noEmit`로 확인.
- 이미지 큰 파일 그대로 올리지 말 것 → 항상 EXIF제거+리사이즈.
- `.vercel/`은 gitignore (커밋 금지).
