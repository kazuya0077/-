/**
 * Google Apps Script for Physiotherapy Questionnaire submissions.
 *
 * デプロイ前に以下を設定してください：
 * - [公開] > [ウェブアプリケーションとして導入] からアクセス権を「全員（匿名含む）」に設定
 * - スプレッドシートに「フォーム回答」というシートと任意で Debug シートを用意
 */
const SHEET_ID = '1X3DzHP-7QIQABGola5QEvZJmpSSe7D9Sue-FWVY0x00';
const SHEET_NAME = 'フォーム回答';
const DEBUG_SHEET_NAME = 'Debug';

function doPost(e) {
  _debugLog(e);
  try {
    const sheet = getOrCreateSheet(SHEET_ID, SHEET_NAME);
    const payload = parseRequestBody(e);
    const headers = ensureHeaders(sheet, payload);
    const row = buildRow(headers, payload);
    sheet.appendRow(row);
    const output = ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(
      ContentService.MimeType.JSON
    );
    return withCors(output);
  } catch (error) {
    const output = ContentService.createTextOutput(
      JSON.stringify({ success: false, message: String(error) })
    ).setMimeType(ContentService.MimeType.JSON);
    return withCors(output);
  }
}

function doGet() {
  const output = ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  );
  return withCors(output);
}

function doOptions() {
  const output = ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
  return withCors(output);
}

function getOrCreateSheet(id, name) {
  const spreadsheet = SpreadsheetApp.openById(id);
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function parseRequestBody(e) {
  if (!e) return {};
  if (e.postData && e.postData.type && e.postData.type.indexOf('application/json') > -1) {
    return e.postData.contents ? JSON.parse(e.postData.contents) : {};
  }
  if (e.parameter) {
    return e.parameter;
  }
  return {};
}

function ensureHeaders(sheet, payload) {
  const payloadKeys = Object.keys(payload || {});
  let headers = [];
  if (sheet.getLastRow() > 0 && sheet.getLastColumn() > 0) {
    headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(function (value) {
        return String(value || '').trim();
      });
  }
  if (headers.length === 0) {
    headers = ['timestamp'].concat(payloadKeys);
  } else {
    if (headers.indexOf('timestamp') === -1) {
      headers.unshift('timestamp');
    }
    const existing = {};
    headers.forEach(function (key) {
      if (key) existing[key] = true;
    });
    payloadKeys.forEach(function (key) {
      if (!existing[key]) {
        headers.push(key);
        existing[key] = true;
      }
    });
  }
  if (headers.length === 0) {
    headers = ['timestamp'];
  }
  const neededColumns = headers.length;
  if (sheet.getMaxColumns() < neededColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), neededColumns - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return headers;
}

function buildRow(headers, payload) {
  const now = nowJST();
  return headers.map(function (header) {
    if (header === 'timestamp') {
      return now;
    }
    if (Object.prototype.hasOwnProperty.call(payload, header)) {
      return normalizeValue(payload[header]);
    }
    return '';
  });
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

function withCors(output) {
  return output
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function nowJST() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function _debugLog(e) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(DEBUG_SHEET_NAME) || ss.insertSheet(DEBUG_SHEET_NAME);
    const type = e && e.postData && e.postData.type ? e.postData.type : '';
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    const params = e && e.parameter ? JSON.stringify(e.parameter) : '';
    sheet.appendRow([nowJST(), type, raw, params]);
  } catch (error) {
    // Logging is best-effort only.
  }
}
