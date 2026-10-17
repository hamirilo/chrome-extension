// background.js と panel.js の両方で使う処理。
//
// Chrome標準のリーディングリスト(chrome.readingList)が持っているのは
// URL・タイトル・既読かどうか・追加日時・更新日時だけ。タグ・メモ・スター・手で移したフォルダは
// この拡張が chrome.storage.local に「URLごとに1キー」(`meta:` + URL)で持つ。
// 1件1キーにしているのは、サイドパネルとバックグラウンドが同時に書き込んでも
// 別のURLの情報を上書きし合わないようにするため。

export const META_PREFIX = 'meta:';
export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS = {
  markReadOnOpen: true, // 一覧から開いたら既読にする
  openIn: 'newTab', // 'newTab' | 'currentTab'
  staleDays: 30, // 未読のままこの日数を過ぎたら「放置」とみなす
  badge: true, // アイコンに未読数を出す
  actionOpens: 'sidePanel', // ツールバーのアイコンを押したとき: 'sidePanel' | 'fullPage'
  faviconSource: 'site', // サイトのアイコンの探し方: 'cache' | 'site' | 'google'(lib/favicon.js)
};

// 全画面(タブ)で開くときのページ。panel.html をサイドパネルと共用する
export const FULL_PAGE_PATH = 'panel.html?mode=full';

export const DAY = 24 * 60 * 60 * 1000;

// リストから消えたURLのタグ・メモは、すぐには消さずにこの期間だけ残す。
// 誤って消して入れ直したとき(標準のサイドパネルから消した場合も含む)にタグが戻るようにするため。
export const REMOVED_META_TTL = 30 * DAY;

export function metaKey(url) {
  return META_PREFIX + url;
}

function isEmptyMeta(meta) {
  return !meta.tags?.length && !meta.note && !meta.starred && meta.folder === undefined && !meta.createdAt && !meta.removedAt;
}

export async function loadAllMeta() {
  const all = await chrome.storage.local.get(null);
  const meta = new Map();
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(META_PREFIX)) meta.set(key.slice(META_PREFIX.length), value);
  }
  return meta;
}

export async function getMeta(url) {
  const key = metaKey(url);
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
}

// 中身が空になったらキーごと消す(何も付けていないURLのためにキーを溜めない)。
export async function setMeta(url, meta) {
  const clean = {};
  const tags = normalizeTags(meta.tags || []);
  if (tags.length) clean.tags = tags;
  if (meta.note && meta.note.trim()) clean.note = meta.note.trim();
  if (meta.starred) clean.starred = true;
  // フォルダID。'' は「手で未分類にした」(ルールに当たっても振り分けない)。キーが無ければルールで自動
  if (typeof meta.folder === 'string') clean.folder = meta.folder;
  if (meta.createdAt) clean.createdAt = meta.createdAt;
  if (meta.removedAt) clean.removedAt = meta.removedAt;
  if (isEmptyMeta(clean)) await chrome.storage.local.remove(metaKey(url));
  else await chrome.storage.local.set({ [metaKey(url)]: clean });
}

export async function patchMeta(url, patch) {
  const current = (await getMeta(url)) || {};
  await setMeta(url, { ...current, ...patch });
}

export async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// 「#」付きで書かれても同じタグとして扱う。区切りはカンマ・読点・空白。
export function parseTags(text) {
  return normalizeTags(String(text || '').split(/[,、，\s]+/));
}

export function normalizeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const tag = String(raw || '').trim().replace(/^[#＃]+/, '');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// 重複候補を見つけるためのキー。標準のリーディングリストはURLが1文字でも違えば
// 別物として入るので、計測用パラメータ・#以降・末尾スラッシュ・http/https・www の
// 違いだけのものは同じキーにまとめる。
const TRACKING_PARAMS = /^(utm_[a-z_]+|fbclid|gclid|yclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|ref_url|_ga|_gl|si)$/i;

export function dupKey(url) {
  try {
    const u = new URL(url);
    const params = [...u.searchParams]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const search = new URLSearchParams(params).toString();
    const path = u.pathname.replace(/\/(index\.html?)?$/i, '');
    return `${u.hostname.replace(/^www\./, '')}${path}${search ? `?${search}` : ''}`;
  } catch {
    return url;
  }
}

// 検索用。全角英数・半角カナの違いや大文字小文字を無視する。
export function fold(text) {
  return String(text || '').normalize('NFKC').toLowerCase();
}

// 全画面の一覧を開く。すでに開いているタブがあればそれを前に出す(同じ画面を何枚も開かない)
export async function openFullPage() {
  const base = chrome.runtime.getURL('panel.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url?.startsWith(base) && /[?&]mode=(full|tab)\b/.test(t.url));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL(FULL_PAGE_PATH) });
}
