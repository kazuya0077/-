/**
 * Google Apps Script for Physiotherapy Questionnaire submissions.
 *
 * 部署する前に以下を設定してください：
 * - [公開] > [ウェブアプリケーションとして導入] からアクセス権を「全員（匿名含む）」に設定
 * - SHEET_NAME に記録したいシート名を指定
 */
const SHEET_ID = '1X3DzHP-7QIQABGola5QEvZJmpSSe7D9Sue-FWVY0x00';
const SHEET_NAME = '問診回答';

function doPost(e) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error(`シート「${SHEET_NAME}」が見つかりません。事前に作成してください。`);
  }

  const requestData = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  const headers = getHeaders(sheet, requestData);
  const row = headers.map((header) => (header in requestData ? normalizeValue(requestData[header]) : ''));
  sheet.appendRow(row);

  const output = ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(
    ContentService.MimeType.JSON
  );
  return withCors(output);
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

function getHeaders(sheet, payload) {
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const payloadKeys = Object.keys(payload);
  const headers = headerRow.filter((header) => header);

  const missing = payloadKeys.filter((key) => !headers.includes(key));
  if (missing.length) {
    sheet.insertColumnsAfter(headers.length || 1, missing.length);
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers.push(...missing);
  }

  return headers;
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
