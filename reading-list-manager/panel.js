import {
  DAY,
  META_PREFIX,
  SETTINGS_KEY,
  dupKey,
  domainOf,
  fold,
  loadAllMeta,
  loadSettings,
  metaKey,
  normalizeTags,
  openFullPage,
  parseTags,
  patchMeta,
  saveSettings,
  setMeta,
} from './lib/common.js';
import {
  FOLDERS_KEY,
  compileRules,
  loadFolders,
  matchRule,
  newFolderId,
  parsePatterns,
  saveFolders,
} from './lib/folders.js';
import { faviconEl, initFavicons, setFaviconMode } from './lib/favicon.js';

// サイドパネルと全画面(?mode=full)で同じ画面を使う。
// サイドパネルは「読むための一覧」に絞る: 検索・未読/既読・行の ★/既読/削除 だけ。
// 並び替え・まとめ表示・絞り込み・フォルダ・タグ・メモ・一括操作などの整理は全画面で行う
// (左に「表示・絞り込み・フォルダ・サイト・タグ」、右に表のような一覧)。
const pageMode = new URLSearchParams(location.search).get('mode');
const isFull = pageMode === 'full' || pageMode === 'tab'; // 'tab' は 0.1 の頃のURL
document.body.classList.add(isFull ? 'full' : 'panel');

const PAGE_SIZE = isFull ? 300 : 200; // 一度に描く件数。数千件を一度に描くと重くなるので「さらに表示」で足す
const NAV_SITE_LIMIT = 25;
const NAV_TAG_LIMIT = 30;
// 表示の好み(未読/既読・並び順・まとめ方)はサイドパネルと全画面で別々に覚える
const VIEW_KEY = isFull ? 'rlm.view' : 'rlm.view.panel';
const UNFILED = ''; // 「未分類」のフォルダID

const $ = (id) => document.getElementById(id);
const listEl = $('list');
const currentEl = $('current');
const chipsEl = $('chips');
const selbarEl = $('selbar');
const toastEl = $('toast');
const queryEl = $('q');
const sortEl = $('sort');
const groupEl = $('group');
const siteFilterEl = $('site-filter');

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

// 固定のSVGだけ。タイトルやURLなど外から来る文字は必ず textContent で入れる。
const ICONS = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.2 5.8.85-4.2 4.1 1 5.75L12 16.8l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"/></svg>',
  read: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l4.5 4.5L19.5 6.5"/></svg>',
  unread: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l2.5-7h11l2.5 7v6H4zM4 13h5l1 2h4l1-2h5"/></svg>',
  stack: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"/></svg>',
  caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10l4 4 4-4"/></svg>',
};

const STATUSES = [
  { key: 'unread', label: '未読' },
  { key: 'read', label: '既読' },
  { key: 'all', label: 'すべて' },
];

const FLAGS = [
  { key: 'starred', label: '★ スター', test: (i) => i.starred },
  { key: 'stale', label: '放置中', test: (i) => i.isStale },
  { key: 'dup', label: '重複候補', test: (i) => i.isDup },
  { key: 'untagged', label: 'タグなし', test: (i) => !i.tags.length },
];

const savedView = loadView();
const state = {
  entries: [],
  meta: new Map(),
  settings: null,
  folders: [], // [{ id, name, patterns }]
  folderById: new Map(),
  rules: [], // compileRules(folders)
  items: [], // entries + meta を合わせたもの(render のたびに作り直す)
  byUrl: new Map(),
  sampleUrlByDomain: new Map(), // サイトのアイコンを探すときに使う、そのサイトの実際のURL
  filtered: [],
  visibleUrls: [],
  status: savedView.status || 'unread',
  sort: (isFull && savedView.sort) || 'newest', // サイドパネルは常に新しい順・まとめない
  group: (isFull && savedView.group) || 'none',
  folder: null, // null = すべて / '' = 未分類 / フォルダID
  site: null, // ドメイン(完全一致)
  flags: new Set(),
  tags: new Set(),
  query: '',
  siteFilter: '',
  showAllTags: false,
  showAllSites: false,
  collapsed: new Set(), // たたんだまとまり(`まとめ方:キー`)
  selected: new Set(),
  lastClicked: null,
  limit: PAGE_SIZE,
  editing: null, // { url, title, tags, note, folder }(全画面だけ)
  editorEl: null,
  renderSkipped: false, // 編集中で一覧の描き直しを見送ったか
  currentTab: null,
  confirmingDelete: false,
};

function loadView() {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY)) || {};
  } catch {
    return {};
  }
}

function saveView() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ status: state.status, sort: state.sort, group: state.group }));
  } catch {
    // 保存できなくても動作には影響しない
  }
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // ICONS 専用
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'checked' || k === 'value') el[k] = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

function icon(name, className = 'ico') {
  return h('span', { class: className, html: ICONS[name] });
}

// サイト単位のアイコン。`https://ドメイン/` で探すとポート違いや http のサイト、
// Chrome がページのURLで覚えているアイコンを取りこぼすので、そのサイトの実際のURLを使う
function siteFavicon(domain, className) {
  return faviconEl(state.sampleUrlByDomain.get(domain) || `https://${domain}/`, className);
}

function relativeDate(ts) {
  const days = Math.floor((Date.now() - ts) / DAY);
  if (days <= 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 30) return `${days}日前`;
  if (days < 365) return `${Math.floor(days / 30)}か月前`;
  return `${Math.floor(days / 365)}年前`;
}

function fullDate(ts) {
  return new Date(ts).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
}

function folderName(id) {
  if (id === UNFILED) return '未分類';
  return state.folderById.get(id)?.name ?? '(削除したフォルダ)';
}

function urlPath(url) {
  try {
    const u = new URL(url);
    const rest = `${u.pathname}${u.search}`;
    try {
      return decodeURI(rest);
    } catch {
      return rest;
    }
  } catch {
    return url;
  }
}

// ---------- データ ----------

let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reload, 80);
}

async function reload() {
  const [entries, meta, settings, folders] = await Promise.all([
    chrome.readingList.query({}),
    loadAllMeta(),
    loadSettings(),
    loadFolders(),
  ]);
  state.entries = entries;
  state.meta = meta;
  state.settings = settings;
  setFolders(folders);
  setFaviconMode(settings.faviconSource);
  render();
}

function setFolders(folders) {
  state.folders = folders;
  state.folderById = new Map(folders.map((f) => [f.id, f]));
  state.rules = compileRules(folders);
  if (state.folder && !state.folderById.has(state.folder)) state.folder = null;
}

function buildItems() {
  const staleMs = state.settings.staleDays * DAY;
  const now = Date.now();
  const dupCounts = new Map();
  const keys = state.entries.map((e) => {
    const key = dupKey(e.url);
    dupCounts.set(key, (dupCounts.get(key) || 0) + 1);
    return key;
  });
  return state.entries.map((e, i) => {
    const m = state.meta.get(e.url) || {};
    const title = e.title || e.url;
    const tags = m.tags || [];
    const note = m.note || '';
    const createdAt = m.createdAt || e.creationTime;
    // 手で移したフォルダが残っていればそれ、なければルールで決める(消したフォルダを指していたら自動に戻す)
    const manual = typeof m.folder === 'string' && (m.folder === UNFILED || state.folderById.has(m.folder)) ? m.folder : undefined;
    const rule = manual === undefined ? matchRule(e.url, state.rules) : null;
    return {
      url: e.url,
      title,
      hasBeenRead: e.hasBeenRead,
      createdAt,
      tags,
      note,
      starred: !!m.starred,
      domain: domainOf(e.url),
      folderId: manual ?? (rule ? rule.id : UNFILED),
      folderManual: manual !== undefined,
      folderRule: rule?.pattern || null,
      dupKey: keys[i],
      isDup: dupCounts.get(keys[i]) > 1,
      isStale: !e.hasBeenRead && now - createdAt > staleMs,
      haystack: fold(`${title}\n${e.url}\n${tags.join(' ')}\n${note}`),
      foldedTags: tags.map(fold),
    };
  });
}

