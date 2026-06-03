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
      html,body{height:100%;overflow-x:hidden;overflow-y:auto}.game-shell{display:grid;grid-template-rows:auto minmax(0,1fr);height:calc(100dvh - 16px);margin:8px auto}.layout,.content,.sidebar,.view.active-view{min-height:0}.layout{height:100%}.content{display:flex;flex-direction:column;overflow:auto;-webkit-overflow-scrolling:touch}.notice{flex:0 0 auto;margin-bottom:10px;padding:8px 10px}.view.active-view{flex:1 1 auto;overflow:visible}#village.active-view{display:grid;grid-template-rows:minmax(190px,.9fr) auto minmax(210px,1fr);gap:10px}.hero-panel{min-height:0;padding:14px}.quick-stats{margin-top:10px}.village-art{min-height:220px}
      .village-mode-bar{display:grid;grid-template-columns:repeat(3,minmax(92px,auto)) minmax(0,1fr);gap:8px;align-items:center;min-height:46px;border:1px solid rgba(126,105,63,.24);border-radius:8px;padding:7px;background:rgba(255,253,246,.92)}.village-mode{min-height:38px;padding:7px 10px}.village-coach{min-width:0;color:#6b705f;font-size:.88rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .village-workbench{margin-top:0}.field-grid.compact-fields{grid-template-columns:repeat(4,minmax(130px,1fr));overflow:visible}.field-grid.compact-fields .field-card{min-height:154px}.village-mode.active{color:#fff;border-color:#2f6436;background:linear-gradient(#6fa34a,#32683c)}
      @media(max-width:1120px){.game-shell{width:100%;height:100dvh;margin:0;border-radius:0}.topbar{position:static}.layout{grid-template-columns:156px minmax(0,1fr)}.sidebar{min-height:0;padding:10px}}
      @media(max-width:768px){body{padding-bottom:0}.topbar{padding:7px 8px}.brand{gap:8px}.brand-mark{width:34px;height:34px}.brand p{display:none}.hud-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;overflow:visible;padding-bottom:0}.hud-item{min-width:0;min-height:46px;grid-template-columns:24px minmax(0,1fr);gap:0 5px;padding:5px}.hud-icon{width:23px;height:23px;font-size:.86rem}.hud-label,.hud-item small{font-size:.66rem}.hud-item strong{font-size:.9rem}.hud-item small:nth-of-type(n+2){display:none}.layout{display:grid;grid-template-rows:auto minmax(0,1fr);height:100%}.sidebar{display:block;padding:6px 8px 0}.task-box{margin:0;padding:0;border:0;background:transparent}.task-box h2,.task-box ol{display:none}.next-step{margin:0;padding:7px 9px;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.content{padding:8px 8px 72px}.notice{margin-bottom:7px;padding:7px 9px;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#village.active-view{grid-template-rows:minmax(172px,.88fr) auto minmax(178px,1fr);gap:7px}.hero-panel{gap:7px;padding:8px}.hero-copy{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center}.hero-copy .eyebrow,.hero-copy h2{margin:0}.hero-copy p:not(.eyebrow),.quick-stats{display:none}.village-art{min-height:158px}.village-mode-bar{grid-template-columns:repeat(3,1fr);gap:5px;min-height:42px;padding:5px}.village-mode{min-height:36px;padding:6px 5px;font-size:.8rem}.village-coach{display:none}.village-workbench{grid-template-columns:1fr}.building-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.building-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.village-art .building-hotspot{min-width:66px;min-height:58px}.village-art .resource-hotspot{min-width:92px;min-height:58px}.building-list-panel{display:none}.panel{padding:9px}.inline-head{margin-bottom:7px}.inline-head h2,.section-head h2{font-size:1.08rem}.click-chip{display:none}.building-hero{grid-template-columns:42px minmax(0,1fr);gap:8px}.building-icon-large{width:42px;height:42px;font-size:1.35rem}.building-detail p{font-size:.82rem;line-height:1.35}.building-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.building-stat-grid div{padding:7px}.section-head{flex-direction:row;align-items:center;margin:0 0 7px}.compact-row,.button-row{display:flex;width:auto}.compact-row button{min-height:36px;padding:6px 8px;font-size:.78rem}.field-grid.compact-fields{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.field-grid.compact-fields .field-card{min-height:132px;padding:8px}.field-card .field-meta:nth-of-type(n+3),.field-card .field-cost{display:none}.upgrade-button{min-height:34px;padding:6px 8px}.training-grid{grid-template-columns:1fr;gap:7px}.training-card{padding:9px}.training-stats{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.training-stats div{padding:5px}.train-buttons{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.main-nav{min-height:62px}}
      @media(max-width:480px){.building-grid,.building-stat-grid{grid-template-columns:1fr}.village-art .building-hotspot b,.village-art .resource-hotspot b{font-size:.68rem;padding-inline:5px}}
      @media(max-width:768px){html,body{height:auto;min-height:100%;overflow-x:hidden;overflow-y:auto}.game-shell{display:block;min-height:100dvh;height:auto;margin:0;overflow:visible}.topbar{position:sticky;top:0;z-index:60}.layout{display:block;height:auto}.sidebar{display:block;min-height:0}.content{display:block;overflow:visible;padding:8px 8px calc(86px + env(safe-area-inset-bottom))}.view.active-view{display:block;overflow:visible;min-height:0}#village.active-view{display:block}.hero-panel{display:block;margin-bottom:8px}.village-art{height:clamp(178px,46vw,220px);min-height:178px}.village-mode-bar{position:relative;z-index:1;margin:8px 0}.village-workbench,.village-panel,.building-detail-panel,.building-list-panel,.resource-panel,.training-panel{overflow:visible}.field-grid.compact-fields,.field-grid{overflow:visible}.map-scroll{max-width:100%;overflow:auto;touch-action:pan-x pan-y}.target-panel{margin-bottom:14px}.battle-result{position:relative;z-index:1}.main-nav{position:fixed;left:0;right:0;bottom:0;z-index:80}}
      @media(max-width:430px){.content{padding-left:7px;padding-right:7px}.topbar{padding:6px 7px}.hud-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.hud-item{min-height:42px;padding:4px}.village-art{height:176px;min-height:176px}.map-grid{min-width:526px;grid-template-columns:repeat(7,70px);gap:5px;padding:8px}.map-tile{min-height:76px;padding:6px}.nav{min-height:50px}}
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
    if (id === "barracks") return `<button data-addon-panel="training">在本頁訓練</button>`;
    if (id === "rally") return `<button data-addon-view="map">前往地圖出兵</button>`;
    if (id === "warehouse" || id === "granary") return `<button data-addon-panel="resources">查看資源</button>`;
    return `<button data-addon-panel="resources">升級資源田</button>`;
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
      const panel = event.target.closest("[data-addon-panel]");
      if (panel) return setVillagePanel(panel.dataset.addonPanel);
      const click = event.target.closest("[data-addon-click]");
      if (click) return document.getElementById(click.dataset.addonClick)?.click();
      const scroll = event.target.closest("[data-addon-scroll]");
      if (scroll) return document.getElementById(scroll.dataset.addonScroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function bindVillagePanels() {
    const village = document.getElementById("village");
    if (!village) return;
    if (!village.dataset.villagePanel) village.dataset.villagePanel = "buildings";
    document.querySelectorAll("[data-village-panel]").forEach((button) => {
      button.addEventListener("click", () => setVillagePanel(button.dataset.villagePanel));
    });
    updateModeButtons();
    applyPanelVisibility(village.dataset.villagePanel);
  }

  function setVillagePanel(panel) {
    const village = document.getElementById("village");
    if (!village) return;
    village.dataset.villagePanel = panel || "buildings";
    updateModeButtons();
    applyPanelVisibility(village.dataset.villagePanel);
    if (panel === "resources") compactFields();
    setNotice(panel === "resources" ? "資源頁已濃縮成 4 種資源，直接升級最低等級的資源田。" : panel === "training" ? "訓練頁已打開，資源足夠時直接補兵。" : "建築頁已打開，點村莊圖或建築卡查看詳情。", "success");
  }

  function updateModeButtons() {
    const panel = document.getElementById("village")?.dataset.villagePanel || "buildings";
    document.querySelectorAll("[data-village-panel]").forEach((button) => {
      button.classList.toggle("active", button.dataset.villagePanel === panel);
    });
    const coach = document.querySelector(".village-coach");
    if (coach) {
      coach.textContent = panel === "resources"
        ? "提示：先升最低等級資源，資源不足就按模擬 1 小時。"
        : panel === "training"
          ? "提示：先補棍棒兵，再去地圖選綠洲攻擊。"
          : "提示：點主樓、倉庫、兵營或集結點進入建築。";
    }
  }

  function ensureCompactStructure() {
    const village = document.getElementById("village");
    const hero = document.querySelector("#village .hero-panel");
    if (!village || !hero) return;
    if (!document.querySelector(".village-mode-bar")) {
      const bar = document.createElement("div");
      bar.className = "village-mode-bar";
      bar.setAttribute("aria-label", "村莊快速切換");
      bar.innerHTML = `
        <button class="village-mode active" data-village-panel="buildings">🏘️ 建築</button>
        <button class="village-mode" data-village-panel="resources">🪵 資源</button>
        <button class="village-mode" data-village-panel="training">⚔️ 訓練</button>
        <span class="village-coach">提示：點主樓、倉庫、兵營或集結點進入建築。</span>
      `;
      hero.insertAdjacentElement("afterend", bar);
    }
  }

  function panelNodes(panel) {
    if (panel === "buildings") return [document.querySelector("#village .village-workbench")].filter(Boolean);
    if (panel === "resources") {
      const wrapper = document.getElementById("resourcePanel");
      if (wrapper) return [wrapper];
      const grid = document.getElementById("fieldGrid");
      return [grid?.previousElementSibling, grid].filter(Boolean);
    }
    if (panel === "training") {
      const wrapper = document.getElementById("trainingPanel");
      if (wrapper) return [wrapper];
      const grid = document.getElementById("trainingGridVillage");
      return [grid?.previousElementSibling, grid].filter(Boolean);
    }
    return [];
  }

  function applyPanelVisibility(activePanel) {
    for (const panel of ["buildings", "resources", "training"]) {
      for (const node of panelNodes(panel)) {
        node.style.display = panel === activePanel ? "" : "none";
      }
    }
  }

  function compactFields() {
    const grid = document.getElementById("fieldGrid");
    const game = readGame();
    if (!grid || !game?.village?.fields?.length) return;
    const groups = {
      wood: { name: "伐木場", icon: "🪵", label: "木材", fields: [] },
      clay: { name: "泥坑", icon: "🧱", label: "泥土", fields: [] },
      iron: { name: "鐵礦", icon: "⛓️", label: "鐵礦", fields: [] },
      crop: { name: "農田", icon: "🌾", label: "穀物", fields: [] },
    };
    for (const field of game.village.fields) {
      if (groups[field.type]) groups[field.type].fields.push(field);
    }
    grid.classList.add("compact-fields");
    grid.innerHTML = Object.entries(groups).map(([type, group]) => {
      const fields = group.fields;
      const target = [...fields].sort((a, b) => a.level - b.level)[0];
      const totalProduction = fields.reduce((sum, field) => sum + 16 + field.level * 12, 0);
      const average = fields.length ? fields.reduce((sum, field) => sum + field.level, 0) / fields.length : 1;
      const costs = fieldCost(target || { level: 1 });
      const affordable = canPay(costs);
      return `
        <article class="field-card field-${type} ${affordable ? "affordable" : "locked"}" data-upgrade-field="${target?.id || type + "_0"}">
          <div class="field-title"><span class="field-icon">${group.icon}</span><span class="field-prompt">點擊升級</span></div>
          <strong>${group.name}</strong>
          <span class="field-meta">平均等級 ${average.toFixed(1)}</span>
          <span class="field-meta">總產量 +${totalProduction}/h</span>
          <span class="field-cost">升級最低田：${fmt(costs)}</span>
          <button class="upgrade-button" data-upgrade-field="${target?.id || type + "_0"}" ${affordable ? "" : "disabled"}>${affordable ? "升級" : "資源不足"}</button>
        </article>
      `;
    }).join("");
  }

  function fieldCost(field) {
    const level = Number(field?.level || 1);
    return { wood: 80 + level * 42, clay: 70 + level * 36, iron: 55 + level * 31, crop: 35 + level * 24 };
  }

  function init() {
    injectStyles();
    ensureCompactStructure();
    bindVillagePanels();
    bind();
    render();
    compactFields();
    window.setInterval(compactFields, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
