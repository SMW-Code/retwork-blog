import { NextRequest, NextResponse } from 'next/server';
import { deletePost } from '../../../lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* 글 삭제 — /admin 글 목록에서 삭제 버튼 */
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
    const sha = await deletePost(token, slug, `delete: ${slug} (작성 페이지에서 삭제)`);
    return NextResponse.json({ ok: true, commit: sha.slice(0, 7) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `삭제 실패: ${msg}` }, { status: 500 });
  }
}