// 「#タグ」「site:ドメイン」「-除外語」と、ふつうの語(すべて含むものだけ)を組み合わせられる
function parseQuery(q) {
  const terms = { words: [], not: [], tags: [], sites: [] };
  for (const raw of fold(q).split(/\s+/).filter(Boolean)) {
    if (raw.length > 1 && raw.startsWith('-')) terms.not.push(raw.slice(1));
    else if (raw.length > 1 && raw.startsWith('#')) terms.tags.push(raw.slice(1));
    else if (raw.length > 5 && raw.startsWith('site:')) terms.sites.push(raw.slice(5));
    else terms.words.push(raw);
  }
  return terms;
}

function matchesQuery(item, t) {
  return (
    t.words.every((w) => item.haystack.includes(w)) &&
    !t.not.some((w) => item.haystack.includes(w)) &&
    t.tags.every((w) => item.foldedTags.some((tag) => tag.includes(w))) &&
    t.sites.every((w) => item.domain.includes(w))
  );
}

const matchesStatus = (item, status) =>
  status === 'all' || (status === 'read' ? item.hasBeenRead : !item.hasBeenRead);

function matchesChips(item) {
  for (const f of FLAGS) if (state.flags.has(f.key) && !f.test(item)) return false;
  for (const tag of state.tags) if (!item.tags.includes(tag)) return false;
  return true;
}

function sortItems(items) {
  const byNewest = (a, b) => b.createdAt - a.createdAt;
  const cmp = {
    newest: byNewest,
    oldest: (a, b) => a.createdAt - b.createdAt,
    title: (a, b) => collator.compare(a.title, b.title) || byNewest(a, b),
    domain: (a, b) => collator.compare(a.domain, b.domain) || byNewest(a, b),
  }[state.sort];
  return items.sort(cmp);
}

