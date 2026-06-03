(() => {
  const SIEGE_KEY = "frontier-village-save-v4";
  const BUILDING_KEY = "frontier-village-buildings-v1";
  const baseStats = {};
  const resKeys = ["wood", "clay", "iron", "crop"];

  function ready() {
    return typeof state !== "undefined" && state?.village && typeof unitStats !== "undefined";
  }

  function boot() {
    if (!ready()) return window.setTimeout(boot, 250);
    injectSiegeCss();
    ensureSiegeState();
    ensureSiegeUi();
    bindSiegeEvents();
    renderSiege();
    window.setInterval(tickSiege, 1000);
  }

  function ensureSiegeState() {
    if (typeof buildingDefs !== "undefined" && !buildingDefs.wall) {
      buildingDefs.wall = {
        name: "城門與城牆",
        icon: "🧱",
        role: "抵抗衝撞車與提高防守",
        description: "城牆會提高守軍防禦。敵方衝撞車抵達時，會優先破壞城門與城牆。",
        baseCost: { wood: 150, clay: 210, iron: 160, crop: 90 },
        growth: { wood: 62, clay: 84, iron: 58, crop: 34 },
        effect(level) { return level <= 0 ? "已毀損，需要修復" : `防禦加成等級 ${level}`; },
      };
    }
    state.village.buildings ||= [];
    if (!state.village.buildings.some((b) => b.id === "wall")) state.village.buildings.push({ id: "wall", level: 2 });

    state.siege ||= {};
    state.siege.enemy ||= { name: "灰岩寨", icon: "🏰", mood: "正在觀察你的村莊" };
    state.siege.incoming ||= [];
    state.siege.nextAttackAt ||= Date.now() + rand(90000, 180000);
    state.siege.unitTech ||= { clubman: { attack: 1, defense: 1 }, spearman: { attack: 1, defense: 1 } };
    state.siege.buildingDamage ||= {};

    for (const [id, level] of Object.entries(state.siege.buildingDamage)) {
      const b = getBuilding(id);
      if (b) b.level = Math.max(0, Number(level || 0));
    }

    for (const unit of ["clubman", "spearman"]) {
      if (!baseStats[unit] && unitStats[unit]) baseStats[unit] = { attack: unitStats[unit].attack, defense: unitStats[unit].defense };
      state.siege.unitTech[unit] ||= { attack: 1, defense: 1 };
    }
    applyTech();

    const cpu = state.map?.find((tile) => tile.id === "2_0");
    if (cpu && !cpu.cpuEnemy && !cpu.cleared) Object.assign(cpu, {
      type: "camp",
      name: "灰岩寨",
      bonus: "電腦敵人據點",
      animals: 32,
      resources: { wood: 180, clay: 160, iron: 130, crop: 120 },
      cpuEnemy: true,
    });
  }

  function applyTech() {
    for (const unit of ["clubman", "spearman"]) {
      const base = baseStats[unit];
      const tech = state.siege.unitTech[unit];
      if (!base || !tech || !unitStats[unit]) continue;
      unitStats[unit].attack = Math.round(base.attack * (1 + (tech.attack - 1) * 0.14));
      unitStats[unit].defense = Math.round(base.defense * (1 + (tech.defense - 1) * 0.16));
    }
  }

  function ensureSiegeUi() {
    const hud = document.querySelector(".hud-grid");
    if (hud && !document.getElementById("incomingHud")) {
      hud.insertAdjacentHTML("beforeend", `<article class="hud-item threat" data-hud="incoming"><span class="hud-icon">🏹</span><span class="hud-label">敵襲</span><strong id="incomingHud">安全</strong><small id="incomingDetail">無行軍</small></article>`);
    }

    const art = document.getElementById("villageArt");
    if (art && !art.querySelector("[data-building='wall']")) {
      art.insertAdjacentHTML("beforeend", `<button type="button" class="building-hotspot gate" data-building="wall" aria-label="進入城門與城牆"><span>🧱</span><b>城門</b></button>`);
    }

    const quick = document.querySelector(".quick-stats");
    if (quick && !document.getElementById("dayPhase")) quick.insertAdjacentHTML("beforeend", `<div><dt>時段</dt><dd id="dayPhase">白天</dd></div>`);

    const military = document.getElementById("military");
    if (military && !document.getElementById("enemyPanel")) {
      military.insertAdjacentHTML("beforeend", `<section id="enemyPanel" class="panel enemy-panel"><div class="section-head compact"><div><p class="eyebrow">電腦敵人</p><h2>敵襲與防守</h2></div><div class="button-row compact-row"><button id="scoutEnemyBtn">👁️ 偵察敵軍</button><button id="forceEnemyBtn" class="danger">⚠️ 測試敵襲</button></div></div><div class="enemy-grid"><article class="enemy-card"><strong id="enemyMood">灰岩寨正在觀察你的村莊</strong><p id="defenseSummary">守軍與城牆資料整理中。</p></article><article class="enemy-card"><strong>士兵升級</strong><div id="unitUpgradeGrid" class="unit-upgrade-grid"></div></article></div><div class="incoming-head"><h3>行軍中的敵人</h3><button id="resolveEnemyBtn">⏩ 快轉最近敵襲</button></div><div id="incomingList" class="incoming-list"></div></section>`);
    }
  }

  function bindSiegeEvents() {
    if (window.__siegeAddonBound) return;
    window.__siegeAddonBound = true;
    document.addEventListener("click", (event) => {
      const tech = event.target.closest("[data-upgrade-unit]");
      if (tech && !tech.disabled) return upgradeUnit(tech.dataset.upgradeUnit, tech.dataset.upgradeKind);
      if (event.target.closest("#scoutEnemyBtn")) return scheduleAttack(true, false, "偵察到灰岩寨正在集結部隊。", "warn");
      if (event.target.closest("#forceEnemyBtn")) return scheduleAttack(true, true, "測試敵襲已派出，幾秒後抵達。", "warn");
      if (event.target.closest("#resolveEnemyBtn")) return fastForwardAttack();
    });
  }

  function upgradeUnit(unit, kind) {
    const cost = techCost(unit, kind);
    if (!canPay(cost)) return notice("資源不足，暫時無法升級士兵。", "warn");
    pay(cost);
    state.siege.unitTech[unit][kind] += 1;
    applyTech();
    state.turn += 1;
    const label = unitStats[unit]?.label || unit;
    const kindLabel = kind === "attack" ? "攻擊" : "防禦";
    const actionLog = action("unit_upgrade", `${label}${kindLabel}升級到 ${state.siege.unitTech[unit][kind]}`, { unit, kind, cost });
    state.actionLogs.unshift(actionLog);
    state.actionLogs = state.actionLogs.slice(0, 60);
    save(`${label}${kindLabel}升級完成。`, "success", { actionLog, cloud: true });
  }

  function techCost(unit, kind) {
    const level = Number(state.siege.unitTech[unit]?.[kind] || 1);
    const base = unit === "clubman" ? { wood: 180, clay: 130, iron: 90, crop: 70 } : { wood: 130, clay: 180, iron: 170, crop: 80 };
    if (kind === "defense") Object.assign(base, { wood: Math.round(base.wood * 0.85), clay: Math.round(base.clay * 1.15), iron: Math.round(base.iron * 1.2) });
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * level * 1.35)]));
  }

  function scheduleAttack(force = false, fast = false, msg = "", tone = "success") {
    ensureSiegeState();
    const now = Date.now();
    if (!force && state.siege.incoming.length) return;
    if (!force && now < state.siege.nextAttackAt) return;
    const attack = makeAttack(fast ? rand(6000, 11000) : rand(70000, 180000));
    state.siege.incoming.push(attack);
    state.siege.nextAttackAt = now + rand(240000, 620000);
    state.siege.enemy.mood = attack.rams || attack.catapults ? "準備攻城器" : "派出掠奪隊";
    if (msg) notice(msg, tone);
    persist();
    renderSiege();
  }

  function makeAttack(delay) {
    const wall = getBuilding("wall")?.level || 0;
    const scale = Math.min(18, Math.max(0, Math.floor((state.turn || 1) / 3)));
    const roll = Math.random();
    return { id: `enemy_${Date.now()}_${Math.random().toString(16).slice(2)}`, enemy: "灰岩寨", arrivalAt: Date.now() + delay, infantry: rand(8, 18) + scale, riders: rand(0, 5) + Math.floor(scale / 4), rams: roll > 0.48 || wall >= 3 ? rand(1, 2) : 0, catapults: roll > 0.72 ? 1 : 0, intent: roll > 0.72 ? "摧毀建築" : roll > 0.48 ? "破壞城門" : "搶奪資源" };
  }

  function tickSiege() {
    ensureSiegeState();
    scheduleAttack(false, false);
    const arrived = state.siege.incoming.filter((a) => a.arrivalAt <= Date.now());
    if (arrived.length) {
      state.siege.incoming = state.siege.incoming.filter((a) => a.arrivalAt > Date.now());
      arrived.forEach(resolveAttack);
      persist();
    }
    renderSiege();
  }

  function resolveAttack(attack) {
    const wall = getBuilding("wall")?.level || 0;
    const defense = Math.round((state.troops.clubman || 0) * unitStats.clubman.defense + (state.troops.spearman || 0) * unitStats.spearman.defense + wall * 55 + rand(20, 80));
    const power = attack.infantry * 28 + attack.riders * 44 + attack.rams * 58 + attack.catapults * 42 + rand(0, 90);
    const win = defense >= power;
    const pressure = power / Math.max(1, defense);
    const ratio = win ? Math.min(0.18, pressure * 0.08) : Math.min(0.68, pressure * 0.22);
    const losses = { clubman: Math.min(state.troops.clubman || 0, Math.ceil((state.troops.clubman || 0) * ratio)), spearman: Math.min(state.troops.spearman || 0, Math.ceil((state.troops.spearman || 0) * ratio)) };
    state.troops.clubman = Math.max(0, (state.troops.clubman || 0) - losses.clubman);
    state.troops.spearman = Math.max(0, (state.troops.spearman || 0) - losses.spearman);
    const stolen = win ? emptyRes() : steal(attack);
    const damage = win ? [] : damageBuildings(attack);
    state.turn += 1;
    const result = win ? "防守成功" : "防守失敗";
    const battleLog = { id: `defense_${Date.now()}`, type: "defense", time: new Date().toLocaleString("zh-TW"), isoTime: new Date().toISOString(), target: "灰岩寨來襲", coordinate: "(0,0)", result, sent: { clubman: attack.infantry + attack.riders, spearman: attack.rams + attack.catapults }, losses, loot: stolen, cleared: win, attack, damage };
    const actionLog = action("enemy_attack", `${result}：灰岩寨`, { attack, stolen, losses, damage });
    state.reports.unshift(battleLog);
    state.reports = state.reports.slice(0, 30);
    state.actionLogs.unshift(actionLog);
    state.actionLogs = state.actionLogs.slice(0, 60);
    const stolenText = hasLoot(stolen) ? `，被搶走 ${fmt(stolen)}` : "";
    const damageText = damage.length ? `；${damage.join("、")}` : "";
    save(`${result}${stolenText}${damageText}。`, win ? "success" : "warn", { actionLog, battleLog, cloud: true });
  }

  function steal(attack) {
    const cap = 180 + attack.infantry * 22 + attack.riders * 38;
    const stolen = emptyRes();
    let left = cap;
    for (const key of [...resKeys].sort(() => Math.random() - 0.5)) {
      const have = Math.floor(state.village.resources[key] || 0);
      const amount = Math.min(have, Math.floor(have * (0.12 + Math.random() * 0.16)), left);
      stolen[key] = amount;
      state.village.resources[key] = Math.max(0, have - amount);
      left -= amount;
      if (left <= 0) break;
    }
    return stolen;
  }

  function damageBuildings(attack) {
    const out = [];
    const wall = getBuilding("wall");
    if (wall && attack.rams > 0 && wall.level > 0) {
      const lost = Math.min(wall.level, attack.rams);
      wall.level -= lost;
      state.siege.buildingDamage.wall = wall.level;
      out.push(`衝撞車破壞城牆 -${lost}`);
    }
    if (attack.catapults > 0) {
      const targets = state.village.buildings.filter((b) => b.id !== "wall" && b.level > 0);
      const target = targets[rand(0, Math.max(0, targets.length - 1))];
      if (target) {
        const lost = Math.min(target.level, attack.catapults + (Math.random() > 0.72 ? 1 : 0));
        target.level -= lost;
        state.siege.buildingDamage[target.id] = target.level;
        out.push(`投石機命中${buildingDefs[target.id]?.name || target.id} -${lost}`);
      }
    }
    return out;
  }

  function renderSiege() {
    if (!ready()) return;
    ensureSiegeState();
    ensureSiegeUi();
    renderPhase();
    renderIncoming();
    renderDefense();
    renderTech();
    renderCpuMap();
    renderDefenseReports();
  }

  function renderPhase() {
    const h = new Date().getHours();
    const phase = h >= 5 && h < 10 ? ["morning", "清晨"] : h >= 10 && h < 15 ? ["noon", "中午"] : h >= 15 && h < 19 ? ["evening", "黃昏"] : ["night", "夜晚"];
    document.body.dataset.phase = phase[0];
    text("dayPhase", phase[1]);
  }

  function renderIncoming() {
    const next = [...state.siege.incoming].sort((a, b) => a.arrivalAt - b.arrivalAt)[0];
    text("incomingHud", next ? cd(next.arrivalAt) : "安全");
    text("incomingDetail", next ? `${next.intent} ${next.enemy}` : `下次可能 ${cd(state.siege.nextAttackAt)}`);
    const list = document.getElementById("incomingList");
    if (!list) return;
    if (!next) return list.innerHTML = `<article class="incoming-card calm">目前沒有行軍中的敵人。灰岩寨下一次可能在 ${cd(state.siege.nextAttackAt)} 後行動。</article>`;
    list.innerHTML = state.siege.incoming.sort((a, b) => a.arrivalAt - b.arrivalAt).map((a) => `<article class="incoming-card danger-line"><div><strong>${a.enemy}</strong><span>${a.intent}</span></div><dl><div><dt>抵達</dt><dd>${cd(a.arrivalAt)}</dd></div><div><dt>兵力</dt><dd>步兵 ${a.infantry}、騎兵 ${a.riders}</dd></div><div><dt>攻城器</dt><dd>衝撞車 ${a.rams}、投石機 ${a.catapults}</dd></div><div><dt>威脅</dt><dd>${a.rams || a.catapults ? "高" : "中"}</dd></div></dl></article>`).join("");
  }

  function renderDefense() {
    const wall = getBuilding("wall")?.level || 0;
    const p = Math.round((state.troops.clubman || 0) * unitStats.clubman.defense + (state.troops.spearman || 0) * unitStats.spearman.defense + wall * 55);
    text("enemyMood", `🏰 灰岩寨：${state.siege.enemy.mood}`);
    text("defenseSummary", `守軍防禦 ${p}，城牆等級 ${wall}。矛兵適合防守，城牆可抵抗衝撞車。`);
  }

  function renderTech() {
    const box = document.getElementById("unitUpgradeGrid");
    if (!box) return;
    box.innerHTML = ["clubman", "spearman"].map((u) => `<article class="unit-upgrade-card"><strong>${unitStats[u].icon} ${unitStats[u].label}</strong><span>攻擊 Lv.${state.siege.unitTech[u].attack} / 目前 ${unitStats[u].attack}</span><button data-upgrade-unit="${u}" data-upgrade-kind="attack" ${canPay(techCost(u, "attack")) ? "" : "disabled"}>升級攻擊 ${fmt(techCost(u, "attack"))}</button><span>防禦 Lv.${state.siege.unitTech[u].defense} / 目前 ${unitStats[u].defense}</span><button data-upgrade-unit="${u}" data-upgrade-kind="defense" ${canPay(techCost(u, "defense")) ? "" : "disabled"}>升級防禦 ${fmt(techCost(u, "defense"))}</button></article>`).join("");
  }

  function renderCpuMap() {
    const cpu = state.map?.find((t) => t.cpuEnemy);
    if (!cpu) return;
    const badge = document.querySelector(`[data-tile="${cpu.id}"] .tile-badge`);
    const detail = document.querySelector(`[data-tile="${cpu.id}"] .tile-detail`);
    if (badge) badge.textContent = cpu.cleared ? "✅" : "🏰";
    if (detail) detail.textContent = cpu.cleared ? `(${cpu.x}, ${cpu.y}) 已擊退` : `(${cpu.x}, ${cpu.y}) 電腦守軍 ${cpu.animals}`;
  }

  function renderDefenseReports() {
    const list = document.getElementById("reportList");
    if (!list || !state.reports?.some((r) => r.type === "defense")) return;
    list.innerHTML = state.reports.map((r) => r.type === "defense" ? `<li><strong>${r.result}</strong> ${r.target}<span class="report-time">${r.time}</span><br>敵軍：步兵 ${r.attack?.infantry || 0}、騎兵 ${r.attack?.riders || 0}、衝撞車 ${r.attack?.rams || 0}、投石機 ${r.attack?.catapults || 0}<br>我方損失：棍棒兵 ${r.losses.clubman}、矛兵 ${r.losses.spearman}<br>被搶資源：${fmt(r.loot)}${r.damage?.length ? `；破壞：${r.damage.join("、")}` : ""}</li>` : `<li><strong>${r.result}</strong> ${r.target} ${r.coordinate}<span class="report-time">${r.time}</span><br>派出：棍棒兵 ${r.sent?.clubman || 0}、矛兵 ${r.sent?.spearman || 0}；損失：棍棒兵 ${r.losses?.clubman || 0}、矛兵 ${r.losses?.spearman || 0}<br>戰利品：${fmt(r.loot || emptyRes())}；${r.cleared ? "已清除" : "未清除"}</li>`).join("");
  }

  function fastForwardAttack() {
    if (!state.siege.incoming.length) scheduleAttack(true, true);
    const first = state.siege.incoming.sort((a, b) => a.arrivalAt - b.arrivalAt)[0];
    if (first) first.arrivalAt = Date.now();
    tickSiege();
  }

  function getBuilding(id) { return state.village.buildings.find((b) => b.id === id); }
  function canPay(cost) { return Object.entries(cost).every(([k, v]) => Number(state.village.resources[k] || 0) >= v); }
  function pay(cost) { for (const [k, v] of Object.entries(cost)) state.village.resources[k] = Math.max(0, Number(state.village.resources[k] || 0) - v); }
  function emptyRes() { return { wood: 0, clay: 0, iron: 0, crop: 0 }; }
  function hasLoot(x) { return Object.values(x || {}).some((v) => Number(v) > 0); }
  function fmt(cost) { return typeof formatCost === "function" ? formatCost(cost) : resKeys.map((k) => `${k}:${Math.floor(cost[k] || 0)}`).join(" "); }
  function action(type, message, details) { return typeof makeActionLog === "function" ? makeActionLog(type, message, details) : { id: `action_${Date.now()}`, time: new Date().toLocaleString("zh-TW"), isoTime: new Date().toISOString(), turn: state.turn, type, message, details }; }
  function save(msg, tone, options) { if (typeof commit === "function") commit(msg, tone, options); else { notice(msg, tone); persist(); } window.setTimeout(renderSiege, 0); }
  function persist() { state.lastSaved = new Date().toISOString(); localStorage.setItem(SIEGE_KEY, JSON.stringify(state)); localStorage.setItem(BUILDING_KEY, JSON.stringify({ levels: Object.fromEntries(state.village.buildings.map((b) => [b.id, b.level])) })); }
  function notice(msg, tone = "success") { const n = document.getElementById("notice"); if (n) { n.className = `notice ${tone}`.trim(); n.textContent = msg; } }
  function text(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function cd(time) { const s = Math.ceil((Number(time || 0) - Date.now()) / 1000); if (s <= 0) return "抵達"; if (s < 60) return `${s} 秒`; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function injectSiegeCss() {
    if (document.getElementById("siegeAddonCss")) return;
    const s = document.createElement("style");
    s.id = "siegeAddonCss";
    s.textContent = `.village-art{isolation:isolate;background:radial-gradient(ellipse at 50% 60%,rgba(112,151,57,.95) 0 33%,rgba(91,135,48,.82) 34% 42%,transparent 43%),radial-gradient(ellipse at 50% 52%,rgba(240,211,97,.9) 0 28%,transparent 29%),linear-gradient(180deg,#cbe7fb 0 36%,#d5efbf 37% 100%)}.village-art:before{content:"";position:absolute;left:-8%;right:-8%;bottom:16%;height:48px;border-radius:50%;background:linear-gradient(90deg,rgba(89,151,190,.74),rgba(124,178,202,.82));transform:rotate(-5deg);z-index:0}.village-art:after{content:"";position:absolute;inset:18% 18% 18% 17%;border:18px solid rgba(188,164,91,.92);border-radius:50%;box-shadow:inset 0 0 0 5px rgba(113,96,55,.42),0 10px 18px rgba(43,72,27,.22);z-index:1;pointer-events:none}.village-art .wall{display:none}.village-art .building-hotspot,.village-art .resource-hotspot{border:1px solid rgba(105,75,33,.5);border-radius:10px;background:linear-gradient(#fff2b5,#d9a94e);box-shadow:0 6px 0 rgba(89,65,29,.2),0 12px 18px rgba(56,76,35,.18)}.village-art .gate{left:45%;top:67%;min-width:76px;min-height:52px}.enemy-panel{margin-top:16px}.enemy-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.9fr);gap:12px}.enemy-card,.incoming-card,.unit-upgrade-card{border:1px solid rgba(126,105,63,.25);border-radius:8px;padding:12px;background:rgba(255,253,246,.94)}.incoming-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 8px}.incoming-list,.unit-upgrade-grid{display:grid;gap:8px}.incoming-card dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}.danger-line{border-left:5px solid #b63c2d}.calm{color:#49623c;background:#eef8df}.unit-upgrade-card{display:grid;gap:7px}.unit-upgrade-card button{min-height:36px;padding:6px 8px}.hud-item.threat{border-color:rgba(182,60,45,.32);background:rgba(255,245,230,.9)}body[data-phase="morning"] .village-art{filter:saturate(1.04) brightness(1.02);background:radial-gradient(circle at 16% 18%,rgba(255,218,109,.95) 0 38px,transparent 39px),radial-gradient(ellipse at 50% 60%,rgba(112,151,57,.95) 0 33%,rgba(91,135,48,.82) 34% 42%,transparent 43%),linear-gradient(180deg,#ffd9a3 0 34%,#d5efbf 35% 100%)}body[data-phase="evening"] .village-art{filter:sepia(.14);background:radial-gradient(circle at 82% 16%,rgba(255,157,84,.92) 0 36px,transparent 37px),radial-gradient(ellipse at 50% 60%,rgba(112,151,57,.95) 0 33%,rgba(91,135,48,.82) 34% 42%,transparent 43%),linear-gradient(180deg,#f4b889 0 34%,#d9e8b4 35% 100%)}body[data-phase="night"] .village-art{filter:saturate(.82) brightness(.78);background:radial-gradient(circle at 82% 16%,rgba(244,239,186,.92) 0 28px,transparent 29px),radial-gradient(ellipse at 50% 60%,rgba(80,125,64,.95) 0 33%,rgba(54,88,52,.9) 34% 42%,transparent 43%),linear-gradient(180deg,#253b69 0 34%,#5f7d70 35% 100%)}@media(max-width:768px){.enemy-grid{grid-template-columns:1fr}.incoming-card dl{grid-template-columns:repeat(2,minmax(0,1fr))}.incoming-head{align-items:stretch;flex-direction:column}.village-art:after{inset:17% 13% 19%;border-width:13px}.village-art .gate{left:42%;top:66%;min-width:66px}}`;
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();