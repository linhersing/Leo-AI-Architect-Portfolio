(() => {
  const GAME_KEY = "frontier-village-save-v4";
  const BUILDING_KEY = "frontier-village-buildings-v1";
  const PATCH_KEY = "frontier-village-ux-fix-2026-06-03-v2";
  const resKeys = ["wood", "clay", "iron", "crop"];
  const resIcon = { wood: "🪵", clay: "🧱", iron: "⛓️", crop: "🌾" };
  const buildingNames = {
    main: ["主樓", "🏛️"],
    warehouse: ["倉庫", "📦"],
    barracks: ["兵營", "⚔️"],
    rally: ["集結點", "🚩"],
    granary: ["穀倉", "🌾"],
    marketplace: ["市集", "⚖️"],
    wall: ["城門", "🧱"],
  };
  const baseUnit = {};

  function getGame() {
    if (typeof state !== "undefined" && state?.village) return state;
    if (typeof s !== "undefined" && s?.village) return s;
    try { return JSON.parse(localStorage.getItem(GAME_KEY) || "null"); } catch { return null; }
  }

  function boot() {
    const game = getGame();
    if (!game?.village) return window.setTimeout(boot, 250);
    injectCss();
    ensureState(true);
    bindEvents();
    renderPatch();
    window.setInterval(tick, 1000);
    window.setInterval(() => {
      syncBuildingStorage();
      renderPatch();
    }, 2500);
  }

  function ensureState(firstRun = false) {
    const game = getGame();
    if (!game?.village) return false;

    game.village.resources ||= { wood: 0, clay: 0, iron: 0, crop: 0 };
    game.troops ||= { clubman: 0, spearman: 0, scout: 0 };
    game.reports ||= [];
    game.actionLogs ||= [];
    game.village.buildings ||= [];

    const storedLevels = readBuildingLevels();
    for (const id of Object.keys(buildingNames)) {
      const found = game.village.buildings.find((b) => b.id === id);
      if (!found) game.village.buildings.push({ id, level: id === "wall" ? 2 : 1 });
    }

    if (!sessionStorage.getItem(PATCH_KEY + "-merged")) {
      for (const b of game.village.buildings) {
        const stored = Number(storedLevels[b.id] || 0);
        b.level = Math.max(Number(b.level || 0), stored, b.id === "wall" ? 2 : 1);
      }
      sessionStorage.setItem(PATCH_KEY + "-merged", "1");
    }

    if (!localStorage.getItem(PATCH_KEY + "-starter")) {
      for (const key of resKeys) game.village.resources[key] = Math.max(Number(game.village.resources[key] || 0), 2600);
      game.troops.clubman = Math.max(Number(game.troops.clubman || 0), 24);
      game.troops.spearman = Math.max(Number(game.troops.spearman || 0), 10);
      game.troops.scout = Math.max(Number(game.troops.scout || 0), 2);
      localStorage.setItem(PATCH_KEY + "-starter", "1");
    }

    game.siege ||= {};
    game.siege.enemy ||= { name: "灰岩寨", icon: "🏰", mood: "正在觀察你的村莊" };
    game.siege.incoming ||= [];
    game.siege.unitTech ||= { clubman: { attack: 1, defense: 1 }, spearman: { attack: 1, defense: 1 } };
    game.siege.buildingDamage ||= {};
    game.siege.nextAttackAt ||= Date.now() + 45000;

    ensureCpuTile(game);
    rememberBaseUnitStats();
    applyUnitTech();

    if (firstRun && !game.siege.incoming.length && !sessionStorage.getItem(PATCH_KEY + "-first-attack")) {
      game.siege.incoming.push(makeAttack(75000));
      game.siege.enemy.mood = "已派出第一波偵察攻擊";
      sessionStorage.setItem(PATCH_KEY + "-first-attack", "1");
    }

    saveRaw(false);
    syncBuildingStorage();
    return true;
  }

  function readBuildingLevels() {
    try { return JSON.parse(localStorage.getItem(BUILDING_KEY) || "{}").levels || {}; } catch { return {}; }
  }

  function syncBuildingStorage() {
    const game = getGame();
    if (!game?.village?.buildings) return;
    const levels = Object.fromEntries(game.village.buildings.map((b) => [b.id, Math.max(0, Number(b.level || 0))]));
    localStorage.setItem(BUILDING_KEY, JSON.stringify({ levels, savedAt: new Date().toISOString() }));
    localStorage.setItem(GAME_KEY, JSON.stringify(game));
  }

  function ensureCpuTile(game) {
    if (!Array.isArray(game.map)) return;
    const cpu = game.map.find((tile) => tile.id === "2_0");
    if (!cpu || cpu.cleared) return;
    Object.assign(cpu, {
      type: "camp",
      name: "灰岩寨",
      bonus: "電腦敵人據點",
      animals: Math.max(Number(cpu.animals || 0), 24),
      resources: { wood: 260, clay: 220, iron: 190, crop: 180 },
      cpuEnemy: true,
    });
  }

  function rememberBaseUnitStats() {
    for (const unit of ["clubman", "spearman"]) {
      const stat = getUnit(unit);
      if (!stat || baseUnit[unit]) continue;
      baseUnit[unit] = { attack: unitAttack(stat), defense: unitDefense(stat) };
    }
  }

  function getUnit(unit) {
    if (typeof unitStats !== "undefined" && unitStats?.[unit]) return unitStats[unit];
    if (typeof U !== "undefined" && U?.[unit]) return U[unit];
    return null;
  }

  function unitLabel(unit) {
    const stat = getUnit(unit);
    return stat?.label || stat?.l || (unit === "clubman" ? "棍棒兵" : "矛兵");
  }

  function unitIcon(unit) {
    const stat = getUnit(unit);
    return stat?.icon || stat?.i || (unit === "clubman" ? "⚔️" : "🛡️");
  }

  function unitAttack(stat) { return Number(stat?.attack ?? stat?.a ?? 0); }
  function unitDefense(stat) { return Number(stat?.defense ?? stat?.d ?? 0); }
  function setUnitAttack(stat, value) { if ("attack" in stat) stat.attack = value; if ("a" in stat) stat.a = value; }
  function setUnitDefense(stat, value) { if ("defense" in stat) stat.defense = value; if ("d" in stat) stat.d = value; }

  function applyUnitTech() {
    const game = getGame();
    if (!game?.siege?.unitTech) return;
    for (const unit of ["clubman", "spearman"]) {
      const stat = getUnit(unit);
      const base = baseUnit[unit];
      const tech = game.siege.unitTech[unit];
      if (!stat || !base || !tech) continue;
      setUnitAttack(stat, Math.round(base.attack * (1 + (Number(tech.attack || 1) - 1) * 0.16)));
      setUnitDefense(stat, Math.round(base.defense * (1 + (Number(tech.defense || 1) - 1) * 0.18)));
    }
  }

  function tick() {
    if (!ensureState(false)) return;
    const game = getGame();
    if (!game.siege.incoming.length && Date.now() >= Number(game.siege.nextAttackAt || 0)) scheduleAttack(false, false);
    const arrived = game.siege.incoming.filter((a) => Number(a.arrivalAt) <= Date.now());
    if (arrived.length) {
      game.siege.incoming = game.siege.incoming.filter((a) => Number(a.arrivalAt) > Date.now());
      arrived.forEach(resolveAttack);
      saveRaw(true);
    }
    renderPatch();
  }

  function scheduleAttack(force = false, fast = false) {
    const game = getGame();
    if (!game?.siege) return;
    if (!force && game.siege.incoming.length) return;
    const delay = fast ? rand(6000, 10000) : rand(55000, 95000);
    const attack = makeAttack(delay);
    game.siege.incoming.push(attack);
    game.siege.nextAttackAt = Date.now() + rand(180000, 360000);
    game.siege.enemy.mood = attack.catapults ? "準備使用投石機" : attack.rams ? "準備用衝撞車破門" : "派出掠奪隊";
    saveRaw(true);
    renderPatch();
  }

  function makeAttack(delay) {
    const game = getGame();
    const turn = Number(game?.turn || 1);
    const wall = buildingLevel("wall");
    const scale = Math.min(16, Math.floor(turn / 3));
    const roll = Math.random();
    return {
      id: `enemy_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      enemy: "灰岩寨",
      arrivalAt: Date.now() + delay,
      infantry: rand(7, 15) + scale,
      riders: rand(0, 4) + Math.floor(scale / 4),
      rams: roll > 0.5 || wall >= 3 ? rand(1, 2) : 0,
      catapults: roll > 0.78 ? 1 : 0,
      intent: roll > 0.78 ? "摧毀建築" : roll > 0.5 ? "破壞城門" : "搶奪資源",
    };
  }

  function resolveAttack(attack) {
    const game = getGame();
    const club = Number(game.troops.clubman || 0);
    const spear = Number(game.troops.spearman || 0);
    const clubDef = unitDefense(getUnit("clubman")) || 20;
    const spearDef = unitDefense(getUnit("spearman")) || 35;
    const wall = buildingLevel("wall");
    const defense = Math.round(club * clubDef + spear * spearDef + wall * 60 + rand(20, 70));
    const power = attack.infantry * 28 + attack.riders * 44 + attack.rams * 60 + attack.catapults * 46 + rand(0, 80);
    const win = defense >= power;
    const pressure = power / Math.max(1, defense);
    const lossRatio = win ? Math.min(0.16, pressure * 0.07) : Math.min(0.55, pressure * 0.18);
    const losses = {
      clubman: Math.min(club, Math.ceil(club * lossRatio)),
      spearman: Math.min(spear, Math.ceil(spear * lossRatio)),
    };
    game.troops.clubman = Math.max(0, club - losses.clubman);
    game.troops.spearman = Math.max(0, spear - losses.spearman);

    const stolen = win ? emptyRes() : stealResources(attack);
    const damage = win ? [] : damageBuildings(attack);
    game.turn = Number(game.turn || 1) + 1;

    const result = win ? "防守成功" : "防守失敗";
    const report = {
      id: `defense_${Date.now()}`,
      type: "defense",
      time: new Date().toLocaleString("zh-TW"),
      isoTime: new Date().toISOString(),
      target: "灰岩寨來襲",
      coordinate: "(0,0)",
      result,
      sent: { clubman: attack.infantry + attack.riders, spearman: attack.rams + attack.catapults },
      losses,
      loot: stolen,
      cleared: win,
      attack,
      damage,
    };
    game.reports.unshift(report);
    game.reports = game.reports.slice(0, 30);
    game.actionLogs.unshift({ id: `action_${Date.now()}`, time: report.time, isoTime: report.isoTime, turn: game.turn, type: "enemy_attack", message: `${result}：灰岩寨`, details: { attack, stolen, losses, damage } });
    game.actionLogs = game.actionLogs.slice(0, 60);

    const stolenText = hasLoot(stolen) ? `，被搶走 ${formatCost(stolen)}` : "";
    const damageText = damage.length ? `；${damage.join("、")}` : "";
    saveNotice(`${result}${stolenText}${damageText}。`, win ? "success" : "warn");
  }

  function stealResources(attack) {
    const game = getGame();
    const cap = 120 + attack.infantry * 16 + attack.riders * 28;
    const stolen = emptyRes();
    let left = cap;
    for (const key of [...resKeys].sort(() => Math.random() - 0.5)) {
      const have = Math.floor(Number(game.village.resources[key] || 0));
      const amount = Math.min(have, Math.floor(have * randFloat(0.08, 0.18)), left);
      stolen[key] = Math.max(0, amount);
      game.village.resources[key] = Math.max(0, have - amount);
      left -= amount;
      if (left <= 0) break;
    }
    return stolen;
  }

  function damageBuildings(attack) {
    const game = getGame();
    const out = [];
    const wall = getBuilding("wall");
    if (wall && attack.rams > 0 && wall.level > 0) {
      const lost = Math.min(Number(wall.level || 0), attack.rams);
      wall.level -= lost;
      game.siege.buildingDamage.wall = wall.level;
      out.push(`衝撞車破壞城門 -${lost}`);
    }
    if (attack.catapults > 0) {
      const targets = game.village.buildings.filter((b) => b.id !== "wall" && Number(b.level || 0) > 0);
      const target = targets[rand(0, Math.max(0, targets.length - 1))];
      if (target) {
        const lost = Math.min(Number(target.level || 0), attack.catapults + (Math.random() > 0.76 ? 1 : 0));
        target.level -= lost;
        game.siege.buildingDamage[target.id] = target.level;
        out.push(`投石機命中${buildingName(target.id)} -${lost}`);
      }
    }
    syncBuildingStorage();
    return out;
  }

  function renderPatch() {
    const game = getGame();
    if (!game?.village) return;
    ensureUi();
    renderIncoming();
    renderBuildingLabels();
    renderDefensePanel();
    renderUnitPanel();
    renderReports();
    renderCpuMap();
    renderDayPhase();
  }

  function ensureUi() {
    const hud = document.querySelector(".hud-grid");
    if (hud && !document.getElementById("incomingHud")) {
      hud.insertAdjacentHTML("beforeend", `<article class="hud-item threat" data-hud="incoming"><span class="hud-icon">🏹</span><span class="hud-label">敵襲</span><strong id="incomingHud">準備中</strong><small id="incomingDetail">灰岩寨</small></article>`);
    }

    const village = document.getElementById("village");
    if (village && !document.getElementById("villageThreatBox")) {
      const anchor = document.querySelector(".village-text-map") || document.querySelector("#village .village-mode-bar");
      anchor?.insertAdjacentHTML("beforebegin", `<section id="villageThreatBox" class="enemy-alert calm"><strong>🏰 敵人狀態</strong><span id="villageThreatText">正在偵察...</span><button type="button" id="quickEnemyBtn">測試敵襲</button></section>`);
      document.getElementById("quickEnemyBtn")?.addEventListener("click", () => {
        scheduleAttack(true, true);
        saveNotice("測試敵襲已派出，請看上方敵襲倒數。", "warn");
      });
    }

    const military = document.getElementById("military");
    if (military && !document.getElementById("enemyPanel")) {
      military.insertAdjacentHTML("beforeend", `<section id="enemyPanel" class="panel enemy-panel"><div class="section-head compact"><div><p class="eyebrow">電腦敵人</p><h2>敵襲與防守</h2></div><div class="button-row compact-row"><button id="scoutEnemyBtn">👁️ 偵察敵軍</button><button id="forceEnemyBtn" class="danger">⚠️ 測試敵襲</button></div></div><div class="enemy-grid"><article class="enemy-card"><strong id="enemyMood">灰岩寨正在觀察你的村莊</strong><p id="defenseSummary">守軍資料整理中。</p></article><article class="enemy-card"><strong>士兵升級</strong><div id="unitUpgradeGrid" class="unit-upgrade-grid"></div></article></div><div class="incoming-head"><h3>行軍中的敵人</h3><button id="resolveEnemyBtn">⏩ 快轉最近敵襲</button></div><div id="incomingList" class="incoming-list"></div></section>`);
      document.getElementById("scoutEnemyBtn")?.addEventListener("click", () => scheduleAttack(true, false));
      document.getElementById("forceEnemyBtn")?.addEventListener("click", () => scheduleAttack(true, true));
      document.getElementById("resolveEnemyBtn")?.addEventListener("click", fastForwardAttack);
    }

    const textMap = document.querySelector(".village-text-map h3");
    if (textMap) textMap.textContent = "文字版可操作區（主要操作請看這裡）";
  }

  function renderIncoming() {
    const game = getGame();
    const next = [...(game.siege?.incoming || [])].sort((a, b) => a.arrivalAt - b.arrivalAt)[0];
    const text = next ? `${next.enemy} ${next.intent}，${countdown(next.arrivalAt)} 抵達` : `安全；下次可能 ${countdown(game.siege.nextAttackAt)}`;
    setText("incomingHud", next ? countdown(next.arrivalAt) : "安全");
    setText("incomingDetail", next ? `${next.intent} ${next.enemy}` : `下次 ${countdown(game.siege.nextAttackAt)}`);
    setText("villageThreatText", text);
    const box = document.getElementById("villageThreatBox");
    if (box) box.className = `enemy-alert ${next ? "danger-line" : "calm"}`;

    const detail = document.getElementById("buildingDetail");
    if (detail) {
      let line = document.getElementById("buildingThreatLine");
      if (!line) {
        line = document.createElement("div");
        line.id = "buildingThreatLine";
        detail.prepend(line);
      }
      line.className = next ? "building-threat active" : "building-threat";
      line.textContent = next ? `⚠️ 敵人正在來：${text}` : "目前沒有敵軍行軍。";
    }

    const list = document.getElementById("incomingList");
    if (!list) return;
    if (!next) {
      list.innerHTML = `<article class="incoming-card calm">目前沒有行軍中的敵人。下一波可能在 ${countdown(game.siege.nextAttackAt)} 後出現。</article>`;
      return;
    }
    list.innerHTML = game.siege.incoming.sort((a, b) => a.arrivalAt - b.arrivalAt).map((a) => `<article class="incoming-card danger-line"><div><strong>${a.enemy}</strong><span>${a.intent}</span></div><dl><div><dt>抵達</dt><dd>${countdown(a.arrivalAt)}</dd></div><div><dt>兵力</dt><dd>步兵 ${a.infantry}、騎兵 ${a.riders}</dd></div><div><dt>攻城器</dt><dd>衝撞車 ${a.rams}、投石機 ${a.catapults}</dd></div><div><dt>威脅</dt><dd>${a.rams || a.catapults ? "高" : "中"}</dd></div></dl></article>`).join("");
  }

  function renderBuildingLabels() {
    document.querySelectorAll("[data-building]").forEach((button) => {
      const id = button.dataset.building;
      const label = button.querySelector("b");
      if (!label) return;
      const level = buildingLevel(id);
      label.textContent = `${buildingName(id)} Lv.${level}`;
    });
    document.querySelectorAll(".text-node[data-building]").forEach((button) => {
      const id = button.dataset.building;
      const strong = button.querySelector("strong");
      if (strong) strong.textContent = `${buildingIcon(id)} ${buildingName(id)} Lv.${buildingLevel(id)}`;
    });
  }

  function renderDefensePanel() {
    const game = getGame();
    const club = Number(game.troops.clubman || 0);
    const spear = Number(game.troops.spearman || 0);
    const power = Math.round(club * (unitDefense(getUnit("clubman")) || 20) + spear * (unitDefense(getUnit("spearman")) || 35) + buildingLevel("wall") * 60);
    setText("enemyMood", `🏰 灰岩寨：${game.siege.enemy.mood}`);
    setText("defenseSummary", `守軍防禦 ${power}；城門 Lv.${buildingLevel("wall")}。矛兵適合防守，城門可抵抗衝撞車。`);
  }

  function renderUnitPanel() {
    const game = getGame();
    const box = document.getElementById("unitUpgradeGrid");
    if (!box) return;
    box.innerHTML = ["clubman", "spearman"].map((unit) => {
      const tech = game.siege.unitTech[unit];
      return `<article class="unit-upgrade-card"><strong>${unitIcon(unit)} ${unitLabel(unit)}</strong><span>攻擊 Lv.${tech.attack} / 防禦 Lv.${tech.defense}</span><button data-upgrade-unit="${unit}" data-upgrade-kind="attack" ${canPay(techCost(unit, "attack")) ? "" : "disabled"}>升級攻擊 ${formatCost(techCost(unit, "attack"))}</button><button data-upgrade-unit="${unit}" data-upgrade-kind="defense" ${canPay(techCost(unit, "defense")) ? "" : "disabled"}>升級防禦 ${formatCost(techCost(unit, "defense"))}</button></article>`;
    }).join("");
  }

  function renderReports() {
    const game = getGame();
    const list = document.getElementById("reportList");
    if (!list || !Array.isArray(game?.reports) || !game.reports.some((r) => r.type === "defense")) return;
    list.innerHTML = game.reports.map((r) => {
      if (r.type === "defense") {
        const a = r.attack || {};
        const damage = r.damage?.length ? `；破壞：${r.damage.join("、")}` : "";
        return `<li><strong>${r.result}</strong> ${r.target}<span class="report-time">${r.time}</span><br>敵軍：步兵 ${a.infantry || 0}、騎兵 ${a.riders || 0}、衝撞車 ${a.rams || 0}、投石機 ${a.catapults || 0}<br>我方損失：棍棒兵 ${r.losses.clubman}、矛兵 ${r.losses.spearman}<br>被搶資源：${formatCost(r.loot || emptyRes())}${damage}</li>`;
      }
      return `<li><strong>${r.result}</strong> ${r.target || "目標"} ${r.coordinate || ""}<span class="report-time">${r.time || ""}</span><br>戰利品：${formatCost(r.loot || emptyRes())}</li>`;
    }).join("");
  }

  function renderCpuMap() {
    const game = getGame();
    const cpu = game?.map?.find((tile) => tile.cpuEnemy);
    if (!cpu) return;
    const tile = document.querySelector(`[data-tile="${cpu.id}"]`);
    tile?.classList.add("map-enemy");
    const badge = tile?.querySelector(".tile-badge");
    const detail = tile?.querySelector(".tile-detail");
    if (badge) badge.textContent = cpu.cleared ? "✅" : "🏰";
    if (detail) detail.textContent = cpu.cleared ? `(${cpu.x}, ${cpu.y}) 已擊退` : `(${cpu.x}, ${cpu.y}) 電腦守軍 ${cpu.animals}`;
  }

  function renderDayPhase() {
    const h = new Date().getHours();
    const phase = h >= 5 && h < 10 ? ["morning", "清晨"] : h >= 10 && h < 15 ? ["noon", "中午"] : h >= 15 && h < 19 ? ["evening", "黃昏"] : ["night", "夜晚"];
    document.body.dataset.phase = phase[0];
    setText("dayPhase", phase[1]);
  }

  function bindEvents() {
    if (window.__frontierUxFixBound) return;
    window.__frontierUxFixBound = true;
    document.addEventListener("click", (event) => {
      const unitButton = event.target.closest("[data-upgrade-unit]");
      if (unitButton && !unitButton.disabled) return upgradeUnit(unitButton.dataset.upgradeUnit, unitButton.dataset.upgradeKind);
    });
  }

  function upgradeUnit(unit, kind) {
    const game = getGame();
    const cost = techCost(unit, kind);
    if (!canPay(cost)) return saveNotice("資源不足，暫時無法升級士兵。", "warn", false);
    for (const [key, value] of Object.entries(cost)) game.village.resources[key] = Math.max(0, Number(game.village.resources[key] || 0) - value);
    game.siege.unitTech[unit][kind] = Number(game.siege.unitTech[unit][kind] || 1) + 1;
    applyUnitTech();
    game.turn = Number(game.turn || 1) + 1;
    saveNotice(`${unitLabel(unit)}${kind === "attack" ? "攻擊" : "防禦"}升級到 Lv.${game.siege.unitTech[unit][kind]}。`, "success");
  }

  function techCost(unit, kind) {
    const game = getGame();
    const level = Number(game?.siege?.unitTech?.[unit]?.[kind] || 1);
    const base = unit === "clubman" ? { wood: 150, clay: 110, iron: 80, crop: 60 } : { wood: 110, clay: 150, iron: 130, crop: 60 };
    if (kind === "defense") {
      base.wood = Math.round(base.wood * 0.85);
      base.clay = Math.round(base.clay * 1.12);
      base.iron = Math.round(base.iron * 1.15);
    }
    return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Math.round(value * level * 1.22)]));
  }

  function fastForwardAttack() {
    const game = getGame();
    if (!game?.siege) return;
    if (!game.siege.incoming.length) scheduleAttack(true, true);
    const first = game.siege.incoming.sort((a, b) => a.arrivalAt - b.arrivalAt)[0];
    if (first) first.arrivalAt = Date.now();
    tick();
  }

  function saveNotice(message, tone = "success", persist = true) {
    const game = getGame();
    if (game) game.lastSaved = new Date().toISOString();
    if (persist) saveRaw(true);
    const notice = document.getElementById("notice");
    if (notice) {
      notice.className = `notice ${tone}`.trim();
      notice.textContent = message;
    }
    if (typeof render === "function") window.setTimeout(() => { try { render(); } catch {} renderPatch(); }, 0);
  }

  function saveRaw(updateBuilding = true) {
    const game = getGame();
    if (!game) return;
    game.lastSaved = new Date().toISOString();
    localStorage.setItem(GAME_KEY, JSON.stringify(game));
    if (updateBuilding) syncBuildingStorage();
  }

  function canPay(cost) {
    const game = getGame();
    return !!game?.village?.resources && Object.entries(cost).every(([key, value]) => Number(game.village.resources[key] || 0) >= value);
  }

  function getBuilding(id) { return getGame()?.village?.buildings?.find((b) => b.id === id); }
  function buildingLevel(id) { return Math.max(0, Number(getBuilding(id)?.level ?? (id === "wall" ? 2 : 1))); }
  function buildingName(id) { return buildingNames[id]?.[0] || id; }
  function buildingIcon(id) { return buildingNames[id]?.[1] || "🏠"; }
  function emptyRes() { return { wood: 0, clay: 0, iron: 0, crop: 0 }; }
  function hasLoot(loot) { return Object.values(loot || {}).some((v) => Number(v) > 0); }
  function formatCost(cost) { return resKeys.map((key) => `${resIcon[key]}${Math.floor(Number(cost?.[key] || 0))}`).join(" "); }
  function countdown(time) { const sec = Math.ceil((Number(time || 0) - Date.now()) / 1000); if (sec <= 0) return "抵達"; if (sec < 60) return `${sec} 秒`; return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randFloat(min, max) { return Math.random() * (max - min) + min; }

  function injectCss() {
    if (document.getElementById("frontierUxFixCss")) return;
    const style = document.createElement("style");
    style.id = "frontierUxFixCss";
    style.textContent = `
      .village-art .building-hotspot,.village-art .resource-hotspot{border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;min-width:74px!important;min-height:44px!important;padding:0!important;filter:none!important}
      .village-art .building-hotspot:before,.village-art .house:before,.village-art .keep:before{display:none!important}.village-art .field-patch{border-radius:0!important;background:transparent!important;transform:none!important}.village-art .building-hotspot span,.village-art .resource-hotspot span{display:grid!important;width:30px!important;height:30px!important;place-items:center!important;margin:0 auto 2px!important;border-radius:8px!important;background:rgba(255,255,255,.86)!important;border:1px solid rgba(98,73,34,.2)!important}.village-art .building-hotspot b,.village-art .resource-hotspot b{display:block!important;border:1px solid rgba(82,63,30,.18)!important;border-radius:8px!important;padding:3px 6px!important;background:rgba(255,252,239,.94)!important;color:#2b1d0b!important;font-size:.72rem!important;box-shadow:0 2px 5px rgba(44,35,18,.12)!important}.village-art .trees{opacity:.72!important}
      .enemy-alert{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;margin:10px 0;padding:10px 12px;border:1px solid rgba(95,143,61,.32);border-radius:10px;background:#eef8df;color:#314f22}.enemy-alert.danger-line{border-color:rgba(182,60,45,.45);border-left:6px solid #b63c2d;background:#fff0eb;color:#7a2b22}.enemy-alert button{min-height:34px;padding:6px 10px}.building-threat{margin-bottom:8px;padding:8px 10px;border-radius:8px;background:#eef8df;color:#314f22;font-weight:800}.building-threat.active{background:#fff0eb;color:#8d271f;border-left:5px solid #b63c2d}
      .map-grid{background:linear-gradient(135deg,#dcebd4 0%,#b9d5ad 45%,#d8e8f0 100%)!important}.map-tile{background:#d7e5c9!important;border-color:rgba(62,95,58,.28)!important}.map-wild{background:linear-gradient(135deg,#dbe8d1,#c5d9b8)!important}.map-oasis{background:radial-gradient(circle at 35% 35%,#2f7435 0 15px,transparent 16px),linear-gradient(135deg,#9bcf86,#d8e8c7)!important}.map-camp,.map-enemy{background:radial-gradient(circle at 50% 34%,#795236 0 16px,transparent 17px),linear-gradient(135deg,#caa27d,#d7c5a7)!important}.map-village{background:radial-gradient(circle,#f5e6a0,#8fbe77)!important}.tile-detail{color:#43523a!important}
      #military .split{grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr)!important}#military .training-grid{grid-template-columns:repeat(2,minmax(220px,1fr))!important;overflow:visible!important}.enemy-panel{margin-top:14px}.enemy-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.9fr);gap:12px}.enemy-card,.incoming-card,.unit-upgrade-card{border:1px solid rgba(126,105,63,.25);border-radius:8px;padding:12px;background:rgba(255,253,246,.94)}.incoming-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 8px}.incoming-list,.unit-upgrade-grid{display:grid;gap:8px}.incoming-card dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}.danger-line{border-left:5px solid #b63c2d}.calm{color:#49623c;background:#eef8df}.unit-upgrade-card{display:grid;gap:7px}.unit-upgrade-card button{min-height:36px;padding:6px 8px}.hud-item.threat{border-color:rgba(182,60,45,.32)!important;background:rgba(255,245,230,.94)!important}
      .notice.success{animation:upgradeFlash .9s ease}.field-card.affordable,.building-card.selected{box-shadow:0 0 0 3px rgba(97,141,63,.22),0 6px 18px rgba(55,85,42,.16)!important}@keyframes upgradeFlash{0%{transform:scale(1)}35%{transform:scale(1.015);box-shadow:0 0 0 5px rgba(244,207,82,.38)}100%{transform:scale(1)}}
      @media(max-width:768px){.enemy-alert{grid-template-columns:1fr;gap:6px}.enemy-alert button{width:100%}#military .split,#military .training-grid,.enemy-grid{grid-template-columns:1fr!important}.incoming-card dl{grid-template-columns:repeat(2,minmax(0,1fr))}.village-art .building-hotspot b,.village-art .resource-hotspot b{font-size:.68rem!important}.map-grid{min-width:526px!important;grid-template-columns:repeat(7,70px)!important}}
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();