function groupItems(items) {
  // 重複候補を見ているときは、同じURLとみなしたもの同士を並べて見比べられるようにする
  if (state.flags.has('dup')) {
    return bucket(items, (i) => [i.dupKey], (k) => k).sort((a, b) => collator.compare(a.key, b.key));
  }
  switch (state.group) {
    case 'folder': {
      const order = new Map(state.folders.map((f, i) => [f.id, i]));
      return bucket(items, (i) => [i.folderId], folderName).sort(
        (a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity)
      );
    }
    case 'domain':
      return bucket(items, (i) => [i.domain], (k) => k || '(ドメインなし)').sort(
        (a, b) => b.items.length - a.items.length || collator.compare(a.key, b.key)
      );
    case 'tag': {
      const groups = bucket(items, (i) => (i.tags.length ? i.tags : ['']), (k) => (k ? `#${k}` : 'タグなし'));
      return groups.sort((a, b) => (!a.key) - (!b.key) || b.items.length - a.items.length || collator.compare(a.key, b.key));
    }
    case 'month': {
      const groups = bucket(
        items,
        (i) => {
          const d = new Date(i.createdAt);
          return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`];
        },
        (k) => `${Number(k.slice(0, 4))}年${Number(k.slice(5))}月`
      );
      const dir = state.sort === 'oldest' ? 1 : -1;
      return groups.sort((a, b) => (a.key < b.key ? -dir : a.key > b.key ? dir : 0));
    }
    default:
      return [{ key: '', label: null, items }];
  }
}

function bucket(items, keysOf, labelOf) {
  const map = new Map();
  for (const item of items) {
    for (const key of keysOf(item)) {
      if (!map.has(key)) map.set(key, { key, label: labelOf(key), items: [] });
      map.get(key).items.push(item);
    }
  }
  return [...map.values()];
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const i of items) {
    for (const k of [].concat(keyOf(i))) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

// ---------- 描画 ----------

function editorFocused() {
  return state.editorEl && state.editorEl.contains(document.activeElement);
}

function render() {
  state.items = buildItems();
  state.byUrl = new Map(state.items.map((i) => [i.url, i]));
  state.sampleUrlByDomain = new Map();
  for (const i of state.items) if (!state.sampleUrlByDomain.has(i.domain)) state.sampleUrlByDomain.set(i.domain, i.url);
  if (state.editing && !state.byUrl.has(state.editing.url)) closeEditor(false);

  // 絞り込みは5種類。左の一覧(サイドパネルではボタン・チップ)の件数は
  // 「その種類の絞り込みだけを外したとき」の件数にする(押したら何件になるかが分かるように)。
  const terms = parseQuery(state.query);
  const tests = {
    query: (i) => matchesQuery(i, terms),
    status: (i) => matchesStatus(i, state.status),
    chips: matchesChips,
    folder: (i) => state.folder === null || i.folderId === state.folder,
    site: (i) => !state.site || i.domain === state.site,
  };
  const except = (skip) =>
    state.items.filter((i) => {
      for (const k in tests) if (k !== skip && !tests[k](i)) return false;
      return true;
    });
  state.filtered = sortItems(except(null));
  const facets = { status: except('status'), chips: except('chips'), folder: except('folder'), site: except('site') };

  // 見えていないものが選ばれたままだと、気づかずに一括削除してしまうので外す
  // (「未読」を見ながら既読にした行など、操作の結果で見えなくなったものも含む)
  const visible = new Set(state.filtered.map((i) => i.url));
  for (const url of state.selected) if (!visible.has(url)) state.selected.delete(url);

  if (isFull) {
    renderNav(facets);
    renderSummary();
    renderChips();
    updateSelbar();
  } else {
    renderStatus(facets.status);
  }
  // 入力中の欄を描き直すとカーソルが飛ぶので、編集欄にフォーカスがある間は一覧を描き直さない。
  // 編集を閉じたときにまとめて描き直す。
  state.renderSkipped = editorFocused();
  if (state.renderSkipped) return;
  renderCurrent();
  renderList();
}

// ----- サイドパネル: 未読/既読/すべて -----

function renderStatus(items) {
  const counts = { unread: 0, read: 0, all: items.length };
  for (const i of items) counts[i.hasBeenRead ? 'read' : 'unread']++;
  for (const btn of document.querySelectorAll('#status-seg button')) {
    const s = btn.dataset.status;
    btn.classList.toggle('active', s === state.status);
    btn.setAttribute('aria-selected', String(s === state.status));
    btn.querySelector('.n').textContent = counts[s];
  }
}

// 全画面では絞り込みは左の一覧で選ぶので、一覧の上には「今かかっている絞り込み」だけを外せる形で並べる
function renderChips() {
  const active = activeFilters();
  const chips = active.map((f) =>
    h('button', { class: 'chip active removable', title: '外す', onclick: f.clear }, f.label, h('span', { class: 'x' }, '×')));
  if (active.length > 1) chips.push(h('button', { class: 'link-btn', onclick: clearFilters }, 'すべて解除'));
  chipsEl.replaceChildren(...chips);
  chipsEl.hidden = chips.length === 0;
}

function flagTitle(key) {
  if (key === 'stale') return `未読のまま${state.settings.staleDays}日以上たったもの`;
  if (key === 'dup') return 'URLの計測用パラメータ・#以降・末尾の / などだけが違うもの';
  return null;
}

function tagCounts(scope) {
  const counts = countBy(scope, (i) => i.tags);
  for (const t of state.tags) if (!counts.has(t)) counts.set(t, 0);
  return [...counts].sort(([a, an], [b, bn]) => state.tags.has(b) - state.tags.has(a) || bn - an || collator.compare(a, b));
}

function activeFilters() {
  const list = [];
  if (state.folder !== null) list.push({ label: `フォルダ: ${folderName(state.folder)}`, clear: () => setFolderFilter(null) });
  if (state.site) list.push({ label: `サイト: ${state.site}`, clear: () => setSite(null) });
  for (const f of FLAGS) if (state.flags.has(f.key)) list.push({ label: f.label, clear: () => toggleSet(state.flags, f.key) });
  for (const t of state.tags) list.push({ label: `#${t}`, clear: () => toggleSet(state.tags, t) });
  if (state.query) list.push({ label: `検索: ${state.query}`, clear: () => setQuery('') });
  return list;
}

function toggleSet(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
  state.limit = PAGE_SIZE;
  render();
}

function setSite(domain) {
  state.site = domain && state.site !== domain ? domain : null;
  state.limit = PAGE_SIZE;
  render();
}

function setFolderFilter(id) {
  state.folder = id;
  state.limit = PAGE_SIZE;
  render();
}

function setStatus(status) {
  state.status = status;
  state.limit = PAGE_SIZE;
  saveView();
  render();
}

// ----- 全画面: 左の一覧 -----

function navRow({ label, n, active, onclick, lead, title, extra, cls = '' }) {
  return h('div', { class: `nav-row${active ? ' active' : ''}${n === 0 && !active ? ' is-zero' : ''} ${cls}` },
    h('button', { class: 'nav-btn', onclick, title, 'aria-pressed': String(!!active) },
      lead || null,
      h('span', { class: 'nav-label' }, label),
      h('span', { class: 'nav-n' }, String(n))),
    extra || null);
}

function renderNav(f) {
  const statusCounts = { unread: 0, read: 0, all: f.status.length };
  for (const i of f.status) statusCounts[i.hasBeenRead ? 'read' : 'unread']++;
  $('nav-status').replaceChildren(...STATUSES.map((s) =>
    navRow({ label: s.label, n: statusCounts[s.key], active: state.status === s.key, onclick: () => setStatus(s.key), lead: icon(s.key === 'all' ? 'stack' : s.key === 'read' ? 'read' : 'unread') })));

  $('nav-flags').replaceChildren(...FLAGS.map((fl) =>
    navRow({ label: fl.label, n: f.chips.filter(fl.test).length, active: state.flags.has(fl.key), title: flagTitle(fl.key), onclick: () => toggleSet(state.flags, fl.key) })));

  const folderCounts = countBy(f.folder, (i) => i.folderId);
  const folderRows = [
    navRow({ label: 'すべて', n: f.folder.length, active: state.folder === null, onclick: () => setFolderFilter(null), lead: icon('stack') }),
    ...state.folders.map((fo) =>
      navRow({
        label: fo.name,
        n: folderCounts.get(fo.id) || 0,
        active: state.folder === fo.id,
        title: fo.patterns.length ? `自動で振り分けるサイト: ${fo.patterns.join(', ')}` : '自動で振り分けるサイトはまだありません',
        onclick: () => setFolderFilter(state.folder === fo.id ? null : fo.id),
        lead: icon('folder'),
      })),
    navRow({ label: '未分類', n: folderCounts.get(UNFILED) || 0, active: state.folder === UNFILED, onclick: () => setFolderFilter(state.folder === UNFILED ? null : UNFILED), lead: icon('inbox') }),
  ];
  if (!state.folders.length) {
    folderRows.push(h('p', { class: 'nav-hint' }, 'サイトの右の「→」から、そのサイトを入れるフォルダを作れます。',
      h('button', { class: 'link-btn', onclick: () => openRules() }, '振り分けを設定する')));
  }
  $('nav-folders').replaceChildren(...folderRows);

  // サイトは件数の多い順。左の欄の「サイトを探す」で絞れる
  const ruleByDomain = new Map();
  for (const fo of state.folders) for (const p of fo.patterns) if (!p.includes('/')) ruleByDomain.set(p, fo.name);
  const filter = fold(state.siteFilter.trim());
  let sites = [...countBy(f.site, (i) => i.domain)]
    .filter(([d]) => d && (!filter || fold(d).includes(filter)))
    .sort(([a, an], [b, bn]) => bn - an || collator.compare(a, b));
  const total = sites.length;
  if (!state.showAllSites && !filter) {
    const top = sites.slice(0, NAV_SITE_LIMIT);
    if (state.site && !top.some(([d]) => d === state.site)) top.unshift(...sites.filter(([d]) => d === state.site));
    sites = top;
  }
  const siteRows = sites.map(([domain, n]) =>
    navRow({
      label: domain,
      n,
      active: state.site === domain,
      cls: 'site',
      title: ruleByDomain.has(domain) ? `${domain} → フォルダ「${ruleByDomain.get(domain)}」へ自動で振り分け中` : domain,
      onclick: () => setSite(domain),
      lead: siteFavicon(domain, 'nav-fav'),
      extra: h('button', {
        class: `nav-assign${ruleByDomain.has(domain) ? ' on' : ''}`,
        title: ruleByDomain.has(domain) ? `振り分け先: ${ruleByDomain.get(domain)}(変更)` : 'このサイトをフォルダへ自動で振り分ける',
        onclick: (e) => openAssignMenu(domain, e.currentTarget),
      }, ruleByDomain.has(domain) ? ruleByDomain.get(domain) : icon('arrow')),
    }));
  if (!filter && total > NAV_SITE_LIMIT) {
    siteRows.push(h('button', { class: 'nav-more', onclick: () => { state.showAllSites = !state.showAllSites; render(); } },
      state.showAllSites ? '少なく表示' : `すべてのサイト(${total})`));
  }
  if (!siteRows.length) siteRows.push(h('p', { class: 'nav-hint' }, filter ? '見つかりません' : 'まだありません'));
  $('nav-sites').replaceChildren(...siteRows);

  const tags = tagCounts(f.chips);
  const shownTags = state.showAllTags ? tags : tags.slice(0, NAV_TAG_LIMIT);
  const tagRows = shownTags.map(([tag, n]) => navRow({ label: `#${tag}`, n, active: state.tags.has(tag), cls: 'tag-row', onclick: () => toggleSet(state.tags, tag) }));
  if (tags.length > NAV_TAG_LIMIT) {
    tagRows.push(h('button', { class: 'nav-more', onclick: () => { state.showAllTags = !state.showAllTags; render(); } },
      state.showAllTags ? '少なく表示' : `すべてのタグ(${tags.length})`));
  }
  if (!tagRows.length) tagRows.push(h('p', { class: 'nav-hint' }, '行の編集(鉛筆)からタグを付けられます'));
  $('nav-tags').replaceChildren(...tagRows);
}

function renderSummary() {
  const unread = state.items.filter((i) => !i.hasBeenRead).length;
  $('brand-count').textContent = `全${state.items.length}件・未読${unread}件`;
  $('result-count').textContent = `${state.filtered.length}件`;
}

// ----- 今のページ(サイドパネルだけ) -----

function renderCurrent() {
  const tab = state.currentTab;
  if (isFull || !tab) {
    currentEl.hidden = true;
    return;
  }
  currentEl.hidden = false;
  const item = state.byUrl.get(tab.url);
  const action = item
    ? h('button', { class: 'btn', onclick: () => setRead([item.url], !item.hasBeenRead) }, item.hasBeenRead ? '未読に戻す' : '既読にする')
    : h('button', { class: 'btn btn-primary', onclick: addCurrentTab }, '＋ 追加');
  const label = item ? (item.hasBeenRead ? 'リストにあります(既読)' : 'リストにあります(未読)') : '今のページ';
  currentEl.replaceChildren(
    h('div', { class: 'current-main' },
      faviconEl(tab.url),
      h('div', { class: 'current-body' },
        h('div', { class: `current-label${item ? ' in-list' : ''}` }, label),
        h('div', { class: 'current-title', title: tab.url }, tab.title || tab.url)),
      h('div', { class: 'current-actions' }, action)));
}

// ----- 一覧 -----

function renderList() {
  const items = state.filtered;
  state.visibleUrls = [];
  if (!state.entries.length) {
    listEl.replaceChildren(
      h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'リーディングリストは空です'),
        h('p', {}, 'ページを右クリック →「このページをリーディングリストに追加」か、Chromeのブックマークメニューの「リーディングリストに追加」で入れたものがここに出ます。'))
    );
    return;
  }
  if (!items.length) {
    const hasFilter = activeFilters().length > 0;
    listEl.replaceChildren(
      h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, '条件に合うものはありません'),
        hasFilter ? h('button', { class: 'btn', onclick: clearFilters }, '絞り込みを解除') : null)
    );
    return;
  }

  const nodes = [];
  const seen = new Set();
  let rendered = 0;
  let hidden = 0;
  const groupMode = state.flags.has('dup') ? 'dup' : state.group;
  for (const group of groupItems(items)) {
    if (rendered >= state.limit) {
      hidden += group.items.length;
      continue;
    }
    const collapseKey = `${groupMode}:${group.key}`;
    const collapsed = group.label !== null && state.collapsed.has(collapseKey);
    if (group.label !== null) nodes.push(groupHeader(group, groupMode, collapseKey, collapsed));
    if (collapsed) continue;
    for (const item of group.items) {
      if (rendered >= state.limit) {
        hidden++;
        continue;
      }
      nodes.push(renderItem(item));
      rendered++;
      if (!seen.has(item.url)) {
        seen.add(item.url);
        state.visibleUrls.push(item.url);
      }
    }
  }
  if (hidden) {
    nodes.push(
      h('button', { class: 'more-btn', onclick: () => { state.limit += PAGE_SIZE; renderList(); } }, `さらに表示(残り${hidden}件)`)
    );
  }
  if (!isFull) {
    nodes.push(h('div', { class: 'panel-foot' },
      h('button', { class: 'link-btn', onclick: () => openFullPage() }, 'フォルダ・タグ・並び替え・まとめて整理は全画面で →')));
  }
  listEl.replaceChildren(...nodes);
}

