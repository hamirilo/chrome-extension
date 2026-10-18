// サイトごとの設定と、登録するコンテンツスクリプトの同期。
// 設定は chrome.storage.local の `sites` に { ホスト名: 'basic' | 'strong' } で持つ。

export const SITES_KEY = 'sites';
export const MODES = ['off', 'basic', 'strong'];

const CSS = ['content/unlock.css'];
const BASIC_JS = ['content/unlock.js'];
const STRONG_JS = ['content/unlock.js', 'content/strong.js'];
const STRONG_MAIN_JS = ['content/strong-main.js'];

export function originPattern(host) {
  return `*://${host}/*`;
}

// http(s) のページだけを対象にする。それ以外は null。
export function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
}

export async function loadSites() {
  const { [SITES_KEY]: sites } = await chrome.storage.local.get(SITES_KEY);
  return sites ?? {};
}

export async function setSiteMode(host, mode) {
  const sites = await loadSites();
  if (mode === 'off') delete sites[host];
  else sites[host] = mode;
  await chrome.storage.local.set({ [SITES_KEY]: sites });
}

export function hasPermission(host) {
  return chrome.permissions.contains({ origins: [originPattern(host)] });
}

// 同期は直列にする（storage と permissions の変更が続けて届くため）
let queue = Promise.resolve();
export function syncContentScripts() {
  queue = queue.then(doSync, doSync);
  return queue;
}

async function doSync() {
  const sites = await loadSites();
  const basic = [];
  const strong = [];
  for (const [host, mode] of Object.entries(sites)) {
    // 許可が取り消されたサイトは設定を残したまま登録だけ外す
    if (!(await hasPermission(host))) continue;
    (mode === 'strong' ? strong : basic).push(originPattern(host));
  }

  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  }

  const common = { runAt: 'document_start', allFrames: true, matchOriginAsFallback: true };
  const scripts = [];
  if (basic.length > 0) {
    scripts.push({ ...common, id: 'basic', matches: basic, css: CSS, js: BASIC_JS });
  }
  if (strong.length > 0) {
    scripts.push({ ...common, id: 'strong', matches: strong, css: CSS, js: STRONG_JS });
    scripts.push({ ...common, id: 'strong-main', matches: strong, js: STRONG_MAIN_JS, world: 'MAIN' });
  }
  if (scripts.length > 0) await chrome.scripting.registerContentScripts(scripts);
}

// 開いているタブへ今すぐ効かせる。登録したスクリプトは次の読み込みから効くため。
export async function applyToTab(tabId, mode) {
  if (mode === 'off') return;
  const strong = mode === 'strong';
  const target = { tabId, allFrames: true };
  await chrome.scripting.insertCSS({ target, files: CSS });
  await chrome.scripting.executeScript({ target, files: strong ? STRONG_JS : BASIC_JS });
  if (strong) {
    await chrome.scripting.executeScript({ target, files: STRONG_MAIN_JS, world: 'MAIN' });
  }
}
