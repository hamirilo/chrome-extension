# Chrome Web Store 掲載情報 & 審査用申告テキスト (Store Listing & Justifications)

Chrome Web Store Developer Dashboard の登録フォームにそのままコピー＆ペーストして使用できるテキスト集です。

---

## 1. ストア掲載情報 (Store Listing)

### 日本語 (Japanese)

#### タイトル (Title)
```text
リーディングリスト整理 (Reading List Manager)
```

#### 簡単な説明 (Summary / Short Description - 最大132文字)
```text
Chrome標準のリーディングリストに全画面一覧・検索・タグ・メモ・自動振り分けを追加し、大量の記事をすっきり整理します。
```

#### 詳細な説明 (Detailed Description)
```markdown
Chrome標準の「リーディングリスト」を、数が増えても迷わず整理・検索できるようにする拡張機能です。

標準のリーディングリストは「未読」「既読」の2区分のみで一覧されるため、数十件〜数百件を超えると過去の記事を探すのが難しくなります。本拡張機能は、Chrome標準のリーディングリストデータをそのまま活用しながら、以下の強力な機能を追加します。

✨ 主な機能

■ 全画面の一覧で快適に整理
・サイドパネルだけでなく、広い全画面タブで表形式の一覧を表示。
・追加日、タイトル、ドメイン、タグ、メモを一覧で見渡せます。

■ フォルダとドメインによる自動振り分け
・「qiita.com」「github.com」など、サイトのドメイン（またはURLパス）をフォルダに登録しておくだけで、該当する記事を自動で振り分けます。
・手動でフォルダを移動した記事は、自動ルールより優先して保持されます。

■ タグ・メモ・スター機能
・記事ごとに複数のタグ、自由なメモ、お気に入りのスター（★）を付与可能。
・「#仕事」「#後で読む」など柔軟な分類ができます。

■ 高速・スマートな横断検索
・タイトル、URL、タグ、メモをインクリメンタルに一括検索。
・`#タグ名` によるタグ絞り込み
・`site:ドメイン` による特定サイト絞り込み
・`-キーワード` による除外検索

■ 一括操作 & 削除の取り消し
・複数選択（Shift+クリック対応）で、一括既読/未読、フォルダ移動、タグ付け、削除が可能。
・誤って削除しても、直後の「元に戻す」でタグやメモごと復元できます。

■ 重複候補の自動検出
・URLパラメータ（utm_source等）やプロトコル（http/https）、末尾スラッシュの違いによる重複記事を検出し、まとめて整理できます。

■ データのバックアップ (JSON / CSV)
・タグやメモ、フォルダ設定を含めた完全バックアップ（JSON）と、スプレッドシート閲覧用（CSV）のエクスポート/インポートに対応。

🔒 プライバシー & セキュリティ
・外部サーバーへのデータ送信は一切行いません。
・すべてのデータはブラウザのローカルストレージに安全に保管されます。
・トラッキング、広告、解析ツールは一切含まれていません。
```

---

### 英語 (English)

#### Title
```text
Reading List Manager
```

#### Summary (Up to 132 chars)
```text
Power up Chrome Reading List with full-screen view, tags, notes, search, domain-based auto folders, and bulk actions.
```

#### Detailed Description
```markdown
Organize, categorize, and master your Chrome Reading List with ease!

Chrome's built-in Reading List is a great way to save articles, but as your list grows into dozens or hundreds of items, it becomes hard to find and manage them. 

Reading List Manager works directly with your native Chrome Reading List while adding powerful management features:

✨ Key Features

■ Full-Screen Manager View
Open your reading list in a wide, dedicated tab with an easy-to-read table layout.

■ Smart Auto-Categorization by Domain
Define folder rules by domain (e.g., "github.com", "medium.com") or URL paths. Existing and newly saved items are automatically organized into their designated folders.

■ Tags, Notes & Star Favorite
Add custom tags (e.g., #tech, #recipes), personal notes, and star favorites to any item.

■ Powerful Multi-condition Search
Filter by title, URL, notes, and tags instantly. Supports advanced search operators:
- `#tag`: Filter by tag
- `site:domain`: Filter by domain
- `-keyword`: Exclude specific terms

■ Bulk Actions & Undo Delete
Select multiple items (with Shift+Click support) to mark as read/unread, move to folders, add/remove tags, or delete. Accidental deletes can be undone immediately with tags and notes restored.

■ Duplicate Detection
Identify near-duplicate URLs that only differ by tracking parameters (like UTM tags) or trailing slashes.

■ Backup & Export (JSON / CSV)
Export and import your complete reading list data including tags, notes, and folder rules in JSON format, or export to CSV for spreadsheets.

🔒 Privacy First
- 100% Local: All tags, notes, and settings are stored locally on your device.
- No Tracking: Zero analytics, zero ads, zero external server tracking.
```

---

## 2. 権限利用の審査申告 (Permissions Justification)

Chrome Web Store 申請フォームの「権限の正当性 (Permissions Justification)」欄に入力する英文です。

### `readingList`
```text
Required to read, add, update (mark as read/unread), and remove items from Chrome's native Reading List, which is the core functionality of this extension.
```

### `storage`
```text
Required to store user-created metadata (tags, notes, starred status, custom folder organization rules, and user preferences) locally on the device.
```

### `sidePanel`
```text
Required to display the compact reading list interface inside Chrome's native Side Panel for quick reference while browsing.
```

### `contextMenus`
```text
Required to provide quick right-click actions: adding the current page or a link directly to the reading list, and opening the manager in side panel or full-screen.
```

### `tabs`
```text
Required solely for two specific actions:
1. When the user triggers the keyboard shortcut (Alt+Shift+R) to save the current page, the active tab's URL and title are retrieved.
2. When the user requests to open the full-screen manager, the extension checks existing open tabs to focus the already-open manager tab instead of creating duplicate tabs.
```

### `favicon`
```text
Required to retrieve and display cached website favicons in the reading list UI for visual identification.
```

---

## 3. プライバシーに関する申告 (Privacy Practices tab)

### 単一目的ポリシーの申告 (Single Purpose)
```text
This extension has a single purpose: to enhance and organize Chrome's native Reading List with search, tags, notes, auto-folders, and full-screen view.
```

### ユーザーデータの収集と使用 (Data Usage)
- **Do you collect or use user data?**: `No`（外部への収集・送信はなし）
- **Do you sell user data?**: `No`
- **Do you use or transfer user data for purposes unrelated to the extension's core functionality?**: `No`
- **Do you use or transfer user data for creditworthiness or lending?**: `No`

### プライバシーポリシーURL (Privacy Policy URL)
GitHub Pages 等でホストした URL を入力します。
例: `https://<your-github-username>.github.io/chrome-extension/`