function groupHeader(group, groupMode, collapseKey, collapsed) {
  const urls = group.items.map((i) => i.url);
  const all = urls.every((u) => state.selected.has(u));
  let lead = null;
  if (groupMode === 'domain' && group.key) lead = siteFavicon(group.key);
  else if (groupMode === 'folder') lead = icon(group.key === UNFILED ? 'inbox' : 'folder');
  return h('div', { class: `group-head${collapsed ? ' collapsed' : ''}` },
    h('input', {
      type: 'checkbox',
      checked: all,
      title: 'このまとまりをすべて選択',
      onclick: (e) => {
        for (const u of urls) {
          if (e.target.checked) state.selected.add(u);
          else state.selected.delete(u);
        }
        render();
      },
    }),
    h('button', {
      class: 'group-toggle',
      title: collapsed ? '開く' : 'たたむ',
      'aria-expanded': String(!collapsed),
      onclick: () => {
        if (collapsed) state.collapsed.delete(collapseKey);
        else state.collapsed.add(collapseKey);
        renderList();
      },
    },
      icon('caret', 'caret'),
      lead,
      h('span', { class: 'group-label' }, group.label),
      h('span', { class: 'group-n' }, `${group.items.length}件`)));
}

function folderBadge(item) {
  if (item.folderId === UNFILED) return h('span', { class: 'folder-none' }, '未分類');
  const how = item.folderManual ? '手で振り分け' : `自動(${item.folderRule})`;
  return h('button', {
    class: `folder-badge${item.folderManual ? ' manual' : ''}`,
    title: `フォルダ「${folderName(item.folderId)}」・${how}。押すとこのフォルダだけを表示`,
    onclick: () => setFolderFilter(item.folderId),
  }, icon('folder'), folderName(item.folderId));
}

function renderItem(item) {
  return isFull ? renderFullItem(item) : renderPanelItem(item);
}

function titleLink(item) {
  return h('a', {
    class: 'title',
    href: item.url,
    title: item.url,
    onclick: (e) => { e.preventDefault(); openItem(item, e.ctrlKey || e.metaKey || e.shiftKey); },
    onauxclick: (e) => { if (e.button === 1) { e.preventDefault(); openItem(item, true); } },
  }, item.title);
}

function starButton(item) {
  return h('button', { class: `icon-btn star${item.starred ? ' on' : ''}`, title: item.starred ? 'スターを外す' : 'スターを付ける', html: ICONS.star, onclick: () => toggleStar(item) });
}

function readButton(item) {
  return h('button', { class: 'icon-btn', title: item.hasBeenRead ? '未読に戻す' : '既読にする', html: item.hasBeenRead ? ICONS.unread : ICONS.read, onclick: () => setRead([item.url], !item.hasBeenRead) });
}

function deleteButton(item) {
  return h('button', { class: 'icon-btn danger', title: '削除', html: ICONS.trash, onclick: () => deleteItems([item]) });
}

// サイドパネルの行: アイコン・タイトル・サイト名・追加日だけ。操作はマウスを乗せたときの ★/既読/削除 だけ
function renderPanelItem(item) {
  return h('div', { class: `item${item.hasBeenRead ? ' read' : ''}`, dataset: { url: item.url } },
    faviconEl(item.url),
    h('div', { class: 'item-body' },
      titleLink(item),
      h('div', { class: 'sub' },
        item.starred ? h('span', { class: 'starred-mark', title: 'スター付き' }, '★') : null,
        h('span', { class: 'domain' }, item.domain),
        h('span', { class: 'date', title: `追加: ${fullDate(item.createdAt)}` }, relativeDate(item.createdAt)))),
    h('div', { class: 'actions' }, starButton(item), readButton(item), deleteButton(item)));
}

function renderFullItem(item) {
  const selected = state.selected.has(item.url);
  const sub = [];
  if (item.starred) sub.push(h('span', { class: 'starred-mark', title: 'スター付き' }, '★'));
  sub.push(h('button', { class: 'domain', title: `${item.domain} だけを表示`, onclick: () => setSite(item.domain) }, item.domain));
  sub.push(h('span', { class: 'path', title: item.url }, urlPath(item.url)));
  if (item.isStale) sub.push(h('span', { class: 'badge stale', title: '未読のまま長く置かれています' }, '放置'));
  if (item.isDup) sub.push(h('button', { class: 'badge dup', title: '似たURLが他にもあります。押すと重複候補だけを表示', onclick: () => { state.flags.add('dup'); render(); } }, '重複'));

  const editingHere = state.editing?.url === item.url;
  return h('div', { class: `item${item.hasBeenRead ? ' read' : ''}${selected ? ' selected' : ''}`, dataset: { url: item.url } },
    h('input', { type: 'checkbox', class: 'sel', checked: selected, title: '選択(Shift+クリックで範囲選択)', onclick: (e) => onSelectClick(item.url, e) }),
    faviconEl(item.url),
    h('div', { class: 'item-body' },
      titleLink(item),
      h('div', { class: 'sub' }, sub),
      item.tags.length
        ? h('div', { class: 'tags' }, item.tags.map((t) =>
            h('button', { class: `tag${state.tags.has(t) ? ' active' : ''}`, onclick: () => toggleSet(state.tags, t) }, `#${t}`)))
        : null,
      item.note ? h('div', { class: 'note', title: item.note }, item.note) : null,
      editingHere ? editorFor(item) : null),
    h('div', { class: 'col-folder' }, folderBadge(item)),
    h('div', { class: 'col-date', title: `追加: ${fullDate(item.createdAt)}` }, relativeDate(item.createdAt)),
    h('div', { class: 'actions' },
      starButton(item),
      readButton(item),
      h('button', { class: 'icon-btn', title: 'タイトル・フォルダ・タグ・メモを編集', html: ICONS.edit, onclick: () => openEditor(item) }),
      deleteButton(item)));
}

// ---------- 編集 ----------

function openEditor(item) {
  state.editing = {
    url: item.url,
    title: item.title,
    tags: [...item.tags],
    note: item.note,
    folder: item.folderManual ? item.folderId : '__auto',
  };
  state.editorEl = null;
  render();
  state.editorEl?.querySelector('.tag-input')?.focus();
  state.editorEl?.scrollIntoView({ block: 'nearest' });
}

