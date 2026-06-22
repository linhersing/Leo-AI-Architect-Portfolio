$ErrorActionPreference = 'Stop'

try {
    $assemblyPath = Join-Path $PSScriptRoot 'CraneTranscript.exe'
    if (-not (Test-Path -LiteralPath $assemblyPath)) {
        throw '找不到鶴昇逐字稿的主程式檔案。'
    }

    $assembly = [Reflection.Assembly]::LoadFile($assemblyPath)
    $entryPoint = $assembly.EntryPoint
    if ($null -eq $entryPoint) {
        throw '主程式沒有可用的啟動點。'
    }

    [void]$entryPoint.Invoke($null, $null)
}
catch {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
        "鶴昇逐字稿無法啟動。`r`n`r`n$($_.Exception.Message)",
        '啟動失敗',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
}
