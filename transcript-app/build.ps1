$ErrorActionPreference = 'Stop'
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$output = Join-Path $PSScriptRoot '鶴昇逐字稿.exe'

if (-not (Test-Path -LiteralPath $csc)) {
    throw 'Windows .NET Framework C# compiler was not found.'
}

& $csc /nologo /target:winexe /optimize+ /platform:x64 /out:$output /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'src\Program.cs')
if ($LASTEXITCODE -ne 0) {
    throw 'Build failed.'
}

Write-Host ('Built: ' + $output) -ForegroundColor Green