function closeEditor(rerender = true) {
  state.editing = null;
  state.editorEl = null;
  if (rerender) render();
}

function allTagsByCount() {
  return [...countBy(state.items, (i) => i.tags)].sort(([a, an], [b, bn]) => bn - an || collator.compare(a, b)).map(([t]) => t);
}

function folderField(item, d) {
  if (!state.folders.length) return null;
  const hit = matchRule(item.url, state.rules);
  const autoLabel = hit ? `自動: ${folderName(hit.id)}(${hit.pattern} に当てはまる)` : '自動: 未分類(当てはまるルールなし)';
  const select = h('select', { class: 'folder-input', onchange: (e) => { d.folder = e.target.value; } },
    h('option', { value: '__auto' }, autoLabel),
    ...state.folders.map((f) => h('option', { value: f.id }, f.name)),
    h('option', { value: UNFILED }, '未分類'));
  select.value = d.folder;
  return h('label', { class: 'ed-field' }, h('span', {}, 'フォルダ'), select);
}

function editorFor(item) {
  const d = state.editing;
  const known = allTagsByCount();
  const chipsIn = h('span', { class: 'tag-chips' });
  const suggest = h('div', { class: 'suggest' });
  const tagInput = h('input', { type: 'text', class: 'tag-input', placeholder: d.tags.length ? '' : 'タグを入力して Enter', autocomplete: 'off' });

  const addTags = (text) => {
    d.tags = normalizeTags([...d.tags, ...parseTags(text)]);
    tagInput.value = '';
    paintTags();
  };
  const paintTags = () => {
    chipsIn.replaceChildren(...d.tags.map((t) =>
      h('span', { class: 'tag-chip' }, `#${t}`,
        h('button', { type: 'button', title: '外す', onclick: () => { d.tags = d.tags.filter((x) => x !== t); paintTags(); tagInput.focus(); } }, '×'))));
    const typed = fold(tagInput.value.trim().replace(/^#/, ''));
    const cands = known.filter((t) => !d.tags.includes(t) && (!typed || fold(t).includes(typed))).slice(0, 8);
    suggest.replaceChildren(...(cands.length ? [h('span', { class: 'suggest-label' }, typed ? '候補:' : 'よく使うタグ:')] : []),
      ...cands.map((t) => h('button', { type: 'button', class: 'tag', onclick: () => { addTags(t); tagInput.focus(); } }, `#${t}`)));
    tagInput.placeholder = d.tags.length ? '' : 'タグを入力して Enter';
  };

  tagInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // 日本語の変換確定のEnterではタグにしない
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && tagInput.value.trim()) {
      e.preventDefault();
      addTags(tagInput.value);
    } else if (e.key === 'Backspace' && !tagInput.value && d.tags.length) {
      d.tags = d.tags.slice(0, -1);
      paintTags();
    }
  });
  tagInput.addEventListener('input', paintTags);
  paintTags();

  const titleInput = h('input', { type: 'text', class: 'title-input', value: d.title, oninput: (e) => { d.title = e.target.value; } });
  const noteInput = h('textarea', { rows: 3, placeholder: 'メモ(なぜ保存したか・読んだ感想など)', oninput: (e) => { d.note = e.target.value; } });
  noteInput.value = d.note;

  const save = async () => {
    if (tagInput.value.trim()) addTags(tagInput.value);
    await saveEditor(item);
  };
  const el = h('div', {
    class: 'editor',
    onkeydown: (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEditor(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    },
  },
    h('label', { class: 'ed-field' }, h('span', {}, 'タイトル'), titleInput),
    folderField(item, d),
    h('div', { class: 'ed-field' }, h('span', {}, 'タグ'),
      h('div', { class: 'tag-editor', onclick: (e) => { if (e.target === e.currentTarget) tagInput.focus(); } }, chipsIn, tagInput),
      suggest),
    h('label', { class: 'ed-field' }, h('span', {}, 'メモ'), noteInput),
    h('div', { class: 'ed-actions' },
      h('span', { class: 'hint' }, 'Ctrl+Enter で保存 / Esc でやめる'),
      h('button', { type: 'button', class: 'btn', onclick: () => closeEditor() }, 'やめる'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, '保存')));
  state.editorEl = el;
  return el;
}

async function saveEditor(item) {
  const d = state.editing;
  if (!d) return;
  const title = d.title.trim();
  const folder = d.folder === '__auto' ? undefined : d.folder;
  try {
    if (title && title !== item.title) await chrome.readingList.updateEntry({ url: item.url, title });
    await patchMeta(item.url, { tags: d.tags, note: d.note, folder });
    // 保存イベントを待たずに画面へ反映する(すぐに reload でも上書きされる)
    const next = { ...(state.meta.get(item.url) || {}), tags: d.tags, note: d.note.trim(), folder };
    if (folder === undefined) delete next.folder;
    state.meta.set(item.url, next);
    closeEditor();
  } catch (e) {
    showToast(`保存できませんでした: ${e.message}`);
  }
}

// ---------- 操作 ----------

function onSelectClick(url, e) {
  const on = e.target.checked;
  if (e.shiftKey && state.lastClicked && state.visibleUrls.includes(state.lastClicked)) {
    const a = state.visibleUrls.indexOf(state.lastClicked);
    const b = state.visibleUrls.indexOf(url);
    for (const u of state.visibleUrls.slice(Math.min(a, b), Math.max(a, b) + 1)) {
      if (on) state.selected.add(u);
      else state.selected.delete(u);
    }
  } else if (on) {
    state.selected.add(url);
  } else {
    state.selected.delete(url);
  }
  state.lastClicked = url;
  state.confirmingDelete = false;
  render();
}

async function openItem(item, background) {
  const url = item.url;
  if (background || isFull || state.settings.openIn === 'newTab') {
    await chrome.tabs.create({ url, active: !background });
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await chrome.tabs.update(tab.id, { url });
    else await chrome.tabs.create({ url });
  }
  if (state.settings.markReadOnOpen && !item.hasBeenRead) await setRead([url], true);
}

async function setRead(urls, hasBeenRead) {
  for (const url of urls) {
    const item = state.byUrl.get(url);
    if (item && item.hasBeenRead !== hasBeenRead) await chrome.readingList.updateEntry({ url, hasBeenRead });
  }
}

async function toggleStar(item) {
  await patchMeta(item.url, { starred: !item.starred });
}

async function setStar(urls, starred) {
  for (const url of urls) await patchMeta(url, { starred });
}

async function addTagTo(urls, tags) {
  for (const url of urls) {
    const item = state.byUrl.get(url);
    if (item) await patchMeta(url, { tags: [...item.tags, ...tags] });
  }
}

async function removeTagFrom(urls, tags) {
  for (const url of urls) {
    const item = state.byUrl.get(url);
    if (item) await patchMeta(url, { tags: item.tags.filter((t) => !tags.includes(t)) });
  }
}

// folder: フォルダID / '' = 未分類にする / undefined = 自動の振り分けに戻す
async function moveToFolder(urls, folder) {
  for (const url of urls) await patchMeta(url, { folder });
  const where = folder === undefined ? '自動の振り分け' : `「${folderName(folder)}」`;
  showToast(`${urls.length}件を${where}に${folder === undefined ? '戻しました' : '移しました'}`);
}

async function deleteItems(items) {
  // 元に戻せるように、消す前の状態を取っておく
  const backup = items.map((i) => ({
    url: i.url,
    title: i.title,
    hasBeenRead: i.hasBeenRead,
    createdAt: i.createdAt,
    meta: state.meta.get(i.url) || {},
  }));
  for (const i of items) {
    state.selected.delete(i.url);
    await chrome.readingList.removeEntry({ url: i.url }).catch(() => {});
  }
  showToast(`${items.length}件削除しました`, { action: '元に戻す', onAction: () => restore(backup), duration: 12000 });
}

