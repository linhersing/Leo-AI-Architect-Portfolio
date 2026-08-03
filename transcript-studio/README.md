# Transcript Studio

本機逐字稿小工具：上傳音訊或影片，選中文/英文，產出可複製與下載的逐字稿。

## 執行

PowerShell：

```powershell
cd transcript-studio
.\start.ps1
```

打開：

```text
http://127.0.0.1:8787
```

## 大檔案支援

工具上傳上限預設是 `2048 MB`。OpenAI 轉錄 API 直接上傳單檔限制保守抓 `24.5 MB`，所以 43 MB、24 Mbps 這類高位元率影音檔不能硬送 API，必須靠 `ffmpeg` 先抽音、壓縮、切段。

建議安裝 ffmpeg，或在 `.env` 設定：

```text
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```

可直接送 OpenAI 的格式：

```text
.flac .mp3 .mp4 .mpeg .mpga .m4a .ogg .wav .webm
```

有 ffmpeg 時，也可處理常見影片格式，例如 `.mov .mkv .avi .wmv .m4v .flv .3gp`。

## API key

這一版使用 OpenAI Audio Transcriptions API，所以需要 OpenAI API key。ChatGPT Plus/Pro 帳號和 OpenAI API key 不是同一件事；沒有 API key 就不能用這個 API 版轉錄。

不要把 API key 寫進 GitHub Pages 或公開前端程式碼，否則別人可以用你的額度。正確做法：

- 本機使用：把 key 放在 `.env`，或在本機頁面輸入。
- 對外網站使用：部署到有後端的服務，例如 Render、Railway、Vercel serverless、Cloudflare Workers，再把 key 放在 server-side environment variables。
- 完全不要 API key：要改成 whisper.cpp / 本機 Whisper 版本，需要另外下載模型與安裝本機轉錄引擎。

## 資料庫

目前不需要資料庫。逐字稿結果會存在本機：

```text
data/jobs
```

若未來要做歷史紀錄、客戶名稱、處理狀態或雲端保存，可以接 Google Sheets；但影音檔本身不適合放 Google Sheets。
