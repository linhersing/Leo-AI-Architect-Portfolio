(function () {
  const GAME_KEY = "frontier-village-save-v4";
  const BUILDING_KEY = "frontier-village-buildings-v1";

  const defs = {
    main: {
      name: "主樓",
      icon: "🏛️",
      role: "村莊管理中心",
      desc: "主樓是村莊的核心。升級後代表村莊管理能力提升，也會增加人口感。",
      base: { wood: 160, clay: 130, iron: 100, crop: 70 },
      grow: { wood: 64, clay: 52, iron: 42, crop: 30 },
      effect: (level) => `村莊管理等級 ${level}`,
    },
    warehouse: {
      name: "倉庫",
      icon: "📦",
      role: "提高資源上限",
      desc: "倉庫讓木材、泥土、鐵礦與穀物可以存更多。資源快滿時先升倉庫。",
      base: { wood: 130, clay: 160, iron: 90, crop: 70 },
      grow: { wood: 58, clay: 72, iron: 42, crop: 30 },
      effect: (level) => `倉儲上限 +${(level - 1) * 1500}`,
    },
    barracks: {
      name: "兵營",
      icon: "⚔️",
      role: "訓練士兵",
      desc: "兵營負責訓練棍棒兵與矛兵。點下方按鈕可以直接前往軍事頁補兵。",
      base: { wood: 180, clay: 150, iron: 170, crop: 90 },
      grow: { wood: 78, clay: 60, iron: 72, crop: 42 },
      effect: (level) => `訓練設施等級 ${level}`,
    },
    rally: {
      name: "集結點",
      icon: "🚩",
      role: "出兵與地圖行動",
      desc: "集結點用來集合軍隊、選擇目標並發動攻擊。點下方按鈕可以直接前往地圖。",
      base: { wood: 110, clay: 130, iron: 120, crop: 80 },
      grow: { wood: 48, clay: 54, iron: 50, crop: 32 },
      effect: (level) => `出兵指揮等級 ${level}`,
    },
    granary: {
      name: "穀倉",
      icon: "🌾",
      role: "保管穀物",
      desc: "穀倉讓村莊能保留更多穀物，之後大量訓練士兵時會更重要。",
      base: { wood: 120, clay: 110, iron: 90, crop: 140 },
      grow: { wood: 46, clay: 44, iron: 38, crop: 64 },
      effect: (level) => `穀物儲備等級 ${level}`,
    },
    marketplace: {
      name: "市集",
      icon: "⚖️",
      role: "後勤與交易",
      desc: "市集目前先作為後勤建築，之後可以擴充交易、補給或雲端紀錄功能。",
      base: { wood: 140, clay: 120, iron: 110, crop: 100 },
      grow: { wood: 58, clay: 48, iron: 44, crop: 44 },
      effect: (level) => `後勤等級 ${level}`,
    },
  };

  const labels = {
    wood: ["木材", "🪵"],
    clay: ["泥土", "🧱"],
    iron: ["鐵礦", "⛓️"],
    crop: ["穀物", "🌾"],
  };

  let selected = "main";

  function injectStyles() {
    if (document.getElementById("buildingAddonStyles")) return;
    const style = document.createElement("style");
    style.id = "buildingAddonStyles";
    style.textContent = `
      .village-art .building-hotspot,.village-art .resource-hotspot{position:absolute;z-index:6;display:grid;place-items:center;gap:1px;min-height:54px;padding:4px;color:#2b1d0b;text-align:center;line-height:1.05;cursor:pointer}
      .village-art .building-hotspot span,.village-art .resource-hotspot span{display:block;font-size:1.15rem}
      .village-art .building-hotspot b,.village-art .resource-hotspot b{display:block;border-radius:999px;padding:2px 7px;background:rgba(255,250,225,.94);font-size:.72rem;white-space:nowrap}
      .village-art .building-hotspot:hover,.village-art .building-hotspot.selected,.village-art .resource-hotspot:hover,.village-art .resource-hotspot.selected{outline:4px solid rgba(47,103,189,.42);transform:translateY(-2px) scale(1.04);filter:brightness(1.06)}
      .village-workbench{display:grid;grid-template-columns:minmax(320px,.86fr) minmax(360px,1.14fr);gap:14px;margin-top:16px}
      .inline-head{align-items:start;margin:0 0 12px}.click-chip{border:1px solid rgba(95,143,61,.28);border-radius:999px;padding:6px 10px;color:#2f6436;background:#eef8df;font-size:.82rem;font-weight:800}
      .building-detail{display:grid;gap:12px}.building-hero{display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;align-items:center}.building-icon-large{display:grid;width:56px;height:56px;place-items:center;border:1px solid rgba(126,105,63,.26);border-radius:8px;background:linear-gradient(#fff8df,#e9c56a);font-size:1.75rem}
      .building-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.building-stat-grid div{border:1px solid rgba(126,105,63,.22);border-radius:8px;padding:9px;background:#fbf4df}.building-stat-grid small{display:block;color:#6b705f;font-size:.76rem}.building-stat-grid strong{display:block;margin-top:3px}
      .building-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.building-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.building-card{display:grid;gap:7px;min-height:132px;padding:11px;text-align:left;background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(255,246,217,.86)),#fff7df}.building-card.selected{color:#fff;border-color:#2f6436;background:linear-gradient(#6fa34a,#32683c)}.building-card-top{display:flex;align-items:center;gap:7px}.building-card-icon{display:grid;width:34px;height:34px;place-items:center;border-radius:8px;background:rgba(255,255,255,.28)}
      @media(max-width:768px){.village-workbench{grid-template-columns:1fr}.building-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.building-actions{grid-template-columns:1fr}.village-art .building-hotspot{min-width:66px;min-height:58px}.village-art .resource-hotspot{min-width:92px;min-height:58px}}
      @media(max-width:480px){.building-grid,.building-stat-grid{grid-template-columns:1fr}.village-art .building-hotspot b,.village-art .resource-hotspot b{font-size:.68rem;padding-inline:5px}}
    `;
    document.head.appendChild(style);
  }

  function loadBuildings() {
    try {
      const saved = JSON.parse(localStorage.getItem(BUILDING_KEY) || "{}");
      return { levels: { ...initialLevels(), ...(saved.levels || {}) } };
    } catch {
      return { levels: initialLevels() };
    }
  }

  function initialLevels() {
    return Object.fromEntries(Object.keys(defs).map((id) => [id, 1]));
  }

  function saveBuildings(data) {
    localStorage.setItem(BUILDING_KEY, JSON.stringify(data));
    const game = readGame();
    if (game?.village) {
      game.village.buildings = Object.entries(data.levels).map(([id, level]) => ({ id, level }));
      game.lastSaved = new Date().toISOString();
      localStorage.setItem(GAME_KEY, JSON.stringify(game));
    }
  }

  function readGame() {
    try { return JSON.parse(localStorage.getItem(GAME_KEY) || "null"); }
    catch { return null; }
  }

  function cost(id, level) {
    const def = defs[id];
    return Object.fromEntries(Object.keys(labels).map((key) => [key, Math.round(def.base[key] + def.grow[key] * level)]));
  }

  function resources() {
    return readGame()?.village?.resources || { wood: 760, clay: 760, iron: 760, crop: 760 };
  }

  function canPay(costs) {
    const res = resources();
    return Object.entries(costs).every(([key, value]) => Number(res[key] || 0) >= value);
  }

  function pay(costs) {
    const game = readGame();
    if (!game?.village?.resources) return true;
    for (const [key, value] of Object.entries(costs)) game.village.resources[key] = Math.max(0, Number(game.village.resources[key] || 0) - value);
    game.lastSaved = new Date().toISOString();
    localStorage.setItem(GAME_KEY, JSON.stringify(game));
    updateHud(game.village.resources);
    return true;
  }

  function updateHud(res) {
    for (const key of Object.keys(labels)) {
      const el = document.getElementById(key);
      if (el) el.textContent = Math.floor(res[key] || 0).toLocaleString("zh-TW");
    }
  }

  function fmt(costs) {
    return Object.entries(costs).map(([key, value]) => `${labels[key][1]}${value}`).join(" ");
  }

  function setNotice(message, tone = "success") {
    const notice = document.getElementById("notice");
    if (!notice) return;
    notice.className = `notice ${tone}`.trim();
    notice.textContent = message;
  }

  function render() {
    const data = loadBuildings();
    const detail = document.getElementById("buildingDetail");
    const grid = document.getElementById("buildingGrid");
    if (!detail || !grid) return;

    const def = defs[selected] || defs.main;
    const level = data.levels[selected] || 1;
    const costs = cost(selected, level);
    const affordable = canPay(costs);

    detail.innerHTML = `
      <div class="building-hero">
        <span class="building-icon-large">${def.icon}</span>
        <div><h3>${def.name} <small>等級 ${level}</small></h3><p>${def.role}</p></div>
      </div>
      <p>${def.desc}</p>
      <div class="building-stat-grid">
        <div><small>目前效果</small><strong>${def.effect(level)}</strong></div>
        <div><small>升級後</small><strong>${def.effect(level + 1)}</strong></div>
        <div><small>升級成本</small><strong>${fmt(costs)}</strong></div>
        <div><small>狀態</small><strong>${affordable ? "資源足夠，可以升級" : "資源不足，先收成或模擬時間"}</strong></div>
      </div>
      <div class="building-actions">
        <button class="primary" data-addon-upgrade="${selected}" ${affordable ? "" : "disabled"}>${affordable ? `升級${def.name}` : "資源不足"}</button>
        ${shortcut(selected)}
      </div>
    `;

    grid.innerHTML = Object.keys(defs).map((id) => `
      <button type="button" class="building-card ${id === selected ? "selected" : ""}" data-addon-building="${id}">
        <span class="building-card-top"><span class="building-card-icon">${defs[id].icon}</span><span><strong>${defs[id].name}</strong><small>等級 ${data.levels[id] || 1}</small></span></span>
        <small>${defs[id].role}</small>
      </button>
    `).join("");

    document.querySelectorAll("[data-building]").forEach((button) => button.classList.toggle("selected", button.dataset.building === selected));
  }

  function shortcut(id) {
    if (id === "barracks") return `<button data-addon-view="military">前往訓練士兵</button>`;
    if (id === "rally") return `<button data-addon-view="map">前往地圖出兵</button>`;
    if (id === "warehouse" || id === "granary") return `<button data-addon-click="collectBtn">收成 / 更新資源</button>`;
    return `<button data-addon-scroll="fieldGrid">查看資源田</button>`;
  }

  function upgrade(id) {
    const data = loadBuildings();
    const level = data.levels[id] || 1;
    const costs = cost(id, level);
    if (!canPay(costs)) {
      setNotice("資源不足，請先收成、模擬時間或升級資源田。", "warn");
      render();
      return;
    }
    pay(costs);
    data.levels[id] = level + 1;
    saveBuildings(data);
    setNotice(`${defs[id].name} 升級成功，現在是等級 ${data.levels[id]}。`, "success");
    render();
  }

  function bind() {
    document.getElementById("villageArt")?.addEventListener("click", (event) => {
      const building = event.target.closest("[data-building]");
      if (building) {
        selected = building.dataset.building;
        setNotice(`已進入 ${defs[selected].name}。`, "success");
        render();
        return;
      }
      const field = event.target.closest("[data-field-jump]");
      if (field) document.getElementById("fieldGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.getElementById("buildingGrid")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-addon-building]");
      if (!card) return;
      selected = card.dataset.addonBuilding;
      setNotice(`已進入 ${defs[selected].name}。`, "success");
      render();
    });

    document.getElementById("buildingDetail")?.addEventListener("click", (event) => {
      const up = event.target.closest("[data-addon-upgrade]");
      if (up && !up.disabled) return upgrade(up.dataset.addonUpgrade);
      const view = event.target.closest("[data-addon-view]");
      if (view) return document.querySelector(`.nav[data-view="${view.dataset.addonView}"]`)?.click();
      const click = event.target.closest("[data-addon-click]");
      if (click) return document.getElementById(click.dataset.addonClick)?.click();
      const scroll = event.target.closest("[data-addon-scroll]");
      if (scroll) return document.getElementById(scroll.dataset.addonScroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function init() {
    injectStyles();
    bind();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
