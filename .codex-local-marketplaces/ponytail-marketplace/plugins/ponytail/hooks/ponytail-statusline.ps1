$stateDir = if ($env:PLUGIN_DATA) {
  $env:PLUGIN_DATA
} elseif ($env:COPILOT_PLUGIN_DATA) {
  $env:COPILOT_PLUGIN_DATA
} elseif ($env:CLAUDE_CONFIG_DIR) {
  $env:CLAUDE_CONFIG_DIR
} else {
  Join-Path $HOME ".claude"
}

$stateFile = Join-Path $stateDir ".ponytail-active"
if (-not (Test-Path -LiteralPath $stateFile)) {
  return
}

$mode = (Get-Content -LiteralPath $stateFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($mode)) {
  return
}

if ($mode -eq "full") {
  Write-Output "[PONYTAIL]"
} else {
  Write-Output "[PONYTAIL:$($mode.ToUpperInvariant())]"
}
