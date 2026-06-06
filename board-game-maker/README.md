# 自製棋盤遊戲編輯器

`board-game-maker` 是獨立於 `/travian-mvp/` 的第二款 GitHub Pages 靜態遊戲。

## 目前功能

- 2 到 4 位玩家。
- 24 格預設棋盤。
- 擲骰、移動、經過起點獲得 500 金錢。
- 土地購買、升級、收過路費。
- 機會卡、命運卡、稅金、獎金、休息、傳送。
- 20 回合後結算金錢最高者。
- 編輯遊戲名稱、棋盤格、卡牌內容。
- localStorage 自動存檔、3 個手動存檔槽、JSON 匯出匯入。

## localStorage keys

- `board-game-maker-autosave`
- `board-game-maker-slot-1`
- `board-game-maker-slot-2`
- `board-game-maker-slot-3`

不使用 Travian MVP 的 localStorage key，不使用 Google Sheets / Firebase。
