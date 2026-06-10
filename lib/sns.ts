/* ────────────────────────────────────────────────────────────
   SNS 게시 로직 — X (트위터) + Threads 공통 모듈
   /api/sns/x · /api/sns/threads · /api/sns/share-by-slug 가 공유
   ──────────────────────────────────────────────────────────── */

import { TwitterApi } from 'twitter-api-v2';

// ─── 글자수 헬퍼 ───────────────────────────────────────────────
export function jLen(s: string): number { return [...(s || '')].length; }
export function truncate(s: string, max: number): string {
  if (!s) return '';
  if (jLen(s) <= max) return s;
  return [...s].slice(0, Math.max(0, max - 1)).join('') + '…';
}

// ─── 자동 메시지 생성 ───────────────────────────────────────────

/** X 280자 — URL 은 t.co 단축으로 23자 차지 */
export function formatTweet(opts: { title: string; description?: string; url: string; tags?: string[] }): string {
  const { title, description, url, tags = [] } = opts;
  const TWEET_MAX = 280, URL_LEN = 23;
  const tagText = tags.slice(0, 4).map((t) => `#${String(t).replace(/\s+/g, '')}`).join(' ');
  const fixed = URL_LEN + 4 + (tagText ? 1 + jLen(tagText) : 0);
  const free = TWEET_MAX - fixed;
  const titleClipped = truncate(title || '', Math.min(80, free - 2));
  let body = titleClipped;
  const rest = free - jLen(body);
  if (description && rest > 12) body += '\n\n' + truncate(description, rest - 2);
  return [body, `→ ${url}`, tagText].filter(Boolean).join('\n\n').trim();
}

/** Threads 500자 — URL 단축 없음 */
export function formatThread(opts: { title: string; description?: string; url: string; tags?: string[] }): string {
  const { title, description, url, tags = [] } = opts;
  const MAX = 500;
  const tagText = tags.slice(0, 6).map((t) => `#${String(t).replace(/\s+/g, '')}`).join(' ');
  const urlBlock = `\n\n→ ${url}`;
  const tagBlock = tagText ? `\n\n${tagText}` : '';
  const free = MAX - jLen(urlBlock) - jLen(tagBlock);
  const titleClipped = truncate(title || '', Math.min(140, free - 2));
  let body = titleClipped;
  const rest = free - jLen(body);
  if (description && rest > 20) body += '\n\n' + truncate(description, rest - 2);
  return body + urlBlock + tagBlock;
}

// ─── 게시 실행 ─────────────────────────────────────────────────

export type XResult = { ok: boolean; tweetId?: string; tweetUrl?: string; error?: string; text?: string };
export type ThreadsResult = { ok: boolean; threadId?: string; threadUrl?: string; error?: string; text?: string };

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

/** X 게시 — 환경변수 4개 사용 */
export async function postToX(text: string): Promise<XResult> {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return { ok: false, error: 'X API 토큰 미설정 (X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET)', text };
  }
  let safeText = text;
  if (jLen(safeText) > 280) safeText = truncate(safeText, 280);
  try {
    const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });
    const result = await client.v2.tweet(safeText);
    const id = result.data?.id;
    return {
      ok: true,
      tweetId: id,
      tweetUrl: id ? `https://x.com/i/web/status/${id}` : undefined,
      text: safeText,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), text: safeText };
  }
}

/** Threads 게시 — 2단계 (컨테이너 생성 + 게시) */
export async function postToThreads(text: string): Promise<ThreadsResult> {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !token) {
    return { ok: false, error: 'Threads 토큰 미설정 (THREADS_USER_ID/THREADS_ACCESS_TOKEN)', text };
  }
  let safeText = text;
  if (jLen(safeText) > 500) safeText = truncate(safeText, 500);
  try {
    // 1) 컨테이너 생성
    const createUrl = new URL(`${THREADS_API_BASE}/${userId}/threads`);
    createUrl.searchParams.set('media_type', 'TEXT');
    createUrl.searchParams.set('text', safeText);
    createUrl.searchParams.set('access_token', token);
    const createRes = await fetch(createUrl.toString(), { method: 'POST' });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.id) {
      return {
        ok: false,
        error: `Threads 컨테이너 생성 실패: ${createJson.error?.message || createRes.status}`,
        text: safeText,
      };
    }
    const creationId = createJson.id as string;

    // 2) 실제 게시
    const publishUrl = new URL(`${THREADS_API_BASE}/${userId}/threads_publish`);
    publishUrl.searchParams.set('creation_id', creationId);
    publishUrl.searchParams.set('access_token', token);
    const publishRes = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishJson = await publishRes.json();
    if (!publishRes.ok || !publishJson.id) {
      return {
        ok: false,
        error: `Threads 게시 실패: ${publishJson.error?.message || publishRes.status}`,
        text: safeText,
      };
    }
    const threadId = publishJson.id as string;

    // 3) permalink 조회 (실패해도 무시)
    let threadUrl: string | undefined;
    try {
      const linkRes = await fetch(
        `${THREADS_API_BASE}/${threadId}?fields=permalink&access_token=${encodeURIComponent(token)}`
      );
      const linkJson = await linkRes.json();
      if (linkJson.permalink) threadUrl = linkJson.permalink as string;
    } catch { /* ignore */ }

    return { ok: true, threadId, threadUrl, text: safeText };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), text: safeText };
  }
}
