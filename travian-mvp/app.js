const CLOUD_ENDPOINT = "https://script.google.com/macros/s/AKfycbz2ttAxilWIULbA_GNeuGk1Ltjo6iycM4w8v_RUasolmwyu62cX1S5T_sRUwX1kaa1VSw/exec";
const STORAGE_KEY = "frontier-village-stable-save";
const OLD_KEYS = ["frontier-village-save-v4", "frontier-village-save-v3", "frontier-village-save-v2", "frontier-village-save"];
const ENDPOINT_KEY = "frontier-village-sheet-endpoint";
const WAREHOUSE_LIMIT = 9000;

const RES = {
  wood: { name: "木材", icon: "🪵" },
  clay: { name: "泥土", icon: "🧱" },
  iron: { name: "鐵礦", icon: "⛓️" },
  crop: { name: "穀物", icon: "🌾" },
};

const UNITS = {
  clubman: { name: "棍棒兵", icon: "⚔️", attack: 40, defense: 18, upkeep: 1, cost: { wood: 95, clay: 75, iron: 40, crop: 40 } },
  spearman: { name: "矛兵", icon: "🛡️", attack: 12, defense: 38, upkeep: 1, cost: { wood: 80, clay: 100, iron: 80, crop: 40 } },
  scout: { name: "斥候", icon: "👁️", attack: 0, defense: 10, upkeep: 1, cost: { wood: 60, clay: 40, iron: 90, crop: 50 } },
};

const BUILDINGS = {
  main: { name: "主樓", icon: "🏛️", role: "村莊核心", cost: { wood: 160, clay: 130, iron: 100, crop: 70 } },
  warehouse: { name: "倉庫", icon: "📦", role: "提高資源上限", cost: { wood: 130, clay: 160, iron: 90, crop: 70 } },
  granary: { name: "穀倉", icon: "🌾", role: "保存穀物", cost: { wood: 120, clay: 110, iron: 90, crop: 140 } },
  barracks: { name: "兵營", icon: "⚔️", role: "訓練士兵", cost: { wood: 180, clay: 150, iron: 170, crop: 90 } },
  rally: { name: "集結點", icon: "🚩", role: "出兵與防守", cost: { wood: 110, clay: 130, iron: 120, crop: 80 } },
  wall: { name: "城牆", icon: "🧱", role: "抵抗衝撞車", cost: { wood: 200, clay: 180, iron: 120, crop: 80 } },
};

const QUESTS = [
  ["upgrade", "升級任一資源田", "下一步：訓練棍棒兵。"],
  ["train", "訓練棍棒兵", "下一步：前往地圖，選擇一個綠洲。"],
  ["select", "選擇地圖目標", "下一步：輸入兵力並攻擊。"],
  ["attack", "完成一次攻擊", "下一步：查看戰報。"],
  ["report", "查看戰報", "下一步：按立即同步，存到 Google Sheets。"],
  ["cloud", "完成雲端存檔", "教學完成，可以繼續升級、訓練與防守。"],
];

let state = normalize(loadInitialState());
let selectedTileId = null;
let selectedBuildingId = "main";
let lastHud = {};

function freshState() {
  const fields = [
    ...Array.from({ length: 4 }, (_, i) => field("wood", i)),
    ...Array.from({ length: 4 }, (_, i) => field("clay", i + 4)),
    ...Array.from({ length: 4 }, (_, i) => field("iron", i + 8)),
    ...Array.from({ length: 6 }, (_, i) => field("crop", i + 12)),
  ];

  return {
    version: 5,
    turn: 1,
    lastTick: Date.now(),
    lastSaved: "",
    lastCloudSaved: "",
    progress: { upgrade: false, train: false, select: false, attack: false, report: false, cloud: false },
    village: {
      name: "邊境村莊",
      warehouseLimit: WAREHOUSE_LIMIT,
      resources: { wood: 1800, clay: 1800, iron: 1800, crop: 1800 },
      fields,
      buildings: Object.keys(BUILDINGS).map((id) => ({ id, level: 1 })),
    },
    troops: { clubman: 12, spearman: 4, scout: 2 },
    map: createMap(),
    incoming: createIncomingRaid(),
    reports: [],
    actionLogs: [],
    lastBattle: null,
  };
}

