// Applies a theme to the page: CSS custom properties on <html>, the data-theme attribute,
// color-scheme, and <meta name="theme-color"> (browser/PWA chrome).

import { type KeyValueStore, loadSettings } from '../core/storage';
import { type Theme, getTheme, themeVars } from '../core/themes';

export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  for (const [name, value] of Object.entries(themeVars(theme))) root.style.setProperty(name, value);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  root.dataset.theme = theme.id;

  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.append(meta);
  }
  meta.content = theme.colors.bg;
}

/** Apply the saved theme. Called first thing in main.ts, before the app renders anything. */
export function bootTheme(store?: KeyValueStore, doc: Document = document): Theme {
  let theme: Theme;
  try {
    theme = getTheme(loadSettings(store ?? localStorage).theme);
  } catch {
    theme = getTheme(undefined); // storage blocked
  }
  applyTheme(theme, doc);
  return theme;
}
