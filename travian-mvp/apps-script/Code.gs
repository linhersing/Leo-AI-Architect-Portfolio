const SPREADSHEET_ID = '1cZ2tNUGjsGbhqvd24W-eUEygm3-QhySdurFMj-W2ZXc';
const SECRET_TOKEN = '';
const BACKEND_VERSION = 'cloud-v5-integrated-boardgame-2026-06-07';

const PLAYER_STATE_SHEET = 'player_state';
const BATTLE_LOGS_SHEET = 'battle_logs';
const ACTION_LOGS_SHEET = 'action_logs';
const LOG_SUMMARY_SHEET = 'log_summary';
const BOARD_GAME_STATE_SHEET = 'board_game_state'; // 新增

const MAX_BATTLE_LOG_ROWS = 300;
const MAX_ACTION_LOG_ROWS = 500;
const MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;

const PLAYER_STATE_HEADERS = ['saved_at', 'source', 'reason', 'turn', 'wood', 'clay', 'iron', 'crop', 'soldiers', 'reports', 'version', 'state_json'];
const BATTLE_LOG_HEADERS = ['id', 'time', 'iso_time', 'type', 'target', 'coordinate', 'result', 'sent', 'losses', 'loot', 'cleared', 'damage', 'raw_json'];
const ACTION_LOG_HEADERS = ['id', 'time', 'iso_time', 'turn', 'type', 'message', 'details', 'raw_json'];
const LOG_SUMMARY_HEADERS = ['run_at', 'sheet', 'before_rows', 'after_rows', 'duplicates_removed', 'old_rows_removed', 'max_rows'];
const BOARD_GAME_STATE_HEADERS = ['saved_at', 'game_title', 'players_count', 'current_round', 'finished', 'game_json']; // 新增

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    if (SECRET_TOKEN && payload.token !== SECRET_TOKEN) return json({ ok: false, error: 'Invalid token', backendVersion: BACKEND_VERSION });

    if (payload.action === 'setup' || payload.action === 'ping') return json(setup());
    if (payload.action === 'saveState' || payload.action === 'save') return json(saveState(payload));
    if (payload.action === 'loadState') return json(loadState());
    if (payload.action === 'appendBattleLog') return json(appendBattleLog(payload.battleLog || payload.log));
    if (payload.action === 'appendActionLog') return json(appendActionLog(payload.actionLog || payload.log));
    if (payload.action === 'compactLogs' || payload.action === 'maintenance') return json(compactLogs());
    if (payload.action === 'stats') return json(getStats());

    return json({ ok: false, error: 'Unsupported action: ' + payload.action, backendVersion: BACKEND_VERSION });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error), backendVersion: BACKEND_VERSION });
  }
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  try {
    if (SECRET_TOKEN && params.token !== SECRET_TOKEN) return respond_(params, { ok: false, error: 'Invalid token', backendVersion: BACKEND_VERSION });

    let result;
    if (params.action === 'loadState') result = loadState();
    else if (params.action === 'stats') result = getStats();
    else result = setup();

    return respond_(params, result);
  } catch (error) {
    return respond_(params, { ok: false, error: String(error.message || error), backendVersion: BACKEND_VERSION });
  }
}

function setup() {
  setupSheets_();
  return {
    ok: true,
    backendVersion: BACKEND_VERSION,
    spreadsheetId: SPREADSHEET_ID,
    sheets: [PLAYER_STATE_SHEET, BATTLE_LOGS_SHEET, ACTION_LOGS_SHEET, LOG_SUMMARY_SHEET, BOARD_GAME_STATE_SHEET],
    limits: { battleLogs: MAX_BATTLE_LOG_ROWS, actionLogs: MAX_ACTION_LOG_ROWS },
    message: 'Google Sheets save backend ready (with board game support)',
  };
}