function field(type, index) {
  return { id: `${type}_${index}`, type, name: type === "wood" ? "伐木場" : type === "clay" ? "泥土坑" : type === "iron" ? "鐵礦場" : "農田", level: 1 };
}

function createMap() {
  const tiles = [];
  for (let y = -3; y <= 3; y += 1) {
    for (let x = -3; x <= 3; x += 1) {
      tiles.push({ id: `${x}_${y}`, x, y, type: x === 0 && y === 0 ? "village" : "wild", name: x === 0 && y === 0 ? "你的村莊" : "荒地", cleared: false });
    }
  }

  const targets = [
    { id: "-1_1", type: "oasis", name: "森林綠洲", bonus: "木材 +25%", animals: 18, resources: { wood: 120, clay: 45, iron: 35, crop: 55 } },
    { id: "2_-1", type: "oasis", name: "泥土綠洲", bonus: "泥土 +25%", animals: 10, resources: { wood: 50, clay: 135, iron: 40, crop: 60 } },
    { id: "1_2", type: "oasis", name: "穀物綠洲", bonus: "穀物 +25%", animals: 26, resources: { wood: 40, clay: 60, iron: 45, crop: 160 } },
    { id: "-2_-2", type: "oasis", name: "鐵礦綠洲", bonus: "鐵礦 +25%", animals: 14, resources: { wood: 70, clay: 45, iron: 140, crop: 40 } },
    { id: "3_2", type: "camp", name: "野獸營地", bonus: "小型戰利品", animals: 8, resources: { wood: 45, clay: 40, iron: 25, crop: 35 } },
    { id: "-3_0", type: "camp", name: "狼穴", bonus: "小型戰利品", animals: 12, resources: { wood: 35, clay: 55, iron: 40, crop: 25 } },
  ];
  for (const target of targets) Object.assign(tiles.find((tile) => tile.id === target.id), target);
  return tiles;
}

function createIncomingRaid() {
  const delay = 120 + Math.floor(Math.random() * 180);
  return {
    id: `raid_${Date.now()}`,
    arriveAt: Date.now() + delay * 1000,
    clubman: 8 + Math.floor(Math.random() * 12),
    ram: Math.random() > 0.55 ? 1 : 0,
    catapult: Math.random() > 0.75 ? 1 : 0,
  };
}

