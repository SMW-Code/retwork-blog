import { NextRequest, NextResponse } from 'next/server';
import { getRawPost } from '../../../lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* 글 원문(markdown) — /admin 에서 수정하려고 불러올 때 */
export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!token || !adminPw) {
    return NextResponse.json({ ok: false, error: '서버 설정 미완료(환경변수).' }, { status: 500 });
  }
  let body: { password?: string; slug?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (body.password !== adminPw) {
    return NextResponse.json({ ok: false, error: '비밀번호가 틀렸어요.' }, { status: 401 });
  }
  const slug = (body.slug || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ ok: false, error: '잘못된 주소(슬러그).' }, { status: 400 });
  }
  try {
    const markdown = await getRawPost(token, slug);
    if (markdown === null) return NextResponse.json({ ok: false, error: '글을 찾을 수 없어요.' }, { status: 404 });
    return NextResponse.json({ ok: true, markdown });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `불러오기 실패: ${msg}` }, { status: 500 });
  }
}