function saveState(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = setupSheets_();
    const state = payload.state;
    if (!state) return { ok: false, error: 'Missing state', backendVersion: BACKEND_VERSION };

    const savedAt = payload.savedAt || new Date().toISOString();
    
    // 保存邊境村莊主遊戲狀態
    const sheet = ss.getSheetByName(PLAYER_STATE_SHEET);
    sheet.clearContents();
    sheet.getRange(1, 1, 2, PLAYER_STATE_HEADERS.length).setValues([
      PLAYER_STATE_HEADERS,
      [
        savedAt,
        'github-pages',
        payload.reason || '',
        state.turn || 0,
        floorResource_(state, 'wood'),
        floorResource_(state, 'clay'),
        floorResource_(state, 'iron'),
        floorResource_(state, 'crop'),
        totalTroops_(state),
        state.reports ? state.reports.length : 0,
        state.version || state.cloudSaveId || '',
        JSON.stringify(state),
      ],
    ]);
    sheet.setFrozenRows(1);

    // 新增：保存棋盤遊戲狀態
    if (state.boardGame) {
      const bgSheet = ss.getSheetByName(BOARD_GAME_STATE_SHEET);
      bgSheet.clearContents();
      bgSheet.getRange(1, 1, 2, BOARD_GAME_STATE_HEADERS.length).setValues([
        BOARD_GAME_STATE_HEADERS,
        [
          savedAt,
          state.boardGame.gameTitle || '',
          state.boardGame.players ? state.boardGame.players.length : 0,
          state.boardGame.round || 1,
          state.boardGame.finished ? 'yes' : 'no',
          JSON.stringify(state.boardGame),
        ],
      ]);
      bgSheet.setFrozenRows(1);
    }

    const battleResult = appendLogs_(BATTLE_LOGS_SHEET, BATTLE_LOG_HEADERS, payload.battleLogs || [], battleRow_);
    const actionResult = appendLogs_(ACTION_LOGS_SHEET, ACTION_LOG_HEADERS, payload.actionLogs || [], actionRow_);
    const maintenance = maybeCompactLogs_();

    return {
      ok: true,
      backendVersion: BACKEND_VERSION,
      savedAt: savedAt,
      cloudSaveId: state.cloudSaveId || '',
      stateRow: 2,
      battleLogs: battleResult,
      actionLogs: actionResult,
      maintenance: maintenance,
      boardGameSaved: state.boardGame ? true : false,
    };
  } finally {
    lock.releaseLock();
  }
}

function loadState() {
  const ss = setupSheets_();
  const sheet = ss.getSheetByName(PLAYER_STATE_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'No cloud save found', backendVersion: BACKEND_VERSION };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const stateIndex = headers.indexOf('state_json');
  const savedAtIndex = headers.indexOf('saved_at');
  if (stateIndex < 0 || !values[stateIndex]) return { ok: false, error: 'Missing state_json', backendVersion: BACKEND_VERSION };

  const state = JSON.parse(values[stateIndex]);
  
  // 新增：載入棋盤遊戲狀態
  try {
    const bgSheet = ss.getSheetByName(BOARD_GAME_STATE_SHEET);
    const bgLastRow = bgSheet.getLastRow();
    if (bgLastRow >= 2) {
      const bgValues = bgSheet.getRange(2, 1, 1, bgSheet.getLastColumn()).getValues()[0];
      const bgHeaders = bgSheet.getRange(1, 1, 1, bgSheet.getLastColumn()).getValues()[0];
      const bgStateIndex = bgHeaders.indexOf('game_json');
      if (bgStateIndex >= 0 && bgValues[bgStateIndex]) {
        state.boardGame = JSON.parse(bgValues[bgStateIndex]);
      }
    }
  } catch (e) {
    Logger.log("Warning: Could not load board game state: " + e.message);
  }

  return { 
    ok: true, 
    backendVersion: BACKEND_VERSION, 
    savedAt: savedAtIndex >= 0 ? values[savedAtIndex] : '', 
    state: state 
  };
}

function appendBattleLog(log, ssArg) {
  if (!log) return { ok: false, error: 'Missing battle log', backendVersion: BACKEND_VERSION };
  const ss = ssArg || setupSheets_();
  return appendLogs_(BATTLE_LOGS_SHEET, BATTLE_LOG_HEADERS, [log], battleRow_, ss);
}

function appendActionLog(log, ssArg) {
  if (!log) return { ok: false, error: 'Missing action log', backendVersion: BACKEND_VERSION };
  const ss = ssArg || setupSheets_();
  return appendLogs_(ACTION_LOGS_SHEET, ACTION_LOG_HEADERS, [log], actionRow_, ss);
}