function loadInitialState() {
  localStorage.setItem(ENDPOINT_KEY, CLOUD_ENDPOINT);
  for (const key of OLD_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore unavailable storage.
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return freshState();
}

function normalize(saved) {
  const base = freshState();
  const village = saved.village || {};
  return {
    ...base,
    ...saved,
    version: 5,
    progress: { ...base.progress, ...(saved.progress || {}) },
    village: {
      ...base.village,
      ...village,
      resources: { ...base.village.resources, ...(village.resources || {}) },
      fields: Array.isArray(village.fields) && village.fields.length ? village.fields.map((item, index) => ({ ...field(item.type || "wood", index), ...item, level: Math.max(1, Number(item.level || 1)) })) : base.village.fields,
      buildings: normalizeBuildings(village.buildings),
    },
    troops: { ...base.troops, ...(saved.troops || {}) },
    map: normalizeMap(saved.map, base.map),
    incoming: saved.incoming && saved.incoming.arriveAt ? saved.incoming : createIncomingRaid(),
    reports: Array.isArray(saved.reports) ? saved.reports : [],
    actionLogs: Array.isArray(saved.actionLogs) ? saved.actionLogs : [],
  };
}

function normalizeBuildings(saved) {
  const list = Array.isArray(saved) ? saved : [];
  return Object.keys(BUILDINGS).map((id) => {
    const current = list.find((item) => item.id === id);
    return { id, level: Math.max(1, Number(current?.level || 1)) };
  });
}

function normalizeMap(saved, base) {
  if (!Array.isArray(saved) || saved.length !== 49) return base;
  return base.map((tile) => {
    const old = saved.find((item) => item.id === tile.id);
    if (!old) return tile;
    if (tile.type === "oasis" || tile.type === "camp") return { ...tile, cleared: Boolean(old.cleared), animals: old.cleared ? 0 : Number(old.animals ?? tile.animals) };
    return tile;
  });
}

function rates() {
  const result = { wood: 0, clay: 0, iron: 0, crop: 0 };
  for (const item of state.village.fields) result[item.type] += 16 + item.level * 12;
  result.crop = Math.max(0, result.crop - upkeep());
  return result;
}

function upkeep() {
  return Object.entries(state.troops).reduce((sum, [unit, amount]) => sum + amount * UNITS[unit].upkeep, 0);
}

function totalTroops() {
  return Object.values(state.troops).reduce((sum, amount) => sum + amount, 0);
}

function population() {
  return 26 + state.village.fields.reduce((sum, item) => sum + item.level, 0) + state.village.buildings.reduce((sum, item) => sum + item.level, 0) + Math.floor(totalTroops() / 4);
}

function warehouseLimit() {
  return Number(state.village.warehouseLimit || WAREHOUSE_LIMIT) + (buildingLevel("warehouse") - 1) * 1500 + (buildingLevel("granary") - 1) * 900;
}

function buildingLevel(id) {
  return Math.max(1, Number(state.village.buildings.find((item) => item.id === id)?.level || 1));
}

function tick() {
  const now = Date.now();
  const hours = Math.max(0, (now - Number(state.lastTick || now)) / 3600000);
  if (hours > 0.0003) {
    addResources(hours);
    state.lastTick = now;
  }
  if (state.incoming && now >= state.incoming.arriveAt) resolveIncomingRaid();
}

function addResources(hours) {
  const cap = warehouseLimit();
  const currentRates = rates();
  for (const key of Object.keys(RES)) state.village.resources[key] = Math.min(cap, state.village.resources[key] + currentRates[key] * hours);
}

function fieldCost(item) {
  const level = Number(item.level || 1);
  return { wood: 80 + level * 42, clay: 70 + level * 36, iron: 55 + level * 31, crop: 35 + level * 24 };
}

function buildingCost(item) {
  const base = BUILDINGS[item.id].cost;
  const level = Number(item.level || 1);
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Math.round(value * (1 + level * 0.42))]));
}

function canPay(cost) {
  return Object.entries(cost).every(([key, value]) => state.village.resources[key] >= value);
}

function pay(cost) {
  if (!canPay(cost)) {
    showNotice("資源不足。可以先按「收成 / 更新」或「模擬 1 小時」。", "warn");
    return false;
  }
  for (const [key, value] of Object.entries(cost)) state.village.resources[key] -= value;
  return true;
}

function upgradeField(id) {
  tick();
  const item = state.village.fields.find((fieldItem) => fieldItem.id === id);
  if (!item) return;
  const cost = fieldCost(item);
  if (!pay(cost)) return render();
  item.level += 1;
  state.turn += 1;
  completeQuest("upgrade");
  logAction("upgrade", `${item.name} 升級到等級 ${item.level}`, { id, cost });
  commit(`${item.name} 升級成功，現在是等級 ${item.level}。`, true);
}

function upgradeBuilding(id) {
  tick();
  const item = state.village.buildings.find((buildingItem) => buildingItem.id === id);
  if (!item) return;
  const cost = buildingCost(item);
  if (!pay(cost)) return render();
  item.level += 1;
  state.turn += 1;
  logAction("building", `${BUILDINGS[id].name} 升級到等級 ${item.level}`, { id, cost });
  commit(`${BUILDINGS[id].name} 升級成功，現在是等級 ${item.level}。`, true);
}

function train(unit, amount) {
  tick();
  const cost = multiply(UNITS[unit].cost, amount);
  if (!pay(cost)) return render();
  state.troops[unit] += amount;
  state.turn += 1;
  if (unit === "clubman") completeQuest("train");
  logAction("train", `訓練完成，${UNITS[unit].name} +${amount}`, { unit, amount, cost });
  commit(`訓練完成，${UNITS[unit].name} +${amount}。`, true);
}