async function restore(backup) {
  let failed = 0;
  for (const b of backup) {
    // 標準のリーディングリストでは追加日を指定できないので、元の追加日はこちらで持つ。
    // 先にタグ・メモを書いてから入れ直す(background の onEntryAdded と書き込みがぶつからないように)。
    await setMeta(b.url, { ...b.meta, removedAt: undefined, createdAt: b.createdAt });
    try {
      await chrome.readingList.addEntry({ url: b.url, title: b.title, hasBeenRead: b.hasBeenRead });
    } catch {
      failed++;
    }
  }
  showToast(failed ? `${backup.length - failed}件戻しました(${failed}件は戻せませんでした)` : `${backup.length}件戻しました`);
}

async function addCurrentTab() {
  const tab = state.currentTab;
  if (!tab) return;
  try {
    await chrome.readingList.addEntry({ url: tab.url, title: tab.title || tab.url, hasBeenRead: false });
  } catch (e) {
    showToast(`追加できませんでした: ${e.message}`);
  }
}

async function refreshCurrentTab() {
  if (isFull) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const next = tab && /^https?:/i.test(tab.url || '') ? { url: tab.url, title: tab.title } : null;
  if (next?.url === state.currentTab?.url && next?.title === state.currentTab?.title) return;
  state.currentTab = next;
  renderCurrent();
}

function setQuery(q) {
  queryEl.value = q;
  state.query = q;
  state.limit = PAGE_SIZE;
  render();
}

function clearFilters() {
  state.flags.clear();
  state.tags.clear();
  state.site = null;
  state.folder = null;
  setQuery('');
}

// ---------- サイトの振り分け先(全画面の左の一覧から) ----------

const assignMenuEl = $('assign-menu');

