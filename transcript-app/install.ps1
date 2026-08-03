$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$desktop = [Environment]::GetFolderPath('Desktop')
$targetRoot = Join-Path $desktop '鶴昇逐字稿'
$appRoot = Join-Path $env:LOCALAPPDATA 'CraneTranscript\App'
$runtime = Join-Path $env:LOCALAPPDATA 'CraneTranscript\runtime-v183-small'
$tools = Join-Path $runtime 'tools'
$models = Join-Path $runtime 'models'
$temp = Join-Path $env:TEMP ('crane-transcript-install-' + [Guid]::NewGuid().ToString('N'))
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

function Download-File([string]$Url, [string]$Destination) {
    Write-Host ('Downloading ' + [IO.Path]::GetFileName($Destination) + ' ...')
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
}

try {
    Write-Host 'Installing Crane Transcript...' -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $targetRoot, $appRoot, $tools, $models, (Join-Path $targetRoot '逐字稿輸出'), $temp -Force | Out-Null

    if (-not (Test-Path -LiteralPath $csc)) {
        throw 'Windows .NET Framework C# compiler was not found.'
    }

    $whisperZip = Join-Path $temp 'whisper-bin-x64.zip'
    $ffmpegZip = Join-Path $temp 'ffmpeg-release-essentials.zip'
    Download-File 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip' $whisperZip
    Download-File 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $ffmpegZip
    Download-File 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' (Join-Path $models 'ggml-small.bin')

    Write-Host 'Extracting local engines...'
    Expand-Archive -LiteralPath $whisperZip -DestinationPath (Join-Path $temp 'whisper') -Force
    Expand-Archive -LiteralPath $ffmpegZip -DestinationPath (Join-Path $temp 'ffmpeg') -Force

    $whisperExe = Get-ChildItem -LiteralPath (Join-Path $temp 'whisper') -Filter 'whisper-cli.exe' -Recurse | Select-Object -First 1
    $ffmpegExe = Get-ChildItem -LiteralPath (Join-Path $temp 'ffmpeg') -Filter 'ffmpeg.exe' -Recurse | Select-Object -First 1
    if (-not $whisperExe -or -not $ffmpegExe) {
        throw 'Downloaded engine archive did not contain the expected executable.'
    }

    Copy-Item -LiteralPath $whisperExe.FullName -Destination (Join-Path $tools 'whisper-cli.exe') -Force
    Get-ChildItem -LiteralPath $whisperExe.Directory.FullName -Filter '*.dll' | Copy-Item -Destination $tools -Force
    Copy-Item -LiteralPath $ffmpegExe.FullName -Destination (Join-Path $tools 'ffmpeg.exe') -Force

    Write-Host 'Building Windows application...'
    $source = Join-Path $PSScriptRoot 'src\Program.cs'
    $outputExe = Join-Path $appRoot 'CraneTranscript.exe'
    & $csc /nologo /target:winexe /optimize+ /platform:x64 /out:$outputExe /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll $source
    if ($LASTEXITCODE -ne 0) {
        throw 'C# compilation failed.'
    }

    $runtimeLink = Join-Path $appRoot '_runtime'
    if (-not (Test-Path -LiteralPath $runtimeLink)) {
        New-Item -ItemType Junction -Path $runtimeLink -Target $runtime | Out-Null
    }

    $outputLink = Join-Path $appRoot '逐字稿輸出'
    if (-not (Test-Path -LiteralPath $outputLink)) {
        New-Item -ItemType Junction -Path $outputLink -Target (Join-Path $targetRoot '逐字稿輸出') | Out-Null
    }

    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Launch.ps1') -Destination (Join-Path $appRoot 'Launch.ps1') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '開啟鶴昇逐字稿.cmd') -Destination (Join-Path $targetRoot '開啟鶴昇逐字稿.cmd') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '使用說明.txt') -Destination (Join-Path $targetRoot '使用說明.txt') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'THIRD_PARTY_NOTICES.txt') -Destination (Join-Path $runtime 'THIRD_PARTY_NOTICES.txt') -Force

    $shell = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path $targetRoot '鶴昇逐字稿（點我開啟）.lnk'
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "' + (Join-Path $appRoot 'Launch.ps1') + '"'
    $shortcut.WorkingDirectory = $appRoot
    $shortcut.Description = '本機中文與英文影音逐字稿工具'
    $shortcut.IconLocation = "$env:WINDIR\System32\imageres.dll,68"
    $shortcut.Save()

    Write-Host ('Installed to: ' + $targetRoot) -ForegroundColor Green
    Start-Process -FilePath $shortcutPath
}
finally {
    if (Test-Path -LiteralPath $temp) {
        Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
