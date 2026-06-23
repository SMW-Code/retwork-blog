import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';

const SITE = {
  title: 'RetWork Blog — コスパで選ぶ日本のグルメ&家計簿術',
  description: '日本のコスパランチ、レシートで見つけた名店、家計簿アプリ RetWork（チリつも）の使い方を発信。神保町・新宿・渋谷など東京エリアのリアルな店舗レビュー。',
  url: 'https://blog.retwork.jp',
};

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: '%s | RetWork Blog' },
  description: SITE.description,
  openGraph: {
    title: SITE.title,
    description: SITE.description,
    type: 'website',
    locale: 'ja_JP',
    siteName: 'RetWork Blog',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.title,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE.url },
};

/* CSS — 외부 파일 대신 inline 으로 layout 에 삽입 (PostCSS pipeline 의존 제거) */
const CSS = `
:root {
  --bg: #fbfaf7;
  --surface: #ffffff;
  --text-1: #1c1c1c;
  --text-2: #4a4a4a;
  --text-3: #8a8a8a;
  --border: #e6e2d8;
  --border-mid: #d6d2c4;
  --accent: #16a87a;
  --accent-dark: #0f7a59;
  --tag-bg: #f0ede4;
  --link: #1f6db3;
  --font-jp: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Yu Gothic UI', sans-serif;
  --max-w: 720px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text-1); }
body { font-family: var(--font-ui); line-height: 1.75; font-size: 16px; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; }
a { color: var(--link); text-decoration: none; transition: opacity .15s; }
a:hover { opacity: .7; }
img { max-width: 100%; height: auto; display: block; border-radius: 8px; }
.container { max-width: var(--max-w); margin: 0 auto; padding: 28px 20px 80px; }
.site-header { border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 10; }
.site-header-inner { max-width: var(--max-w); margin: 0 auto; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; }
.site-logo { display: flex; align-items: center; gap: 8px; font-family: var(--font-jp); font-size: 18px; font-weight: 800; color: var(--text-1); letter-spacing: -.3px; }
.site-logo img { width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0; }
.site-logo span { color: var(--accent); }
.site-nav a { font-size: 13px; color: var(--text-2); margin-left: 16px; }
.post-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 14px; transition: border-color .15s, transform .15s; display: flex; gap: 16px; align-items: flex-start; }
.post-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.post-card .post-thumb { width: 132px; height: 132px; object-fit: cover; border-radius: 10px; flex-shrink: 0; background: var(--tag-bg); display: block; }
.post-card .post-body { flex: 1; min-width: 0; }
@media (max-width: 560px) { .post-card { gap: 12px; } .post-card .post-thumb { width: 96px; height: 96px; } }
.post-card h2 { font-family: var(--font-jp); font-size: 19px; font-weight: 700; margin: 0 0 6px; line-height: 1.4; color: var(--text-1); }
.post-card .meta { font-size: 12px; color: var(--text-3); margin-bottom: 8px; }
.post-card .excerpt { font-size: 14px; color: var(--text-2); line-height: 1.7; margin: 0; }
.post-card .tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.post-card .tag { font-size: 11px; padding: 2px 9px; border-radius: 10px; background: var(--tag-bg); color: var(--text-2); font-weight: 600; }
.post-hero { font-family: var(--font-jp); font-size: 28px; font-weight: 800; line-height: 1.4; letter-spacing: -.5px; margin: 18px 0 10px; color: var(--text-1); }
.post-meta { font-size: 13px; color: var(--text-3); border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
.post-meta .author { color: var(--text-2); font-weight: 700; }
.post-meta .dot { margin: 0 6px; }
.post-body { font-size: 16px; line-height: 1.85; color: var(--text-1); }
.post-body h2 { font-family: var(--font-jp); font-size: 22px; font-weight: 700; margin: 36px 0 14px; padding-top: 8px; border-top: 2px solid var(--accent); padding-left: 0; }
.post-body h3 { font-size: 17px; font-weight: 700; margin: 28px 0 10px; color: var(--text-1); }
.post-body p { margin: 0 0 16px; }
.post-body img { margin: 20px auto; }
.post-body figure { margin: 24px 0; }
.post-body figure figcaption { font-size: 12px; color: var(--text-3); text-align: center; margin-top: 6px; }
.post-body ul, .post-body ol { padding-left: 24px; margin: 0 0 16px; }
.post-body li { margin-bottom: 6px; }
.post-body blockquote { border-left: 4px solid var(--accent); margin: 20px 0; padding: 8px 16px; background: var(--surface); color: var(--text-2); border-radius: 4px; }
/* 강조 카드 — 기본 (색상 미지정) : 무난한 베이지 */
.post-body .callout { background: #f5f1ea; border-left: 4px solid #b0a99a; border-radius: 0 12px 12px 0; padding: 14px 18px; margin: 20px 0; color: var(--text-1); }
/* 메인앱 10가지 테마와 동일한 색상 팔레트 (배경=light, 좌측 보더=color) */
.post-body .callout.callout-color-green   { background: #E0ECEA; border-left-color: #00644D; }
.post-body .callout.callout-color-blue    { background: #E1EFFE; border-left-color: #0279F7; }
.post-body .callout.callout-color-purple  { background: #E7E0F2; border-left-color: #380193; }
.post-body .callout.callout-color-coral   { background: #FFF0EB; border-left-color: #F78156; }
.post-body .callout.callout-color-rose    { background: #FDF3FA; border-left-color: #F198D5; }
.post-body .callout.callout-color-gold    { background: #FFFAE0; border-left-color: #FFDE02; }
.post-body .callout.callout-color-indigo  { background: #E3E6EB; border-left-color: #172C58; }
.post-body .callout.callout-color-cyan    { background: #E5ECF0; border-left-color: #266586; }
.post-body .callout.callout-color-lime    { background: #E7F9E7; border-left-color: #38CF39; }
.post-body .callout.callout-color-magenta { background: #FCE1F0; border-left-color: #E30884; }
/* 구분 라인 — 색상 미지정 시 기본 베이지, 테마키 또는 인라인 style 로 색상 지정 가능 */
.post-body hr.line { border: none; border-top: 2px solid #b0a99a; margin: 24px 0; }
.post-body hr.line.line-color-green   { border-top-color: #00644D; }
.post-body hr.line.line-color-blue    { border-top-color: #0279F7; }
.post-body hr.line.line-color-purple  { border-top-color: #380193; }
.post-body hr.line.line-color-coral   { border-top-color: #F78156; }
.post-body hr.line.line-color-rose    { border-top-color: #F198D5; }
.post-body hr.line.line-color-gold    { border-top-color: #FFDE02; }
.post-body hr.line.line-color-indigo  { border-top-color: #172C58; }
.post-body hr.line.line-color-cyan    { border-top-color: #266586; }
.post-body hr.line.line-color-lime    { border-top-color: #38CF39; }
.post-body hr.line.line-color-magenta { border-top-color: #E30884; }
.post-body table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }
.post-body th, .post-body td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
.post-body th { background: var(--tag-bg); font-weight: 700; }
.post-body code { background: var(--tag-bg); padding: 2px 6px; border-radius: 4px; font-size: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.post-body hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
.ad-slot { margin: 32px 0; padding: 18px; background: var(--surface); border: 1px dashed var(--border-mid); border-radius: 8px; text-align: center; font-size: 11px; color: var(--text-3); }
.site-footer { margin-top: 60px; padding: 28px 20px; border-top: 1px solid var(--border); text-align: center; font-size: 12px; color: var(--text-3); background: var(--surface); }
.site-footer a { color: var(--text-2); margin: 0 8px; }
@media (max-width: 600px) {
  body { font-size: 15px; }
  .container { padding: 20px 16px 60px; }
  .post-hero { font-size: 23px; }
  .post-body h2 { font-size: 19px; }
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {ADSENSE_CLIENT && (
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="site-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="RetWork" />
              RetWork<span>.blog</span>
            </Link>
            <nav className="site-nav">
              <Link href="/">記事一覧</Link>
              <a href="https://retwork.jp/blog/" target="_blank" rel="noopener">節約ブログ</a>
              <a href="https://retwork.jp" target="_blank" rel="noopener">アプリ</a>
            </nav>
          </div>
        </header>

        <main className="container">{children}</main>

        <footer className="site-footer">
          <div>© 2026 RetWork (チリつも). All rights reserved.</div>
          <div style={{ marginTop: 8 }}>
            <Link href="/about">運営者</Link>
            <Link href="/privacy">プライバシーポリシー</Link>
            <Link href="/terms">利用規約</Link>
            <a href="https://retwork.jp/blog/" target="_blank" rel="noopener">節約ブログ</a>
            <a href="https://retwork.jp" target="_blank" rel="noopener">RetWork アプリ</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
