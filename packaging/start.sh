#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if [ -x "$SCRIPT_DIR/runtime/node" ]; then
  NODE_BIN="$SCRIPT_DIR/runtime/node"
else
  NODE_BIN="node"
fi

exec "$NODE_BIN" "$SCRIPT_DIR/start.mjs"
