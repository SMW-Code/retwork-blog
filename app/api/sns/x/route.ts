import { NextRequest, NextResponse } from 'next/server';
import { formatTweet, postToX, jLen, truncate } from '../../../../lib/sns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* X (Twitter) 자동 게시 — /admin 에서 발행 시 같이 호출.
   비밀번호: ADMIN_PASSWORD 또는 BLOG_PUBLISH_KEY 둘 다 OK */

type Body = {
  password: string;
  title: string;
  description?: string;
  url: string;
  tags?: string[];
  customText?: string;
};

export async function POST(req: NextRequest) {
  const adminPw = process.env.ADMIN_PASSWORD;
  const publishKey = process.env.BLOG_PUBLISH_KEY;

  if (!adminPw) {
    return NextResponse.json({ ok: false, error: '서버 설정: ADMIN_PASSWORD 미설정' }, { status: 500 });
  }

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '잘못된 요청 형식' }, { status: 400 }); }

  const validPw = body.password === adminPw || (publishKey && body.password === publishKey);
  if (!validPw) {
    return NextResponse.json({ ok: false, error: '비밀번호 오류' }, { status: 401 });
  }
  if (!body.title || !body.url) {
    return NextResponse.json({ ok: false, error: 'title / url 필수' }, { status: 400 });
  }

  let text = body.customText && body.customText.trim()
    ? body.customText.trim()
    : formatTweet({ title: body.title, description: body.description, url: body.url, tags: body.tags });
  if (jLen(text) > 280) text = truncate(text, 280);

  const result = await postToX(text);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
