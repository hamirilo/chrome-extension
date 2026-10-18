// 強力モードの ISOLATED world 側。標準モードに足して止める。
(() => {
  if (globalThis.__copyUnlockStrong) return;
  globalThis.__copyUnlockStrong = true;

  const stop = (e) => e.stopImmediatePropagation();
  for (const type of ['paste', 'dragstart']) {
    window.addEventListener(type, stop, true);
  }

  // キー入力は選択とコピーの組み合わせだけ止め、サイトのほかのショートカットは残す
  const COPY_KEYS = ['a', 'c', 'v', 'x'];
  window.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && COPY_KEYS.includes(e.key?.toLowerCase())) stop(e);
    },
    true,
  );
})();
