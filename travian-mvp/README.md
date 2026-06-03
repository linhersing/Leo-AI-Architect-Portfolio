# 邊境村莊 Frontier Village

這是一個早期網頁策略遊戲風格的單人 MVP，用來測試「GitHub Pages 前端 + Google Sheets 存檔」的架構。畫面與互動邏輯參考經典網頁策略遊戲，但沒有使用 Travian 官方圖片、商標或素材。

## 檔案結構

- `index.html`：GitHub Pages 可直接開啟的主頁。
- `styles.css`：遊戲 HUD、導覽列、村莊、地圖、戰報與存檔頁樣式。
- `app.js`：資源成長、升級、訓練、出兵、戰報、localStorage 與 Google Sheets 同步邏輯。
- `apps-script/Code.gs`：Google Apps Script 後端範例，用於把存檔寫入 Google Sheets。
- `tools/build-single-file.ps1`：產生可放 Google Drive 備份的單一 HTML。

## 目前功能

- 固定上方 HUD：木材、泥土、鐵礦、穀物、人口、士兵、回合。
- 明顯導覽：村莊、地圖、出兵 / 軍事、戰報、存檔。
- 村莊頁：可點擊資源田升級，顯示等級、產量、升級成本。
- 地圖頁：7x7 地圖、中央玩家村莊、綠洲、野獸營地、荒地。
- 出兵流程：選目標、派兵、攻擊、勝敗、損失、戰利品、清除狀態。
- 戰報：每次攻擊都會寫入紀錄。
- 存檔：localStorage 快速存檔、匯出 JSON、可選 Google Sheets 同步。

## Google Sheets 同步

目前測試用資料庫：

https://docs.google.com/spreadsheets/d/1cZ2tNUGjsGbhqvd24W-eUEygm3-QhySdurFMj-W2ZXc/edit?usp=drivesdk

設定方式：

1. 開啟上面的 Google Sheet。
2. 建立或開啟 Apps Script 專案。
3. 貼上 `apps-script/Code.gs`。
4. 如果有設定 `SECRET_TOKEN`，遊戲內的 Sync token 要填同一組。
5. 部署成 Web App。
6. 把 Web App URL 貼到遊戲的「存檔」頁 endpoint 欄位。

沒有設定 endpoint 時，遊戲仍可在線上遊玩，並使用瀏覽器 localStorage 存檔。
