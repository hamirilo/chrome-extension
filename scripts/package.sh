#!/usr/bin/env bash
set -euo pipefail

# スクリプトの場所からリポジトリルートを特定
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="${ROOT_DIR}/reading-list-manager"
DIST_DIR="${ROOT_DIR}/dist"

# manifest.json からバージョンを取得 (node に依存せず sed/grep で抽出)
VERSION=$(grep '"version"' "${EXT_DIR}/manifest.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
OUTPUT_ZIP="${DIST_DIR}/reading-list-manager-v${VERSION}.zip"

echo "=== Chrome Web Store 配布用パッケージ作成 ==="
echo "Version: ${VERSION}"
echo "Source:  ${EXT_DIR}"
echo "Output:  ${OUTPUT_ZIP}"

mkdir -p "${DIST_DIR}"
rm -f "${OUTPUT_ZIP}"

# 一時ディレクトリにクリーンコピー
TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

mkdir -p "${TMP_DIR}/package"
rsync -av \
  --exclude=".DS_Store" \
  --exclude="._*" \
  --exclude="*.tmp" \
  --exclude="*~" \
  --exclude="README.md" \
  "${EXT_DIR}/" "${TMP_DIR}/package/"

cd "${TMP_DIR}/package"
zip -r -q -9 "${OUTPUT_ZIP}" .

echo "✓ パッケージが正常に作成されました:"
ls -lh "${OUTPUT_ZIP}"
echo ""
echo "=== ZIP 内ファイル一覧 ==="
unzip -l "${OUTPUT_ZIP}"
