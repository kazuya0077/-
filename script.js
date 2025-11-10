const scriptURL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

// スプレッドシートと完全一致させるカラム順。GAS 側と合わせて変更してください。
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

const FALL_ASSESSMENT_HIGH = '転倒リスクあり';
const FALL_ASSESSMENT_LOW = '転倒リスク低';

const form = document.getElementById('questionnaireForm');
const statusMessage = document.getElementById('statusMessage');
const submitButton = form.querySelector('button[type="submit"]');
const conditionalFields = Array.from(document.querySelectorAll('[data-conditional]'));

function cleanValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanValue(item))
      .filter((item) => item !== '')
      .join(', ');
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isNaN(value)) {
    return '';
  }
  return String(value);
}

function combineValues(values, separator = ' / ') {
  return values
    .map((value) => cleanValue(value))
    .filter((value) => value !== '')
    .join(separator);
}

function getSelectedValues(name) {
  return Array.from(form.querySelectorAll(`[name="${name}"]`)).reduce((accumulator, field) => {
    if ((field.type === 'checkbox' || field.type === 'radio') && field.checked) {
      accumulator.push(field.value);
    }
    return accumulator;
  }, []);
}

function formatMonthFromDate(value) {
  const cleaned = cleanValue(value);
  if (!cleaned) {
    return '';
  }
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    return cleaned;
  }
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}`;
}

function extractMonthFromDetail(detail) {
  const cleaned = cleanValue(detail);
  if (!cleaned) {
    return '';
  }
  const match = cleaned.match(/(\d{4})[年\/\.\-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}`;
  }
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) {
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${parsed.getFullYear()}-${month}`;
  }
  return cleaned;
}

function computeFallAssessment() {
  const history = cleanValue(getFieldValue('3kq_fall_history'));
  const unsteady = cleanValue(getFieldValue('3kq_unsteady'));
  const fear = cleanValue(getFieldValue('3kq_fear'));
  const fallCountRaw = cleanValue(getFieldValue('fall_count'));
  const injury = cleanValue(getFieldValue('fall_injury'));

  const fallCount = fallCountRaw === '' ? NaN : Number(fallCountRaw);
  const hasRisk =
    history === 'はい' ||
    unsteady === 'はい' ||
    fear === 'はい' ||
    (!Number.isNaN(fallCount) && fallCount > 0) ||
    injury === 'あり';
  const answered = [history, unsteady, fear, fallCountRaw, injury].some((value) => value !== '');

  if (!answered) {
    return '';
  }

  return hasRisk ? FALL_ASSESSMENT_HIGH : FALL_ASSESSMENT_LOW;
}

function collectRowValues() {
  const regions = getSelectedValues('sensory_regions');
  const regionText = regions.length ? regions.join('、') : '';

  const getters = {
    氏名: () => cleanValue(getFieldValue('name')),
    年齢: () => cleanValue(getFieldValue('age')),
    性別: () => cleanValue(getFieldValue('sex')),
    '身長（cm）': () => cleanValue(getFieldValue('height_cm')),
    '体重（kg）': () => cleanValue(getFieldValue('weight_kg')),
    '体格指数（BMI）': () => cleanValue(getFieldValue('bmi')),
    '身体のことで気になっていること': () =>
      combineValues([getFieldValue('current_issues'), getFieldValue('target_symptoms')]),
    '体の気になる部位': () =>
      combineValues([regionText, getFieldValue('pain_detail'), getFieldValue('sensory_detail')], ' / '),
    'これまでの病気': () => cleanValue(getFieldValue('diagnoses')),
    '既往：その他': () => combineValues([getFieldValue('hospital_history'), getFieldValue('chronic_management')]),
    服薬: () =>
      combineValues([
        getFieldValue('current_medications'),
        getFieldValue('medication_management'),
        getFieldValue('medication_management_other'),
      ]),
    一般健診: () => cleanValue(getFieldValue('general_checkup')),
    '一般健診の最終月': () => formatMonthFromDate(getFieldValue('general_checkup_date')),
    特定健診: () => cleanValue(getFieldValue('special_checkup')),
    '特定健診の最終月': () => extractMonthFromDetail(getFieldValue('special_checkup_detail')),
    '過去1年に転んだ': () => cleanValue(getFieldValue('3kq_fall_history')),
    '転倒の回数': () => cleanValue(getFieldValue('fall_count')),
    '転倒によるけが': () =>
      combineValues([getFieldValue('fall_injury'), getFieldValue('fall_injury_detail')]),
    '立位・歩行で不安定': () => cleanValue(getFieldValue('3kq_unsteady')),
    '転ぶのがこわい': () => cleanValue(getFieldValue('3kq_fear')),
    '転倒の判定': () => computeFallAssessment(),
  };

  return FIXED_HEADERS.map((header) => {
    const getter = getters[header];
    return getter ? getter() : '';
  });
}

function buildSubmissionPayload() {
  const row = collectRowValues();
  const dataMap = {};
  FIXED_HEADERS.forEach((header, index) => {
    dataMap[header] = row[index];
  });

  return {
    headers: FIXED_HEADERS,
    row,
    data: {
      headers: FIXED_HEADERS,
      row,
      values: dataMap,
    },
  };
}

function getFieldValue(name) {
  const element = form.elements.namedItem(name);
  if (!element) return '';
  if (typeof RadioNodeList !== 'undefined' && element instanceof RadioNodeList) {
    return element.value;
  }
  if (element.type === 'checkbox') {
    return element.checked ? element.value : '';
  }
  return element.value || '';
}

function clearFieldInputs(container) {
  const inputs = container.querySelectorAll('input, textarea, select');
  inputs.forEach((input) => {
    if (input.type === 'checkbox' || input.type === 'radio') {
      input.checked = false;
    } else if (input.tagName.toLowerCase() === 'select') {
      input.selectedIndex = 0;
    } else if (input.type === 'range') {
      input.value = input.getAttribute('value') || '0';
      const outputId = input.dataset.output;
      if (outputId) {
        const output = document.getElementById(outputId);
        if (output) {
          output.textContent = input.value;
        }
      }
    } else {
      input.value = '';
    }
  });
}

function evaluateConditions(conditionString) {
  const groups = conditionString.split(',').map((item) => item.trim());
  return groups.some((group) => {
    const [name, value] = group.split(':');
    if (!name || value === undefined) return false;
    return getFieldValue(name.trim()) === value.trim();
  });
}

function updateConditionalFields() {
  conditionalFields.forEach((field) => {
    const shouldShow = evaluateConditions(field.dataset.conditional || '');
    if (shouldShow) {
      field.dataset.hidden = 'false';
    } else {
      field.dataset.hidden = 'true';
      clearFieldInputs(field);
    }
  });
}

function initializeRangeOutputs() {
  const ranges = form.querySelectorAll('input[type="range"][data-output]');
  ranges.forEach((range) => {
    const output = document.getElementById(range.dataset.output);
    if (!output) return;
    const updateOutput = () => {
      output.textContent = range.value;
    };
    if (range.dataset.listenerAttached !== 'true') {
      range.addEventListener('input', updateOutput);
      range.dataset.listenerAttached = 'true';
    }
    updateOutput();
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  statusMessage.textContent = '送信中です…';
  statusMessage.dataset.state = 'loading';
  submitButton.disabled = true;

  const payload = buildSubmissionPayload();

  if (scriptURL.includes('YOUR_DEPLOYMENT_ID')) {
    statusMessage.textContent = '送信先URLが未設定です。Apps Scriptを導入してURLを設定してください。';
    statusMessage.dataset.state = 'error';
    submitButton.disabled = false;
    return;
  }

  try {
    const response = await fetch(scriptURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed with status ${response.status}`);
    }

    statusMessage.textContent = '送信が完了しました。ご協力ありがとうございます。';
    statusMessage.dataset.state = 'success';
    form.reset();
    updateConditionalFields();
    initializeRangeOutputs();
  } catch (error) {
    console.error(error);
    statusMessage.textContent = '送信に失敗しました。通信環境をご確認のうえ再度お試しください。';
    statusMessage.dataset.state = 'error';
  } finally {
    submitButton.disabled = false;
  }
}

initializeRangeOutputs();
updateConditionalFields();

form.addEventListener('change', updateConditionalFields);
form.addEventListener('submit', handleSubmit);
