'use client';

import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  THEMES, THEME_KEYS, DEFAULT_THEME, isThemeKey,
  resolveColor, resolveCardBg, isHexColor,
  type ThemeKey,
} from '../../lib/themes';

/* ────────────────────────────────────────────────────────────
   /admin — 그루메 블로그 글쓰기 (작성 / 목록 / 수정 / 삭제)
   ──────────────────────────────────────────────────────────── */

type BlockType = 'heading' | 'text' | 'card' | 'quote' | 'image' | 'line';
type FontKind = 'sans' | 'serif';
type WeightKind = 'thin' | 'normal' | 'bold' | 'extra';
type Block = {
  id: number; type: BlockType; text: string;
  file?: File; preview?: string; existingUrl?: string;
  // 강조 카드의 배경/보더 색 (테마키 or hex)
  color?: string;
  // 폰트 옵션 (heading / text / card 에서 사용)
  font?: FontKind;
  size?: number;        // px
  weight?: WeightKind;
  textColor?: string;   // 테마키 or hex
  // 라인 전용
  lineColor?: string;   // 테마키 or hex
};
type PostItem = { slug: string; title: string; date: string };

const TYPE_NAME: Record<BlockType, string> = {
  heading: '소제목', text: '본문', card: '강조 카드', quote: '인용', image: '이미지', line: '라인',
};
const FONT_FAMILY: Record<FontKind, string> = {
  sans: "var(--font-ui)",
  serif: "var(--font-jp)",
};
const WEIGHT_VAL: Record<WeightKind, number> = {
  thin: 300, normal: 400, bold: 700, extra: 900,
};
const WEIGHT_LABEL: Record<WeightKind, string> = {
  thin: '얇게', normal: '표준', bold: '두껍게', extra: '매우두껍게',
};
const SIZES = [12, 14, 16, 18, 20, 22, 24, 28];

