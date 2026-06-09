import { NextRequest, NextResponse } from 'next/server';
import { commitFiles } from '../../../lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* 블로그 글 발행/수정 — /admin 에서 호출. 비번 검증 후 GitHub 커밋. */

type FileIn = { path: string; base64: string };
type Body = { password: string; slug: string; markdown: string; images: FileIn[] };

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!token || !adminPw) {
    return NextResponse.json({ ok: false, error: '서버 설정 미완료: ADMIN_PASSWORD / GITHUB_TOKEN 환경변수를 Vercel 에 등록하세요.' }, { status: 500 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: '잘못된 요청 형식' }, { status: 400 }); }

  if (!body.password || body.password !== adminPw) {
    return NextResponse.json({ ok: false, error: '비밀번호가 틀렸어요.' }, { status: 401 });
  }

  const slug = (body.slug || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ ok: false, error: '주소(슬러그)는 영문 소문자·숫자·하이픈만, 2자 이상이어야 해요.' }, { status: 400 });
  }
  if (!body.markdown || body.markdown.length < 10) {
    return NextResponse.json({ ok: false, error: '본문 내용이 너무 짧아요.' }, { status: 400 });
  }

  const files: { path: string; content: string; encoding: 'utf-8' | 'base64' }[] = [
    { path: `posts/${slug}.md`, content: body.markdown, encoding: 'utf-8' },
  ];
  for (const img of body.images || []) {
    if (!/^public\/images\/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(img.path)) continue;
    files.push({ path: img.path, content: img.base64, encoding: 'base64' });
  }

  try {
    const sha = await commitFiles(token, files, `post: ${slug} (작성 페이지에서 발행)`);
    return NextResponse.json({ ok: true, url: `https://blog.retwork.jp/posts/${slug}`, commit: sha.slice(0, 7) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `발행 실패: ${msg}` }, { status: 500 });
  }
}