function openAssignMenu(domain, anchor) {
  const current = state.folders.find((f) => f.patterns.includes(domain));
  const count = state.items.filter((i) => matchRule(i.url, compileRules([{ id: 'x', patterns: [domain] }]))).length;
  const nameInput = h('input', {
    type: 'text',
    class: 'assign-new',
    placeholder: '新しいフォルダ名',
    value: suggestFolderName(domain),
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        createFolderFor(domain, nameInput.value);
      }
    },
  });
  assignMenuEl.replaceChildren(...[
    h('div', { class: 'menu-head' },
      h('strong', {}, domain),
      h('span', {}, `のもの(${count}件)を、これから追加するものも含めて自動で入れるフォルダ`)),
    ...state.folders.map((f) =>
      h('button', { class: current?.id === f.id ? 'current' : null, onclick: () => assignDomain(domain, f.id) },
        icon('folder'), f.name, current?.id === f.id ? h('span', { class: 'menu-check' }, '✓ 振り分け中') : null)),
    state.folders.length ? h('hr') : null,
    h('div', { class: 'assign-create' }, nameInput,
      h('button', { class: 'btn btn-primary', onclick: () => createFolderFor(domain, nameInput.value) }, '作成')),
    current ? h('button', { class: 'danger-text', onclick: () => assignDomain(domain, null) }, 'このサイトの自動振り分けをやめる') : null,
    h('hr'),
    h('button', { onclick: () => { assignMenuEl.hidePopover(); openRules(); } }, 'ほかのルールも見る(振り分け設定)…'),
  ].filter(Boolean));
  const r = anchor.getBoundingClientRect();
  assignMenuEl.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 340)}px`;
  assignMenuEl.style.left = `${Math.min(r.left, window.innerWidth - 300)}px`;
  assignMenuEl.showPopover();
}

// 例: zenn.dev → zenn, blog.example.co.jp → example
function suggestFolderName(domain) {
  const parts = domain.split('.');
  const sld = parts.length > 2 && /^(co|ne|or|ac|go|com|net|org)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
  return sld || domain;
}

async function createFolderFor(domain, name) {
  const folder = { id: newFolderId(), name: String(name || '').trim() || suggestFolderName(domain), patterns: [] };
  await assignDomain(domain, folder.id, [...state.folders, folder]);
}

// そのドメインを書いたルールをいったん全フォルダから外し、指定のフォルダにだけ足す(null ならやめる)
async function assignDomain(domain, folderId, base = state.folders) {
  const next = base.map((f) => ({ ...f, patterns: f.patterns.filter((p) => p !== domain) }));
  const target = next.find((f) => f.id === folderId);
  if (target) target.patterns.push(domain);
  setFolders(await saveFolders(next));
  assignMenuEl.hidePopover();
  render();
  showToast(target ? `${domain} を「${target.name}」へ自動で振り分けます` : `${domain} の自動振り分けをやめました`);
}

// ---------- フォルダと自動振り分けの設定 ----------

let draft = []; // [{ id, name, patternsText, confirmDelete }]

function openRules() {
  draft = state.folders.map((f) => ({ id: f.id, name: f.name, patternsText: f.patterns.join('\n') }));
  paintRules();
  paintSuggest();
  $('rules').showModal();
}

function draftRules() {
  return compileRules(draft.map((f) => ({ id: f.id, patterns: parsePatterns(f.patternsText) })));
}

function paintRules() {
  const list = $('rules-list');
  if (!draft.length) {
    list.replaceChildren(h('p', { class: 'rules-empty' }, 'まだフォルダがありません。「＋ フォルダを追加」か、下の「よく保存しているサイト」から作れます。'));
    return;
  }
  list.replaceChildren(...draft.map(ruleCard));
}

function ruleCard(f, idx) {
  const count = h('span', { class: 'rule-count' });
  const updateCount = () => {
    const rules = compileRules([{ id: f.id, patterns: parsePatterns(f.patternsText) }]);
    count.textContent = `今あるもののうち ${state.items.filter((i) => matchRule(i.url, rules)).length}件が当てはまります`;
  };
  const move = (dir) => {
    const [x] = draft.splice(idx, 1);
    draft.splice(idx + dir, 0, x);
    paintRules();
  };
  const patterns = h('textarea', {
    rows: 3,
    class: 'rule-patterns',
    placeholder: 'github.com\nqiita.com/tags/javascript',
    oninput: (e) => { f.patternsText = e.target.value; updateCount(); schedulePaintSuggest(); },
  });
  patterns.value = f.patternsText;
  updateCount();
  return h('div', { class: 'rule-card' },
    h('div', { class: 'rule-head' },
      icon('folder'),
      h('input', { type: 'text', class: 'rule-name', value: f.name, placeholder: 'フォルダ名', oninput: (e) => { f.name = e.target.value; } }),
      h('button', { type: 'button', class: 'icon-btn small', title: '上へ', disabled: idx === 0, onclick: () => move(-1) }, '↑'),
      h('button', { type: 'button', class: 'icon-btn small', title: '下へ', disabled: idx === draft.length - 1, onclick: () => move(1) }, '↓'),
      h('button', { type: 'button', class: 'icon-btn small danger', title: 'このフォルダを削除', html: ICONS.trash, onclick: () => { f.confirmDelete = true; paintRules(); } })),
    f.confirmDelete
      ? h('div', { class: 'rule-confirm' },
          h('span', {}, 'このフォルダを削除しますか?(中のものは消えません。手で移したものは自動の振り分けに戻ります)'),
          h('button', { type: 'button', class: 'btn btn-danger', onclick: () => { draft.splice(idx, 1); paintRules(); paintSuggest(); } }, '削除する'),
          h('button', { type: 'button', class: 'btn', onclick: () => { f.confirmDelete = false; paintRules(); } }, 'やめる'))
      : null,
    h('label', { class: 'rule-label' }, '振り分けるサイト(1行に1つ)'),
    patterns,
    count);
}

// 入力のたびではなく、手が止まってから出し直す。欄から離れた瞬間(change)に出し直すと、
// 下の「保存」ボタンの位置がずれて、押したつもりのクリックが外れてしまうため。
let suggestTimer = null;
function schedulePaintSuggest() {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(paintSuggest, 600);
}

// まだどのフォルダにも入っていないのに、よく保存しているサイトを出して、ワンクリックでルールにできるようにする
function paintSuggest() {
  clearTimeout(suggestTimer);
  const rules = draftRules();
  const counts = countBy(state.items.filter((i) => !i.folderManual && !matchRule(i.url, rules) && i.domain), (i) => i.domain);
  const top = [...counts].filter(([, n]) => n >= 2).sort(([a, an], [b, bn]) => bn - an || collator.compare(a, b)).slice(0, 12);
  const box = $('rules-suggest');
  if (!top.length) {
    box.replaceChildren();
    return;
  }
  box.replaceChildren(
    h('h3', {}, 'よく保存しているのに、まだ振り分けていないサイト'),
    ...top.map(([domain, n]) => {
      const select = h('select', {
        onchange: (e) => {
          const v = e.target.value;
          if (!v) return;
          let target = draft.find((f) => f.id === v);
          if (v === '__new') {
            target = { id: newFolderId(), name: suggestFolderName(domain), patternsText: '' };
            draft.push(target);
          }
          target.patternsText = `${target.patternsText.trim()}\n${domain}`.trim();
          paintRules();
          paintSuggest();
        },
      },
        h('option', { value: '' }, '振り分け先を選ぶ…'),
        ...draft.map((f) => h('option', { value: f.id }, f.name || '無題のフォルダ')),
        h('option', { value: '__new' }, `＋ 新しいフォルダ「${suggestFolderName(domain)}」`));
      return h('div', { class: 'suggest-row' },
        siteFavicon(domain),
        h('span', { class: 'suggest-domain' }, domain),
        h('span', { class: 'suggest-n' }, `${n}件`),
        select);
    }));
}

// ---------- 選択中の一括操作 ----------

const sel = {};
function buildSelbar() {
  sel.count = h('span', { class: 'sel-count' });
  sel.selectAll = h('button', { class: 'link-btn', onclick: () => { for (const i of state.filtered) state.selected.add(i.url); render(); } });
  sel.tagInput = h('input', { type: 'text', placeholder: 'タグ', list: 'tag-options', class: 'sel-tag' });
  sel.tagList = h('datalist', { id: 'tag-options' });
  const urls = () => [...state.selected];
  const tagsFromInput = () => {
    const tags = parseTags(sel.tagInput.value);
    if (!tags.length) sel.tagInput.focus();
    return tags;
  };
  sel.folderSelect = h('select', {
    class: 'sel-folder',
    title: '選んだものを手でフォルダへ移す(ルールより優先)',
    onchange: async (e) => {
      const v = e.target.value;
      e.target.value = '';
      if (!v) return;
      await moveToFolder(urls(), v === '__auto' ? undefined : v === '__unfiled' ? UNFILED : v);
    },
  });
  sel.actions = h('div', { class: 'sel-actions' },
    h('button', { class: 'btn', onclick: () => setRead(urls(), true) }, '既読に'),
    h('button', { class: 'btn', onclick: () => setRead(urls(), false) }, '未読に'),
    h('button', { class: 'btn', title: 'スターを付ける(全部付いていれば外す)', onclick: () => setStar(urls(), !urls().every((u) => state.byUrl.get(u)?.starred)) }, '★'),
    sel.folderSelect,
    h('span', { class: 'sel-tag-group' },
      sel.tagInput,
      h('button', { class: 'btn', onclick: async () => { const t = tagsFromInput(); if (t.length) { await addTagTo(urls(), t); sel.tagInput.value = ''; } } }, '付ける'),
      h('button', { class: 'btn', onclick: async () => { const t = tagsFromInput(); if (t.length) { await removeTagFrom(urls(), t); sel.tagInput.value = ''; } } }, '外す')),
    h('button', { class: 'btn btn-danger', onclick: () => { state.confirmingDelete = true; updateSelbar(); } }, '削除'));
  sel.confirm = h('div', { class: 'sel-confirm' },
    sel.confirmText = h('span', {}),
    h('button', { class: 'btn btn-danger', onclick: () => { state.confirmingDelete = false; deleteItems(urls().map((u) => state.byUrl.get(u)).filter(Boolean)); } }, '削除する'),
    h('button', { class: 'btn', onclick: () => { state.confirmingDelete = false; updateSelbar(); } }, 'やめる'));
  selbarEl.append(
    h('div', { class: 'sel-head' }, sel.count, sel.selectAll,
      h('button', { class: 'link-btn', onclick: () => { state.selected.clear(); state.confirmingDelete = false; render(); } }, '選択解除')),
    sel.actions, sel.confirm, sel.tagList);
}

let selFolderSig = null;
function updateSelbar() {
  const n = state.selected.size;
  selbarEl.hidden = n === 0;
  if (!n) {
    state.confirmingDelete = false;
    return;
  }
  sel.count.textContent = `${n}件を選択中`;
  const notSelected = state.filtered.filter((i) => !state.selected.has(i.url)).length;
  sel.selectAll.hidden = notSelected === 0;
  sel.selectAll.textContent = `表示中の${state.filtered.length}件をすべて選択`;
  sel.actions.hidden = state.confirmingDelete;
  sel.confirm.hidden = !state.confirmingDelete;
  sel.confirmText.textContent = `${n}件をリーディングリストから削除しますか?(直後なら元に戻せます)`;
  const tags = allTagsByCount();
  if (sel.tagList.childElementCount !== tags.length) sel.tagList.replaceChildren(...tags.map((t) => h('option', { value: t })));
  const sig = state.folders.map((f) => `${f.id}:${f.name}`).join('|');
  if (sig !== selFolderSig) {
    selFolderSig = sig;
    sel.folderSelect.replaceChildren(
      h('option', { value: '' }, 'フォルダへ移す…'),
      ...state.folders.map((f) => h('option', { value: f.id }, f.name)),
      h('option', { value: '__unfiled' }, '未分類にする'),
      h('option', { value: '__auto' }, '自動の振り分けに戻す'));
  }
  sel.folderSelect.hidden = state.folders.length === 0;
}

// ---------- お知らせ ----------

let toastTimer = null;
function showToast(text, { action, onAction, duration = 5000 } = {}) {
  clearTimeout(toastTimer);
  toastEl.replaceChildren(
    h('span', {}, text),
    ...(action ? [h('button', { class: 'link-btn', onclick: () => { toastEl.hidden = true; onAction(); } }, action)] : []),
    h('button', { class: 'toast-close', title: '閉じる', onclick: () => { toastEl.hidden = true; } }, '×'));
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, duration);
}

// ---------- エクスポート / インポート ----------

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const entries = state.items.map((i) => ({
    url: i.url,
    title: i.title,
    hasBeenRead: i.hasBeenRead,
    createdAt: i.createdAt,
    tags: i.tags,
    note: i.note,
    starred: i.starred,
    folder: i.folderId === UNFILED ? '' : folderName(i.folderId),
    folderManual: i.folderManual,
  }));
  const folders = state.folders.map((f) => ({ name: f.name, patterns: f.patterns }));
  const data = { format: 'reading-list-manager', version: 2, exportedAt: new Date().toISOString(), folders, entries };
  download(`reading-list-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
  showToast(`${entries.length}件を書き出しました`);
}

function exportCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['タイトル', 'URL', '状態', '追加日', 'フォルダ', 'タグ', 'メモ', 'スター']];
  for (const i of state.items) {
    rows.push([i.title, i.url, i.hasBeenRead ? '既読' : '未読', fullDate(i.createdAt), folderName(i.folderId), i.tags.join(' '), i.note, i.starred ? '★' : '']);
  }
  // Excelで文字化けしないように BOM を付ける
  download(`reading-list-${stamp()}.csv`, `﻿${rows.map((r) => r.map(q).join(',')).join('\r\n')}`, 'text/csv');
  showToast(`${state.items.length}件を書き出しました`);
}

