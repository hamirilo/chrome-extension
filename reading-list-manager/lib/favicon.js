// サイトのアイコン(ファビコン)を探す。
//
// Chromeの _favicon は「一度でも開いたページ」のアイコンしか持っていないので、
// 別のPCで追加したものや開いたことのないサイトは地球儀マークになってしまう。そこで順に試す:
//   1. Chromeのキャッシュ(_favicon)。ページのURLとサイトのトップの両方で探す
//   2. サイトの /favicon.ico を直接読む               (設定が 'site' か 'google' のとき)
//   3. Googleのファビコン取得サービス                  (設定が 'google' のとき。ドメイン名がGoogleに送られる)
//   4. どれも無ければ、ドメインの頭文字を色付きの四角で出す
// 結果はドメインごとに storage に覚えておき、開くたびにサイトへ問い合わせないようにする。

import { DAY } from './common.js';

export const FAVICON_CACHE_KEY = 'faviconCache';
const FOUND_TTL = 30 * DAY;
const MISSING_TTL = 3 * DAY;
const MAX_PARALLEL = 4;
const LOAD_TIMEOUT = 5000;

let mode = 'site'; // 'cache' | 'site' | 'google'
let cache = {}; // host -> { src, mode, t }   src が '' のときは「見つからなかった」
const pending = new Map(); // host -> Promise<string>
let defaultSignature = null;
let saveTimer = null;

export async function initFavicons(sourceMode) {
  mode = sourceMode || 'site';
  try {
    const data = await chrome.storage.local.get(FAVICON_CACHE_KEY);
    cache = data[FAVICON_CACHE_KEY] || {};
  } catch {
    cache = {};
  }
}

export function setFaviconMode(sourceMode) {
  if (sourceMode && sourceMode !== mode) {
    mode = sourceMode;
    pending.clear();
  }
}

export async function clearFaviconCache() {
  cache = {};
  pending.clear();
  await chrome.storage.local.remove(FAVICON_CACHE_KEY);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function chromeFavicon(pageUrl) {
  return `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
}

function fresh(rec) {
  if (!rec || rec.mode !== mode) return false;
  return Date.now() - rec.t < (rec.src ? FOUND_TTL : MISSING_TTL);
}

// 一覧の行などに置く要素を返す。分かっていればすぐ <img>、まだなら頭文字を置いておき、
// 見つかった時点で差し替える。
export function faviconEl(url, className = 'fav') {
  const host = hostOf(url);
  const rec = cache[host];
  if (fresh(rec)) return rec.src ? imageEl(rec.src, host, className) : letterEl(host, className);
  const el = letterEl(host, className);
  if (host) {
    resolve(host, url).then((src) => {
      if (src && el.isConnected) el.replaceWith(imageEl(src, host, className));
    });
  }
  return el;
}

function imageEl(src, host, className) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.loading = 'lazy';
  img.src = src;
  // 覚えていたURLが後から読めなくなった(サイト側の変更など)ときは頭文字に戻す
  img.addEventListener('error', () => {
    img.replaceWith(letterEl(host, className));
    delete cache[host];
    scheduleSave();
  }, { once: true });
  return img;
}

function letterEl(host, className) {
  const span = document.createElement('span');
  span.className = `${className} fav-letter`;
  span.textContent = (host.replace(/^[^a-z0-9]+/i, '')[0] || '?').toUpperCase();
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  span.style.background = `hsl(${hash % 360} 45% 48%)`;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function resolve(host, url) {
  if (!pending.has(host)) {
    const job = enqueue(() => probe(host, url)).then((src) => {
      cache[host] = { src, mode, t: Date.now() };
      scheduleSave();
      return src;
    });
    pending.set(host, job);
  }
  return pending.get(host);
}

async function probe(host, url) {
  const origin = new URL(url).origin;
  for (const src of [chromeFavicon(`${origin}/`), chromeFavicon(url)]) {
    if (await isRealChromeFavicon(src)) return src;
  }
  if (mode === 'site' || mode === 'google') {
    const src = `${origin}/favicon.ico`;
    if (await loads(src)) return src;
  }
  if (mode === 'google') {
    const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
    if (await loads(src)) return src;
  }
  return '';
}

// _favicon は見つからないと既定の地球儀を返すので、その画像と見比べて区別する
async function isRealChromeFavicon(src) {
  if (defaultSignature === null) {
    defaultSignature = await signature(chromeFavicon('https://no-favicon.invalid/'));
  }
  const sig = await signature(src);
  return !!sig && sig !== defaultSignature;
}

async function signature(src) {
  const img = await loadImage(src);
  if (!img) return '';
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 16, 16);
  return canvas.toDataURL();
}

async function loads(src) {
  const img = await loadImage(src);
  return !!img && img.naturalWidth >= 8;
}

function loadImage(src) {
  return new Promise((done) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; done(null); }, LOAD_TIMEOUT);
    img.onload = () => { clearTimeout(timer); done(img); };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = src;
  });
}

// 一覧を開いた瞬間に数百のサイトへ同時に問い合わせないよう、同時に調べる数を絞る
let running = 0;
const queue = [];
function enqueue(task) {
  return new Promise((done) => {
    queue.push(async () => {
      running++;
      try {
        done(await task());
      } catch {
        done('');
      } finally {
        running--;
        queue.shift()?.();
      }
    });
    if (running < MAX_PARALLEL) queue.shift()();
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ [FAVICON_CACHE_KEY]: cache }).catch(() => {});
  }, 1500);
}
