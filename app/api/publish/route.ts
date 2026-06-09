import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ────────────────────────────────────────────────────────────
   블로그 글 발행 API
   - /admin 작성 페이지에서 POST 로 호출
   - 비밀번호 검증 후, GitHub Git Data API 로 .md + 이미지들을
     단일 커밋으로 SMW-Code/retwork-blog(main) 에 올림
   - Vercel 이 자동 재빌드 → blog.retwork.jp 반영 (~1분)

   필요한 환경변수 (Vercel):
     ADMIN_PASSWORD  : 작성 페이지 비밀번호
     GITHUB_TOKEN    : retwork-blog 에 Contents 쓰기 권한 토큰
     (선택) GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH
   ──────────────────────────────────────────────────────────── */

const OWNER = process.env.GITHUB_OWNER || 'SMW-Code';
const REPO = process.env.GITHUB_REPO || 'retwork-blog';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const GH = 'https://api.github.com';

type FileIn = { path: string; base64: string };
type Body = {
  password: string;
  slug: string;
  markdown: string;
  images: FileIn[];
};

function gh(token: string) {
  return async (url: string, init?: RequestInit) => {
    const res = await fetch(`${GH}${url}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub ${res.status}: ${t.slice(0, 300)}`);
    }
    return res.json();
  };
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  const adminPw = process.env.ADMIN_PASSWORD;

  if (!token || !adminPw) {
    return NextResponse.json(
      { ok: false, error: '서버 설정 미완료: ADMIN_PASSWORD / GITHUB_TOKEN 환경변수를 Vercel 에 등록하세요.' },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: '잘못된 요청 형식' }, { status: 400 });
  }

  // 비밀번호 검증
  if (!body.password || body.password !== adminPw) {
    return NextResponse.json({ ok: false, error: '비밀번호가 틀렸어요.' }, { status: 401 });
  }

  // 입력 검증
  const slug = (body.slug || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json(
      { ok: false, error: '주소(슬러그)는 영문 소문자·숫자·하이픈만, 2자 이상이어야 해요. 예: chogori-jimbocho' },
      { status: 400 }
    );
  }
  if (!body.markdown || body.markdown.length < 10) {
    return NextResponse.json({ ok: false, error: '본문 내용이 너무 짧아요.' }, { status: 400 });
  }

  // 올릴 파일 목록 구성
  const files: { path: string; content: string; encoding: 'utf-8' | 'base64' }[] = [
    { path: `posts/${slug}.md`, content: body.markdown, encoding: 'utf-8' },
  ];
  for (const img of body.images || []) {
    // path 예: public/images/<slug>/main.jpg  (안전 검증)
    if (!/^public\/images\/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(img.path)) continue;
    files.push({ path: img.path, content: img.base64, encoding: 'base64' });
  }

  try {
    const api = gh(token);

    // 1) 현재 main 의 최신 커밋/트리
    const ref = await api(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await api(`/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    // 2) 각 파일 blob 생성
    const treeItems = [];
    for (const f of files) {
      const blob = await api(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: f.encoding }),
      });
      treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // 3) 새 트리
    const tree = await api(`/repos/${OWNER}/${REPO}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });

    // 4) 새 커밋
    const commit = await api(`/repos/${OWNER}/${REPO}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: `post: ${slug} (작성 페이지에서 발행)`,
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    });

    // 5) main 이동
    await api(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    return NextResponse.json({
      ok: true,
      url: `https://blog.retwork.jp/posts/${slug}`,
      commit: commit.sha.slice(0, 7),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `발행 실패: ${msg}` }, { status: 500 });
  }
}
