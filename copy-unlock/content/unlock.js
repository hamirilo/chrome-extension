// 標準モード（ISOLATED world、document_start）。
// window の捕捉段階で伝播を止めると、サイトのリスナーにもインラインの on〜 属性にも届かない。
// preventDefault は呼ばないので、右クリックメニュー・選択・コピーという既定の動作だけが残る。
(() => {
  if (globalThis.__copyUnlockBasic) return;
  globalThis.__copyUnlockBasic = true;

  const stop = (e) => e.stopImmediatePropagation();
  for (const type of ['contextmenu', 'copy', 'cut', 'selectstart']) {
    window.addEventListener(type, stop, true);
  }
})();
