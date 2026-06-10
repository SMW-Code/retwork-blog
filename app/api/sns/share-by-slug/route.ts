import { NextRequest, NextResponse } from 'next/server';
import { getPostBySlug } from '../../../../lib/posts';
import {
  formatTweet, formatThread,
  postToX, postToThreads,
  type XResult, type ThreadsResult,
} from '../../../../lib/sns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* /api/sns/share-by-slug
   기존(또는 새로 push 된) 블로그 글을 slug 만으로 SNS 게시.
   - 사용자가 /admin 에 들어가지 않아도 curl 한 줄로 트리거 가능
   - 비번: ADMIN_PASSWORD 또는 BLOG_PUBLISH_KEY (별도 키)
   - 글의 frontmatter (title/description/tags) 에서 자동 메시지 생성

   요청 예시:
     POST /api/sns/share-by-slug
     { "password": "...",
       "slug": "chogori-jimbocho",
       "platforms": ["x","threads"],
       "customX": "...",         // 선택 — 직접 작성한 트윗
       "customThreads": "..."    // 선택 — 직접 작성한 Threads 본문
     }

   응답:
     {
       ok: true/false,
       slug, url, title,
       results: { x?: XResult, threads?: ThreadsResult }
     }
*/

type Platform = 'x' | 'threads';
type Body = {
  password?: string;
  slug: string;
  platforms?: Platform[];
  customX?: string;
  customThreads?: string;
};

export async function POST(req: NextRequest) {
  const adminPw = process.env.ADMIN_PASSWORD;
  const publishKey = process.env.BLOG_PUBLISH_KEY;

  if (!adminPw && !publishKey) {
    return NextResponse.json({
      ok: false,
      error: '서버 설정: ADMIN_PASSWORD 또는 BLOG_PUBLISH_KEY 중 하나 이상 등록 필요',
    }, { status: 500 });
  }

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '잘못된 요청 형식' }, { status: 400 }); }

  // 인증: ADMIN_PASSWORD 또는 BLOG_PUBLISH_KEY 둘 다 인정
  const validPw =
    (adminPw && body.password === adminPw) ||
    (publishKey && body.password === publishKey);
  if (!validPw) {
    return NextResponse.json({ ok: false, error: '비밀번호 오류' }, { status: 401 });
  }

  if (!body.slug || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(body.slug)) {
    return NextResponse.json({ ok: false, error: '유효하지 않은 slug' }, { status: 400 });
  }

  const platforms: Platform[] = body.platforms && body.platforms.length
    ? body.platforms
    : ['x', 'threads'];

  // 글 frontmatter 로드 (publish 직후라 file system 이 아직 옛 캐시일 가능성 있음)
  const post = await getPostBySlug(body.slug);
  if (!post) {
    return NextResponse.json({
      ok: false,
      error: `글을 찾을 수 없음: ${body.slug} (Vercel 빌드가 끝났는지 확인. 보통 push 후 1~2분)`,
    }, { status: 404 });
  }

  const url = `https://blog.retwork.jp/posts/${body.slug}`;
  const tags = (post.tags || []).filter(Boolean);
  const baseOpts = {
    title: post.title,
    description: post.description,
    url,
    tags,
  };

  const results: { x?: XResult; threads?: ThreadsResult } = {};

  if (platforms.includes('x')) {
    const text = (body.customX && body.customX.trim()) || formatTweet(baseOpts);
    results.x = await postToX(text);
  }

  if (platforms.includes('threads')) {
    const text = (body.customThreads && body.customThreads.trim()) || formatThread(baseOpts);
    results.threads = await postToThreads(text);
  }

  const platformResults = Object.values(results);
  const allOk = platformResults.length > 0 && platformResults.every((r) => r?.ok);

  return NextResponse.json({
    ok: allOk,
    slug: body.slug,
    url,
    title: post.title,
    results,
  });
}
