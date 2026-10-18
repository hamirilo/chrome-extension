// 強力モードの MAIN world 側（ページと同じ環境で動く）。
// ISOLATED world からは、ページが先に登録したリスナーや on〜 属性の `return false` を止めきれない。
// そこで対象のイベントに限って、ページからの取り消し（preventDefault）を効かなくする。
(() => {
  const FLAG = Symbol.for('copy-unlock.main');
  if (window[FLAG]) return;
  Object.defineProperty(window, FLAG, { value: true });

  const COPY_KEYS = ['a', 'c', 'v', 'x'];
  const isGuarded = (e) => {
    if (!e.isTrusted) return false;
    switch (e.type) {
      case 'contextmenu':
      case 'copy':
      case 'cut':
      case 'paste':
      case 'selectstart':
      case 'dragstart':
      case 'mousedown':
        return true;
      case 'keydown':
        return (e.ctrlKey || e.metaKey) && !e.altKey && COPY_KEYS.includes(e.key?.toLowerCase());
      default:
        return false;
    }
  };

  const preventDefault = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (isGuarded(this)) return;
    return preventDefault.call(this);
  };

  const returnValue = Object.getOwnPropertyDescriptor(Event.prototype, 'returnValue');
  if (returnValue?.set) {
    Object.defineProperty(Event.prototype, 'returnValue', {
      ...returnValue,
      set(value) {
        if (value === false && isGuarded(this)) return;
        returnValue.set.call(this, value);
      },
    });
  }

  // `<body onmousedown="return false">` のような属性は preventDefault を経ないので外す
  const HANDLERS = ['oncontextmenu', 'oncopy', 'oncut', 'onpaste', 'onselectstart', 'ondragstart', 'onmousedown'];
  const clearHandlers = () => {
    for (const el of [document, document.documentElement, document.body]) {
      if (!el) continue;
      for (const name of HANDLERS) el[name] = null;
    }
  };
  clearHandlers();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clearHandlers, { once: true });
  }
})();
