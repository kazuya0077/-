/**
 * Google Apps Script for Physiotherapy Questionnaire submissions.
 *
 * 部署する前に以下を設定してください：
 * - [公開] > [ウェブアプリケーションとして導入] からアクセス権を「全員（匿名含む）」に設定
 * - SHEET_NAME に記録したいシート名を指定
 */
const SHEET_ID = '1X3DzHP-7QIQABGola5QEvZJmpSSe7D9Sue-FWVY0x00';
const SHEET_NAME = '問診回答';

// Web フォームとスプレッドシートで完全一致させるヘッダー定義
const FIXED_HEADERS = [
  '氏名',
  '年齢',
  '性別',
  '身長（cm）',
  '体重（kg）',
  '体格指数（BMI）',
  '身体のことで気になっていること',
  '体の気になる部位',
  'これまでの病気',
  '既往：その他',
  '服薬',
  '一般健診',
  '一般健診の最終月',
  '特定健診',
  '特定健診の最終月',
  '過去1年に転んだ',
  '転倒の回数',
  '転倒によるけが',
  '立位・歩行で不安定',
  '転ぶのがこわい',
  '転倒の判定',
];

// シート側で許容するフィールド名のゆらぎを吸収するマップ
const FIELD_KEY_MAP = {
  '氏名': ['氏名', 'name', 'fullName', '名前'],
  '年齢': ['年齢', 'age'],
  '性別': ['性別', 'sex', 'gender'],
  '身長（cm）': ['身長（cm）', 'height', 'height_cm'],
  '体重（kg）': ['体重（kg）', 'weight', 'weight_kg'],
  '体格指数（BMI）': ['体格指数（BMI）', 'bmi', 'BMI'],
  '身体のことで気になっていること': ['身体のことで気になっていること', 'current_issues', 'currentConcerns'],
  '体の気になる部位': ['体の気になる部位', 'body_concern', 'pain_detail', 'sensory_regions'],
  'これまでの病気': ['これまでの病気', 'diagnoses', 'past_diseases'],
  '既往：その他': ['既往：その他', 'hospital_history', 'pastHistoryOther'],
  '服薬': ['服薬', 'current_medications', 'medication'],
  '一般健診': ['一般健診', 'general_checkup'],
  '一般健診の最終月': ['一般健診の最終月', 'general_checkup_month', 'general_checkup_date'],
  '特定健診': ['特定健診', 'special_checkup', 'specific_health_check'],
  '特定健診の最終月': ['特定健診の最終月', 'special_checkup_month', 'special_checkup_detail'],
  '過去1年に転んだ': ['過去1年に転んだ', '3kq_fall_history', 'fall_history'],
  '転倒の回数': ['転倒の回数', 'fall_count'],
  '転倒によるけが': ['転倒によるけが', 'fall_injury'],
  '立位・歩行で不安定': ['立位・歩行で不安定', '3kq_unsteady'],
  '転ぶのがこわい': ['転ぶのがこわい', '3kq_fear'],
  '転倒の判定': ['転倒の判定', 'fall_assessment'],
};

function doPost(e) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error(`シート「${SHEET_NAME}」が見つかりません。事前に作成してください。`);
  }

  const raw = e && e.postData ? e.postData.contents : '';
  Logger.log('RAW=' + raw);

  let payload = {};
  if (looksLikeJson(raw)) {
    payload = parseJsonSafely(raw);
  }

  if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  const data = extractDataFromEvent(e, payload);
  Logger.log('DATA=' + JSON.stringify(data));

  const headers = ensureHeaders(sheet);
  const row = buildRowFromData(data, headers);
  sheet.appendRow(row);

  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(
    ContentService.MimeType.JSON
  );
}

function extractDataFromEvent(e, payload) {
  let data = resolveHeadersAndRow(payload);

  if (!data || Object.keys(data).length === 0) {
    // headers/row が無い場合はそのままフィールド名と値のペアを利用
    if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
      data = payload;
    }
  }

  if ((!data || Object.keys(data).length === 0) && e && e.parameter) {
    // フォーム送信 (x-www-form-urlencoded) 形式のフォールバック
    const params = e.parameter;
    const parsedHeaders = parseMaybeJson(params.headers);
    const parsedRow = parseMaybeJson(params.row);
    if (Array.isArray(parsedHeaders) && Array.isArray(parsedRow)) {
      data = zipHeadersAndRow(parsedHeaders, parsedRow);
    } else {
      data = {};
      Object.keys(params).forEach(function (key) {
        if (key === 'headers' || key === 'row') {
          return;
        }
        data[key] = params[key];
      });
    }
  }

  return data || {};
}

function resolveHeadersAndRow(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const sources = [payload];
  if (payload.data && typeof payload.data === 'object') {
    sources.push(payload.data);
  }

  for (let i = 0; i < sources.length; i += 1) {
    const candidate = sources[i];
    const headers = candidate && Array.isArray(candidate.headers) ? candidate.headers : null;
    const row = candidate && Array.isArray(candidate.row) ? candidate.row : null;
    if (headers && row) {
      return zipHeadersAndRow(headers, row);
    }
  }

  return null;
}

function ensureHeaders(sheet) {
  const expected = FIXED_HEADERS.concat(['timestamp']);
  const maxColumns = sheet.getMaxColumns();
  const neededColumns = expected.length;

  if (maxColumns < neededColumns) {
    const columnsToAdd = neededColumns - maxColumns;
    if (columnsToAdd > 0) {
      sheet.insertColumnsAfter(maxColumns, columnsToAdd);
    }
  }

  const headerRange = sheet.getRange(1, 1, 1, neededColumns);
  const current = headerRange.getValues()[0];
  let shouldWrite = false;

  for (let i = 0; i < neededColumns; i += 1) {
    if (current[i] !== expected[i]) {
      shouldWrite = true;
      break;
    }
  }

  if (shouldWrite || sheet.getLastRow() === 0) {
    headerRange.setValues([expected]);
  }

  return expected;
}

function buildRowFromData(data, headers) {
  const values = headers.slice(0, -1).map(function (header) {
    return normalizeValue(findValueForHeader(data, header));
  });
  values.push(new Date());
  return values;
}

function findValueForHeader(data, header) {
  const keys = FIELD_KEY_MAP[header] || [header];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined && data[key] !== null) {
      return data[key];
    }
  }
  return '';
}

function zipHeadersAndRow(headers, row) {
  const result = {};
  headers.forEach(function (header, index) {
    if (typeof header === 'string' && header.trim() !== '') {
      result[header] = index < row.length ? row[index] : '';
    }
  });
  return result;
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value || '';
}

function looksLikeJson(text) {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function parseJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    Logger.log('JSON_PARSE_ERROR=' + error);
    return {};
  }
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value;
  }
  if (!looksLikeJson(value)) {
    return value;
  }
  return parseJsonSafely(value);
}
