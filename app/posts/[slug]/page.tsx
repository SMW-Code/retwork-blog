import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllSlugs, getPostBySlug, getAllPosts } from '../../../lib/posts';
import { getTheme } from '../../../lib/themes';
import AdSlot from '../../../components/AdSlot';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description || post.title,
    openGraph: {
      title: post.title,
      description: post.description || post.title,
      type: 'article',
      images: post.image ? [{ url: post.image }] : undefined,
      publishedTime: post.date,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description || post.title,
      images: post.image ? [post.image] : undefined,
    },
    alternates: { canonical: `https://blog.retwork.jp/posts/${slug}` },
  };
}

export default async function PostPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const SITE = 'https://blog.retwork.jp';

  // 글 frontmatter 의 theme 키 → --accent / --accent-dark 를 그 색으로 변경
  const theme = getTheme(post.theme);
  const themeStyle = {
    '--accent': theme.color,
    '--accent-dark': theme.dark,
  } as CSSProperties;

  // 관련 글(다른 글) — 현재 글 제외 최신 4개. 글↔글 내부 링크 그래프 강화 → 크롤 유도
  const related = getAllPosts().filter((p) => p.slug !== slug).slice(0, 4);

  // BlogPosting 구조화 데이터 — Google 이 기사로 인식하도록(색인 우선순위/리치결과 도움)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description || post.title,
    image: post.image ? `${SITE}${post.image}` : `${SITE}/images/logo.png`,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: post.author || 'RetWork編集部', url: SITE },
    publisher: {
      '@type': 'Organization',
      name: 'RetWork',
      logo: { '@type': 'ImageObject', url: `${SITE}/images/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/posts/${slug}` },
    keywords: (post.tags || []).join(', '),
  };

  return (
    <article style={themeStyle}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/" style={{ fontSize: 13, color: 'var(--text-3)' }}>← 記事一覧に戻る</Link>

      <h1 className="post-hero">{post.title}</h1>

      <div className="post-meta">
        <span className="author">{post.author}</span>
        <span className="dot">·</span>
        <span>{post.date}</span>
        {post.tags && post.tags.length > 0 && (
          <>
            <span className="dot">·</span>
            {post.tags.map((t, i) => (
              <span key={t}>
                #{t}{i < post.tags!.length - 1 ? ' ' : ''}
              </span>
            ))}
          </>
        )}
      </div>

      {/* 상단 광고 */}
      <AdSlot slot="" format="horizontal" />

      <div
        className="post-body"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />

      {/* 본문 하단 광고 */}
      <AdSlot slot="" format="auto" />

      <hr style={{ margin: '40px 0 24px', border: 'none', borderTop: '1px solid var(--border)' }} />

      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: '20px 22px',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 6 }}>
          📷 レシートで家計簿、地図でコスパ店検索
        </div>
        <div style={{ fontFamily: 'var(--font-jp)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          RetWork（チリつも）— 日本ユーザー向け家計簿+コスパマップ
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 12 }}>
          レシートを撮影するだけで自動仕分け、コミュニティ全体のリアル価格データから「安くて美味しい店」を発見できます。
        </div>
        <a
          href="https://retwork.jp"
          target="_blank"
          rel="noopener"
          style={{
            display: 'inline-block', padding: '10px 16px',
            background: 'var(--accent)', color: '#fff',
            borderRadius: 8, fontWeight: 700, fontSize: 14,
          }}
        >
          アプリを開く →
        </a>
      </div>

      {related.length > 0 && (
        <nav style={{ marginTop: 40 }} aria-label="他の記事">
          <h2 style={{ fontFamily: 'var(--font-jp)', fontSize: 18, fontWeight: 700, margin: '0 0 14px' }}>
            他の記事も読む
          </h2>
          {related.map((p) => (
            <Link key={p.slug} href={`/posts/${p.slug}`} style={{ display: 'block', color: 'inherit' }}>
              <article className="post-card">
                <h3 style={{ fontFamily: 'var(--font-jp)', fontSize: 16, fontWeight: 700, margin: '0 0 4px', lineHeight: 1.4, color: 'var(--text-1)' }}>{p.title}</h3>
                <div className="meta">{p.date}{p.author && <> · {p.author}</>}</div>
              </article>
            </Link>
          ))}
        </nav>
      )}

      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--text-3)' }}>← 記事一覧に戻る</Link>
      </div>
    </article>
  );
}