function collectResources() {
  tick();
  logAction("collect", "收成 / 更新資源");
  commit("資源已更新。", false);
}

function simulateHour() {
  addResources(1);
  state.lastTick = Date.now();
  state.turn += 1;
  logAction("simulate", "模擬 1 小時");
  commit("已模擬 1 小時，資源增加了。", false);
}

function attackTarget() {
  tick();
  const target = state.map.find((tile) => tile.id === selectedTileId);
  if (!target || !isAttackable(target)) {
    showNotice("請先在地圖上選擇綠洲或野獸營地。", "warn");
    return;
  }
  const sent = { clubman: readNumber("sendClub"), spearman: readNumber("sendSpear") };
  if (sent.clubman + sent.spearman <= 0) return showNotice("至少要派出一名士兵。", "warn");
  if (sent.clubman > state.troops.clubman || sent.spearman > state.troops.spearman) return showNotice("派出的士兵超過目前兵力。", "warn");

  const attack = sent.clubman * UNITS.clubman.attack + sent.spearman * UNITS.spearman.attack;
  const defense = target.animals * 23 + Math.floor(Math.random() * 60);
  const victory = attack >= defense;
  const lossRate = victory ? Math.min(0.42, defense / Math.max(1, attack) * 0.36) : Math.min(0.9, defense / Math.max(1, attack) * 0.58);
  const losses = { clubman: Math.min(sent.clubman, Math.ceil(sent.clubman * lossRate)), spearman: Math.min(sent.spearman, Math.ceil(sent.spearman * lossRate)) };
  state.troops.clubman -= losses.clubman;
  state.troops.spearman -= losses.spearman;

  const loot = victory ? { ...target.resources } : { wood: 0, clay: 0, iron: 0, crop: 0 };
  if (victory) {
    for (const key of Object.keys(RES)) state.village.resources[key] = Math.min(warehouseLimit(), state.village.resources[key] + (loot[key] || 0));
    target.cleared = true;
    target.animals = 0;
  } else {
    target.animals = Math.max(1, target.animals - Math.ceil((sent.clubman + sent.spearman) / 4));
  }

  const report = {
    id: `battle_${Date.now()}`,
    time: new Date().toLocaleString("zh-TW"),
    isoTime: new Date().toISOString(),
    type: "attack",
    target: target.name,
    coordinate: `(${target.x}, ${target.y})`,
    result: victory ? "勝利" : "失敗",
    sent,
    losses,
    loot,
    cleared: victory,
  };
  state.lastBattle = report;
  state.reports.unshift(report);
  state.reports = state.reports.slice(0, 40);
  completeQuest("attack");
  logAction("attack", `攻擊${target.name}：${report.result}`, { sent, losses, loot });
  commit(victory ? `攻擊勝利：${target.name} 已清除。` : `攻擊失敗：${target.name} 還有野獸。`, true);
}

function resolveIncomingRaid() {
  const raid = state.incoming;
  const defense = state.troops.clubman * UNITS.clubman.defense + state.troops.spearman * UNITS.spearman.defense + state.troops.scout * UNITS.scout.defense + buildingLevel("wall") * 35;
  const attack = raid.clubman * 36 + raid.ram * 120 + raid.catapult * 170;
  const defended = defense >= attack;
  const stolen = { wood: 0, clay: 0, iron: 0, crop: 0 };
  const damage = [];

  if (!defended) {
    for (const key of Object.keys(RES)) {
      stolen[key] = Math.min(Math.floor(state.village.resources[key] * 0.12), 240);
      state.village.resources[key] -= stolen[key];
    }
    if (raid.ram) damageBuilding("wall", damage);
    if (raid.catapult) {
      const candidates = state.village.buildings.filter((item) => item.id !== "wall" && item.level > 1);
      if (candidates.length) damageBuilding(candidates[Math.floor(Math.random() * candidates.length)].id, damage);
    }
  }

  const report = {
    id: `defense_${Date.now()}`,
    time: new Date().toLocaleString("zh-TW"),
    isoTime: new Date().toISOString(),
    type: "defense",
    target: "你的村莊",
    coordinate: "(0, 0)",
    result: defended ? "防守成功" : "防守失敗",
    sent: { attackers: raid.clubman, ram: raid.ram, catapult: raid.catapult },
    losses: defended ? { attackers: raid.clubman } : { clubman: Math.ceil(state.troops.clubman * 0.08), spearman: Math.ceil(state.troops.spearman * 0.08) },
    loot: stolen,
    cleared: defended,
    damage,
  };
  state.reports.unshift(report);
  state.reports = state.reports.slice(0, 40);
  state.lastBattle = report;
  state.incoming = createIncomingRaid();
  logAction("defense", report.result, { stolen, damage });
  commit(defended ? "防守成功，敵軍被擊退。" : `防守失敗，資源被搶：${formatCost(stolen)}。`, true);
}

