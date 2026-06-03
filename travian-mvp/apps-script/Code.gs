const SPREADSHEET_ID = '1cZ2tNUGjsGbhqvd24W-eUEygm3-QhySdurFMj-W2ZXc';
const SECRET_TOKEN = '';

const PLAYER_STATE_SHEET = 'player_state';
const BATTLE_LOGS_SHEET = 'battle_logs';
const ACTION_LOGS_SHEET = 'action_logs';

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (SECRET_TOKEN && payload.token !== SECRET_TOKEN) {
      return json({ ok: false, error: 'Invalid token' });
    }

    if (payload.action === 'saveState' || payload.action === 'save') return json(saveState(payload));
    if (payload.action === 'loadState') return json(loadState());
    if (payload.action === 'appendBattleLog') return json(appendBattleLog(payload.battleLog || payload.log));
    if (payload.action === 'appendActionLog') return json(appendActionLog(payload.actionLog || payload.log));

    return json({ ok: false, error: 'Unsupported action' });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
}

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'loadState') {
      if (SECRET_TOKEN && e.parameter.token !== SECRET_TOKEN) {
        return json({ ok: false, error: 'Invalid token' });
      }
      return json(loadState());
    }
    setupSheets_();
    return json({ ok: true, spreadsheetId: SPREADSHEET_ID, sheets: [PLAYER_STATE_SHEET, BATTLE_LOGS_SHEET, ACTION_LOGS_SHEET] });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
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
    sheet.getRange(1, 1, 2, 12).setValues([
      ['saved_at', 'source', 'reason', 'turn', 'wood', 'clay', 'iron', 'crop', 'soldiers', 'reports', 'version', 'state_json'],
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

    (payload.battleLogs || []).forEach(log => appendBattleLog(log, ss));
    (payload.actionLogs || []).forEach(log => appendActionLog(log, ss));

    return { ok: true, savedAt };
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
  if (stateIndex < 0 || !values[stateIndex]) return { ok: false, error: 'Missing state_json' };

  return {
    ok: true,
    savedAt: values[headers.indexOf('saved_at')] || '',
    state: JSON.parse(values[stateIndex]),
  };
}

function appendBattleLog(log, ssArg) {
  if (!log) return { ok: false, error: 'Missing battle log' };
  const ss = ssArg || setupSheets_();
  const sheet = ss.getSheetByName(BATTLE_LOGS_SHEET);
  ensureHeader_(sheet, ['id', 'time', 'iso_time', 'target', 'coordinate', 'result', 'sent', 'losses', 'loot', 'cleared']);
  sheet.appendRow([
    log.id || '',
    log.time || '',
    log.isoTime || new Date().toISOString(),
    log.target || '',
    log.coordinate || '',
    log.result || '',
    JSON.stringify(log.sent || {}),
    JSON.stringify(log.losses || {}),
    JSON.stringify(log.loot || {}),
    Boolean(log.cleared),
  ]);
  return { ok: true };
}

function appendActionLog(log, ssArg) {
  if (!log) return { ok: false, error: 'Missing action log' };
  const ss = ssArg || setupSheets_();
  const sheet = ss.getSheetByName(ACTION_LOGS_SHEET);
  ensureHeader_(sheet, ['id', 'time', 'iso_time', 'turn', 'type', 'message', 'details']);
  sheet.appendRow([
    log.id || '',
    log.time || '',
    log.isoTime || new Date().toISOString(),
    log.turn || 0,
    log.type || '',
    log.message || '',
    JSON.stringify(log.details || {}),
  ]);
  return { ok: true };
}

function setupSheets_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureSheet_(ss, PLAYER_STATE_SHEET, ['saved_at', 'source', 'reason', 'turn', 'wood', 'clay', 'iron', 'crop', 'soldiers', 'reports', 'version', 'state_json']);
  ensureSheet_(ss, BATTLE_LOGS_SHEET, ['id', 'time', 'iso_time', 'target', 'coordinate', 'result', 'sent', 'losses', 'loot', 'cleared']);
  ensureSheet_(ss, ACTION_LOGS_SHEET, ['id', 'time', 'iso_time', 'turn', 'type', 'message', 'details']);
  return ss;
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  ensureHeader_(sheet, headers);
  return sheet;
}

function ensureHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0];
  const needsHeader = headers.some((header, index) => existing[index] !== header);
  if (needsHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function floorResource_(state, key) {
  return Math.floor((state.village && state.village.resources && state.village.resources[key]) || 0);
}

function totalTroops_(state) {
  const troops = state.troops || {};
  return Object.keys(troops).reduce((sum, key) => sum + Number(troops[key] || 0), 0);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