/* 블록의 스타일 옵션을 inline style 객체로 변환 (미리보기/렌더용) */
function blockStyle(b: Block): CSSProperties {
  const s: CSSProperties = {};
  if (b.font) s.fontFamily = FONT_FAMILY[b.font];
  if (b.size) s.fontSize = `${b.size}px`;
  if (b.weight) s.fontWeight = WEIGHT_VAL[b.weight];
  if (b.textColor) {
    const c = resolveColor(b.textColor);
    if (c) s.color = c;
  }
  return s;
}
/* 블록의 옵션을 markdown용 inline style 문자열로 직렬화 */
function blockStyleStr(b: Block): string {
  const parts: string[] = [];
  if (b.font) parts.push(`font-family:${FONT_FAMILY[b.font]}`);
  if (b.size) parts.push(`font-size:${b.size}px`);
  if (b.weight) parts.push(`font-weight:${WEIGHT_VAL[b.weight]}`);
  if (b.textColor) {
    const c = resolveColor(b.textColor);
    if (c) parts.push(`color:${c}`);
  }
  return parts.join(';');
}
/* style="font-size:20px;color:#xxx" → block 옵션으로 역파싱 */
function parseStyleAttr(style: string): Partial<Block> {
  const o: Partial<Block> = {};
  const m1 = style.match(/font-size\s*:\s*(\d+)px/i); if (m1) o.size = parseInt(m1[1], 10);
  const m2 = style.match(/font-weight\s*:\s*(\d{3})/i);
  if (m2) {
    const n = parseInt(m2[1], 10);
    o.weight = n >= 900 ? 'extra' : n >= 700 ? 'bold' : n >= 400 ? 'normal' : 'thin';
  }
  const m3 = style.match(/font-family\s*:\s*var\(--font-(ui|jp)\)/i);
  if (m3) o.font = m3[1] === 'jp' ? 'serif' : 'sans';
  const m4 = style.match(/color\s*:\s*(#[0-9A-Fa-f]{3,8})/i);
  if (m4) o.textColor = m4[1];
  return o;
}

function jLen(s: string) { return [...(s || '')].length; }
function extOf(f: File) {
  const t = f.type;
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/gif') return 'gif';
  return 'jpg';
}
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function esc(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function unesc(s: string) { return (s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }

/* 업로드 전 이미지 자동 압축
   - 최대 변 1600px (작으면 그대로)
   - JPEG quality 85
   - 5MB 사진 → 보통 200~500KB
   - Vercel API Route 의 4.5MB 본문 한계 회피 */
function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); resolve(file); return; }
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) { resolve(file); return; }
          if (blob.size >= file.size) { resolve(file); return; }  // 원본이 더 작으면 그대로
          const newName = file.name.replace(/\.\w+$/, '') + '.jpg';
          resolve(new File([blob], newName, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* X 280자 메시지 미리보기 — 서버 /api/sns/x 의 formatTweet 와 동일 로직 */
function previewTweet({ title, description, url, tags }: { title: string; description: string; url: string; tags: string[] }): string {
  const TWEET_MAX = 280, URL_LEN = 23;
  if (!title) return '';
  const tagText = tags.slice(0, 4).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
  const fixed = URL_LEN + 4 + (tagText ? 1 + jLen(tagText) : 0);
  const free = TWEET_MAX - fixed;
  const titleClipped = clip(title, Math.min(80, free - 2));
  let body = titleClipped;
  const rest = free - jLen(body);
  if (description && rest > 12) body += '\n\n' + clip(description, rest - 2);
  return [body, `→ ${url}`, tagText].filter(Boolean).join('\n\n').trim();
}
/* Threads 500자 메시지 미리보기 — 서버 /api/sns/threads 의 formatThread 와 동일 */
function previewThread({ title, description, url, tags }: { title: string; description: string; url: string; tags: string[] }): string {
  const MAX = 500;
  if (!title) return '';
  const tagText = tags.slice(0, 6).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
  const urlBlock = `\n\n→ ${url}`;
  const tagBlock = tagText ? `\n\n${tagText}` : '';
  const free = MAX - jLen(urlBlock) - jLen(tagBlock);
  const titleClipped = clip(title, Math.min(140, free - 2));
  let body = titleClipped;
  const rest = free - jLen(body);
  if (description && rest > 20) body += '\n\n' + clip(description, rest - 2);
  return body + urlBlock + tagBlock;
}
function clip(s: string, max: number): string {
  if (jLen(s) <= max) return s;
  return [...s].slice(0, Math.max(0, max - 1)).join('') + '…';
}

/* markdown(원문) → 필드 + 블록 으로 역파싱 (수정용) */
function parseMarkdown(md: string) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const fm: Record<string, unknown> = {};
  let body = md;
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':'); if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v: unknown = line.slice(i + 1).trim();
      try { v = JSON.parse(v as string); } catch { v = (v as string).replace(/^['"]|['"]$/g, ''); }
      fm[k] = v;
    }
  }
  const chunks = body.trim().split(/\r?\n\r?\n+/);
  const blocks: Block[] = [];
  let idc = 1;
  for (let raw of chunks) {
    raw = raw.trim(); if (!raw) continue;
    let blk: Omit<Block, 'id'>;
    if (raw.startsWith('## ')) {
      // <h2> 또는 ## — 인라인 style 옵션 지원
      const mh = raw.match(/^<h2(?:\s+class="[^"]*")?(?:\s+style="([^"]*)")?\s*>([\s\S]*?)<\/h2>$/);
      if (mh) {
        blk = { type: 'heading', text: mh[2].replace(/<br\s*\/?>/g, '\n'), ...parseStyleAttr(mh[1] || '') };
      } else {
        blk = { type: 'heading', text: raw.slice(3).trim() };
      }
    }
    else if (/^<h2/.test(raw)) {
      const mh = raw.match(/^<h2(?:\s+class="[^"]*")?(?:\s+style="([^"]*)")?\s*>([\s\S]*?)<\/h2>$/);
      blk = { type: 'heading', text: mh ? mh[2].replace(/<br\s*\/?>/g, '\n') : raw, ...(mh ? parseStyleAttr(mh[1] || '') : {}) };
    }
    else if (/^<hr/i.test(raw)) {
      // <hr class="line" style="border-color:#xxx" /> 또는 인라인
      const mhr = raw.match(/^<hr(?:\s+class="[^"]*")?(?:\s+style="([^"]*)")?\s*\/?>$/i);
      const st = mhr?.[1] || '';
      const mc = st.match(/border-(?:top-)?color\s*:\s*(#[0-9A-Fa-f]{3,8})/i);
      const cls = raw.match(/class="line(?:\s+line-color-([a-z]+))?/);
      blk = { type: 'line', text: '', lineColor: cls?.[1] || mc?.[1] || undefined };
    }
    else if (/^<div class="callout/.test(raw)) {
      // 색상 추출 (테마키 또는 인라인 style 의 hex)
      const mc = raw.match(/^<div class="callout(?:\s+callout-color-([a-z]+))?"(?:\s+style="([^"]*)")?\s*>([\s\S]*?)<\/div>\s*$/);
      const colorKey = mc?.[1];
      const styleAttr = mc?.[2] || '';
      const inner = mc?.[3] || raw.replace(/^<div class="callout[^"]*"[^>]*>/, '').replace(/<\/div>\s*$/, '');
      // 카드 배경색: 테마키 우선, 없으면 style 의 background 색
      let cardColor: string | undefined = undefined;
      if (isThemeKey(colorKey)) cardColor = colorKey;
      else {
        const mb = styleAttr.match(/background(?:-color)?\s*:\s*(#[0-9A-Fa-f]{3,8})/i);
        if (mb) cardColor = mb[1].slice(0, 7); // alpha 떼고 6자리 hex 만
      }
      blk = {
        type: 'card',
        text: unesc(inner.replace(/<br\s*\/?>/g, '\n')),
        color: cardColor,
        ...parseStyleAttr(styleAttr),
      };
    }
    else if (/^<p\s/.test(raw)) {
      // 스타일 있는 본문 단락 <p style="...">텍스트</p>
      const mp = raw.match(/^<p(?:\s+style="([^"]*)")?\s*>([\s\S]*?)<\/p>$/);
      blk = { type: 'text', text: mp ? mp[2].replace(/<br\s*\/?>/g, '\n') : raw, ...(mp ? parseStyleAttr(mp[1] || '') : {}) };
    }
    else if (/^!\[[^\]]*\]\([^)]*\)$/.test(raw)) {
      const mm = raw.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
      blk = { type: 'image', text: mm ? mm[1] : '', existingUrl: mm ? mm[2] : '' };
    } else if (raw.startsWith('>'))
      blk = { type: 'quote', text: raw.split(/\r?\n/).map((l) => l.replace(/^>\s?/, '')).join('\n') };
    else blk = { type: 'text', text: raw };
    blocks.push({ id: idc++, ...blk });
  }
  return { fm, blocks, nextId: idc };
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [entered, setEntered] = useState(false);
  const [mode, setMode] = useState<'edit' | 'list'>('edit');

  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [hero, setHero] = useState<File | undefined>();
  const [heroPreview, setHeroPreview] = useState('');
  const [heroExistingUrl, setHeroExistingUrl] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [nextId, setNextId] = useState(1);
  const [date] = useState(() => new Date().toISOString().slice(0, 10));
  const [theme, setTheme] = useState<ThemeKey>(DEFAULT_THEME);   // 글 전체 테마색

  const [status, setStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resultUrl, setResultUrl] = useState('');

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [mdExpanded, setMdExpanded] = useState(false);
  const [mdPreview, setMdPreview] = useState('');
  // X 자동 게시 옵션
  const [snsX, setSnsX] = useState(true);
  const [snsXCustom, setSnsXCustom] = useState('');
  const [snsXEditOpen, setSnsXEditOpen] = useState(false);
  const [snsXResult, setSnsXResult] = useState<{ ok: boolean; tweetUrl?: string | null; error?: string; text?: string } | null>(null);
  // Threads 자동 게시 옵션
  const [snsThreads, setSnsThreads] = useState(true);
  const [snsThreadsCustom, setSnsThreadsCustom] = useState('');
  const [snsThreadsEditOpen, setSnsThreadsEditOpen] = useState(false);
  const [snsThreadsResult, setSnsThreadsResult] = useState<{ ok: boolean; threadUrl?: string | null; error?: string; text?: string } | null>(null);
  // 이미지 편집 (회전/자르기) — null = 닫힘, 'hero' = 대표 이미지, 숫자 = 블록 id
  const [editingImg, setEditingImg] = useState<number | 'hero' | null>(null);

  const tags = tagsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  /* ---- 블록 ---- */
  function addBlock(type: BlockType) {
    setBlocks((b) => [...b, {
      id: nextId, type, text: '',
      ...(type === 'card' ? { color: theme } : {}),
      ...(type === 'line' ? { lineColor: theme } : {}),
    }]);
    setNextId((n) => n + 1);
  }
  function setText(id: number, v: string) { setBlocks((b) => b.map((x) => (x.id === id ? { ...x, text: v } : x))); }
  function patchBlock(id: number, patch: Partial<Block>) {
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function setBlockColor(id: number, c: string) { patchBlock(id, { color: c }); }
  async function setBlockFile(id: number, f?: File) {
    if (!f) {
      setBlocks((b) => b.map((x) => (x.id === id ? { ...x, file: undefined } : x)));
      return;
    }
    const compressed = await compressImage(f);
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, file: compressed, preview: URL.createObjectURL(compressed) } : x)));
  }
  function rmBlock(id: number) { setBlocks((b) => b.filter((x) => x.id !== id)); }
  function move(id: number, d: number) {
    setBlocks((b) => { const i = b.findIndex((x) => x.id === id); const j = i + d; if (i < 0 || j < 0 || j >= b.length) return b; const c = [...b]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  }
  async function pickHero(f?: File) {
    if (!f) { setHero(undefined); setHeroPreview(''); return; }
    const compressed = await compressImage(f);
    setHero(compressed);
    setHeroPreview(URL.createObjectURL(compressed));
  }

  /* ---- 새 글 / 목록 ---- */
  function newPost() {
    setEditingSlug(null); setSlug(''); setTitle(''); setDesc(''); setTagsRaw('');
    setHero(undefined); setHeroPreview(''); setHeroExistingUrl(''); setBlocks([]); setNextId(1);
    setTheme(DEFAULT_THEME);
    setStatus('idle'); setMessage(''); setMode('edit');
    setSnsX(true); setSnsXResult(null);   // 새 글: X 자동 게시 기본 ON
    setSnsThreads(true); setSnsThreadsResult(null);
  }
  async function loadList() {
    setMode('list'); setListLoading(true); setListError('');
    try {
      const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!data.ok) { setListError(data.error || '실패'); setPosts([]); }
      else setPosts(data.posts);
    } catch (e) { setListError(e instanceof Error ? e.message : String(e)); }
    setListLoading(false);
  }
  async function editPost(s: string) {
    try {
      const res = await fetch('/api/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, slug: s }) });
      const data = await res.json();
      if (!data.ok) { alert(data.error); return; }
      const p = parseMarkdown(data.markdown);
      setEditingSlug(s); setSlug(s);
      setTitle((p.fm.title as string) || '');
      setDesc((p.fm.description as string) || '');
      setTagsRaw(Array.isArray(p.fm.tags) ? (p.fm.tags as string[]).join(', ') : (p.fm.tags as string) || '');
      setHero(undefined); setHeroPreview(''); setHeroExistingUrl((p.fm.image as string) || '');
      setBlocks(p.blocks); setNextId(p.nextId);
      setTheme(isThemeKey(p.fm.theme) ? p.fm.theme : DEFAULT_THEME);
      setStatus('idle'); setMessage(''); setMode('edit');
      setSnsX(false); setSnsXResult(null);   // 수정 모드: X 자동 게시 기본 OFF (중복 차단 회피)
      setSnsThreads(false); setSnsThreadsResult(null);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }
  /* 기존 글 SNS 재공유 — /api/sns/share-by-slug 호출 */
  async function shareToSns(s: string, platforms: ('x' | 'threads')[]) {
    const label = platforms.join(' + ');
    if (!window.confirm(`'${s}' 글을 ${label} 에 게시할까요?\n같은 내용 중복 시 X 는 403 거부될 수 있어요.`)) return;
    try {
      const res = await fetch('/api/sns/share-by-slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, slug: s, platforms }),
      });
      const data = await res.json();
      const msgs: string[] = [];
      if (data.results?.x) {
        msgs.push(data.results.x.ok
          ? `🐦 X 게시 OK → ${data.results.x.tweetUrl}`
          : `🐦 X 실패: ${data.results.x.error}`);
      }
      if (data.results?.threads) {
        msgs.push(data.results.threads.ok
          ? `🧵 Threads 게시 OK${data.results.threads.threadUrl ? ' → ' + data.results.threads.threadUrl : ''}`
          : `🧵 Threads 실패: ${data.results.threads.error}`);
      }
      if (!msgs.length) msgs.push(data.error || '응답 없음');
      window.alert((data.ok ? '✅ ' : '⚠️ ') + msgs.join('\n'));
    } catch (e) {
      window.alert('❌ 요청 실패: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function delPost(s: string) {
    if (!window.confirm(`'${s}' 글을 삭제할까요?\n되돌릴 수 없어요. (이미지도 같이 삭제)`)) return;
    try {
      const res = await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, slug: s }) });
      const data = await res.json();
      if (!data.ok) { alert(data.error); return; }
      loadList();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }

  /* ---- 빌드 + 발행 ---- */
  async function buildPost() {
    const images: { path: string; base64: string }[] = [];
    let heroPath = '';
    if (hero) { const ext = extOf(hero); heroPath = `/images/${slug}/main.${ext}`; images.push({ path: `public${heroPath}`, base64: await fileToBase64(hero) }); }
    else if (heroExistingUrl) heroPath = heroExistingUrl;

    const parts: string[] = [];
    for (const b of blocks) {
      const sStr = blockStyleStr(b);
      if (b.type === 'heading') {
        if (sStr) parts.push(`<h2 style="${sStr}">${esc(b.text || '').replace(/\n/g, '<br>')}</h2>`);
        else parts.push(`## ${b.text || ''}`);
      }
      else if (b.type === 'text') {
        if (sStr) parts.push(`<p style="${sStr}">${esc(b.text || '').replace(/\n/g, '<br>')}</p>`);
        else parts.push(b.text || '');
      }
      else if (b.type === 'card') {
        // 카드 색상: 테마키면 클래스, hex면 인라인 style (배경/보더)
        let cls = 'callout';
        let cardStyle = sStr;
        if (b.color) {
          if (isThemeKey(b.color)) cls += ` callout-color-${b.color}`;
          else if (isHexColor(b.color)) {
            const bg = resolveCardBg(b.color);
            const bd = resolveColor(b.color);
            cardStyle = [`background:${bg}`, `border-left-color:${bd}`, sStr].filter(Boolean).join(';');
          }
        }
        const styleAttr = cardStyle ? ` style="${cardStyle}"` : '';
        parts.push(`<div class="${cls}"${styleAttr}>${esc(b.text || '').replace(/\n/g, '<br>')}</div>`);
      }
      else if (b.type === 'line') {
        if (b.lineColor && isThemeKey(b.lineColor)) {
          parts.push(`<hr class="line line-color-${b.lineColor}" />`);
        } else if (b.lineColor && isHexColor(b.lineColor)) {
          parts.push(`<hr class="line" style="border-top-color:${b.lineColor}" />`);
        } else {
          parts.push(`<hr class="line" />`);
        }
      }
      else if (b.type === 'quote') parts.push(`> ${(b.text || '').replace(/\n/g, '\n> ')}`);
      else if (b.type === 'image') {
        const alt = (b.text || '').replace(/[[\]]/g, '');
        if (b.file) { const ext = extOf(b.file); const p = `/images/${slug}/img-${b.id}.${ext}`; images.push({ path: `public${p}`, base64: await fileToBase64(b.file) }); parts.push(`![${alt}](${p})`); }
        else if (b.existingUrl) parts.push(`![${alt}](${b.existingUrl})`);
      }
    }
    const fm = [
      '---', `title: ${JSON.stringify(title)}`, `date: ${JSON.stringify(date)}`,
      `description: ${JSON.stringify(desc)}`, `image: ${JSON.stringify(heroPath)}`,
      `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`, `author: ${JSON.stringify('RetWork編集部')}`,
      `theme: ${JSON.stringify(theme)}`,
      '---', '',
    ].join('\n');
    return { markdown: fm + parts.join('\n\n') + '\n', images };
  }

  const slugOk = /^[a-z0-9][a-z0-9-]{1,80}$/.test(slug);
  const bodyLen = blocks.filter((b) => b.type === 'text' || b.type === 'card').reduce((a, b) => a + jLen(b.text), 0);
  const canPublish = slugOk && !!title.trim() && !!desc.trim() && bodyLen >= 50;

  async function publish() {
    if (!canPublish) { setStatus('error'); setMessage('제목/주소/검색설명/본문을 채워주세요. (본문 50자 이상)'); return; }
    setStatus('publishing'); setMessage(''); setSnsXResult(null); setSnsThreadsResult(null);
    try {
      const { markdown, images } = await buildPost();
      const res = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, slug, markdown, images }) });
      const data = await res.json();
      if (!data.ok) { setStatus('error'); setMessage(data.error || '발행 실패'); return; }
      setStatus('done'); setResultUrl(data.url); setEditingSlug(slug);

      const postUrl = data.url || `https://blog.retwork.jp/posts/${slug}`;
      const commonPayload = { password, title, description: desc, url: postUrl, tags };

      // 발행 성공 후 SNS 자동 게시 (병렬)
      const tasks: Promise<unknown>[] = [];
      if (snsX) {
        tasks.push(
          fetch('/api/sns/x', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...commonPayload, customText: snsXEditOpen ? snsXCustom : undefined }),
          }).then((r) => r.json()).then((xd) => setSnsXResult(xd))
            .catch((e) => setSnsXResult({ ok: false, error: e instanceof Error ? e.message : String(e) }))
        );
      }
      if (snsThreads) {
        tasks.push(
          fetch('/api/sns/threads', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...commonPayload, customText: snsThreadsEditOpen ? snsThreadsCustom : undefined }),
          }).then((r) => r.json()).then((td) => setSnsThreadsResult(td))
            .catch((e) => setSnsThreadsResult({ ok: false, error: e instanceof Error ? e.message : String(e) }))
        );
      }
      await Promise.all(tasks);
    } catch (e) { setStatus('error'); setMessage(e instanceof Error ? e.message : String(e)); }
  }

  const checks = [
    { ok: jLen(title) >= 12 && jLen(title) <= 40, label: '제목 길이', g: '검색에 딱 좋아요', b: '12~40자로' },
    { ok: jLen(desc) >= 60 && jLen(desc) <= 120, label: '검색 설명', g: '잘 작성됐어요', b: '60~120자로' },
    { ok: tags.length >= 2, label: '태그(키워드)', g: `${tags.length}개`, b: '2개 이상' },
    { ok: !!hero || !!heroExistingUrl, label: '대표 이미지', g: 'SNS 공유 OK', b: '추가 권장' },
    { ok: bodyLen >= 150, label: '본문 분량', g: '충분해요', b: '더 작성' },
  ];
  const seoScore = Math.round(checks.filter((c) => c.ok).length / checks.length * 100);

  /* ════════ 게이트 ════════ */
  if (!entered) {
    return (
      <div className="adm-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Style />
        <div className="adm-panel" style={{ maxWidth: 360, width: '90%' }}>
          <h2 className="adm-h">🔒 글쓰기 페이지</h2>
          <p className="adm-desc">관리자 비밀번호를 입력하세요.</p>
          <input className="adm-in" type="password" value={password} placeholder="비밀번호"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && password) setEntered(true); }} />
          <button className="adm-btn primary" style={{ width: '100%', marginTop: 12 }} disabled={!password} onClick={() => setEntered(true)}>들어가기</button>
          <p className="adm-desc" style={{ marginTop: 10, fontSize: 11 }}>※ 비밀번호는 발행할 때 서버에서 확인돼요.</p>
        </div>
      </div>
    );
  }

  /* ════════ 상단 바 ════════ */
  const TopBar = (
    <div className="adm-top">
      <b>✍️ RetWork 그루메 블로그</b>
      <div className="adm-tabs">
        <button className={`adm-tab ${mode === 'edit' ? 'on' : ''}`} onClick={() => (editingSlug || blocks.length ? setMode('edit') : newPost())}>
          {editingSlug ? '✏️ 수정 중' : '✏️ 새 글'}
        </button>
        <button className={`adm-tab ${mode === 'list' ? 'on' : ''}`} onClick={loadList}>📋 글 목록</button>
      </div>
      {mode === 'edit' && (
        <button className="adm-btn primary" style={{ marginLeft: 'auto' }} disabled={status === 'publishing'} onClick={publish}>
          {status === 'publishing' ? '발행 중…' : editingSlug ? '🚀 수정 발행' : '🚀 발행하기'}
        </button>
      )}
      {mode === 'list' && (
        <button className="adm-btn primary" style={{ marginLeft: 'auto' }} onClick={newPost}>＋ 새 글 쓰기</button>
      )}
    </div>
  );

  /* ════════ 목록 화면 ════════ */
  if (mode === 'list') {
    return (
      <div className="adm-root">
        <Style />{TopBar}
        <div className="adm-wrap" style={{ gridTemplateColumns: '1fr', maxWidth: 760 }}>
          <div className="adm-panel">
            <h2 className="adm-h">📋 글 목록 {listLoading && <span className="adm-desc">불러오는 중…</span>}</h2>
            {listError && <div className="adm-banner bad" style={{ borderRadius: 8 }}>⚠️ {listError}</div>}
            {!listLoading && !listError && posts.length === 0 && <p className="adm-desc">글이 없어요.</p>}
            {posts.map((p) => (
              <div className="adm-listrow" key={p.slug}>
                <div style={{ minWidth: 0 }}>
                  <div className="adm-lt">{p.title}</div>
                  <div className="adm-ls">{p.date} · /posts/{p.slug}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <a className="adm-btn mini" href={`/posts/${p.slug}`} target="_blank" rel="noopener">보기</a>
                  <button className="adm-btn mini" onClick={() => editPost(p.slug)}>수정</button>
                  <button className="adm-btn mini" title="X 에 게시" onClick={() => shareToSns(p.slug, ['x'])}>X</button>
                  <button className="adm-btn mini" title="Threads 에 게시" onClick={() => shareToSns(p.slug, ['threads'])}>Threads</button>
                  <button className="adm-btn mini" title="X + Threads 동시 게시" onClick={() => shareToSns(p.slug, ['x', 'threads'])}>X + Threads</button>
                  <button className="adm-btn mini danger" onClick={() => delPost(p.slug)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ════════ 에디터 화면 ════════ */
  const heroSrc = heroPreview || heroExistingUrl;
  const themeObj = THEMES[theme];
  // 에디터 전체에 선택한 테마색을 라이브 반영 (--accent / --accent-dark)
  const rootStyle = {
    '--accent': themeObj.color,
    '--accent-dark': themeObj.dark,
  } as CSSProperties;
  // 편집 중인 이미지의 File 객체와 적용 콜백
  const editingFile: File | null = editingImg === 'hero'
    ? hero || null
    : typeof editingImg === 'number'
      ? blocks.find((b) => b.id === editingImg)?.file || null
      : null;
  function applyEditedFile(newFile: File) {
    if (editingImg === 'hero') {
      pickHero(newFile);
    } else if (typeof editingImg === 'number') {
      setBlockFile(editingImg, newFile);
    }
    setEditingImg(null);
  }

  return (
    <div className="adm-root" style={rootStyle}>
      <Style />{TopBar}
      {editingFile && (
        <ImageEditor
          file={editingFile}
          onApply={applyEditedFile}
          onCancel={() => setEditingImg(null)}
        />
      )}
      {editingSlug && <div className="adm-banner edit">✏️ 기존 글 수정 중: <b>{editingSlug}</b> (발행하면 덮어써져요)</div>}
      {status === 'done' && <div className="adm-banner ok">✅ 발행됐어요! 약 1분 후 반영 → <a href={resultUrl} target="_blank" rel="noopener">{resultUrl}</a></div>}
      {snsXResult && snsXResult.ok && (
        <div className="adm-banner ok">🐦 X 게시 완료 → <a href={snsXResult.tweetUrl || '#'} target="_blank" rel="noopener">{snsXResult.tweetUrl}</a></div>
      )}
      {snsXResult && !snsXResult.ok && (
        <div className="adm-banner bad">🐦 X 게시 실패: {snsXResult.error}</div>
      )}
      {snsThreadsResult && snsThreadsResult.ok && (
        <div className="adm-banner ok">🧵 Threads 게시 완료 {snsThreadsResult.threadUrl && <>→ <a href={snsThreadsResult.threadUrl} target="_blank" rel="noopener">{snsThreadsResult.threadUrl}</a></>}</div>
      )}
      {snsThreadsResult && !snsThreadsResult.ok && (
        <div className="adm-banner bad">🧵 Threads 게시 실패: {snsThreadsResult.error}</div>
      )}
      {status === 'error' && <div className="adm-banner bad">⚠️ {message}</div>}

      <div className="adm-wrap">
        <div>
          <div className="adm-panel">
            <h2 className="adm-h">① 기본 정보 <span className="adm-auto">SEO 자동</span></h2>
            <p className="adm-desc">SEO 몰라도 OK — 칸만 채우면 검색·SNS 태그가 자동 생성돼요.</p>

            <label className="adm-lab">제목 <span>검색 제목이 됨 · 25~40자 추천</span></label>
            <input className="adm-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 神保町・チョゴリの韓国ランチを正直レビュー" />
            <Counter v={title} min={12} max={40} />

            <label className="adm-lab">주소(슬러그) <span>영문소문자-하이픈 · 수정 시 변경 불가</span></label>
            <input className="adm-in" value={slug} disabled={!!editingSlug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="chogori-jimbocho"
              style={{ borderColor: slug && !slugOk ? '#E24B4A' : undefined, opacity: editingSlug ? 0.6 : 1 }} />
            <div className="adm-cnt" style={{ color: slug && !slugOk ? '#E24B4A' : 'var(--text-3)' }}>
              {slug ? (slugOk ? `blog.retwork.jp/posts/${slug}` : '영문 소문자·숫자·하이픈만, 2자 이상') : ''}
            </div>

            <label className="adm-lab">검색 설명 <span>검색결과 2줄 소개 · 80~120자</span></label>
            <textarea className="adm-in" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="예: 東京・神保町の韓国料理店「チョゴリ」でランチ3名分を実食。豆乳冷麺とチキン定食を忖度なしでレビュー。" />
            <Counter v={desc} min={60} max={120} />

            <label className="adm-lab">태그 <span>쉼표로 구분 · 키워드 자동 등록</span></label>
            <input className="adm-in" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="神保町, 韓国料理, ランチ, 冷麺" />

            <label className="adm-lab">대표 이미지 <span>SNS 미리보기 이미지</span></label>
            <input type="file" accept="image/*" onChange={(e) => pickHero(e.target.files?.[0])} />
            {hero && (
              <button type="button" className="adm-btn mini" style={{ marginTop: 6 }} onClick={() => setEditingImg('hero')}>
                ✂️ 회전·자르기
              </button>
            )}
            {heroExistingUrl && !heroPreview && <div className="adm-cnt" style={{ textAlign: 'left' }}>현재: {heroExistingUrl} (바꾸려면 새 파일 선택)</div>}

            <label className="adm-lab">🎨 글 테마 색상 <span>제목 보더·링크·CTA 버튼 등에 적용</span></label>
            <ColorSwatches value={theme} onChange={setTheme} />
          </div>

          <div className="adm-panel">
            <h2 className="adm-h">② 본문 — 블록 쌓기</h2>
            <p className="adm-desc">버튼으로 블록 추가 → 카드/이미지가 일관 디자인으로 들어가요.</p>
            <div className="adm-tool">
              <button className="adm-btn" onClick={() => addBlock('heading')}>＋ 소제목</button>
              <button className="adm-btn" onClick={() => addBlock('text')}>＋ 본문</button>
              <button className="adm-btn" onClick={() => addBlock('card')}>＋ 강조 카드</button>
              <button className="adm-btn" onClick={() => addBlock('quote')}>＋ 인용</button>
              <button className="adm-btn" onClick={() => addBlock('image')}>＋ 이미지</button>
              <button className="adm-btn" onClick={() => addBlock('line')}>＋ 라인</button>
            </div>
            {blocks.length === 0 && <p className="adm-desc">아직 블록이 없어요. 위 버튼으로 추가하세요.</p>}
            {/* ___ 본문 블록 목록 ___ */}
            {blocks.map((b) => (
              <div className="adm-block" key={b.id}>
                <div className="adm-bhead">
                  <span className={`adm-btype t-${b.type}`}>{TYPE_NAME[b.type]}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    <button className="adm-btn mini" onClick={() => move(b.id, -1)}>↑</button>
                    <button className="adm-btn mini" onClick={() => move(b.id, 1)}>↓</button>
                    <button className="adm-btn mini danger" onClick={() => rmBlock(b.id)}>✕</button>
                  </div>
                </div>
                {b.type === 'image' ? (
                  <>
                    <input type="file" accept="image/*" onChange={(e) => setBlockFile(b.id, e.target.files?.[0])} />
                    {b.file && (
                      <button type="button" className="adm-btn mini" style={{ marginTop: 6 }} onClick={() => setEditingImg(b.id)}>
                        ✂️ 회전·자르기
                      </button>
                    )}
                    {b.preview && (
                      <div style={{ marginTop: 6 }}>
                        <img src={b.preview} alt="" style={{ maxHeight: 120, borderRadius: 6 }} />
                      </div>
                    )}
                    {b.existingUrl && !b.preview && <div className="adm-cnt" style={{ textAlign: 'left' }}>현재: {b.existingUrl}</div>}
                    <input className="adm-in" style={{ marginTop: 7 }} value={b.text} onChange={(e) => setText(b.id, e.target.value)} placeholder="이미지 설명(alt) — 검색에 도움" />
                  </>
                ) : b.type === 'line' ? (
                  <div>
                    <div className="adm-lab" style={{ margin: '0 0 4px' }}>🎨 라인 색상 <span>구분선 색</span></div>
                    <ColorPicker value={b.lineColor || theme} onChange={(c) => patchBlock(b.id, { lineColor: c })} />
                  </div>
                ) : (
                  <>
                    <textarea className="adm-in" value={b.text} rows={b.type === 'text' ? 3 : 2} onChange={(e) => setText(b.id, e.target.value)} placeholder={`${TYPE_NAME[b.type]} 내용…`} />
                    {/* 스타일 패널 — 소제목/본문/강조카드 */}
                    {(b.type === 'heading' || b.type === 'text' || b.type === 'card') && (
                      <BlockStyleEditor block={b} theme={theme} onPatch={(p) => patchBlock(b.id, p)} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* ③ SNS 자동 게시 */}
          <div className="adm-panel">
            <h2 className="adm-h">③ SNS 자동 공유 <span className="adm-auto">옵션</span></h2>
            <p className="adm-desc">발행과 동시에 SNS 에도 자동 게시. 비워두면 자동 메시지 생성.</p>
            {editingSlug && (
              <div style={{ background: '#FFF6E6', border: '1px solid #F3D9A0', color: '#8a6020', padding: '8px 10px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
                ℹ️ 수정 모드 — 같은 내용으로 다시 X 에 게시하면 <b>중복 차단(403)</b> 됩니다. <br />
                새 트윗을 올리려면 「메시지 직접 작성하기」로 본문을 다르게 적어주세요.
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 9, background: snsX ? '#E6F5EF' : '#fff' }}>
              <input type="checkbox" checked={snsX} onChange={(e) => setSnsX(e.target.checked)} />
              <span>🐦 <b>X (트위터)</b> 에 자동 게시</span>
            </label>
            {snsX && (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="adm-btn mini" onClick={() => setSnsXEditOpen((v) => !v)} style={{ marginBottom: 6 }}>
                  {snsXEditOpen ? '▲ 자동 메시지로 돌아가기' : '✏️ 메시지 직접 작성하기'}
                </button>
                {snsXEditOpen ? (
                  <>
                    <textarea
                      className="adm-in" rows={5}
                      value={snsXCustom}
                      onChange={(e) => setSnsXCustom(e.target.value)}
                      placeholder="X 에 그대로 올라갈 본문 (URL/태그 직접 포함)"
                      maxLength={280}
                    />
                    <div className="adm-cnt" style={{ color: jLen(snsXCustom) > 280 ? '#E24B4A' : 'var(--text-3)' }}>
                      {jLen(snsXCustom)} / 280자 (URL 은 23자로 계산됨)
                    </div>
                  </>
                ) : (
                  <div style={{ background: '#fbfaf7', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.5, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                    {previewTweet({ title, description: desc, url: `https://blog.retwork.jp/posts/${slug || '(주소)'}`, tags }) || '제목·검색설명·태그를 채우면 자동 생성됩니다.'}
                  </div>
                )}
                <div className="adm-desc" style={{ marginTop: 8, fontSize: 11 }}>
                  💡 X API 토큰 4개를 Vercel 환경변수에 등록해야 작동합니다.
                </div>
              </div>
            )}

            {/* Threads */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 9, background: snsThreads ? '#E6F5EF' : '#fff', marginTop: 10 }}>
              <input type="checkbox" checked={snsThreads} onChange={(e) => setSnsThreads(e.target.checked)} />
              <span>🧵 <b>Threads</b> 에 자동 게시</span>
            </label>
            {snsThreads && (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="adm-btn mini" onClick={() => setSnsThreadsEditOpen((v) => !v)} style={{ marginBottom: 6 }}>
                  {snsThreadsEditOpen ? '▲ 자동 메시지로 돌아가기' : '✏️ 메시지 직접 작성하기'}
                </button>
                {snsThreadsEditOpen ? (
                  <>
                    <textarea
                      className="adm-in" rows={6}
                      value={snsThreadsCustom}
                      onChange={(e) => setSnsThreadsCustom(e.target.value)}
                      placeholder="Threads 에 그대로 올라갈 본문 (URL/태그 직접 포함)"
                      maxLength={500}
                    />
                    <div className="adm-cnt" style={{ color: jLen(snsThreadsCustom) > 500 ? '#E24B4A' : 'var(--text-3)' }}>
                      {jLen(snsThreadsCustom)} / 500자
                    </div>
                  </>
                ) : (
                  <div style={{ background: '#fbfaf7', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.5, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                    {previewThread({ title, description: desc, url: `https://blog.retwork.jp/posts/${slug || '(주소)'}`, tags }) || '제목·검색설명·태그를 채우면 자동 생성됩니다.'}
                  </div>
                )}
                <div className="adm-desc" style={{ marginTop: 8, fontSize: 11 }}>
                  💡 Threads 토큰 2개 (THREADS_USER_ID / THREADS_ACCESS_TOKEN) 를 Vercel 환경변수에 등록해야 작동합니다.
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="adm-panel">
            <h2 className="adm-h">👀 미리보기 (실제 블로그 모양)</h2>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 18 }}>
              {heroSrc && <img src={heroSrc} alt="" style={{ marginBottom: 14 }} />}
              <div className="post-hero" style={{ margin: '0 0 8px' }}>{title || '제목을 입력하세요'}</div>
              <div className="post-meta"><span className="author">RetWork編集部</span><span className="dot">·</span>{date}{tags.map((t) => <span key={t}> · #{t}</span>)}</div>
              <div className="post-body">
                {blocks.length === 0 && <p style={{ color: '#aaa' }}>본문 블록을 추가해보세요.</p>}
                {blocks.map((b) => {
                  const st = blockStyle(b);
                  if (b.type === 'heading') return <h2 key={b.id} style={st}>{b.text || '소제목'}</h2>;
                  if (b.type === 'text') return <p key={b.id} style={st}>{b.text || '본문…'}</p>;
                  if (b.type === 'card') {
                    const c = b.color || theme;
                    if (isThemeKey(c)) return <div className={`callout callout-color-${c}`} key={b.id} style={st}>{b.text || '강조 내용'}</div>;
                    // 커스텀 hex
                    const bg = resolveCardBg(c); const bd = resolveColor(c);
                    return <div className="callout" key={b.id} style={{ ...st, background: bg, borderLeftColor: bd }}>{b.text || '강조 내용'}</div>;
                  }
                  if (b.type === 'quote') return <blockquote key={b.id}>{b.text || '인용'}</blockquote>;
                  if (b.type === 'line') {
                    const lc = resolveColor(b.lineColor || theme, '#b0a99a');
                    return <hr key={b.id} style={{ border: 'none', borderTop: `2px solid ${lc}`, margin: '20px 0' }} />;
                  }
                  if (b.type === 'image') { const src = b.preview || b.existingUrl; return src ? <img key={b.id} src={src} alt={b.text} /> : <div key={b.id} style={{ background: '#eee', borderRadius: 8, padding: 30, textAlign: 'center', color: '#aaa' }}>이미지 자리</div>; }
                  return null;
                })}
              </div>
            </div>
          </div>

          <div className="adm-panel">
            <h2 className="adm-h">📄 저장될 마크다운 <span className="adm-auto" style={{ background: '#1E1B2E', color: '#D7CFF0' }}>코드 보기</span></h2>
            <p className="adm-desc">SEO 부분(맨 위 frontmatter)은 자동으로 채워져요. 클릭으로 펼치기.</p>
            <MdViewer
              expanded={mdExpanded}
              onToggle={() => setMdExpanded((v) => !v)}
              fetchMd={async () => {
                try { const r = await buildPost(); setMdPreview(r.markdown); return r.markdown; }
                catch { return mdPreview; }
              }}
              md={mdPreview}
            />
          </div>

          <div className="adm-panel">
            <h2 className="adm-h">✅ SEO 자동 점검</h2>
            <div style={{ fontSize: 30, fontWeight: 900, textAlign: 'center', margin: '4px 0', color: seoScore >= 80 ? 'var(--accent)' : seoScore >= 50 ? '#E8A33A' : '#E24B4A' }}>{seoScore}점</div>
            {checks.map((c) => (
              <div className="adm-seo" key={c.label}>
                <span className="adm-dot" style={{ background: c.ok ? 'var(--accent)' : '#ccc' }}>{c.ok ? '✓' : '!'}</span>
                <span>{c.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{c.ok ? c.g : c.b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Counter({ v, min, max }: { v: string; min: number; max: number }) {
  const n = jLen(v);
  const col = n === 0 ? 'var(--text-3)' : n < min || n > max ? '#E8A33A' : 'var(--accent)';
  const msg = n === 0 ? '' : n < min ? '조금 짧아요' : n > max ? '조금 길어요' : '적당해요 👍';
  return <div className="adm-cnt" style={{ color: col }}>{n}자 {msg}</div>;
}

/* 색상 칩 스워치 — 테마 키만 (글 전체 테마 색상 등) */
function ColorSwatches({ value, onChange, mini }: { value: ThemeKey; onChange: (k: ThemeKey) => void; mini?: boolean }) {
  const sz = mini ? 22 : 28;
  return (
    <div className="adm-swatches" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {THEME_KEYS.map((k) => {
        const th = THEMES[k];
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            title={th.name}
            onClick={() => onChange(k)}
            aria-label={th.name}
            style={{
              width: sz, height: sz, borderRadius: '50%',
              background: th.color,
              border: on ? '2.5px solid #1c1c1c' : '2px solid #fff',
              outline: on ? '1.5px solid #fff' : 'none',
              boxShadow: on ? '0 0 0 2px ' + th.color + ' , 0 1px 4px rgba(0,0,0,.18)' : '0 1px 3px rgba(0,0,0,.12)',
              cursor: 'pointer', padding: 0, transition: '.12s',
            }}
          />
        );
      })}
    </div>
  );
}

/* 색상 피커 — 테마 키 OR 커스텀 hex */
function ColorPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const isTheme = !!value && isThemeKey(value);
  const customHex = !value || isTheme ? '#888888' : value;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
      {THEME_KEYS.map((k) => {
        const th = THEMES[k];
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            title={th.name}
            onClick={() => onChange(k)}
            aria-label={th.name}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: th.color,
              border: on ? '2.5px solid #1c1c1c' : '2px solid #fff',
              outline: on ? '1.5px solid #fff' : 'none',
              boxShadow: on ? '0 0 0 2px ' + th.color : '0 1px 3px rgba(0,0,0,.12)',
              cursor: 'pointer', padding: 0, transition: '.12s',
            }}
          />
        );
      })}
      <span style={{ width: 1, height: 18, background: '#ddd', margin: '0 4px' }} />
      <label
        title="커스텀 색 — 색상 박스 클릭"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', border: !isTheme && value ? '2px solid #1c1c1c' : '1.5px dashed #c4bdaf',
          borderRadius: 16, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#1c1c1c',
        }}
      >
        🎨
        <input
          type="color"
          value={customHex}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 22, height: 22, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }}
        />
        {!isTheme && value && <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10 }}>{value}</span>}
      </label>
    </div>
  );
}

/* 폰트 / 사이즈 / 굵기 / 색상 — 한 블록의 모든 스타일 옵션 */
function BlockStyleEditor({ block, theme, onPatch }: { block: Block; theme: ThemeKey; onPatch: (p: Partial<Block>) => void }) {
  const [open, setOpen] = useState(false);
  const has =
    !!block.font || !!block.size || !!block.weight || !!block.textColor ||
    (block.type === 'card' && !!block.color);
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed #e5e2d8', paddingTop: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 700, color: has ? 'var(--accent)' : 'var(--text-3)',
          padding: '3px 0',
        }}
      >
        🎨 스타일 옵션 {open ? '▲' : '▼'} {has && '· 적용됨'}
      </button>
      {open && (
        <div style={{ paddingTop: 4 }}>
          {/* 폰트 종류 */}
          <div className="adm-lab" style={{ margin: '6px 0 3px' }}>폰트 종류</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['sans', 'serif'] as FontKind[]).map((f) => (
              <button key={f} type="button"
                onClick={() => onPatch({ font: block.font === f ? undefined : f })}
                className={`adm-btn mini ${block.font === f ? 'primary' : ''}`}
                style={{ fontFamily: FONT_FAMILY[f], minWidth: 80 }}>
                {f === 'sans' ? '고딕 (Gothic)' : '명조 (Mincho)'}
              </button>
            ))}
          </div>

          {/* 사이즈 */}
          <div className="adm-lab" style={{ margin: '8px 0 3px' }}>폰트 사이즈 (px)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {SIZES.map((s) => (
              <button key={s} type="button"
                onClick={() => onPatch({ size: block.size === s ? undefined : s })}
                className={`adm-btn mini ${block.size === s ? 'primary' : ''}`}>
                {s}
              </button>
            ))}
          </div>

          {/* 굵기 */}
          <div className="adm-lab" style={{ margin: '8px 0 3px' }}>굵기</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(Object.keys(WEIGHT_LABEL) as WeightKind[]).map((w) => (
              <button key={w} type="button"
                onClick={() => onPatch({ weight: block.weight === w ? undefined : w })}
                className={`adm-btn mini ${block.weight === w ? 'primary' : ''}`}
                style={{ fontWeight: WEIGHT_VAL[w] }}>
                {WEIGHT_LABEL[w]}
              </button>
            ))}
          </div>

          {/* 글자 색 */}
          <div className="adm-lab" style={{ margin: '8px 0 3px' }}>글자 색</div>
          <ColorPicker value={block.textColor} onChange={(c) => onPatch({ textColor: c })} />

          {/* 카드 전용 — 배경/보더 색 */}
          {block.type === 'card' && (
            <>
              <div className="adm-lab" style={{ margin: '8px 0 3px' }}>강조 카드 색 (배경+좌측 보더)</div>
              <ColorPicker value={block.color || theme} onChange={(c) => onPatch({ color: c })} />
            </>
          )}

          {/* 초기화 */}
          {has && (
            <button type="button"
              onClick={() => onPatch({ font: undefined, size: undefined, weight: undefined, textColor: undefined, ...(block.type === 'card' ? { color: undefined } : {}) })}
              className="adm-btn mini" style={{ marginTop: 10 }}>
              스타일 초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   이미지 편집기 — 회전 (90° 단위) + 비율 자르기 (사전 정의)
   ───────────────────────────────────────────────── */
const CROP_RATIOS = [
  { key: 'free',  label: '원본', value: null },
  { key: '1:1',   label: '1:1 정사각', value: 1 },
  { key: '4:3',   label: '4:3', value: 4 / 3 },
  { key: '16:9',  label: '16:9', value: 16 / 9 },
  { key: '3:2',   label: '3:2', value: 3 / 2 },
  { key: '3:4',   label: '3:4 세로', value: 3 / 4 },
  { key: '9:16',  label: '9:16 세로', value: 9 / 16 },
] as const;

function ImageEditor({ file, onApply, onCancel }: {
  file: File;
  onApply: (newFile: File) => void;
  onCancel: () => void;
}) {
  const [angle, setAngle] = useState(0);         // 0/90/180/270
  const [ratio, setRatio] = useState<number | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 파일 → Image 로드
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => setImgEl(img);
    img.onerror = () => setImgEl(null);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 회전·자르기 적용된 Canvas 렌더
  useEffect(() => {
    if (!imgEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rotated = angle === 90 || angle === 270;
    const baseW = rotated ? imgEl.height : imgEl.width;
    const baseH = rotated ? imgEl.width : imgEl.height;

    // 자르기 영역 (중앙)
    let cropW = baseW, cropH = baseH;
    if (ratio) {
      const imgRatio = baseW / baseH;
      if (imgRatio > ratio) { cropW = baseH * ratio; cropH = baseH; }
      else { cropW = baseW; cropH = baseW / ratio; }
    }
    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(imgEl, -imgEl.width / 2, -imgEl.height / 2);
    ctx.restore();
  }, [imgEl, angle, ratio]);

  function apply() {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const name = file.name.replace(/\.\w+$/, '') + '.jpg';
      const newFile = new File([blob], name, { type: 'image/jpeg' });
      onApply(newFile);
    }, 'image/jpeg', 0.9);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 18,
        maxWidth: '95vw', width: 720,
        display: 'flex', flexDirection: 'column', gap: 12,
        maxHeight: '95vh',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>✂️ 이미지 편집</h3>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>회전 / 비율 자르기 → 적용</span>
          <button onClick={onCancel} className="adm-btn mini" style={{ marginLeft: 'auto' }}>닫기</button>
        </div>

        {/* 캔버스 미리보기 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px',
          borderRadius: 8, padding: 12, minHeight: 200, overflow: 'auto',
        }}>
          <canvas ref={canvasRef} style={{
            maxWidth: '100%', maxHeight: '50vh',
            boxShadow: '0 2px 10px rgba(0,0,0,.15)', borderRadius: 4,
          }} />
        </div>

        {/* 회전 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
            회전 <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>· 현재 {angle}°</span>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button className="adm-btn mini" onClick={() => setAngle((a) => (a + 270) % 360)}>↺ 좌 90°</button>
            <button className="adm-btn mini" onClick={() => setAngle((a) => (a + 90) % 360)}>↻ 우 90°</button>
            <button className="adm-btn mini" onClick={() => setAngle((a) => (a + 180) % 360)}>↕ 180°</button>
            <button className="adm-btn mini" onClick={() => setAngle(0)}>초기화</button>
          </div>
        </div>

        {/* 비율 자르기 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
            비율 자르기 <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>· 중앙 자동 자르기</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CROP_RATIOS.map((r) => (
              <button key={r.key}
                className={`adm-btn mini ${ratio === r.value ? 'primary' : ''}`}
                onClick={() => setRatio(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* 액션 */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onCancel} className="adm-btn">취소</button>
          <button onClick={apply} className="adm-btn primary">✅ 적용</button>
        </div>
      </div>
    </div>
  );
}

/* 마크다운 출력 박스 — 일부만 보이고 펼치기 */
function MdViewer({ md, expanded, onToggle, fetchMd }: {
  md: string; expanded: boolean; onToggle: () => void;
  fetchMd: () => Promise<string>;
}) {
  const [shown, setShown] = useState(md);
  // 패널 열릴 때 미리보기 fetch (사용자 클릭 시점)
  function handleToggle() {
    if (!expanded) {
      fetchMd().then((s) => setShown(s));
    }
    onToggle();
  }
  const fence = expanded ? 'none' : '220px';
  return (
    <div style={{ position: 'relative' }}>
      <pre
        style={{
          background: '#1E1B2E', color: '#D7CFF0',
          padding: 14, borderRadius: 10,
          fontSize: 12, lineHeight: 1.55,
          fontFamily: 'ui-monospace,Menlo,Consolas,monospace',
          margin: 0, maxHeight: fence, overflow: expanded ? 'auto' : 'hidden',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}
      >
        {shown || '(아직 비어 있어요 — 본문을 좀 작성한 뒤 펼쳐보세요)'}
      </pre>
      {!expanded && shown && (
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
            background: 'linear-gradient(to bottom, rgba(30,27,46,0), rgba(30,27,46,1))',
            pointerEvents: 'none', borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
          }}
        />
      )}
      <button
        type="button"
        onClick={handleToggle}
        className="adm-btn"
        style={{ marginTop: 8, width: '100%' }}
      >
        {expanded ? '▲ 접기' : (shown ? '▼ 전체 펼치기' : '▼ 코드 보기')}
      </button>
    </div>
  );
}

function Style() {
  return <style dangerouslySetInnerHTML={{ __html: `
    .adm-root{position:fixed;inset:0;z-index:9999;overflow:auto;background:#F5F4F0;font-family:var(--font-ui);padding-bottom:60px;}
    .adm-top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--border);padding:12px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
    .adm-top b{font-size:15px;}
    .adm-tabs{display:flex;gap:6px;}
    .adm-tab{border:1.5px solid var(--border);background:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;color:var(--text-2);}
    .adm-tab.on{background:var(--accent);color:#fff;border-color:var(--accent);}
    .adm-wrap{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1320px;margin:16px auto;padding:0 16px;}
    @media(max-width:880px){.adm-wrap{grid-template-columns:1fr;}}
    .adm-panel{background:#fff;border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:16px;}
    .adm-h{font-size:14px;font-weight:800;color:var(--accent);margin:0 0 4px;}
    .adm-auto{background:#E6F5EF;color:var(--accent);font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;}
    .adm-desc{font-size:12px;color:var(--text-3);margin:0 0 12px;}
    .adm-lab{display:block;font-size:12px;font-weight:700;margin:12px 0 5px;color:var(--text-1);}
    .adm-lab span{font-weight:400;color:var(--text-3);font-size:11px;}
    .adm-in{width:100%;border:1.5px solid var(--border);border-radius:9px;padding:10px 12px;font-size:14px;font-family:inherit;color:var(--text-1);background:#fff;}
    .adm-in:focus{outline:none;border-color:var(--accent);}
    .adm-in:disabled{background:#f3f1ec;}
    textarea.adm-in{resize:vertical;min-height:60px;}
    .adm-cnt{font-size:11px;margin-top:4px;text-align:right;}
    .adm-tool{display:flex;flex-wrap:wrap;gap:7px;margin:6px 0 14px;}
    .adm-btn{border:1.5px solid var(--border);background:#fff;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;color:var(--text-1);transition:.15s;text-decoration:none;display:inline-block;}
    .adm-btn:hover{border-color:var(--accent);color:var(--accent);}
    .adm-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent);}
    .adm-btn.primary:disabled{opacity:.5;cursor:default;}
    .adm-btn.mini{padding:4px 9px;font-size:11px;}
    .adm-btn.danger:hover{border-color:#E24B4A;color:#E24B4A;}
    .adm-block{border:1.5px dashed var(--border);border-radius:10px;padding:10px;margin-bottom:10px;}
    .adm-bhead{display:flex;align-items:center;margin-bottom:6px;}
    .adm-btype{font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;}
    .t-heading{background:#E6F5EF;color:var(--accent);}.t-text{background:#EEF6F2;color:#0f7a59;}
    .t-card{background:#FDF0E6;color:#C77A3A;}.t-quote{background:#F0F0EC;color:var(--text-3);}.t-image{background:#E6F0FB;color:#1f6db3;}
    .adm-seo{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 0;border-bottom:1px solid #F2F0EA;}
    .adm-dot{width:18px;height:18px;border-radius:50%;flex:0 0 18px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:800;}
    .adm-banner{padding:10px 18px;font-size:13px;font-weight:600;}
    .adm-banner.ok{background:#E6F5EF;color:#0f7a59;}.adm-banner.bad{background:#FBEAEA;color:#C0392B;}.adm-banner.edit{background:#FFF6E6;color:#B07A1A;}
    .adm-listrow{display:flex;align-items:center;gap:10px;padding:12px 4px;border-bottom:1px solid #F2F0EA;}
    .adm-lt{font-size:14px;font-weight:700;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .adm-ls{font-size:11px;color:var(--text-3);margin-top:2px;}
    /* 미리보기 강조 카드 — 기본 (색상 미지정) */
    .callout{background:#f5f1ea;border-left:4px solid #b0a99a;border-radius:0 12px 12px 0;padding:14px 16px;margin:14px 0;}
    /* 10가지 테마 색상 — 메인앱 팔레트 동기화 */
    .callout.callout-color-green   {background:#E0ECEA;border-left-color:#00644D;}
    .callout.callout-color-blue    {background:#E1EFFE;border-left-color:#0279F7;}
    .callout.callout-color-purple  {background:#E7E0F2;border-left-color:#380193;}
    .callout.callout-color-coral   {background:#FFF0EB;border-left-color:#F78156;}
    .callout.callout-color-rose    {background:#FDF3FA;border-left-color:#F198D5;}
    .callout.callout-color-gold    {background:#FFFAE0;border-left-color:#FFDE02;}
    .callout.callout-color-indigo  {background:#E3E6EB;border-left-color:#172C58;}
    .callout.callout-color-cyan    {background:#E5ECF0;border-left-color:#266586;}
    .callout.callout-color-lime    {background:#E7F9E7;border-left-color:#38CF39;}
    .callout.callout-color-magenta {background:#FCE1F0;border-left-color:#E30884;}
  `}} />;
}