function appendLogs_(sheetName, headers, logs, rowFactory, ssArg) {
  const ss = ssArg || setupSheets_();
  const sheet = ss.getSheetByName(sheetName);
  ensureHeader_(sheet, headers);
  const existingIds = getExistingIds_(sheet);
  const rows = [];
  let skipped = 0;

  logs.forEach(function (log) {
    if (!log) return;
    const id = String(log.id || '');
    if (id && existingIds[id]) {
      skipped += 1;
      return;
    }
    if (id) existingIds[id] = true;
    rows.push(rowFactory(log));
  });

  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  return { ok: true, backendVersion: BACKEND_VERSION, appended: rows.length, skippedDuplicates: skipped };
}

function getExistingIds_(sheet) {
  const ids = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return ids;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  values.forEach(function (row) {
    const id = String(row[0] || '');
    if (id) ids[id] = true;
  });
  return ids;
}

function compactLogs() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = setupSheets_();
    const battle = compactLogSheet_(ss.getSheetByName(BATTLE_LOGS_SHEET), BATTLE_LOG_HEADERS, MAX_BATTLE_LOG_ROWS);
    const action = compactLogSheet_(ss.getSheetByName(ACTION_LOGS_SHEET), ACTION_LOG_HEADERS, MAX_ACTION_LOG_ROWS);
    PropertiesService.getDocumentProperties().setProperty('lastMaintenanceAt', String(Date.now()));
    return { ok: true, backendVersion: BACKEND_VERSION, battleLogs: battle, actionLogs: action, stats: getStats() };
  } finally {
    lock.releaseLock();
  }
}

function maybeCompactLogs_() {
  const props = PropertiesService.getDocumentProperties();
  const last = Number(props.getProperty('lastMaintenanceAt') || 0);
  if (Date.now() - last < MAINTENANCE_INTERVAL_MS) return { ok: true, skipped: true, reason: 'interval' };

  const ss = setupSheets_();
  const battleRows = Math.max(0, ss.getSheetByName(BATTLE_LOGS_SHEET).getLastRow() - 1);
  const actionRows = Math.max(0, ss.getSheetByName(ACTION_LOGS_SHEET).getLastRow() - 1);
  if (battleRows <= MAX_BATTLE_LOG_ROWS && actionRows <= MAX_ACTION_LOG_ROWS) {
    props.setProperty('lastMaintenanceAt', String(Date.now()));
    return { ok: true, skipped: true, reason: 'under_limit', battleRows: battleRows, actionRows: actionRows };
  }
  return compactLogs();
}

function compactLogSheet_(sheet, headers, maxRows) {
  ensureHeader_(sheet, headers);
  const beforeRows = Math.max(0, sheet.getLastRow() - 1);
  if (beforeRows <= 0) return writeSummary_(sheet.getName(), beforeRows, 0, 0, 0, maxRows);

  const width = headers.length;
  const rows = sheet.getRange(2, 1, beforeRows, width).getValues();
  const unique = {};
  const deduped = [];

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const id = String(row[0] || ('row_' + i));
    if (unique[id]) continue;
    unique[id] = true;
    deduped.unshift(row);
  }

  deduped.sort(function (a, b) {
    return Date.parse(b[2] || '') - Date.parse(a[2] || '');
  });

  const kept = deduped.slice(0, maxRows);
  const duplicatesRemoved = rows.length - deduped.length;
  const oldRowsRemoved = Math.max(0, deduped.length - kept.length);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, width).setValues([headers]);
  if (kept.length) sheet.getRange(2, 1, kept.length, width).setValues(kept);
  sheet.setFrozenRows(1);

  return writeSummary_(sheet.getName(), beforeRows, kept.length, duplicatesRemoved, oldRowsRemoved, maxRows);
}

