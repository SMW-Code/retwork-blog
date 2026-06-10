/* ────────────────────────────────────────────────────────────
   메인앱(RetWork)과 동일한 10가지 테마 색상.
   - 에디터의 강조 카드 색상 + 글 전체 테마색에 사용
   - 메인앱 public/index.html 의 THEMES 와 동기화
   ──────────────────────────────────────────────────────────── */

export type ThemeKey =
  | 'green' | 'blue' | 'purple' | 'coral' | 'rose'
  | 'gold' | 'indigo' | 'cyan' | 'lime' | 'magenta';

export type Theme = {
  key: ThemeKey;
  name: string;       // 한국어 표시명
  color: string;      // 메인 색 (--accent)
  dark: string;       // 진한 변형
  light: string;      // 옅은 배경 (callout 배경)
  mid: string;        // 보더용 중간 톤
};

export const THEMES: Record<ThemeKey, Theme> = {
  green:   { key: 'green',   name: '에메랄드', color: '#00644D', dark: '#004132', light: '#E0ECEA', mid: '#7FB2A6' },
  blue:    { key: 'blue',    name: '오션블루', color: '#0279F7', dark: '#014FA1', light: '#E1EFFE', mid: '#80BCFB' },
  purple:  { key: 'purple',  name: '퍼플',    color: '#380193', dark: '#240160', light: '#E7E0F2', mid: '#9B80C9' },
  coral:   { key: 'coral',   name: '코랄',    color: '#F78156', dark: '#A15438', light: '#FFF0EB', mid: '#FBC0AB' },
  rose:    { key: 'rose',    name: '로즈핑크', color: '#F198D5', dark: '#9D638A', light: '#FDF3FA', mid: '#F8CCEA' },
  gold:    { key: 'gold',    name: '골드',    color: '#FFDE02', dark: '#A68C00', light: '#FFFAE0', mid: '#FFEB80' },
  indigo:  { key: 'indigo',  name: '인디고',  color: '#172C58', dark: '#0F1D39', light: '#E3E6EB', mid: '#8B95AB' },
  cyan:    { key: 'cyan',    name: '사이언',  color: '#266586', dark: '#194257', light: '#E5ECF0', mid: '#92B2C2' },
  lime:    { key: 'lime',    name: '라임',    color: '#38CF39', dark: '#248725', light: '#E7F9E7', mid: '#9BE79C' },
  magenta: { key: 'magenta', name: '마젠타',  color: '#E30884', dark: '#940556', light: '#FCE1F0', mid: '#F183C2' },
};

export const THEME_KEYS: ThemeKey[] =
  ['green', 'blue', 'purple', 'coral', 'rose', 'gold', 'indigo', 'cyan', 'lime', 'magenta'];

export const DEFAULT_THEME: ThemeKey = 'green';

export function isThemeKey(s: unknown): s is ThemeKey {
  return typeof s === 'string' && (s as string) in THEMES;
}

export function getTheme(k: unknown): Theme {
  return isThemeKey(k) ? THEMES[k] : THEMES[DEFAULT_THEME];
}
