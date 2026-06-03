# 邊境村莊 Frontier Village

早期網頁策略遊戲風格的單人 MVP，用來測試「GitHub Pages 前端 + Google Sheets 存檔」架構。介面邏輯參考經典中世紀網頁策略遊戲，但沒有使用 Travian 官方圖片、logo、商標或素材。

## 檔案結構

- `index.html`：GitHub Pages 主頁。
- `styles.css`：桌機/手機版 HUD、底部導覽、地圖、村莊、戰報與存檔樣式。
- `app.js`：資源產出、升級、訓練、出兵、任務、自動存檔、Google Sheets 同步。
- `apps-script/Code.gs`：Google Apps Script 後端。
- `tools/build-single-file.ps1`：產生 Drive 備份用單一 HTML。

## 目前功能

- 手機版底部導覽：村莊、地圖、軍事、戰報、存檔。
- 橫向滑動 HUD：目前資源、每小時產量、倉庫上限、滿倉時間。
- 村莊頁：資源田顯示成本、目前產量、升級後產量與明確升級按鈕。
- 資源測試：收成 / 更新資源、模擬 1 小時。
- 兵營訓練：棍棒兵 x1/x3、矛兵 x1/x2，顯示成本、攻擊、防禦、耗糧。
- 地圖頁：7x7 地圖、綠洲、野獸營地、荒地、已選取狀態。
- 出兵流程：選目標、輸入兵力、攻擊、結果卡片、查看戰報。
- 新手任務：升級、訓練、前往地圖、選目標、攻擊、查看戰報、雲端存檔。
- 本機自動存檔：升級/訓練/攻擊/任務完成時寫入 localStorage，每 30 秒也自動保存。
- 雲端自動同步：設定 endpoint 後，升級/訓練/攻擊後 debounce 同步，每 60 秒也同步一次。

## Google Sheets 同步

測試用資料庫：

https://docs.google.com/spreadsheets/d/1cZ2tNUGjsGbhqvd24W-eUEygm3-QhySdurFMj-W2ZXc/edit?usp=drivesdk

`Code.gs` 會建立或使用以下工作表：

- `player_state`：最新完整 state JSON。
- `battle_logs`：每次戰鬥追加一筆紀錄。
- `action_logs`：升級、訓練、手動存檔等操作紀錄。

部署方式：

1. 開啟 Google Sheet。
2. 開啟 Apps Script。
3. 貼上 `apps-script/Code.gs`。
4. 如需 token，設定 `SECRET_TOKEN`，並在遊戲存檔頁填同一組。
5. 部署成 Web App。
6. 把 Web App URL 貼到遊戲「存檔」頁的 endpoint。

未設定 endpoint 時，遊戲仍可在線上遊玩，但只會使用瀏覽器本機存檔。
