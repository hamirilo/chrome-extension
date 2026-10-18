# コピー解除（Copy Unlock）

右クリック・文字の選択・コピーを禁じているサイトで、それらを使えるようにする Chrome 拡張機能です。サイトごとに、ツールバーのポップアップから有効にします。

## モード

| モード | すること | 壊しやすさ |
|---|---|---|
| 標準 | `user-select: none` と透明な選択色を戻す。`contextmenu`・`copy`・`cut`・`selectstart` をサイトに届かせない | 低い。たいていはこれで足りる |
| 強力 | 標準に加えて `paste`・`dragstart`・⌘/Ctrl + A・C・V・X を止める。対象のイベントについて、ページからの `preventDefault()` を無効にする（マウスを押すことの取り消しも含む） | 高い。エディタのツールバーやドラッグ操作が崩れることがある |

標準で選択できないサイト（マウスを押すこと自体を取り消すもの）は強力にします。

## 仕組み

- **document_start で効かせる**：有効にしたサイトには `chrome.scripting.registerContentScripts` でスクリプトを登録し、ページのスクリプトより先に動かす。今開いているタブには、切り替えたその場で `executeScript` でも入れる。
- **伝播を止めるだけで、既定の動作は残す**：`window` の捕捉段階で `stopImmediatePropagation()` すると、サイトのリスナーにもインラインの `on〜` 属性にも届かない。`preventDefault()` は呼ばないので、メニュー・選択・コピーがそのまま起きる。
- **強力モードは MAIN world で動かす**：先に登録されたページのリスナーは ISOLATED world からは止められない。そこで `world: 'MAIN'` のスクリプトが `Event.prototype.preventDefault` と `returnValue` を包み、ブラウザ由来（`isTrusted`）の対象イベントだけ取り消しを無視する。インラインの `<script>` を差し込まないので、ページの CSP に止められない。

## 権限

- `storage`・`scripting`・`activeTab` だけを常に持つ。
- サイトへのアクセスは `optional_host_permissions` で、**有効にしたサイトだけ**その場で許可を求める。外すと許可も返す。
- 外への通信はしない。設定（`{ ホスト名: モード }`）は `chrome.storage.local` に置く。

## ファイル

| パス | 役割 |
|---|---|
| `background.js` | 設定・許可の変化を受けて、登録するスクリプトを同期する |
| `lib/sites.js` | 設定の読み書き、登録の同期、開いているタブへの注入 |
| `popup.*` | このサイトのモード切り替えと、有効にしたサイトの一覧 |
| `content/unlock.css`・`unlock.js` | 標準モード（ISOLATED world） |
| `content/strong.js` | 強力モードの追加分（ISOLATED world） |
| `content/strong-main.js` | 強力モードの取り消し無効化（MAIN world） |
| `test/blocked.html` | 禁止をひと通り入れた確認用ページ。`?strict` でマウスを押すことの取り消しも足す |

## 導入（開発中）

1. `chrome://extensions/` を開き、デベロッパーモードをオンにする。
2. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ。

## 確かめかた

`test/blocked.html` を http で配信して開き（`file://` では許可の仕組みが働かない）、ポップアップで標準・強力を切り替える。

## 限界

- 文字の上に透明な要素を重ねる妨害や、文字を画像・canvas で描くものは解除しない。
- `style="user-select: none !important"` のようなインラインの `!important` は上書きできない。
- 強力モードを標準やオフへ戻したときは、ページを再読み込みするまで効果が残る。
