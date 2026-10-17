# Privacy Policy / プライバシーポリシー

**Last Updated / 最終更新日: October 17, 2026**

This Privacy Policy applies to the Chrome Extension **"Reading List Manager" (リーディングリスト整理)**.

本プライバシーポリシーは、Chrome拡張機能「**リーディングリスト整理** (Reading List Manager)」に適用されます。

---

## English

### 1. Overview
Reading List Manager values your privacy. This extension is designed to operate locally within your browser and does **not** collect, store, sell, or transmit any of your personal information, reading habits, or browsing history to external servers.

### 2. Data Storage
- **Reading List Items**: Stored directly in Google Chrome's native Reading List via the `chrome.readingList` API.
- **Tags, Notes, Folders & Settings**: Stored locally on your device using Chrome's local storage (`chrome.storage.local`).
- No user data is ever uploaded to our servers or any third-party analytics/advertising services.

### 3. Network Requests & Third Parties
- By default, the extension communicates directly with websites only to retrieve their favicons (`/favicon.ico`).
- If you opt into the optional "Google Favicon Service" in settings, only the website domain name (e.g. `example.com`, not full URLs or personal data) is sent to Google's public favicon service (`https://www.google.com/s2/favicons`). You can disable this at any time in the extension settings.
- The extension contains **no tracking codes, no analytics, and no advertising libraries**.

### 4. Permissions Justification
- `readingList`: Required to read, add, update, and remove items from Chrome's native Reading List.
- `storage`: Required to save user-defined tags, notes, folder rules, and display preferences locally on your machine.
- `sidePanel`: Required to display the reading list manager within Chrome's native side panel.
- `contextMenus`: Required to provide quick actions ("Add page to reading list", "Add link to reading list", "Open full screen", "Open side panel") from the right-click context menu.
- `tabs`: Required only to identify the active tab's URL and title when you press the shortcut key (Alt+Shift+R), and to focus the existing manager tab instead of opening duplicates.
- `favicon`: Required to display website favicons stored by Chrome.

### 5. Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated revision date.

### 6. Contact
If you have any questions about this Privacy Policy, please contact the developer via GitHub Issues or email.

---

## 日本語

### 1. 基本方針
「リーディングリスト整理」(Reading List Manager) は、ユーザーのプライバシーを最優先に考えて開発されています。本拡張機能はブラウザ内でローカルに完結して動作し、利用者の個人情報、閲覧履歴、読書データを外部サーバーに収集・保存・転売・送信することは一切ありません。

### 2. データの保存場所
- **リーディングリスト項目**: Chrome標準の `chrome.readingList` APIを通じて、ブラウザ本体に保存されます。
- **タグ・メモ・フォルダ設定**: Chromeのローカルストレージ (`chrome.storage.local`) を使用して、お使いの端末内にのみ安全に保存されます。
- 開発者や第三者のサーバーにデータが送信・同期されることはありません。

### 3. 外部通信および第三者サービス
- デフォルトでは、各サイトのファビコンを取得するために該当ドメインの `/favicon.ico` を読み込む通信のみを端末から直接行います。
- 設定で「Googleのファビコン取得サービス」を有効にした場合に限り、ドメイン名（例: `example.com`。URL全体や個人情報は含まれません）が Google の公開ファビコンAPI (`https://www.google.com/s2/favicons`) に送信されます。この機能は設定画面からいつでも無効にできます。
- 広告配信、アクセス解析ツール（Google Analytics 等）、トラッカーなどのライブラリは一切含んでいません。

### 4. 権限（Permissions）の利用目的
- `readingList`: Chrome標準のリーディングリストの取得、項目の追加・削除、既読/未読ステータスの更新に必須です。
- `storage`: タグ、メモ、フォルダ振り分けルール、表示設定をお使いのPC内に保存するために利用します。
- `sidePanel`: Chrome標準のサイドパネルUI内にリーディングリストを表示するために利用します。
- `contextMenus`: 右クリックメニューから「このページを追加」「リンク先を追加」「全画面で開く」などの操作を行うために利用します。
- `tabs`: ショートカットキー（Alt+Shift+R）で現在開いているページのURLとタイトルを取得する際、および全画面表示時に既存のタブを探して二重起動を防ぐためにのみ利用します。
- `favicon`: Chromeがキャッシュしている各Webサイトのファビコン画像を表示するために利用します。

### 5. プライバシーポリシーの改定
本ポリシーは必要に応じて改定されることがあります。改定された場合は当ページにて更新日とともに公開されます。

### 6. お問い合わせ
プライバシーポリシーに関するご質問やお問い合わせは、GitHubリポジトリのIssueまたは開発者連絡先までお願いいたします。