function writeSummary_(sheetName, beforeRows, afterRows, duplicatesRemoved, oldRowsRemoved, maxRows) {
  const ss = setupSheets_();
  const sheet = ss.getSheetByName(LOG_SUMMARY_SHEET);
  ensureHeader_(sheet, LOG_SUMMARY_HEADERS);
  sheet.appendRow([new Date().toISOString(), sheetName, beforeRows, afterRows, duplicatesRemoved, oldRowsRemoved, maxRows]);
  return { sheet: sheetName, beforeRows: beforeRows, afterRows: afterRows, duplicatesRemoved: duplicatesRemoved, oldRowsRemoved: oldRowsRemoved, maxRows: maxRows };
}

function getStats() {
  const ss = setupSheets_();
  return {
    ok: true,
    backendVersion: BACKEND_VERSION,
    sheets: {
      playerStateRows: Math.max(0, ss.getSheetByName(PLAYER_STATE_SHEET).getLastRow() - 1),
      battleLogRows: Math.max(0, ss.getSheetByName(BATTLE_LOGS_SHEET).getLastRow() - 1),
      actionLogRows: Math.max(0, ss.getSheetByName(ACTION_LOGS_SHEET).getLastRow() - 1),
      summaryRows: Math.max(0, ss.getSheetByName(LOG_SUMMARY_SHEET).getLastRow() - 1),
      boardGameStateRows: Math.max(0, ss.getSheetByName(BOARD_GAME_STATE_SHEET).getLastRow() - 1),
    },
    limits: { battleLogs: MAX_BATTLE_LOG_ROWS, actionLogs: MAX_ACTION_LOG_ROWS },
  };
}

function setupSheets_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureSheet_(ss, PLAYER_STATE_SHEET, PLAYER_STATE_HEADERS);
  ensureSheet_(ss, BATTLE_LOGS_SHEET, BATTLE_LOG_HEADERS);
  ensureSheet_(ss, ACTION_LOGS_SHEET, ACTION_LOG_HEADERS);
  ensureSheet_(ss, LOG_SUMMARY_SHEET, LOG_SUMMARY_HEADERS);
  ensureSheet_(ss, BOARD_GAME_STATE_SHEET, BOARD_GAME_STATE_HEADERS); // 新增
  return ss;
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  ensureHeader_(sheet, headers);
  sheet.setFrozenRows(1);
  return sheet;
}

function ensureHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
  const needsHeader = headers.some(function (header, index) { return existing[index] !== header; });
  if (needsHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function battleRow_(log) {
  return [
    log.id || '',
    log.time || '',
    log.isoTime || new Date().toISOString(),
    log.type || 'attack',
    log.target || '',
    log.coordinate || '',
    log.result || '',
    JSON.stringify(log.sent || {}),
    JSON.stringify(log.losses || {}),
    JSON.stringify(log.loot || {}),
    Boolean(log.cleared),
    JSON.stringify(log.damage || []),
    JSON.stringify(log),
  ];
}

function actionRow_(log) {
  return [
    log.id || '',
    log.time || '',
    log.isoTime || new Date().toISOString(),
    log.turn || 0,
    log.type || '',
    log.message || '',
    JSON.stringify(log.details || {}),
    JSON.stringify(log),
  ];
}

function floorResource_(state, key) {
  return Math.floor((state.village && state.village.resources && state.village.resources[key]) || 0);
}

function totalTroops_(state) {
  const troops = state.troops || {};
  return Object.keys(troops).reduce(function (sum, key) { return sum + Number(troops[key] || 0); }, 0);
}

function parsePayload_(e) {
  if (e && e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  const raw = (e && e.postData && e.postData.contents) || '{}';
  if (raw.charAt(0) === '{') return JSON.parse(raw);

  const payloadMatch = raw.match(/(?:^|&)payload=([^&]+)/);
  if (payloadMatch) return JSON.parse(decodeURIComponent(payloadMatch[1].replace(/\+/g, ' ')));

  const textPlainMatch = raw.match(/payload\s*=\s*(\{[\s\S]*\})/);
  if (textPlainMatch) return JSON.parse(textPlainMatch[1]);

  return JSON.parse(raw || '{}');
}

function respond_(params, data) {
  if (params && params.callback) return jsonp_(params.callback, data);
  return json(data);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(callback, data) {
  const safeCallback = String(callback || '').replace(/[^\w.$]/g, '');
  if (!safeCallback) return json(data);
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
