const SPREADSHEET_ID = '1cZ2tNUGjsGbhqvd24W-eUEygm3-QhySdurFMj-W2ZXc';
const SECRET_TOKEN = '';

const PLAYER_STATE_SHEET = 'player_state';
const BATTLE_LOGS_SHEET = 'battle_logs';
const ACTION_LOGS_SHEET = 'action_logs';

const PLAYER_STATE_HEADERS = ['saved_at', 'source', 'reason', 'turn', 'wood', 'clay', 'iron', 'crop', 'soldiers', 'reports', 'version', 'state_json'];
const BATTLE_LOG_HEADERS = ['id', 'time', 'iso_time', 'type', 'target', 'coordinate', 'result', 'sent', 'losses', 'loot', 'cleared', 'damage', 'raw_json'];
const ACTION_LOG_HEADERS = ['id', 'time', 'iso_time', 'turn', 'type', 'message', 'details', 'raw_json'];

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    if (SECRET_TOKEN && payload.token !== SECRET_TOKEN) return json({ ok: false, error: 'Invalid token' });

    if (payload.action === 'setup' || payload.action === 'ping') return json(setup());
    if (payload.action === 'saveState' || payload.action === 'save') return json(saveState(payload));
    if (payload.action === 'loadState') return json(loadState());
    if (payload.action === 'appendBattleLog') return json(appendBattleLog(payload.battleLog || payload.log));
    if (payload.action === 'appendActionLog') return json(appendActionLog(payload.actionLog || payload.log));

    return json({ ok: false, error: 'Unsupported action: ' + payload.action });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  try {
    if (SECRET_TOKEN && params.token !== SECRET_TOKEN) return respond_(params, { ok: false, error: 'Invalid token' });

    let result;
    if (params.action === 'loadState') result = loadState();
    else result = setup();

    return respond_(params, result);
  } catch (error) {
    return respond_(params, { ok: false, error: String(error.message || error) });
  }
}

function setup() {
  setupSheets_();
  return { ok: true, spreadsheetId: SPREADSHEET_ID, sheets: [PLAYER_STATE_SHEET, BATTLE_LOGS_SHEET, ACTION_LOGS_SHEET], message: 'Google Sheets save backend ready' };
}

function saveState(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = setupSheets_();
    const state = payload.state;
    if (!state) return { ok: false, error: 'Missing state' };

    const savedAt = payload.savedAt || new Date().toISOString();
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
        state.version || '',
        JSON.stringify(state),
      ],
    ]);
    sheet.setFrozenRows(1);

    (payload.battleLogs || []).forEach(function (log) { appendBattleLog(log, ss); });
    (payload.actionLogs || []).forEach(function (log) { appendActionLog(log, ss); });

    return { ok: true, savedAt: savedAt, stateRow: 2, battleLogs: (payload.battleLogs || []).length, actionLogs: (payload.actionLogs || []).length };
  } finally {
    lock.releaseLock();
  }
}

function loadState() {
  const ss = setupSheets_();
  const sheet = ss.getSheetByName(PLAYER_STATE_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'No cloud save found' };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const stateIndex = headers.indexOf('state_json');
  const savedAtIndex = headers.indexOf('saved_at');
  if (stateIndex < 0 || !values[stateIndex]) return { ok: false, error: 'Missing state_json' };

  return { ok: true, savedAt: savedAtIndex >= 0 ? values[savedAtIndex] : '', state: JSON.parse(values[stateIndex]) };
}

function appendBattleLog(log, ssArg) {
  if (!log) return { ok: false, error: 'Missing battle log' };
  const ss = ssArg || setupSheets_();
  const sheet = ss.getSheetByName(BATTLE_LOGS_SHEET);
  ensureHeader_(sheet, BATTLE_LOG_HEADERS);
  sheet.appendRow([
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
  ]);
  return { ok: true };
}

function appendActionLog(log, ssArg) {
  if (!log) return { ok: false, error: 'Missing action log' };
  const ss = ssArg || setupSheets_();
  const sheet = ss.getSheetByName(ACTION_LOGS_SHEET);
  ensureHeader_(sheet, ACTION_LOG_HEADERS);
  sheet.appendRow([
    log.id || '',
    log.time || '',
    log.isoTime || new Date().toISOString(),
    log.turn || 0,
    log.type || '',
    log.message || '',
    JSON.stringify(log.details || {}),
    JSON.stringify(log),
  ]);
  return { ok: true };
}

function setupSheets_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureSheet_(ss, PLAYER_STATE_SHEET, PLAYER_STATE_HEADERS);
  ensureSheet_(ss, BATTLE_LOGS_SHEET, BATTLE_LOG_HEADERS);
  ensureSheet_(ss, ACTION_LOGS_SHEET, ACTION_LOG_HEADERS);
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

function floorResource_(state, key) {
  return Math.floor((state.village && state.village.resources && state.village.resources[key]) || 0);
}

function totalTroops_(state) {
  const troops = state.troops || {};
  return Object.keys(troops).reduce(function (sum, key) { return sum + Number(troops[key] || 0); }, 0);
}

function parsePayload_(e) {
  return JSON.parse((e && e.postData && e.postData.contents) || '{}');
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
