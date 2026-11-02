import ja from './locales/ja.js';
import en from './locales/en.js';
import es from './locales/es.js';
import ptBR from './locales/pt-BR.js';
import zhHans from './locales/zh-Hans.js';
import fr from './locales/fr.js';
import de from './locales/de.js';
import ko from './locales/ko.js';
import ru from './locales/ru.js';
import it from './locales/it.js';
import zhHant from './locales/zh-Hant.js';
import id from './locales/id.js';
import tr from './locales/tr.js';
import vi from './locales/vi.js';
import th from './locales/th.js';
export const CATALOGS = {
  ja,
  en,
  es,
  'pt-BR': ptBR,
  'zh-Hans': zhHans,
  fr,
  de,
  ko,
  ru,
  it,
  'zh-Hant': zhHant,
  id,
  tr,
  vi,
  th
};
export const LANGUAGES = [
  ['ja', '日本語'],
  ['en', 'English'],
  ['es', 'Español'],
  ['pt-BR', 'Português (Brasil)'],
  ['zh-Hans', '简体中文'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['ko', '한국어'],
  ['ru', 'Русский'],
  ['it', 'Italiano'],
  ['zh-Hant', '繁體中文'],
  ['id', 'Bahasa Indonesia'],
  ['tr', 'Türkçe'],
  ['vi', 'Tiếng Việt'],
  ['th', 'ไทย']
];
export const LANGUAGE_KEY = 'saisupi.language.v1';
const LOCALES = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' };
let language = 'ja';
export function languageFromTag(tag) {
  const value = String(tag ?? '').toLowerCase();
  if (value.startsWith('zh')) { if(value.includes('hans'))return 'zh-Hans';if(value.includes('hant'))return 'zh-Hant';return /tw|hk|mo/.test(value)?'zh-Hant':'zh-Hans'; }
  if (value.startsWith('pt')) return 'pt-BR';
  return LANGUAGES.find(([key]) => key === value || value.startsWith(key + '-'))?.[0] ?? null;
}
export function resolveLanguage(saved, nav = {}) {
  if (Object.hasOwn(CATALOGS, saved)) return saved;
  for (const tag of [...(nav.languages ?? []), nav.language]) {
    const match = languageFromTag(tag);
    if (match) return match;
  }
  return 'en';
}
export function initLanguage(storage, nav) {
  let saved = null;
  try {
    saved = storage?.getItem(LANGUAGE_KEY);
  } catch {}
  language = resolveLanguage(saved, nav);
  return language;
}
export function getLanguage() {
  return language;
}
export function setLanguage(value, storage) {
  if (!Object.hasOwn(CATALOGS, value)) return false;
  language = value;
  try {
    storage?.setItem(LANGUAGE_KEY, value);
  } catch {}
  return true;
}
export function t(source, parameters = {}, selected = language) {
  const catalog=CATALOGS[selected];
  const text = catalog && Object.hasOwn(catalog,source) ? catalog[source] : source;
  return text.replace(/\{(name|count|value|time)\}/g, (_, key) => String(parameters[key] ?? ''));
}
export function formatTime(score) {
  const value =
    Number.isSafeInteger(score) && score >= 0
      ? new Intl.NumberFormat(LOCALES[language] ?? language, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: false
        }).format(score / 100)
      : '--.--';
  return t('{time}秒', { time: value });
}
// Capture static UI once. Runtime messages and player names have separate rendering.
export function bindStaticTranslations(root) {
  const bindings = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const source = node.data.trim();
      if (Object.hasOwn(ja, source))
        bindings.push(() => {
          if (node.isConnected) node.data = node.data.replace(node.data.trim(), t(source));
        });
    } else if (node.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
      for (const key of ['aria-label', 'placeholder', 'title']) {
        const source = node.getAttribute(key);
        if (Object.hasOwn(ja, source)) bindings.push(() => node.setAttribute(key, t(source)));
      }
      if (node.tagName !== 'TEXTAREA') for (const child of node.childNodes) walk(child);
    }
  };
  walk(root);
  return () => {
    bindings.forEach((apply) => apply());
    root.ownerDocument.documentElement.lang = language;
    root.ownerDocument.title = t('サイスピ');
  };
}
