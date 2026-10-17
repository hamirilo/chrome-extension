import {
  META_PREFIX,
  REMOVED_META_TTL,
  SETTINGS_KEY,
  getMeta,
  loadAllMeta,
  loadSettings,
  openFullPage,
  setMeta,
} from './lib/common.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'add-page',
      title: 'このページをリーディングリストに追加',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'add-link',
      title: 'リンク先をリーディングリストに追加',
      contexts: ['link'],
    });
    // ツールバーのアイコンを右クリックしたときのメニュー
    chrome.contextMenus.create({
      id: 'open-full',
      title: '全画面で開く',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'open-side',
      title: 'サイドパネルで開く',
      contexts: ['action'],
    });
  });
  setup();
});

chrome.runtime.onStartup.addListener(setup);

async function setup() {
  await applyActionBehavior();
  await tidyMeta();
  await refreshBadge();
}

// アイコンを押したときに開くもの。ポップアップは使わない(件数が多いと最大800×600では
// 一覧が窮屈で、外をクリックすると閉じてしまうため)。既定はサイドパネル、設定で全画面にできる。
async function applyActionBehavior() {
  const settings = await loadSettings();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: settings.actionOpens !== 'fullPage' });
}

// openPanelOnActionClick が false(全画面にする設定)のときだけ呼ばれる
chrome.action.onClicked.addListener(() => openFullPage());

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-full') {
    await openFullPage();
  } else if (info.menuItemId === 'open-side') {
    // sidePanel.open はクリック直後に呼ばないと断られるので、ほかの await より先に呼ぶ
    if (tab?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId });
  } else if (info.menuItemId === 'add-page') {
    await addToList(info.pageUrl, tab?.title);
  } else if (info.menuItemId === 'add-link') {
    // リンクの文字列は取れないことがあるので、選択中の文字 → URL の順で代わりにする
    await addToList(info.linkUrl, info.linkText || info.selectionText);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'open-full') {
    await openFullPage();
    return;
  }
  if (command !== 'add-current-tab') return;
  const target = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (target) await addToList(target.url, target.title);
});

// 右クリック・ショートカットからの追加。結果はアイコンのバッジで一瞬だけ知らせる。
async function addToList(url, title) {
  if (!url) return;
  try {
    const [existing] = await chrome.readingList.query({ url });
    if (existing) {
      await flashBadge('済', '#97601f');
      return;
    }
    await chrome.readingList.addEntry({ url, title: (title || '').trim() || url, hasBeenRead: false });
    await flashBadge('+', '#26795a');
  } catch (e) {
    // chrome:// や file:// など、リーディングリストに入れられないURL
    console.warn('リーディングリストに追加できませんでした', url, e);
    await flashBadge('×', '#bc4f5b');
  }
}

let flashTimer = null;
async function flashBadge(text, color) {
  clearTimeout(flashTimer);
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  flashTimer = setTimeout(refreshBadge, 1500);
}

async function refreshBadge() {
  const settings = await loadSettings();
  if (!settings.badge) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const unread = await chrome.readingList.query({ hasBeenRead: false });
  const n = unread.length;
  await chrome.action.setBadgeBackgroundColor({ color: '#4f5ae0' });
  await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: n === 0 ? '' : n > 999 ? '999+' : String(n) });
}

// 入れ直されたら、残しておいたタグ・メモをそのまま生かす。
chrome.readingList.onEntryAdded.addListener(async (entry) => {
  const meta = await getMeta(entry.url);
  if (meta?.removedAt) {
    delete meta.removedAt;
    await setMeta(entry.url, meta);
  }
  refreshBadge();
});

// 消えたURLのタグ・メモは消した日時だけ付けておき、REMOVED_META_TTL 後に tidyMeta で片付ける。
chrome.readingList.onEntryRemoved.addListener(async (entry) => {
  const meta = await getMeta(entry.url);
  if (meta && !meta.removedAt) await setMeta(entry.url, { ...meta, removedAt: Date.now() });
  refreshBadge();
});

chrome.readingList.onEntryUpdated.addListener(() => refreshBadge());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS_KEY]) {
    refreshBadge();
    applyActionBehavior();
  }
});

// リストに無いURLのタグ・メモを整理する。拡張を止めている間に消されたものには
// ここで消した日時を付け、期限を過ぎたものだけ実際に消す。リストに戻っているものは印を外す。
async function tidyMeta() {
  const [entries, meta] = await Promise.all([chrome.readingList.query({}), loadAllMeta()]);
  const urls = new Set(entries.map((e) => e.url));
  const now = Date.now();
  const toRemove = [];
  for (const [url, m] of meta) {
    if (urls.has(url)) {
      if (m.removedAt) {
        delete m.removedAt;
        await setMeta(url, m);
      }
    } else if (!m.removedAt) {
      await setMeta(url, { ...m, removedAt: now });
    } else if (now - m.removedAt > REMOVED_META_TTL) {
      toRemove.push(META_PREFIX + url);
    }
  }
  if (toRemove.length) await chrome.storage.local.remove(toRemove);
}
