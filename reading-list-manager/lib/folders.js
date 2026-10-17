// フォルダと、ドメインによる自動振り分け。
//
// フォルダには「どのサイトのものを入れるか」をドメイン(必要ならパスまで)で書いておく。
// 振り分け先は保存せず、表示のたびにルールから決める。ルールを書き換えれば、
// すでにリストにあるものもその場で振り分け直される(「既存分に適用」の操作が要らない)。
// 1件ずつ手で移したものだけは meta.folder にフォルダIDを持ち、ルールより優先する。

export const FOLDERS_KEY = 'folders';

export async function loadFolders() {
  const data = await chrome.storage.local.get(FOLDERS_KEY);
  const list = data[FOLDERS_KEY];
  return Array.isArray(list) ? list.filter((f) => f && f.id) : [];
}

export async function saveFolders(folders) {
  const clean = folders.map((f) => ({
    id: f.id,
    name: String(f.name || '').trim() || '無題のフォルダ',
    patterns: parsePatterns(f.patterns || []),
  }));
  await chrome.storage.local.set({ [FOLDERS_KEY]: clean });
  return clean;
}

export function newFolderId() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// `https://www.Example.com/blog/` → `example.com/blog`。`*.example.com` も example.com として扱う
export function normalizePattern(pattern) {
  return String(pattern || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^\*\./, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

// 1行に1つ(カンマ・空白区切りでも可)
export function parsePatterns(input) {
  const parts = Array.isArray(input) ? input : String(input || '').split(/[\s,、，]+/);
  const out = [];
  for (const p of parts) {
    const n = normalizePattern(p);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function compileRules(folders) {
  const rules = [];
  for (const f of folders) {
    for (const p of f.patterns || []) {
      const n = normalizePattern(p);
      if (!n) continue;
      const slash = n.indexOf('/');
      rules.push({
        id: f.id,
        pattern: n,
        host: slash < 0 ? n : n.slice(0, slash),
        path: slash < 0 ? '' : n.slice(slash),
      });
    }
  }
  // 複数のルールに当たるときは、長く書いたほう(より具体的なほう)を優先する
  return rules.sort((a, b) => b.pattern.length - a.pattern.length);
}

// ドメインはサブドメインも含めて当てる(example.com → blog.example.com も)。
// パスは区切り単位で前方一致(example.com/blog → /blog と /blog/… だけ。/blogger は当てない)。
export function matchRule(url, rules) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.toLowerCase();
  for (const r of rules) {
    if (host !== r.host && !host.endsWith(`.${r.host}`)) continue;
    if (r.path && path !== r.path && !path.startsWith(`${r.path}/`)) continue;
    return r;
  }
  return null;
}
