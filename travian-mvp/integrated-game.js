/**
 * 整合遊戲系統：邊境村莊 + 棋盤遊戲戰鬥
 * 主要功能：
 * 1. 邊境村莊為主遊戲
 * 2. 棋盤遊戲融入作為多人 PvP 戰鬥模式
 * 3. 統一的 Google Sheets 同步
 */

(function () {
  const INTEGRATED_KEY = "frontier-village-integrated-save";
  const BOARD_GAME_STATE_KEY = "frontier-village-board-game-state";
  const CLOUD_ENDPOINT = "https://script.google.com/macros/s/AKfycbz2ttAxilWIULbA_GNeuGk1Ltjo6iycM4w8v_RUasolmwyu62cX1S5T_sRUwX1kaa1VSw/exec";

  // ============ 棋盤遊戲 ============
  class BoardGameState {
    constructor() {
      this.gameTitle = "邊境村莊 - 多人戰爭";
      this.players = [];
      this.board = this.createDefaultBoard();
      this.cards = { chance: [], fate: [] };
      this.currentTurnIndex = 0;
      this.round = 1;
      this.logs = [];
      this.updatedAt = new Date().toISOString();
      this.mode = "play";
      this.view = "board";
      this.lastRoll = null;
      this.event = null;
      this.finished = false;
    }

    createDefaultBoard() {
      const tiles = [
        { id: "start", index: 0, type: "start", name: "起點", description: "邊境村莊", price: 0, rent: 0, ownerId: null, level: 1 },
        { id: "t1", index: 1, type: "property", name: "北方平原", description: "肥沃的農業用地", price: 600, rent: 50, ownerId: null, level: 1 },
        { id: "c1", index: 2, type: "chance", name: "機會", description: "發生隨機事件", price: 0, rent: 0, ownerId: null, level: 1 },
        { id: "t2", index: 3, type: "property", name: "森林", description: "木材豐富", price: 600, rent: 50, ownerId: null, level: 1 },
        { id: "tax1", index: 4, type: "tax", name: "稅收", description: "需繳稅 150 金幣", amount: 150, price: 0, rent: 0, ownerId: null, level: 1 },
        { id: "t3", index: 5, type: "property", name: "礦山", description: "鐵礦豐富", price: 800, rent: 100, ownerId: null, level: 1 },
        { id: "f1", index: 6, type: "fate", name: "命運", description: "發生隨機事件", price: 0, rent: 0, ownerId: null, level: 1 },
        { id: "t4", index: 7, type: "property", name: "城堡", description: "防禦堅固", price: 800, rent: 100, ownerId: null, level: 1 },
        { id: "bonus1", index: 8, type: "bonus", name: "獎金站", description: "獲得獎金 200", amount: 200, price: 0, rent: 0, ownerId: null, level: 1 },
      ];

      return tiles;
    }

    addPlayer(playerName, color, emoji, initialMoney = 3000) {
      this.players.push({
        id: `player-${this.players.length + 1}`,
        name: playerName,
        color: color,
        emoji: emoji,
        position: 0,
        money: initialMoney,
        troops: { clubman: 0, spearman: 0, scout: 0 },
        properties: [],
      });
    }

    rollDice() {
      return 1 + Math.floor(Math.random() * 6);
    }

    movePlayer(playerId, steps) {
      const player = this.players.find((p) => p.id === playerId);
      if (!player) return;

      const from = player.position;
      const newPosition = (from + steps) % this.board.length;
      const passedStart = from + steps >= this.board.length;

      player.position = newPosition;
      if (passedStart) player.money += 500; // 經過起點獲得 500

      return { from, newPosition, passedStart };
    }

    buyProperty(playerId, tileId) {
      const player = this.players.find((p) => p.id === playerId);
      const tile = this.board.find((t) => t.id === tileId);

      if (!player || !tile || tile.type !== "property" || tile.ownerId) return false;
      if (player.money < tile.price) return false;

      player.money -= tile.price;
      tile.ownerId = playerId;
      player.properties.push(tileId);
      return true;
    }

    upgradeProperty(playerId, tileId) {
      const tile = this.board.find((t) => t.id === tileId);
      const player = this.players.find((p) => p.id === playerId);

      if (!player || !tile || tile.ownerId !== playerId) return false;

      const cost = Math.round(tile.price * 0.5 * tile.level);
      if (player.money < cost) return false;

      player.money -= cost;
      tile.level += 1;
      tile.rent = Math.round(tile.rent * 1.35);
      return true;
    }

    collectRent(playerId, tileId, payer) {
      const tile = this.board.find((t) => t.id === tileId);
      const owner = this.players.find((p) => p.id === tile.ownerId);
      const payingPlayer = this.players.find((p) => p.id === payer);

      if (!owner || !payingPlayer || owner.id === payingPlayer.id) return false;

      const rentAmount = tile.rent * tile.level;
      if (payingPlayer.money < rentAmount) {
        // 無法支付，宣布破產
        payingPlayer.money = 0;
      } else {
        payingPlayer.money -= rentAmount;
        owner.money += rentAmount;
      }

      return rentAmount;
    }

    addLog(message) {
      const time = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
      this.logs.unshift({ id: `log-${Date.now()}`, time, message });
      if (this.logs.length > 120) this.logs = this.logs.slice(0, 120);
    }

    save() {
      localStorage.setItem(BOARD_GAME_STATE_KEY, JSON.stringify(this));
      this.updatedAt = new Date().toISOString();
    }

    static load() {
      const saved = localStorage.getItem(BOARD_GAME_STATE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        const state = new BoardGameState();
        Object.assign(state, data);
        return state;
      }
      return new BoardGameState();
    }
  }

  // ============ 整合戰鬥系統 ============
  class CombatSystem {
    static calculateBattle(attacker, defender, troops, targetTile) {
      const attackPower = 
        (troops.clubman || 0) * 40 + 
        (troops.spearman || 0) * 12 + 
        (troops.scout || 0) * 0;

      // 防禦力來自該土地等級 + 防禦兵
      const defensePower = targetTile.level * 50 + (defender?.troops?.spearman || 0) * 38;

      const result = {
        id: `battle-${Date.now()}`,
        time: new Date().toLocaleTimeString("zh-TW"),
        isoTime: new Date().toISOString(),
        attacker: attacker.name,
        defender: defender?.name || "野獸",
        target: targetTile.name,
        attackPower,
        defensePower,
        sent: troops,
        losses: {},
        loot: {},
        winner: attackPower > defensePower ? attacker.name : defender?.name || "野獸",
        cleared: attackPower > defensePower,
        raw_json: {},
      };

      if (result.cleared) {
        // 勝利：獲得金錢
        result.loot = { money: targetTile.level * 200 + Math.random() * 300 };
        attacker.money += result.loot.money;

        // 如果是玩家領地，進行搶劫
        if (defender && defender.money > 0) {
          const stolenMoney = Math.min(defender.money * 0.3, 500);
          defender.money -= stolenMoney;
          attacker.money += stolenMoney;
          result.loot.stolen = stolenMoney;
        }
      } else {
        // 失敗：損失部隊
        result.losses = {
          clubman: Math.floor((troops.clubman || 0) * 0.5),
          spearman: Math.floor((troops.spearman || 0) * 0.5),
          scout: Math.floor((troops.scout || 0) * 0.3),
        };
      }

      return result;
    }
  }

  // ============ 雲端同步擴展 ============
  class IntegratedCloudSync {
    static async saveToCloud(villageState, boardGameState, actionLogs = [], battleLogs = []) {
      const payload = {
        action: "saveState",
        state: {
          ...villageState,
          boardGame: boardGameState,
        },
        battleLogs: battleLogs,
        actionLogs: actionLogs,
        reason: "integrated-game-save",
        savedAt: new Date().toISOString(),
      };

      try {
        const response = await fetch(CLOUD_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        return result;
      } catch (error) {
        console.error("雲端同步失敗：", error);
        return { ok: false, error: error.message };
      }
    }

    static async loadFromCloud() {
      try {
        const response = await fetch(CLOUD_ENDPOINT + "?action=loadState");
        const result = await response.json();
        return result;
      } catch (error) {
        console.error("載入雲端存檔失敗：", error);
        return { ok: false, error: error.message };
      }
    }
  }

  // ============ 導出給全局使用 ============
  window.IntegratedGame = {
    BoardGameState,
    CombatSystem,
    IntegratedCloudSync,
    INTEGRATED_KEY,
    BOARD_GAME_STATE_KEY,
  };
})();
