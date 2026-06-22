# 鶴昇逐字稿

Windows 本機影音逐字稿工具，支援中文、英文與自動語言偵測。影音檔不會上傳到伺服器，不需要 OpenAI API Key，也沒有 43 MB 或 64 MB 的網頁上傳限制。

## 功能

- 直接選擇或拖曳音訊、影片檔
- 支援兩小時以上長檔，每 30 分鐘自動分段後合併
- 中文、English、自動偵測
- 輸出 UTF-8 TXT 逐字稿與 SRT 字幕
- 處理期間避免 Windows 自動休眠
- 常見格式：MP3、M4A、WAV、AAC、FLAC、MP4、MOV、MKV、AVI、WMV、WEBM 等

## Windows 安裝

1. 下載此資料夾，解壓縮後雙擊 `安裝鶴昇逐字稿.cmd`。
2. 安裝程式會下載官方 whisper.cpp、FFmpeg 與 Whisper small 多語模型，約需 600 MB。
3. 完成後桌面會出現 `鶴昇逐字稿` 捷徑。

第一次安裝需要網路，之後辨識可以離線使用。模型較大，因此沒有直接存進 GitHub commit。

## 手動編譯

在 Windows PowerShell 執行：

```powershell
.\build.ps1
```

需要 Windows 內建的 .NET Framework 4.x C# 編譯器，執行階段檔案需放在程式旁的 `_runtime` 資料夾。

## 技術

- C# Windows Forms
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) v1.8.3
- [FFmpeg](https://ffmpeg.org/)
- Whisper `small` 多語模型

辨識時間取決於音訊長度、清晰度與電腦效能。兩小時檔案受到支援，但不代表一定能在兩小時內完成。
