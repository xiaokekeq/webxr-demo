#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${PLUGIN_DATA:-}" ]]; then
  state_dir="$PLUGIN_DATA"
elif [[ -n "${COPILOT_PLUGIN_DATA:-}" ]]; then
  state_dir="$COPILOT_PLUGIN_DATA"
elif [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
  state_dir="$CLAUDE_CONFIG_DIR"
else
  state_dir="$HOME/.claude"
fi

state_file="$state_dir/.ponytail-active"
if [[ ! -f "$state_file" ]]; then
  exit 0
fi

mode="$(tr -d '\r\n' < "$state_file")"
if [[ -z "$mode" ]]; then
  exit 0
fi

if [[ "$mode" == "full" ]]; then
  printf '[PONYTAIL]\n'
else
  printf '[PONYTAIL:%s]\n' "$(printf '%s' "$mode" | tr '[:lower:]' '[:upper:]')"
fi
