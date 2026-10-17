# Chrome Web Store 公開・申請手順ガイド (Step-by-Step)

本ガイドでは、開発した拡張機能（`reading-list-manager`）を Chrome Web Store (CWS) に公開する手順を説明します。

---

## 準備したもの一覧

リポジトリ内に以下の公開用アセットがすでに準備されています：

1. **配布用パッケージ (ZIP)**:
   - `dist/reading-list-manager-v1.0.0.zip`
   - スクリプト `./scripts/package.sh` を実行するだけでいつでも最新版をビルド可能
2. **多言語対応 (i18n)**:
   - `reading-list-manager/_locales/ja/messages.json` (日本語)
   - `reading-list-manager/_locales/en/messages.json` (英語)
3. **プライバシーポリシー**:
   - `docs/privacy-policy.md` (Markdown版)
   - `docs/index.html` (Web公開用HTML版 - GitHub Pages用)
4. **ストア掲載用テキスト & 審査理由書**:
   - `store-assets/STORE_LISTING.md` (タイトル・説明文・権限利用理由の英文)
5. **プロモーション画像**:
   - `store-assets/promo-tile.jpg` (440x280 / 小プロモーション用)
   - `reading-list-manager/icons/icon128.png` (128x128 / ストアアイコン)

---

## 公開手順 (全5ステップ)

### ステップ 1: プライバシーポリシーの公開 (GitHub Pages)

Chrome Web Store の審査では公開されたプライバシーポリシーのURLが必要です。

1. 本リポジトリを GitHub にプッシュします。
2. GitHub のリポジトリページを開き、**Settings** → **Pages** に移動します。
3. **Branch** で `main` を選択し、フォルダを `/docs` に設定して **Save** を押します。
4. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` でプライバシーポリシーが Web 上に公開されます。このURLを後のステップで使います。

---

### ステップ 2: Chrome Web Store デベロッパー登録

1. [Chrome 開発者ダッシュボード](https://chrome.google.com/webstore/devconsole/) にアクセスし、Googleアカウントでログインします。
2. 初回のみ、開発者登録料（$5 USD / 1回のみ）の支払いと開発者規約への同意が必要です。
3. 2段階認証プロセス（2FA）が有効になっていることを確認してください。

---

### ステップ 3: パッケージ (ZIP) のアップロード

1. ダッシュボード右上の **「新しいアイテムを追加」** (Add new item) をクリックします。
2. `dist/reading-list-manager-v1.0.0.zip` をドラッグ＆ドロップしてアップロードします。
   - ※新しいバージョンを作る際は、ターミナルで `./scripts/package.sh` を実行するだけでクリーンな ZIP が再作成されます。

---

### ステップ 4: ストア掲載情報の入力

左メニューの各項目を入力していきます（内容は `store-assets/STORE_LISTING.md` をそのままコピーしてください）。

#### ① ストアの掲載情報 (Store Listing)
- **詳細な説明 (Detailed Description)**: `store-assets/STORE_LISTING.md` の「詳細な説明」を貼り付け。
- **カテゴリ (Category)**: 「生産性」(Productivity) または 「ワークフローと企画」(Workflow & Planning)。
- **言語 (Language)**: 「日本語」または「英語 (English)」。
- **ストアアイコン**: `reading-list-manager/icons/icon128.png` をアップロード。
- **プロモーション画像 (小タイル 440x280)**: `store-assets/promo-tile.jpg` をアップロード。
- **スクリーンショット**: 実際のブラウザで拡張機能を動作させた画面（サイドパネルまたは全画面表示）のスクリーンショット（1280x800 または 640x400）を1〜5枚撮影してアップロード。

#### ② プライバシーへの取り組み (Privacy Practices)
審査通過のための最重要セクションです。

- **単一目的の記述 (Single Purpose)**:
  `store-assets/STORE_LISTING.md` の Single Purpose 英文を貼り付け。
- **権限の正当化 (Permission Justification)**:
  `tabs`, `readingList`, `storage` などの理由欄に、`store-assets/STORE_LISTING.md` の対応する英文を貼り付け。
  - ※特に `tabs` 権限は「Alt+Shift+RでのURL取得」および「重複タブ防止」のためであることを明記しています。
- **データ使用に関する質問 (Data Usage)**:
  個人データの収集・販売・無関係な第三者送信はすべて「いいえ (No)」を選択。
- **プライバシーポリシーのURL (Privacy Policy URL)**:
  ステップ1で公開した GitHub Pages の URL を入力。

---

### ステップ 5: 審査への提出 (Submit for Review)

1. 右上の **「審査のために送信」** (Submit for Review) をクリックします。
2. 通常、2〜3営業日程度で Google の審査が行われます。
3. 承認されると、自動的に Chrome Web Store 上に公開され、世界中のユーザーがインストールできるようになります。
