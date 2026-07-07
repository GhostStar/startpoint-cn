#!/usr/bin/env bash
# =============================================================================
# WF Patch Studio 启动脚本
# 用法:
#   bash scripts/start-patch-studio.sh
#   WF_WEB_HOST=0.0.0.0 WF_WEB_PORT=8788 bash scripts/start-patch-studio.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export WF_DATA_ROOT="${WF_DATA_ROOT:-$ROOT}"
export WF_TARGET_STORE="${WF_TARGET_STORE:-$ROOT/.cdn/cn/production/upload}"
export WF_CDN_DIR="${WF_CDN_DIR:-$ROOT/.cdn/cn}"
export WF_WEB_HOST="${WF_WEB_HOST:-127.0.0.1}"
export WF_WEB_PORT="${WF_WEB_PORT:-8788}"

echo "=== WF Patch Studio ==="
echo "  URL:          http://${WF_WEB_HOST}:${WF_WEB_PORT}"
echo "  data root:    $WF_DATA_ROOT"
echo "  target store: $WF_TARGET_STORE"
echo "  cdn root:     $WF_CDN_DIR"
echo ""

node node-web-editor/server.js