function damageBuilding(id, damage) {
  const building = state.village.buildings.find((item) => item.id === id);
  if (!building || building.level <= 1) return;
  building.level -= 1;
  damage.push(`${BUILDINGS[id].name} 降到等級 ${building.level}`);
}

function selectTile(id) {
  selectedTileId = id;
  const target = state.map.find((tile) => tile.id === id);
  if (target && isAttackable(target)) completeQuest("select");
  showNotice(target ? `已選取：${target.name} (${target.x}, ${target.y})。` : "已選取地圖格。");
  saveLocal();
  render();
}

function isAttackable(tile) {
  return (tile.type === "oasis" || tile.type === "camp") && !tile.cleared;
}

function logAction(type, message, details = {}) {
  state.actionLogs.unshift({ id: `action_${Date.now()}`, time: new Date().toLocaleString("zh-TW"), isoTime: new Date().toISOString(), turn: state.turn, type, message, details });
  state.actionLogs = state.actionLogs.slice(0, 80);
}

function completeQuest(id) {
  if (state.progress[id]) return;
  state.progress[id] = true;
}

function commit(message, cloud) {
  saveLocal();
  showNotice(message, "success");
  render();
  if (cloud) syncCloudDebounced(message);
}

function saveLocal() {
  state.lastSaved = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let syncTimer = null;
function syncCloudDebounced(reason) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncCloud(reason), 1200);
}

async function syncCloud(reason = "手動同步") {
  try {
    updateCloudStatus("同步中...");
    const payload = {
      action: "saveState",
      reason,
      savedAt: new Date().toISOString(),
      state: { ...state, cloudSaveId: `save_${Date.now()}` },
      actionLogs: state.actionLogs.slice(0, 5),
      battleLogs: state.reports.slice(0, 3),
    };
    await postByForm(payload);
    await wait(2800);
    const loaded = await loadCloudState();
    if (!loaded?.state?.village) throw new Error("雲端沒有讀回 state_json");
    state.lastCloudSaved = loaded.savedAt || new Date().toISOString();
    completeQuest("cloud");
    saveLocal();
    updateCloudStatus(`已同步到 Google Sheets（${new Date(state.lastCloudSaved).toLocaleString("zh-TW")}）。`, "ok");
    render();
  } catch (error) {
    updateCloudStatus(`同步失敗：${error.message}`, "fail");
  }
}

function postByForm(payload) {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.name = `cloud_target_${Date.now()}`;
    iframe.hidden = true;
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = CLOUD_ENDPOINT;
    form.target = iframe.name;
    form.hidden = true;

    const input = document.createElement("input");
    input.name = "payload";
    input.value = JSON.stringify(payload);
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();

    setTimeout(() => {
      form.remove();
      iframe.remove();
      resolve();
    }, 1600);
  });
}

