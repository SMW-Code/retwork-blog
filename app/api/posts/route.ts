import { NextRequest, NextResponse } from 'next/server';
import { listPosts } from '../../../lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* 글 목록 — /admin 글 목록 탭에서 호출 */
export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!token || !adminPw) {
    return NextResponse.json({ ok: false, error: '서버 설정 미완료(환경변수).' }, { status: 500 });
  }
  let body: { password?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (body.password !== adminPw) {
    return NextResponse.json({ ok: false, error: '비밀번호가 틀렸어요.' }, { status: 401 });
  }
  try {
    const posts = await listPosts(token);
    return NextResponse.json({ ok: true, posts });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `목록 불러오기 실패: ${msg}` }, { status: 500 });
  }
}
