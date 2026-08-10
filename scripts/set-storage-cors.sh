#!/usr/bin/env bash
# 設定 Firebase Storage CORS，讓瀏覽器可 fetch／getBlob 下載照片。
# 用法（本機已安裝 gcloud 或 gsutil，並登入有權限的帳號）：
#
#   ./scripts/set-storage-cors.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORS_FILE="$ROOT/storage.cors.json"
BUCKET="${1:-ci-inspection.firebasestorage.app}"

if ! command -v gsutil >/dev/null 2>&1 && ! command -v gcloud >/dev/null 2>&1; then
  echo "請先安裝 Google Cloud SDK（含 gsutil）"
  echo "https://cloud.google.com/sdk/docs/install"
  exit 1
fi

echo "套用 CORS → gs://${BUCKET}"
if command -v gcloud >/dev/null 2>&1; then
  gcloud storage buckets update "gs://${BUCKET}" --cors-file="$CORS_FILE"
else
  gsutil cors set "$CORS_FILE" "gs://${BUCKET}"
fi
echo "完成。請重新整理 https://ww3e23.github.io/CI/ 後再試下載。"
