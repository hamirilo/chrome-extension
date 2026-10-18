import { applyToTab, hasPermission, hostOf, loadSites, originPattern, setSiteMode } from './lib/sites.js';

const DESC = {
  off: '何もしません。',
  basic: '右クリック・文字の選択・コピーを使えるようにします。たいていのサイトはこれで足ります。',
  strong: '標準で選択できないときに。貼り付け・ドラッグ・⌘C などのキーも解除し、ページ側の取り消しを無効にします。サイトの操作が崩れることがあります。',
};
const TAG = { basic: '標準', strong: '強力' };
const RANK = { off: 0, basic: 1, strong: 2 };

const $ = (id) => document.getElementById(id);
const modes = $('modes');

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const host = hostOf(tab?.url ?? '');
let current = 'off';

function showNotice(text, withReload) {
  $('notice-text').textContent = text;
  $('reload').hidden = !withReload;
  $('notice').hidden = false;
}

function renderMode(mode) {
  modes.querySelector(`input[value="${mode}"]`).checked = true;
  $('desc').textContent = DESC[mode];
}

async function renderList() {
  const sites = await loadSites();
  const ul = $('sites');
  ul.replaceChildren();
  for (const name of Object.keys(sites).sort()) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    label.title = name;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = TAG[sites[name]] ?? sites[name];
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '外す';
    del.addEventListener('click', () => turnOff(name));
    li.append(label, tag, del);
    ul.append(li);
  }
  $('empty').hidden = ul.childElementCount > 0;
}

async function turnOff(name) {
  await setSiteMode(name, 'off');
  await chrome.permissions.remove({ origins: [originPattern(name)] });
  if (name === host) {
    const was = current;
    current = 'off';
    renderMode('off');
    if (was !== 'off') showNotice('再読み込みすると元に戻ります。', true);
  }
  await renderList();
}

async function changeMode(next) {
  const prev = current;
  if (next === 'off') {
    await turnOff(host);
    return;
  }

  // 許可を求めるのはクリックの直後でないといけないので、保存より先に呼ぶ。
  // 保存は待たずに走らせ、ポップアップが許可の途中で閉じても背景側が同期できるようにする。
  const saving = setSiteMode(host, next);
  const granted = await chrome.permissions.request({ origins: [originPattern(host)] });
  await saving;
  if (!granted) {
    await setSiteMode(host, prev);
    renderMode(prev);
    showNotice('このサイトへの許可がないため、有効にできませんでした。', false);
    return;
  }

  current = next;
  renderMode(next);
  await renderList();

  if (RANK[next] < RANK[prev]) {
    showNotice('強力モードの解除は、再読み込みで反映されます。', true);
    return;
  }
  try {
    await applyToTab(tab.id, next);
    $('notice').hidden = true;
  } catch {
    showNotice('このページには今すぐ効かせられませんでした。再読み込みしてください。', true);
  }
}

modes.addEventListener('change', (e) => changeMode(e.target.value));
$('reload').addEventListener('click', () => {
  chrome.tabs.reload(tab.id);
  window.close();
});

if (host === null) {
  $('host').textContent = '—';
  modes.disabled = true;
  renderMode('off');
  $('desc').textContent = 'このページでは使えません（http / https のページだけが対象です）。';
} else {
  $('host').textContent = host;
  const sites = await loadSites();
  current = sites[host] ?? 'off';
  renderMode(current);
  if (current !== 'off' && !(await hasPermission(host))) {
    showNotice('許可が取り消されています。モードを選び直してください。', false);
  }
}
await renderList();
