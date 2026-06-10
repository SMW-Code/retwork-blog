import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* X (Twitter) 자동 게시 — /admin 에서 발행 시 같이 호출.
   필요 환경변수 (Vercel Settings → Environment Variables):
     X_API_KEY              — Consumer Key
     X_API_SECRET           — Consumer Secret
     X_ACCESS_TOKEN         — Access Token (사용자 컨텍스트)
     X_ACCESS_TOKEN_SECRET  — Access Token Secret
     ADMIN_PASSWORD         — admin 비번 (publish 와 공유)

   본문 글자수: 280자 (URL 은 t.co 단축으로 23자 차지) */

type Body = {
  password: string;
  title: string;
  description?: string;
  url: string;
  tags?: string[];
  customText?: string;   // 직접 입력한 트윗 내용 (있으면 우선)
};

const TWEET_MAX = 280;
const URL_LEN = 23;       // X 가 모든 URL 을 t.co 로 단축 → 23자 (https/http 동일)

function jLen(s: string): number {
  return [...(s || '')].length;
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  if (jLen(s) <= max) return s;
  return [...s].slice(0, Math.max(0, max - 1)).join('') + '…';
}

/** 자동 트윗 메시지 생성 — 280자 안에 들어가게 */
function formatTweet(opts: { title: string; description?: string; url: string; tags?: string[] }): string {
  const { title, description, url, tags = [] } = opts;
  const tagText = tags.slice(0, 4).map((t) => `#${String(t).replace(/\s+/g, '')}`).join(' ');
  // 구조: title \n\n desc?...\n\n→ URL\n#tag1 #tag2
  // 고정 비용: URL = 23, 「\n\n→ 」 = 4, 「\n」 + tags
  const fixed = URL_LEN + 4 + (tagText ? 1 + jLen(tagText) : 0);
  const free = TWEET_MAX - fixed;
  // 본문 = title + (\n\n + description?) 안에 free 이내
  const titleClipped = truncate(title || '', Math.min(80, free - 2));
  let body = titleClipped;
  const rest = free - jLen(body);
  if (description && rest > 12) {
    body += '\n\n' + truncate(description, rest - 2);
  }
  const lines = [body, `→ ${url}`, tagText].filter(Boolean);
  return lines.join('\n\n').trim();
}

export async function POST(req: NextRequest) {
  const adminPw = process.env.ADMIN_PASSWORD;
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!adminPw) {
    return NextResponse.json({ ok: false, error: '서버 설정: ADMIN_PASSWORD 미설정' }, { status: 500 });
  }
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return NextResponse.json({
      ok: false,
      error: 'X API 토큰 미설정 — Vercel 환경변수에 X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET 4개를 등록하세요.',
    }, { status: 500 });
  }

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '잘못된 요청 형식' }, { status: 400 }); }

  if (body.password !== adminPw) {
    return NextResponse.json({ ok: false, error: '비밀번호 오류' }, { status: 401 });
  }
  if (!body.title || !body.url) {
    return NextResponse.json({ ok: false, error: 'title / url 필수' }, { status: 400 });
  }

  // 메시지 생성 — customText 있으면 우선, 없으면 자동
  let text = body.customText && body.customText.trim()
    ? body.customText.trim()
    : formatTweet({ title: body.title, description: body.description, url: body.url, tags: body.tags });
  // 최종 안전 컷
  if (jLen(text) > TWEET_MAX) text = truncate(text, TWEET_MAX);

  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret,
    });
    const result = await client.v2.tweet(text);
    const tweetId = result.data?.id;
    return NextResponse.json({
      ok: true,
      tweetId,
      tweetUrl: tweetId ? `https://x.com/i/web/status/${tweetId}` : null,
      text,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `X 게시 실패: ${msg}`, text }, { status: 500 });
  }
}
