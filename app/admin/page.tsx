'use client';

import { useMemo, useState } from 'react';

/* ────────────────────────────────────────────────────────────
   /admin — 그루메 블로그 글쓰기 페이지 (비개발자용)
   - 블록으로 본문 작성 + 이미지 업로드 + SEO 자동
   - "발행" → /api/publish → GitHub 커밋 → blog.retwork.jp 반영
   ──────────────────────────────────────────────────────────── */

type BlockType = 'heading' | 'text' | 'card' | 'quote' | 'image';
type Block = { id: number; type: BlockType; text: string; file?: File; preview?: string };

const TYPE_NAME: Record<BlockType, string> = {
  heading: '소제목', text: '본문', card: '강조 카드', quote: '인용', image: '이미지',
};

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

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [entered, setEntered] = useState(false);

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [hero, setHero] = useState<File | undefined>();
  const [heroPreview, setHeroPreview] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [nextId, setNextId] = useState(1);

  const [status, setStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resultUrl, setResultUrl] = useState('');

  const date = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tags = tagsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  /* ---- 블록 조작 ---- */
  function addBlock(type: BlockType) {
    setBlocks((b) => [...b, { id: nextId, type, text: '' }]);
    setNextId((n) => n + 1);
  }
  function setText(id: number, v: string) {
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, text: v } : x)));
  }
  function setBlockFile(id: number, f?: File) {
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, file: f, preview: f ? URL.createObjectURL(f) : undefined } : x)));
  }
  function rmBlock(id: number) { setBlocks((b) => b.filter((x) => x.id !== id)); }
  function move(id: number, d: number) {
    setBlocks((b) => {
      const i = b.findIndex((x) => x.id === id); const j = i + d;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const c = [...b]; [c[i], c[j]] = [c[j], c[i]]; return c;
    });
  }
  function pickHero(f?: File) { setHero(f); setHeroPreview(f ? URL.createObjectURL(f) : ''); }

  /* ---- 마크다운 + 이미지 빌드 ---- */
  async function buildPost() {
    const images: { path: string; base64: string }[] = [];
    let heroPath = '';
    if (hero) {
      const ext = extOf(hero);
      heroPath = `/images/${slug}/main.${ext}`;
      images.push({ path: `public${heroPath}`, base64: await fileToBase64(hero) });
    }
    let imgIdx = 0;
    const parts: string[] = [];
    for (const b of blocks) {
      if (b.type === 'heading') parts.push(`## ${b.text || ''}`);
      else if (b.type === 'text') parts.push(b.text || '');
      else if (b.type === 'card') parts.push(`<div class="callout">${esc(b.text || '').replace(/\n/g, '<br>')}</div>`);
      else if (b.type === 'quote') parts.push(`> ${(b.text || '').replace(/\n/g, '\n> ')}`);
      else if (b.type === 'image' && b.file) {
        imgIdx++;
        const ext = extOf(b.file);
        const p = `/images/${slug}/img-${imgIdx}.${ext}`;
        images.push({ path: `public${p}`, base64: await fileToBase64(b.file) });
        parts.push(`![${(b.text || '').replace(/[[\]]/g, '')}](${p})`);
      }
    }
    const fm = [
      '---',
      `title: ${JSON.stringify(title)}`,
      `date: ${JSON.stringify(date)}`,
      `description: ${JSON.stringify(desc)}`,
      `image: ${JSON.stringify(heroPath)}`,
      `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`,
      `author: ${JSON.stringify('RetWork編集部')}`,
      '---', '',
    ].join('\n');
    return { markdown: fm + parts.join('\n\n') + '\n', images };
  }

  /* ---- 발행 ---- */
  const slugOk = /^[a-z0-9][a-z0-9-]{1,80}$/.test(slug);
  const bodyLen = blocks.filter((b) => b.type === 'text' || b.type === 'card').reduce((a, b) => a + jLen(b.text), 0);
  const canPublish = slugOk && title.trim() && desc.trim() && bodyLen >= 50;

  async function publish() {
    if (!canPublish) { setStatus('error'); setMessage('제목/주소/검색설명/본문을 채워주세요. (본문 50자 이상)'); return; }
    setStatus('publishing'); setMessage('');
    try {
      const { markdown, images } = await buildPost();
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, slug, markdown, images }),
      });
      const data = await res.json();
      if (!data.ok) { setStatus('error'); setMessage(data.error || '발행 실패'); return; }
      setStatus('done'); setResultUrl(data.url);
    } catch (e) {
      setStatus('error'); setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  /* ---- SEO 점검 ---- */
  const checks = [
    { ok: jLen(title) >= 12 && jLen(title) <= 40, label: '제목 길이', g: '검색에 딱 좋아요', b: '12~40자로' },
    { ok: jLen(desc) >= 60 && jLen(desc) <= 120, label: '검색 설명', g: '잘 작성됐어요', b: '60~120자로' },
    { ok: tags.length >= 2, label: '태그(키워드)', g: `${tags.length}개`, b: '2개 이상' },
    { ok: !!hero, label: '대표 이미지', g: 'SNS 공유 OK', b: '추가 권장' },
    { ok: bodyLen >= 150, label: '본문 분량', g: '충분해요', b: '더 작성' },
  ];
  const seoScore = Math.round(checks.filter((c) => c.ok).length / checks.length * 100);

  /* ════════════ 비밀번호 게이트 ════════════ */
  if (!entered) {
    return (
      <div className="adm-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Style />
        <div className="adm-panel" style={{ maxWidth: 360, width: '90%' }}>
          <h2 className="adm-h">🔒 글쓰기 페이지</h2>
          <p className="adm-desc">관리자 비밀번호를 입력하세요.</p>
          <input
            className="adm-in" type="password" value={password}
            placeholder="비밀번호"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && password) setEntered(true); }}
          />
          <button className="adm-btn primary" style={{ width: '100%', marginTop: 12 }}
            disabled={!password} onClick={() => setEntered(true)}>
            들어가기
          </button>
          <p className="adm-desc" style={{ marginTop: 10, fontSize: 11 }}>
            ※ 비밀번호는 발행할 때 서버에서 확인돼요.
          </p>
        </div>
      </div>
    );
  }

  /* ════════════ 에디터 ════════════ */
  return (
    <div className="adm-root">
      <Style />
      <div className="adm-top">
        <b>✍️ RetWork 그루메 블로그 — 글쓰기</b>
        <span className="adm-top-hint">왼쪽에서 쓰면 오른쪽에 미리보기 + SEO 자동</span>
        <button className="adm-btn primary" style={{ marginLeft: 'auto' }}
          disabled={status === 'publishing'} onClick={publish}>
          {status === 'publishing' ? '발행 중…' : '🚀 발행하기'}
        </button>
      </div>

      {/* 발행 결과 배너 */}
      {status === 'done' && (
        <div className="adm-banner ok">
          ✅ 발행됐어요! 약 1분 후 반영돼요 →{' '}
          <a href={resultUrl} target="_blank" rel="noopener">{resultUrl}</a>
        </div>
      )}
      {status === 'error' && <div className="adm-banner bad">⚠️ {message}</div>}

      <div className="adm-wrap">
        {/* 왼쪽: 에디터 */}
        <div>
          <div className="adm-panel">
            <h2 className="adm-h">① 기본 정보 <span className="adm-auto">SEO 자동</span></h2>
            <p className="adm-desc">SEO 몰라도 OK — 칸만 채우면 검색·SNS 태그가 자동 생성돼요.</p>

            <label className="adm-lab">제목 <span>검색 제목이 됨 · 25~40자 추천</span></label>
            <input className="adm-in" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 神保町・チョゴリの韓国ランチを正直レビュー" />
            <Counter v={title} min={12} max={40} />

            <label className="adm-lab">주소(슬러그) <span>영문소문자-하이픈 · 예: chogori-jimbocho</span></label>
            <input className="adm-in" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="chogori-jimbocho"
              style={{ borderColor: slug ? (slugOk ? 'var(--accent)' : '#E24B4A') : undefined }} />
            <div className="adm-cnt" style={{ color: slug && !slugOk ? '#E24B4A' : 'var(--text-3)' }}>
              {slug ? (slugOk ? `주소: blog.retwork.jp/posts/${slug}` : '영문 소문자·숫자·하이픈만, 2자 이상') : ''}
            </div>

            <label className="adm-lab">검색 설명 <span>검색결과 2줄 소개 · 80~120자</span></label>
            <textarea className="adm-in" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
              placeholder="예: 東京・神保町の韓国料理店「チョゴリ」でランチ3名分を実食。豆乳冷麺とチキン定食を忖度なしでレビュー。" />
            <Counter v={desc} min={60} max={120} />

            <label className="adm-lab">태그 <span>쉼표로 구분 · 키워드 자동 등록</span></label>
            <input className="adm-in" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="神保町, 韓国料理, ランチ, 冷麺" />

            <label className="adm-lab">대표 이미지 <span>SNS 미리보기 이미지</span></label>
            <input type="file" accept="image/*" onChange={(e) => pickHero(e.target.files?.[0])} />
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
            </div>
            {blocks.length === 0 && <p className="adm-desc">아직 블록이 없어요. 위 버튼으로 추가하세요.</p>}
            {blocks.map((b) => (
              <div className="adm-block" key={b.id}>
                <div className="adm-bhead">
                  <span className={`adm-btype t-${b.type}`}>{TYPE_NAME[b.type]}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    <button className="adm-btn mini" onClick={() => move(b.id, -1)}>↑</button>
                    <button className="adm-btn mini" onClick={() => move(b.id, 1)}>↓</button>
                    <button className="adm-btn mini" onClick={() => rmBlock(b.id)}>✕</button>
                  </div>
                </div>
                {b.type === 'image' ? (
                  <>
                    <input type="file" accept="image/*" onChange={(e) => setBlockFile(b.id, e.target.files?.[0])} />
                    <input className="adm-in" style={{ marginTop: 7 }} value={b.text}
                      onChange={(e) => setText(b.id, e.target.value)} placeholder="이미지 설명(alt) — 검색에 도움" />
                  </>
                ) : (
                  <textarea className="adm-in" value={b.text} rows={b.type === 'text' ? 3 : 2}
                    onChange={(e) => setText(b.id, e.target.value)} placeholder={`${TYPE_NAME[b.type]} 내용…`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽: 미리보기 + SEO */}
        <div>
          <div className="adm-panel">
            <h2 className="adm-h">👀 미리보기 (실제 블로그 모양)</h2>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 18 }}>
              {heroPreview && <img src={heroPreview} alt="" style={{ marginBottom: 14 }} />}
              <div className="post-hero" style={{ margin: '0 0 8px' }}>{title || '제목을 입력하세요'}</div>
              <div className="post-meta">
                <span className="author">RetWork編集部</span><span className="dot">·</span>{date}
                {tags.map((t) => <span key={t}> · #{t}</span>)}
              </div>
              <div className="post-body">
                {blocks.length === 0 && <p style={{ color: '#aaa' }}>본문 블록을 추가해보세요.</p>}
                {blocks.map((b) => {
                  if (b.type === 'heading') return <h2 key={b.id}>{b.text || '소제목'}</h2>;
                  if (b.type === 'text') return <p key={b.id}>{b.text || '본문…'}</p>;
                  if (b.type === 'card') return <div className="callout" key={b.id}>{b.text || '강조 내용'}</div>;
                  if (b.type === 'quote') return <blockquote key={b.id}>{b.text || '인용'}</blockquote>;
                  if (b.type === 'image') return b.preview
                    ? <img key={b.id} src={b.preview} alt={b.text} />
                    : <div key={b.id} style={{ background: '#eee', borderRadius: 8, padding: 30, textAlign: 'center', color: '#aaa' }}>이미지 자리</div>;
                  return null;
                })}
              </div>
            </div>
          </div>

          <div className="adm-panel">
            <h2 className="adm-h">✅ SEO 자동 점검</h2>
            <div style={{ fontSize: 30, fontWeight: 900, textAlign: 'center', margin: '4px 0', color: seoScore >= 80 ? 'var(--accent)' : seoScore >= 50 ? '#E8A33A' : '#E24B4A' }}>
              {seoScore}점
            </div>
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

function Style() {
  return <style dangerouslySetInnerHTML={{ __html: `
    .adm-root{position:fixed;inset:0;z-index:9999;overflow:auto;background:#F5F4F0;
      font-family:var(--font-ui);padding-bottom:60px;}
    .adm-top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--border);
      padding:12px 18px;display:flex;align-items:center;gap:12px;}
    .adm-top b{font-size:15px;}
    .adm-top-hint{font-size:12px;color:var(--text-3);}
    .adm-wrap{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1320px;margin:16px auto;padding:0 16px;}
    @media(max-width:880px){.adm-wrap{grid-template-columns:1fr;}}
    .adm-panel{background:#fff;border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:16px;}
    .adm-h{font-size:14px;font-weight:800;color:var(--accent);margin:0 0 4px;}
    .adm-auto{background:#E6F5EF;color:var(--accent);font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;}
    .adm-desc{font-size:12px;color:var(--text-3);margin:0 0 12px;}
    .adm-lab{display:block;font-size:12px;font-weight:700;margin:12px 0 5px;color:var(--text-1);}
    .adm-lab span{font-weight:400;color:var(--text-3);font-size:11px;}
    .adm-in{width:100%;border:1.5px solid var(--border);border-radius:9px;padding:10px 12px;font-size:14px;
      font-family:inherit;color:var(--text-1);background:#fff;}
    .adm-in:focus{outline:none;border-color:var(--accent);}
    textarea.adm-in{resize:vertical;min-height:60px;}
    .adm-cnt{font-size:11px;margin-top:4px;text-align:right;}
    .adm-tool{display:flex;flex-wrap:wrap;gap:7px;margin:6px 0 14px;}
    .adm-btn{border:1.5px solid var(--border);background:#fff;border-radius:8px;padding:8px 12px;font-size:12px;
      font-weight:700;cursor:pointer;color:var(--text-1);transition:.15s;}
    .adm-btn:hover{border-color:var(--accent);color:var(--accent);}
    .adm-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent);}
    .adm-btn.primary:disabled{opacity:.5;cursor:default;}
    .adm-btn.mini{padding:3px 8px;font-size:11px;}
    .adm-block{border:1.5px dashed var(--border);border-radius:10px;padding:10px;margin-bottom:10px;}
    .adm-bhead{display:flex;align-items:center;margin-bottom:6px;}
    .adm-btype{font-size:11px;font-weight:800;padding:2px 8px;border-radius:6px;}
    .t-heading{background:#E6F5EF;color:var(--accent);}.t-text{background:#EEF6F2;color:#0f7a59;}
    .t-card{background:#FDF0E6;color:#C77A3A;}.t-quote{background:#F0F0EC;color:var(--text-3);}
    .t-image{background:#E6F0FB;color:#1f6db3;}
    .adm-seo{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 0;border-bottom:1px solid #F2F0EA;}
    .adm-dot{width:18px;height:18px;border-radius:50%;flex:0 0 18px;display:flex;align-items:center;justify-content:center;
      font-size:11px;color:#fff;font-weight:800;}
    .adm-banner{padding:10px 18px;font-size:13px;font-weight:600;}
    .adm-banner.ok{background:#E6F5EF;color:#0f7a59;}.adm-banner.bad{background:#FBEAEA;color:#C0392B;}
    .callout{background:#FDF6EF;border:1px solid #F3D9C2;border-radius:12px;padding:14px 16px;margin:14px 0;}
  `}} />;
}
