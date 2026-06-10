import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Threads 자동 게시 — /admin 에서 발행 시 같이 호출.
   2단계 게시 (Meta 공식 흐름):
     ① POST /{user-id}/threads          → creation_id 받기
     ② POST /{user-id}/threads_publish  → 실제 게시

   필요 환경변수:
     THREADS_USER_ID        — Threads user ID (숫자)
     THREADS_ACCESS_TOKEN   — Long-lived Access Token (60일 갱신)
     ADMIN_PASSWORD         — admin 비번 (publish 와 공유)

   글자 제한: 500자 (URL 도 그대로 길이 차지 — Threads 는 단축 안 함)
*/

type Body = {
  password: string;
  title: string;
  description?: string;
  url: string;
  tags?: string[];
  customText?: string;
};

const THREADS_MAX = 500;
const API_BASE = 'https://graph.threads.net/v1.0';

function jLen(s: string): number { return [...(s || '')].length; }
function truncate(s: string, max: number): string {
  if (!s) return '';
  if (jLen(s) <= max) return s;
  return [...s].slice(0, Math.max(0, max - 1)).join('') + '…';
}

/** 자동 메시지 생성 — Threads 500자 */
function formatThread(opts: { title: string; description?: string; url: string; tags?: string[] }): string {
  const { title, description, url, tags = [] } = opts;
  const tagText = tags.slice(0, 6).map((t) => `#${String(t).replace(/\s+/g, '')}`).join(' ');
  const urlBlock = `\n\n→ ${url}`;
  const tagBlock = tagText ? `\n\n${tagText}` : '';
  const free = THREADS_MAX - jLen(urlBlock) - jLen(tagBlock);
  // 본문 = title + (\n\n + description?)
  const titleClipped = truncate(title || '', Math.min(140, free - 2));
  let body = titleClipped;
  const rest = free - jLen(body);
  if (description && rest > 20) {
    body += '\n\n' + truncate(description, rest - 2);
  }
  return body + urlBlock + tagBlock;
}

export async function POST(req: NextRequest) {
  const adminPw = process.env.ADMIN_PASSWORD;
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;

  if (!adminPw) {
    return NextResponse.json({ ok: false, error: '서버 설정: ADMIN_PASSWORD 미설정' }, { status: 500 });
  }
  if (!userId || !token) {
    return NextResponse.json({
      ok: false,
      error: 'Threads 토큰 미설정 — Vercel 환경변수에 THREADS_USER_ID / THREADS_ACCESS_TOKEN 2개를 등록하세요.',
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

  let text = body.customText && body.customText.trim()
    ? body.customText.trim()
    : formatThread({ title: body.title, description: body.description, url: body.url, tags: body.tags });
  if (jLen(text) > THREADS_MAX) text = truncate(text, THREADS_MAX);

  try {
    // ① 미디어 컨테이너 생성 (TEXT)
    const createUrl = new URL(`${API_BASE}/${userId}/threads`);
    createUrl.searchParams.set('media_type', 'TEXT');
    createUrl.searchParams.set('text', text);
    createUrl.searchParams.set('access_token', token);

    const createRes = await fetch(createUrl.toString(), { method: 'POST' });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.id) {
      return NextResponse.json({
        ok: false,
        error: `Threads 컨테이너 생성 실패: ${createJson.error?.message || createRes.status}`,
        text,
      }, { status: 500 });
    }
    const creationId = createJson.id as string;

    // ② 실제 게시
    const publishUrl = new URL(`${API_BASE}/${userId}/threads_publish`);
    publishUrl.searchParams.set('creation_id', creationId);
    publishUrl.searchParams.set('access_token', token);

    const publishRes = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishJson = await publishRes.json();
    if (!publishRes.ok || !publishJson.id) {
      return NextResponse.json({
        ok: false,
        error: `Threads 게시 실패: ${publishJson.error?.message || publishRes.status}`,
        text,
      }, { status: 500 });
    }
    const threadId = publishJson.id as string;

    // 게시 URL — 실제 영구 URL 받으려면 /{thread-id}?fields=permalink 추가 호출
    let threadUrl: string | null = null;
    try {
      const linkRes = await fetch(
        `${API_BASE}/${threadId}?fields=permalink&access_token=${encodeURIComponent(token)}`
      );
      const linkJson = await linkRes.json();
      if (linkJson.permalink) threadUrl = linkJson.permalink;
    } catch { /* permalink 없으면 무시 */ }

    return NextResponse.json({ ok: true, threadId, threadUrl, text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Threads 게시 실패: ${msg}`, text }, { status: 500 });
  }
}