function loadCloudState() {
  return new Promise((resolve, reject) => {
    const callback = `frontierCloud_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("雲端讀取逾時"));
    }, 10000);
    window[callback] = (data) => {
      cleanup();
      resolve(data);
    };
    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
    script.onerror = () => {
      cleanup();
      reject(new Error("雲端讀取失敗"));
    };
    script.src = `${CLOUD_ENDPOINT}?action=loadState&callback=${callback}&t=${Date.now()}`;
    document.body.appendChild(script);
  });
}

async function loadFromCloud() {
  try {
    updateCloudStatus("正在載入雲端存檔...");
    const result = await loadCloudState();
    if (!result.ok || !result.state) throw new Error(result.error || "沒有雲端存檔");
    state = normalize(result.state);
    saveLocal();
    updateCloudStatus("已載入 Google Sheets 雲端存檔。", "ok");
    showNotice("已載入雲端存檔。", "success");
    render();
  } catch (error) {
    updateCloudStatus(`載入失敗：${error.message}`, "fail");
  }
}

function updateCloudStatus(message, mode = "") {
  const el = byId("cloudStatus");
  el.textContent = message;
  el.className = `sync-status ${mode}`.trim();
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".nav button").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  if (view === "reports") completeQuest("report");
  render();
}

function render() {
  tick();
  renderHud();
  renderQuests();
  renderBuildings();
  renderFields();
  renderTraining();
  renderMap();
  renderTarget();
  renderMilitary();
  renderReports();
  renderSave();
}

function renderHud() {
  const currentRates = rates();
  for (const key of Object.keys(RES)) {
    setText(key, Math.floor(state.village.resources[key]).toLocaleString("zh-TW"));
    setText(`${key}Rate`, `+${currentRates[key]}/h`);
  }
  setText("population", String(population()));
  setText("soldiers", String(totalTroops()));
  setText("upkeep", `耗糧 ${upkeep()}/h`);
  const remaining = Math.max(0, Math.ceil((state.incoming.arriveAt - Date.now()) / 1000));
  setText("raidTimer", remaining ? formatTime(remaining) : "抵達");
  setText("raidHint", state.incoming.ram || state.incoming.catapult ? "含攻城器械" : "搶奪資源");

  for (const key of ["wood", "clay", "iron", "crop", "soldiers"]) {
    const el = key === "soldiers" ? document.querySelector(".hud article:nth-child(6)") : document.querySelector(`#${key}`)?.closest("article");
    const value = key === "soldiers" ? totalTroops() : Math.floor(state.village.resources[key]);
    if (el && lastHud[key] !== undefined && lastHud[key] !== value) {
      el.classList.remove("pulse");
      void el.offsetWidth;
      el.classList.add("pulse");
    }
    lastHud[key] = value;
  }
}

function renderQuests() {
  byId("questList").innerHTML = QUESTS.map(([id, text], index) => `<li class="${state.progress[id] ? "done" : ""}">${state.progress[id] ? "✓" : index + 1}. ${text}</li>`).join("");
  const next = QUESTS.find(([id]) => !state.progress[id]) || QUESTS[QUESTS.length - 1];
  setText("nextStep", next[2]);
}

function renderBuildings() {
  byId("buildings").innerHTML = state.village.buildings.map((item) => {
    const def = BUILDINGS[item.id];
    return `<button class="card building-card ${item.id === selectedBuildingId ? "selected" : ""}" data-building="${item.id}">
      <span class="big">${def.icon}</span><b>${def.name}</b><small>等級 ${item.level}</small><small>${def.role}</small>
    </button>`;
  }).join("");
  const item = state.village.buildings.find((building) => building.id === selectedBuildingId) || state.village.buildings[0];
  const def = BUILDINGS[item.id];
  const cost = buildingCost(item);
  byId("buildingDetail").innerHTML = `<h2>${def.icon} ${def.name}</h2>
    <p>${def.role}</p>
    <div class="statline"><span>目前等級</span><b>${item.level}</b></div>
    <div class="statline"><span>升級成本</span><b>${formatCost(cost)}</b></div>
    <button class="primary full" data-upgrade-building="${item.id}" ${canPay(cost) ? "" : "disabled"}>${canPay(cost) ? "升級建築" : "資源不足"}</button>`;
}

function renderFields() {
  byId("fields").innerHTML = state.village.fields.map((item) => {
    const cost = fieldCost(item);
    return `<article class="card field ${item.type}">
      <span class="big">${RES[item.type].icon}</span>
      <b>${item.name}</b>
      <small>等級 ${item.level}，產量 +${16 + item.level * 12}/h</small>
      <small>升級成本 ${formatCost(cost)}</small>
      <button data-upgrade-field="${item.id}" ${canPay(cost) ? "" : "disabled"}>${canPay(cost) ? "升級" : "資源不足"}</button>
    </article>`;
  }).join("");
}

function renderTraining() {
  setText("trainingSummary", `目前士兵 ${totalTroops()}`);
  byId("training").innerHTML = Object.entries(UNITS).filter(([id]) => id !== "scout").map(([id, unit]) => {
    const amounts = id === "clubman" ? [1, 3] : [1, 2];
    return `<article class="card">
      <span class="big">${unit.icon}</span><b>${unit.name}</b>
      <small>目前 ${state.troops[id]}，攻 ${unit.attack} / 防 ${unit.defense} / 耗糧 ${unit.upkeep}</small>
      <small>成本 ${formatCost(unit.cost)}</small>
      <div class="button-row">${amounts.map((amount) => {
        const cost = multiply(unit.cost, amount);
        return `<button data-train="${id}" data-amount="${amount}" ${canPay(cost) ? "" : "disabled"}>${canPay(cost) ? `訓練 x${amount}` : `資源不足 x${amount}`}</button>`;
      }).join("")}</div>
    </article>`;
  }).join("");
}

function renderMap() {
  byId("mapGrid").innerHTML = state.map.map((tile) => `<button class="tile ${tile.type} ${tile.id === selectedTileId ? "selected" : ""} ${tile.cleared ? "cleared" : ""}" data-tile="${tile.id}">
    <span>${tileIcon(tile)}</span><b>${tile.name}</b><small>(${tile.x}, ${tile.y}) ${tile.animals ? `野獸 ${tile.animals}` : ""}</small>
  </button>`).join("");
}

function renderTarget() {
  const target = state.map.find((tile) => tile.id === selectedTileId);
  if (!target) {
    byId("targetInfo").textContent = "尚未選擇目標。";
    return;
  }
  if (!isAttackable(target)) {
    byId("targetInfo").innerHTML = `<b>${tileIcon(target)} ${target.name}</b><p>這個格子目前不能攻擊。</p>`;
    return;
  }
  byId("targetInfo").innerHTML = `<b>${tileIcon(target)} ${target.name} (${target.x}, ${target.y})</b>
    <p>野獸：${target.animals}</p>
    <p>戰利品：${formatCost(target.resources)}</p>
    <p>建議棍棒兵：${Math.max(1, Math.ceil((target.animals * 23 + 45) / UNITS.clubman.attack))}</p>`;
}

function renderMilitary() {
  byId("troops").innerHTML = Object.entries(UNITS).map(([id, unit]) => `<article class="card">
    <span class="big">${unit.icon}</span><b>${unit.name} x${state.troops[id]}</b>
    <small>攻擊 ${unit.attack} / 防禦 ${unit.defense} / 耗糧 ${unit.upkeep}</small>
  </article>`).join("");
  byId("defenseBox").innerHTML = `<div class="target-box">
    <b>下一波敵襲：${formatTime(Math.max(0, Math.ceil((state.incoming.arriveAt - Date.now()) / 1000)))}</b>
    <p>敵軍：步兵 ${state.incoming.clubman}、衝撞車 ${state.incoming.ram}、投石機 ${state.incoming.catapult}</p>
    <p>防守靠矛兵與城牆。衝撞車會打城牆，投石機會讓建築降級。</p>
  </div>`;
}

function renderReports() {
  if (!state.reports.length) {
    byId("reportsList").innerHTML = "<li>尚無戰報。攻擊或防守後會出現在這裡。</li>";
    return;
  }
  byId("reportsList").innerHTML = state.reports.map((report) => `<li>
    <b>${report.result}</b> ${report.target} ${report.coordinate || ""}
    <small>${report.time}</small>
    <p>兵力：${JSON.stringify(report.sent)}；損失：${JSON.stringify(report.losses)}</p>
    <p>資源：${formatCost(report.loot || {})}${report.damage?.length ? `；損壞：${report.damage.join("、")}` : ""}</p>
  </li>`).join("");
}

function renderSave() {
  byId("endpointInput").value = CLOUD_ENDPOINT;
  setText("localStatus", state.lastSaved ? `本機備用存檔：${new Date(state.lastSaved).toLocaleString("zh-TW")}` : "尚無本機存檔。");
  if (!byId("cloudStatus").dataset.touched) updateCloudStatus(state.lastCloudSaved ? `已同步到 Google Sheets（${new Date(state.lastCloudSaved).toLocaleString("zh-TW")}）。` : "Google Sheets 雲端存檔已設定完成。");
}

function bindEvents() {
  document.querySelector(".nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) switchView(button.dataset.view);
  });
  document.body.addEventListener("click", (event) => {
    const viewJump = event.target.closest("[data-view-jump]");
    if (viewJump) switchView(viewJump.dataset.viewJump);
    const jump = event.target.closest("[data-jump]");
    if (jump) byId(jump.dataset.jump === "fields" ? "fieldsPanel" : "trainingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    const fieldButton = event.target.closest("[data-upgrade-field]");
    if (fieldButton && !fieldButton.disabled) upgradeField(fieldButton.dataset.upgradeField);
    const buildingCard = event.target.closest("[data-building]");
    if (buildingCard) {
      selectedBuildingId = buildingCard.dataset.building;
      renderBuildings();
    }
    const buildingButton = event.target.closest("[data-upgrade-building]");
    if (buildingButton && !buildingButton.disabled) upgradeBuilding(buildingButton.dataset.upgradeBuilding);
    const trainButton = event.target.closest("[data-train]");
    if (trainButton && !trainButton.disabled) train(trainButton.dataset.train, Number(trainButton.dataset.amount));
    const tile = event.target.closest("[data-tile]");
    if (tile) selectTile(tile.dataset.tile);
  });
  byId("collectBtn").addEventListener("click", collectResources);
  byId("hourBtn").addEventListener("click", simulateHour);
  byId("attackBtn").addEventListener("click", attackTarget);
  byId("syncBtn").addEventListener("click", () => syncCloud("手動同步"));
  byId("loadCloudBtn").addEventListener("click", loadFromCloud);
  byId("localSaveBtn").addEventListener("click", () => {
    saveLocal();
    showNotice("已寫入本機備用存檔。", "success");
    render();
  });
  byId("exportBtn").addEventListener("click", exportSave);
  byId("resetBtn").addEventListener("click", () => {
    if (!confirm("確定重置遊戲？")) return;
    state = freshState();
    selectedTileId = null;
    saveLocal();
    render();
  });
}

function exportSave() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "frontier-village-save.json";
  a.click();
  URL.revokeObjectURL(url);
}

function showNotice(message, tone = "") {
  const el = byId("notice");
  el.textContent = message;
  el.className = `notice ${tone}`.trim();
}

function tileIcon(tile) {
  if (tile.type === "village") return "🏠";
  if (tile.cleared) return "✅";
  if (tile.type === "oasis") return "🌳";
  if (tile.type === "camp") return "🐾";
  return "🌾";
}

function multiply(cost, amount) {
  return Object.fromEntries(Object.entries(cost).map(([key, value]) => [key, value * amount]));
}

function formatCost(cost) {
  return Object.keys(RES).map((key) => `${RES[key].icon}${Math.floor(cost[key] || 0)}`).join(" ");
}

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${r}秒`;
}

function readNumber(id) {
  return Math.max(0, Math.floor(Number(byId(id).value) || 0));
}

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

bindEvents();
saveLocal();
render();
setInterval(() => {
  tick();
  saveLocal();
  render();
}, 5000);
setInterval(() => syncCloud("每 60 秒自動同步"), 60000);