async function importJson(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    showToast('JSONとして読めませんでした');
    return;
  }
  const list = Array.isArray(data) ? data : data?.entries;
  if (!Array.isArray(list)) {
    showToast('取り込めるデータが見つかりませんでした');
    return;
  }

  // フォルダは名前で突き合わせる。同じ名前があれば振り分けるサイトを足し合わせ、無ければ作る
  const folders = state.folders.map((f) => ({ ...f, patterns: [...f.patterns] }));
  const byName = new Map(folders.map((f) => [f.name, f]));
  const folderFor = (name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    if (!byName.has(n)) {
      const f = { id: newFolderId(), name: n, patterns: [] };
      folders.push(f);
      byName.set(n, f);
    }
    return byName.get(n);
  };
  for (const f of Array.isArray(data?.folders) ? data.folders : []) {
    const target = folderFor(f?.name);
    if (target) target.patterns = parsePatterns([...target.patterns, ...parsePatterns(f.patterns || [])]);
  }
  const manualFolderIds = new Map();
  for (const raw of list) {
    if (raw?.folderManual && raw.folder) manualFolderIds.set(raw.url, folderFor(raw.folder).id);
  }
  if (folders.length !== state.folders.length || data?.folders?.length) setFolders(await saveFolders(folders));

  const existing = new Set(state.entries.map((e) => e.url));
  let added = 0;
  let merged = 0;
  let failed = 0;
  for (const raw of list) {
    const url = typeof raw?.url === 'string' ? raw.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) {
      failed++;
      continue;
    }
    const tags = Array.isArray(raw.tags) ? raw.tags : parseTags(raw.tags);
    const note = typeof raw.note === 'string' ? raw.note : '';
    const cur = state.meta.get(url) || {};
    const metaNext = {
      ...cur,
      removedAt: undefined,
      tags: [...(cur.tags || []), ...tags],
      note: cur.note || note,
      starred: cur.starred || !!raw.starred,
    };
    if (cur.folder === undefined && manualFolderIds.has(raw.url)) metaNext.folder = manualFolderIds.get(raw.url);
    if (existing.has(url)) {
      // すでにあるものは、読んだかどうか・タイトルは今のまま。タグは足し合わせ、メモは空のときだけ入れる
      await setMeta(url, metaNext);
      merged++;
      continue;
    }
    const createdAt = Number(raw.createdAt ?? raw.creationTime) || undefined;
    await setMeta(url, { ...metaNext, createdAt });
    try {
      await chrome.readingList.addEntry({ url, title: String(raw.title || url), hasBeenRead: !!raw.hasBeenRead });
      existing.add(url);
      added++;
    } catch {
      await chrome.storage.local.remove(metaKey(url));
      failed++;
    }
  }
  showToast(`追加 ${added}件 / タグ・メモを統合 ${merged}件${failed ? ` / 取り込めなかったもの ${failed}件` : ''}`, { duration: 10000 });
}

// ---------- 設定 ----------

function openSettings() {
  const form = $('settings-form');
  const s = state.settings;
  form.actionOpens.value = s.actionOpens;
  form.openIn.value = s.openIn;
  form.markReadOnOpen.checked = s.markReadOnOpen;
  form.staleDays.value = s.staleDays;
  form.faviconSource.value = s.faviconSource;
  form.badge.checked = s.badge;
  $('settings').showModal();
}

function wireDialogs() {
  $('settings-cancel').addEventListener('click', () => $('settings').close('cancel'));
  $('settings').addEventListener('close', async () => {
    if ($('settings').returnValue !== 'save') return;
    const form = $('settings-form');
    const days = Math.round(Number(form.staleDays.value));
    await saveSettings({
      ...state.settings,
      actionOpens: form.actionOpens.value,
      openIn: form.openIn.value,
      markReadOnOpen: form.markReadOnOpen.checked,
      staleDays: days >= 1 ? Math.min(days, 3650) : state.settings.staleDays,
      faviconSource: form.faviconSource.value,
      badge: form.badge.checked,
    });
  });

  $('rules-cancel').addEventListener('click', () => $('rules').close('cancel'));
  $('rules-add').addEventListener('click', () => {
    draft.push({ id: newFolderId(), name: '', patternsText: '' });
    paintRules();
    paintSuggest();
    const cards = $('rules-list').querySelectorAll('.rule-name');
    cards[cards.length - 1]?.focus();
  });
  // フォルダ名の欄で Enter を押しても、保存してダイアログが閉じないようにする
  $('rules-form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
  });
  $('rules').addEventListener('close', async () => {
    if ($('rules').returnValue !== 'save') return;
    const kept = draft.filter((f) => f.name.trim() || f.patternsText.trim());
    setFolders(await saveFolders(kept.map((f) => ({ id: f.id, name: f.name, patterns: f.patternsText }))));
    render();
    showToast(`振り分けを保存しました(フォルダ ${kept.length}個)`);
  });
}

// ---------- 初期化 ----------

function wireStatic() {
  if (!isFull) queryEl.placeholder = 'タイトル・URLで検索';
  for (const btn of document.querySelectorAll('#status-seg button')) {
    btn.addEventListener('click', () => setStatus(btn.dataset.status));
  }
  sortEl.value = state.sort;
  groupEl.value = state.group;
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; saveView(); render(); });
  groupEl.addEventListener('change', () => { state.group = groupEl.value; state.limit = PAGE_SIZE; saveView(); render(); });

  let qTimer = null;
  queryEl.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => setQuery(queryEl.value), 120);
  });
  siteFilterEl.addEventListener('input', () => {
    state.siteFilter = siteFilterEl.value;
    render();
  });

  $('full-btn').addEventListener('click', () => openFullPage());
  const menu = $('menu');
  const runAction = (action) => {
    if (action === 'rules') openRules();
    else if (action === 'export-json') exportJson();
    else if (action === 'export-csv') exportCsv();
    else if (action === 'import') $('import-file').click();
    else if (action === 'settings') openSettings();
  };
  menu.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (!action) return;
    menu.hidePopover();
    runAction(action);
  });
  for (const btn of document.querySelectorAll('.nav-title-btn[data-action]')) {
    btn.addEventListener('click', () => runAction(btn.dataset.action));
  }
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await importJson(file);
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select');
    if (e.key === '/' && !typing) {
      e.preventDefault();
      queryEl.focus();
      queryEl.select();
    } else if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (state.editing) closeEditor();
      else if (state.selected.size) { state.selected.clear(); render(); }
      else if (e.target === queryEl && queryEl.value) setQuery('');
    }
  });

  // 編集欄からフォーカスが外れたら、止めていた描き直しをする
  document.addEventListener('focusout', () => setTimeout(() => { if (state.renderSkipped && !editorFocused()) render(); }, 0));

  buildSelbar();
  wireDialogs();
}

async function init() {
  if (!chrome.readingList) {
    listEl.replaceChildren(h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'このChromeではリーディングリストを読めません'), h('p', {}, 'Chrome 120 以降が必要です。')));
    return;
  }
  wireStatic();
  chrome.readingList.onEntryAdded.addListener(scheduleReload);
  chrome.readingList.onEntryRemoved.addListener(scheduleReload);
  chrome.readingList.onEntryUpdated.addListener(scheduleReload);
  // アイコンの覚え書き(faviconCache)の書き込みでは描き直さない
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(changes).some((k) => k.startsWith(META_PREFIX) || k === SETTINGS_KEY || k === FOLDERS_KEY)) scheduleReload();
  });
  if (!isFull) {
    chrome.tabs.onActivated.addListener(refreshCurrentTab);
    chrome.tabs.onUpdated.addListener((_id, info, tab) => { if (tab.active && (info.url || info.title || info.status === 'complete')) refreshCurrentTab(); });
    chrome.windows.onFocusChanged.addListener(refreshCurrentTab);
  }
  await initFavicons((await loadSettings()).faviconSource);
  await reload();
  await refreshCurrentTab();
}

init();
