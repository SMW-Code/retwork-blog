/* ────────────────────────────────────────────────────────────
   GitHub 연동 공용 함수 (글 목록/원문/발행/삭제)
   - GITHUB_TOKEN 으로 SMW-Code/retwork-blog(main) 조작
   ──────────────────────────────────────────────────────────── */

const OWNER = process.env.GITHUB_OWNER || 'SMW-Code';
const REPO = process.env.GITHUB_REPO || 'retwork-blog';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const GH = 'https://api.github.com';

export type PostListItem = { slug: string; title: string; date: string };

async function api(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GH}${path}`, {
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
}

function fmVal(line: string): string {
  const v = line.slice(line.indexOf(':') + 1).trim();
  try { return JSON.parse(v); } catch { return v.replace(/^['"]|['"]$/g, ''); }
}

/* 글 목록 (frontmatter 의 title/date 추출) */
export async function listPosts(token: string): Promise<PostListItem[]> {
  const list = await api(token, `/repos/${OWNER}/${REPO}/contents/posts?ref=${BRANCH}`);
  const md = (list as { name: string; path: string }[]).filter((f) => f.name.endsWith('.md'));
  const items = await Promise.all(
    md.map(async (f) => {
      const slug = f.name.replace(/\.md$/, '');
      let title = slug, date = '';
      try {
        const raw = await getRawPost(token, slug);
        if (raw) {
          for (const line of raw.split('\n')) {
            if (line.startsWith('title:')) title = fmVal(line);
            else if (line.startsWith('date:')) date = fmVal(line);
            else if (line.trim() === '---' && date) break;
          }
        }
      } catch { /* skip */ }
      return { slug, title, date };
    })
  );
  items.sort((a, b) => (a.date < b.date ? 1 : -1));
  return items;
}

/* 글 원문(markdown) */
export async function getRawPost(token: string, slug: string): Promise<string | null> {
  try {
    const f = await api(token, `/repos/${OWNER}/${REPO}/contents/posts/${slug}.md?ref=${BRANCH}`);
    return Buffer.from(f.content, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/* 여러 파일을 단일 커밋으로 추가/수정 */
export async function commitFiles(
  token: string,
  files: { path: string; content: string; encoding: 'utf-8' | 'base64' }[],
  message: string
): Promise<string> {
  const ref = await api(token, `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const baseCommit = await api(token, `/repos/${OWNER}/${REPO}/git/commits/${baseSha}`);
  const baseTree = baseCommit.tree.sha;

  const treeItems = [];
  for (const f of files) {
    const blob = await api(token, `/repos/${OWNER}/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: f.content, encoding: f.encoding }),
    });
    treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await api(token, `/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: treeItems }),
  });
  const commit = await api(token, `/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });
  await api(token, `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}

/* 글 삭제 (.md + 해당 이미지 폴더 전체를 단일 커밋으로) */
export async function deletePost(token: string, slug: string, message: string): Promise<string> {
  const ref = await api(token, `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const baseCommit = await api(token, `/repos/${OWNER}/${REPO}/git/commits/${baseSha}`);
  const baseTree = baseCommit.tree.sha;

  const full = await api(token, `/repos/${OWNER}/${REPO}/git/trees/${baseTree}?recursive=1`);
  const targets = (full.tree as { path: string; type: string }[])
    .filter((t) => t.type === 'blob' && (t.path === `posts/${slug}.md` || t.path.startsWith(`public/images/${slug}/`)))
    .map((t) => t.path);

  if (targets.length === 0) throw new Error('해당 글을 찾을 수 없어요.');

  const tree = await api(token, `/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTree,
      tree: targets.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
    }),
  });
  const commit = await api(token, `/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });
  await api(token, `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}
