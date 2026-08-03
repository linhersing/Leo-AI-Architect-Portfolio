$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path $RuntimeNode) {
  $Node = $RuntimeNode
} else {
  $Command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $Command) {
    throw "找不到 Node.js。請安裝 Node.js 20+ 後再執行。"
  }
  $Node = $Command.Source
}

& $Node (Join-Path $ScriptDir "server.js")
