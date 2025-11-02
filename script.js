const scriptURL =
  (typeof window !== 'undefined' && window.APPS_SCRIPT_URL ? window.APPS_SCRIPT_URL.trim() : '') ||
  (document.body?.dataset?.appsScriptUrl ? document.body.dataset.appsScriptUrl.trim() : '');
const STORAGE_KEY = 'physio-questionnaire-v1';

const form = document.getElementById('questionnaireForm');
if (!form) {
  throw new Error('Questionnaire form not found.');
}
const statusMessage = document.getElementById('statusMessage');
const submitButton = form.querySelector('button[type="submit"]');
const previewButton = document.getElementById('previewButton');
const previewModal = document.getElementById('previewModal');
const previewContent = document.getElementById('previewContent');
const closePreviewButton = document.getElementById('closePreview');
const closePreviewFooter = document.getElementById('closePreviewFooter');
const sectionNav = document.getElementById('sectionNav');
const formProgress = document.getElementById('formProgress');
const progressValue = document.getElementById('progressValue');
const clearStorageButton = document.getElementById('clearStorage');
const lastSavedMessage = document.getElementById('lastSaved');
const modalOverlay = previewModal.querySelector('[data-close-preview]');
const birthdateInput = form.elements.namedItem('birthdate');
const ageInput = form.elements.namedItem('age');
const heightInput = form.elements.namedItem('height_cm');
const weightInput = form.elements.namedItem('weight_kg');
const bmiInput = form.elements.namedItem('bmi');
const bodyMapElement = document.querySelector('[data-body-map]');
const bodyMapSelection = document.querySelector('[data-body-map-selection]');
const bodyAreaInputs = Array.from(form.querySelectorAll('input[name="sensory_areas"][data-body-area]'));
const bodyMapButtons = bodyMapElement
  ? Array.from(bodyMapElement.querySelectorAll('.body-map__area'))
  : [];

const conditionalFields = Array.from(document.querySelectorAll('[data-conditional]'));
const sections = Array.from(form.querySelectorAll('section[data-section]'));
const actionsContainer = document.querySelector('.actions');

let currentSectionIndex = 0;

let saveTimeout = null;
let isRestoring = false;

if (ageInput) {
  ageInput.readOnly = true;
}

if (bmiInput) {
  bmiInput.readOnly = true;
}

function getFieldValue(name) {
  const element = form.elements.namedItem(name);
  if (!element) return '';
  if (typeof RadioNodeList !== 'undefined' && element instanceof RadioNodeList) {
    const items = Array.from(element);
    if (items.length && items[0].type === 'checkbox') {
      return items.filter((item) => item.checked).map((item) => item.value);
    }
    return element.value;
  }
  if (element.type === 'checkbox') {
    return element.checked ? element.value : '';
  }
  if (element instanceof HTMLSelectElement && element.multiple) {
    return Array.from(element.selectedOptions).map((option) => option.value);
  }
  return element.value || '';
}

function clearFieldInputs(container) {
  const inputs = container.querySelectorAll('input, textarea, select');
  inputs.forEach((input) => {
    if (input.type === 'checkbox' || input.type === 'radio') {
      input.checked = false;
    } else if (input.tagName.toLowerCase() === 'select') {
      if (input.multiple) {
        Array.from(input.options).forEach((option) => {
          option.selected = false;
        });
      } else {
        input.selectedIndex = 0;
      }
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
  const groups = conditionString.split(',').map((item) => item.trim()).filter(Boolean);
  if (groups.length === 0) return false;
  return groups.some((group) => {
    const [name, value] = group.split(':');
    if (!name || value === undefined) return false;
    const fieldValue = getFieldValue(name.trim());
    if (Array.isArray(fieldValue)) {
      return fieldValue.includes(value.trim());
    }
    return fieldValue === value.trim();
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

function validateSection(index) {
  const section = sections[index];
  if (!section) return true;
  const focusable = Array.from(section.querySelectorAll('input, select, textarea'));
  const requiredElements = focusable.filter((element) => element.required && !element.disabled);

  for (const element of requiredElements) {
    if (!element.checkValidity()) {
      element.reportValidity();
      return false;
    }
  }

  return true;
}

function updateActionsVisibility() {
  if (!actionsContainer) return;
  const shouldShow = sections.length > 0 && currentSectionIndex === sections.length - 1;
  actionsContainer.hidden = !shouldShow;
}

function updateStepNavigation() {
  if (!sectionNav) return;
  const buttons = Array.from(sectionNav.querySelectorAll('button[data-step-index]'));
  buttons.forEach((button) => {
    const index = Number(button.dataset.stepIndex);
    const isActive = index === currentSectionIndex;
    button.classList.toggle('is-active', isActive);
    button.classList.toggle('is-complete', index < currentSectionIndex);
    button.disabled = isActive;
    button.setAttribute('aria-current', isActive ? 'step' : 'false');
  });
}

function showSection(index, options = {}) {
  if (sections.length === 0) return;
  const clampedIndex = Math.max(0, Math.min(index, sections.length - 1));
  currentSectionIndex = clampedIndex;

  sections.forEach((section, sectionIndex) => {
    const isActive = sectionIndex === currentSectionIndex;
    section.dataset.active = isActive ? 'true' : 'false';
    section.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    const controls = section.querySelector('.section-controls');
    if (controls) {
      controls.hidden = !isActive;
    }
    const prevButton = section.querySelector('[data-step="prev"]');
    if (prevButton) {
      prevButton.hidden = !isActive || sectionIndex === 0;
      prevButton.disabled = sectionIndex === 0;
    }
    const nextButton = section.querySelector('[data-step="next"]');
    if (nextButton) {
      nextButton.hidden = !isActive;
      nextButton.textContent = sectionIndex === sections.length - 1 ? '確認画面へ' : '次のセクションへ';
    }

    if (isActive && !options.preventFocus) {
      const firstField = section.querySelector('input, select, textarea, button:not([data-step])');
      if (firstField && typeof firstField.focus === 'function') {
        try {
          firstField.focus({ preventScroll: true });
        } catch (error) {
          firstField.focus();
        }
      }
    }
  });

  updateStepNavigation();
  updateActionsVisibility();
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

function formatDateTime(date) {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (error) {
    return date.toLocaleString('ja-JP');
  }
}

function setLastSavedMessage(timestamp) {
  if (!lastSavedMessage) return;
  if (!timestamp) {
    lastSavedMessage.textContent = '';
    return;
  }
  lastSavedMessage.textContent = `最終保存: ${formatDateTime(new Date(timestamp))}`;
}

function saveFormState() {
  if (isRestoring) return;
  const data = {};
  Array.from(form.elements).forEach((element) => {
    if (!element.name || element.disabled) return;
    if (element.type === 'button' || element.type === 'submit' || element.type === 'reset') return;

    if (element.type === 'radio') {
      if (element.checked) {
        data[element.name] = element.value;
      }
      return;
    }

    if (element.type === 'checkbox') {
      if (!Array.isArray(data[element.name])) {
        data[element.name] = [];
      }
      if (element.checked) {
        data[element.name].push(element.value);
      }
      return;
    }

    if (element instanceof HTMLSelectElement && element.multiple) {
      const selectedValues = Array.from(element.selectedOptions).map((option) => option.value);
      data[element.name] = selectedValues;
      return;
    }

    data[element.name] = element.value;
  });

  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key]) && data[key].length === 0) {
      delete data[key];
    }
  });

  data._timestamp = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setLastSavedMessage(data._timestamp);
  } catch (error) {
    console.error('Failed to save form state', error);
  }
}

function scheduleSave() {
  if (isRestoring) return;
  window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(saveFormState, 300);
}

function parseBirthdateDigits(digits) {
  if (!digits || digits.length !== 8) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatBirthdateDigits(digits) {
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function calculateAge(birthdate) {
  if (!(birthdate instanceof Date)) return '';
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();
  const dayDiff = today.getDate() - birthdate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

function updateAgeFromBirthdate(options = {}) {
  if (!birthdateInput || !ageInput) return;
  const { enforceFormat = false, fromBlur = false } = options;
  const rawValue = birthdateInput.value || '';
  if (!rawValue.trim()) {
    ageInput.value = '';
    birthdateInput.setCustomValidity('');
    return;
  }

  const digits = rawValue.replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) {
    ageInput.value = '';
    if (fromBlur) {
      birthdateInput.setCustomValidity('生年月日はYYYYMMDD形式で入力してください。');
    } else {
      birthdateInput.setCustomValidity('');
    }
    return;
  }

  const parsed = parseBirthdateDigits(digits);
  if (!parsed) {
    ageInput.value = '';
    if (fromBlur) {
      birthdateInput.setCustomValidity('生年月日が正しくありません。');
    } else {
      birthdateInput.setCustomValidity('');
    }
    return;
  }

  birthdateInput.setCustomValidity('');
  if (enforceFormat) {
    birthdateInput.value = formatBirthdateDigits(digits);
  }

  const age = calculateAge(parsed);
  ageInput.value = Number.isFinite(age) && age >= 0 ? String(age) : '';
}

function calculateBmiValue(heightCm, weightKg) {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) return '';
  if (heightCm <= 0 || weightKg <= 0) return '';
  const heightMeters = heightCm / 100;
  if (heightMeters <= 0) return '';
  const bmi = weightKg / (heightMeters * heightMeters);
  if (!Number.isFinite(bmi)) return '';
  return Math.round(bmi * 10) / 10;
}

function updateBmiFromInputs() {
  if (!bmiInput) return;
  const height = heightInput ? Number.parseFloat(heightInput.value) : NaN;
  const weight = weightInput ? Number.parseFloat(weightInput.value) : NaN;
  const bmi = calculateBmiValue(height, weight);
  bmiInput.value = bmi ? String(bmi) : '';
}

function getExclusiveGroupNames() {
  const exclusives = Array.from(form.querySelectorAll('input[data-exclusive]'));
  const names = new Set(exclusives.map((input) => input.name).filter(Boolean));
  return Array.from(names);
}

function enforceExclusiveSelections(name) {
  const targets = name ? [name] : getExclusiveGroupNames();
  targets.forEach((groupName) => {
    if (!groupName) return;
    const exclusives = Array.from(form.querySelectorAll(`input[name="${groupName}"][data-exclusive]`));
    if (exclusives.length === 0) return;
    const others = Array.from(form.querySelectorAll(`input[name="${groupName}"]:not([data-exclusive])`));
    const exclusiveChecked = exclusives.some((input) => input.checked);
    if (exclusiveChecked) {
      others.forEach((input) => {
        if (input.checked) {
          input.checked = false;
        }
      });
    } else if (others.some((input) => input.checked)) {
      exclusives.forEach((input) => {
        if (input.checked) {
          input.checked = false;
        }
      });
    }
  });
}

function updateBodyMapSelection() {
  if (!bodyMapSelection) return;
  const selections = bodyAreaInputs
    .filter((input) => input.checked && input.value !== '特に気になる部位はない')
    .map((input) => input.value);
  const hasNoneSelected = bodyAreaInputs.some((input) => input.checked && 'exclusive' in input.dataset);
  bodyMapSelection.innerHTML = '';
  if (selections.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'body-map__empty';
    empty.textContent = hasNoneSelected ? '特に気になる部位はありません。' : '選択された部位はありません。';
    bodyMapSelection.appendChild(empty);
    return;
  }
  selections.forEach((value) => {
    const chip = document.createElement('span');
    chip.className = 'body-map__chip';
    chip.textContent = value;
    bodyMapSelection.appendChild(chip);
  });
}

function syncBodyMapButtons() {
  if (!bodyMapButtons.length) return;
  const activeValues = new Set(bodyAreaInputs.filter((input) => input.checked).map((input) => input.value));
  bodyMapButtons.forEach((button) => {
    const value = button.dataset.area;
    if (!value) return;
    const isActive = activeValues.has(value);
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function initializeBodyMapInteractions() {
  if (!bodyMapElement) return;
  bodyMapButtons.forEach((button) => {
    if (!button.hasAttribute('aria-pressed')) {
      button.setAttribute('aria-pressed', 'false');
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const value = button.dataset.area;
      if (!value) return;
      const inputs = bodyAreaInputs.filter((input) => input.value === value);
      if (inputs.length === 0) return;
      const shouldCheck = !inputs[0].checked;
      inputs.forEach((input) => {
        input.checked = shouldCheck;
      });
      if (inputs.length > 0) {
        enforceExclusiveSelections(inputs[0].name);
      }
      syncBodyMapButtons();
      updateBodyMapSelection();
      updateConditionalFields();
      updateProgress();
      scheduleSave();
    });
  });

  bodyAreaInputs.forEach((input) => {
    input.addEventListener('change', () => {
      enforceExclusiveSelections(input.name);
      syncBodyMapButtons();
      updateBodyMapSelection();
    });
  });

  syncBodyMapButtons();
  updateBodyMapSelection();
}

function setFieldValues(name, value) {
  const element = form.elements.namedItem(name);
  if (!element) return;

  if (typeof RadioNodeList !== 'undefined' && element instanceof RadioNodeList) {
    const items = Array.from(element);
    if (items.length === 0) return;
    if (items[0].type === 'checkbox') {
      const values = Array.isArray(value) ? value : [value];
      items.forEach((item) => {
        item.checked = values.includes(item.value);
      });
      return;
    }
    const selected = Array.isArray(value) ? value[0] : value;
    items.forEach((item) => {
      item.checked = item.value === selected;
    });
    return;
  }

  if (element.type === 'checkbox') {
    const values = Array.isArray(value) ? value : [value];
    element.checked = values.includes(element.value);
    return;
  }

  if (element instanceof HTMLSelectElement && element.multiple) {
    const values = Array.isArray(value) ? value : [value];
    Array.from(element.options).forEach((option) => {
      option.selected = values.includes(option.value);
    });
    return;
  }

  element.value = Array.isArray(value) ? value[0] : value;
}

function restoreFormState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    setLastSavedMessage();
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    const { _timestamp, ...fields } = parsed;
    isRestoring = true;
    Object.entries(fields).forEach(([name, value]) => {
      setFieldValues(name, value);
    });
    updateConditionalFields();
    initializeRangeOutputs();
    updateProgress();
    updateAgeFromBirthdate({ enforceFormat: true });
    updateBmiFromInputs();
    enforceExclusiveSelections();
    syncBodyMapButtons();
    updateBodyMapSelection();
    if (_timestamp) {
      setLastSavedMessage(_timestamp);
    }
  } catch (error) {
    console.error('Failed to restore form state', error);
    setLastSavedMessage();
  } finally {
    isRestoring = false;
  }
}

function getFieldLabel(element) {
  if (!element) return '';
  if (element.dataset.label) return element.dataset.label;
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  let labelElement = null;
  if (element.id) {
    labelElement = form.querySelector(`label[for="${element.id}"]`);
  }
  if (!labelElement) {
    labelElement = element.closest('label');
  }
  if (labelElement) {
    const text = Array.from(labelElement.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join(' ')
      .trim();
    if (text) return text;
  }

  const schemaItem = element.closest('.schema-item');
  if (schemaItem) {
    const question = schemaItem.querySelector('p');
    if (question) return question.textContent.trim();
  }

  const schemaGroup = element.closest('.schema-group');
  if (schemaGroup) {
    const legend = schemaGroup.querySelector('legend');
    if (legend) return legend.textContent.trim();
  }

  return element.name;
}

function renderPreview() {
  const formData = new FormData(form);
  const aggregated = {};

  for (const [name, value] of formData.entries()) {
    if (!aggregated[name]) {
      aggregated[name] = [];
    }
    aggregated[name].push(value);
  }

  const processedNames = new Set();
  const previewSections = [];

  sections.forEach((section) => {
    const heading = section.querySelector('h2');
    if (!heading) return;
    const items = [];

    Array.from(section.querySelectorAll('[name]')).forEach((element) => {
      const { name } = element;
      if (!name || processedNames.has(name)) return;
      const values = aggregated[name];
      if (!values || values.length === 0) return;
      const uniqueValues = [...new Set(values.filter(Boolean))];
      if (uniqueValues.length === 0) return;
      const label = getFieldLabel(element);
      items.push({ label, value: uniqueValues.join('、') });
      processedNames.add(name);
    });

    if (items.length > 0) {
      previewSections.push({ title: heading.textContent.trim(), items });
    }
  });

  previewContent.innerHTML = '';
  if (previewSections.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'preview-empty';
    emptyState.textContent = '入力済みの項目がありません。フォームに情報を入力してください。';
    previewContent.appendChild(emptyState);
    return;
  }

  previewSections.forEach((sectionData) => {
    const container = document.createElement('section');
    container.className = 'preview-section';

    const heading = document.createElement('h3');
    heading.textContent = sectionData.title;
    container.appendChild(heading);

    const dl = document.createElement('dl');
    sectionData.items.forEach(({ label, value }) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    });

    container.appendChild(dl);
    previewContent.appendChild(container);
  });
}

function openPreview() {
  renderPreview();
  previewModal.classList.add('is-visible');
  previewModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  previewModal.classList.remove('is-visible');
  previewModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function buildSectionNavigation() {
  if (!sectionNav) return;
  sectionNav.innerHTML = '';
  sections.forEach((section, index) => {
    if (!section.id) {
      section.id = `section-${index + 1}`;
    }
    const heading = section.querySelector('h2');
    if (!heading) return;
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.stepIndex = String(index);
    button.textContent = heading.textContent.trim();
    button.addEventListener('click', () => {
      if (index > currentSectionIndex && !validateSection(currentSectionIndex)) {
        return;
      }
      showSection(index, { preventFocus: false });
    });
    item.appendChild(button);
    sectionNav.appendChild(item);
  });
  updateStepNavigation();
}

function updateProgress() {
  const requiredElements = Array.from(form.querySelectorAll('[required][name]'));
  const uniqueNames = new Map();
  requiredElements.forEach((element) => {
    if (!element.name) return;
    if (!uniqueNames.has(element.name)) {
      uniqueNames.set(element.name, element);
    }
  });

  const total = uniqueNames.size;
  if (total === 0) {
    formProgress.value = 0;
    progressValue.textContent = '0% 完了（必須項目）';
    return;
  }

  let completed = 0;
  uniqueNames.forEach((element, name) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    if (typeof RadioNodeList !== 'undefined' && field instanceof RadioNodeList) {
      if (field.value) {
        completed += 1;
      }
      return;
    }
    if (field.type === 'checkbox') {
      if (field.checked) {
        completed += 1;
      }
      return;
    }
    if (field.value && field.value.trim() !== '') {
      completed += 1;
    }
  });

  const percent = Math.round((completed / total) * 100);
  formProgress.value = percent;
  progressValue.textContent = `${percent}% 完了（必須項目）`;
}

async function handleSubmit(event) {
  event.preventDefault();
  updateAgeFromBirthdate({ enforceFormat: true, fromBlur: true });
  if (!form.reportValidity()) {
    statusMessage.textContent = '未入力または形式が正しくない項目があります。確認してください。';
    statusMessage.dataset.state = 'error';
    return;
  }
  statusMessage.textContent = '送信中です…';
  statusMessage.dataset.state = 'loading';
  submitButton.disabled = true;

  const formData = new FormData(form);
  const payload = {};
  formData.forEach((value, key) => {
    if (payload[key] !== undefined) {
      if (!Array.isArray(payload[key])) {
        payload[key] = [payload[key]];
      }
      payload[key].push(value);
    } else {
      payload[key] = value;
    }
  });
  payload.timestamp = new Date().toISOString();

  if (!scriptURL) {
    statusMessage.textContent = '送信先URLが未設定です。config.js に Google Apps Script の WebアプリURL を設定してください。';
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
      mode: 'cors',
      body: JSON.stringify(payload),
    });

    let result = null;
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch (error) {
        result = text;
      }
    }

    if (!response.ok || (result && typeof result === 'object' && result.success === false)) {
      const message =
        result && typeof result === 'object' && result.message
          ? result.message
          : `Failed with status ${response.status}`;
      throw new Error(message);
    }

    statusMessage.textContent = '送信が完了しました。ご協力ありがとうございます。';
    statusMessage.dataset.state = 'success';
    localStorage.removeItem(STORAGE_KEY);
    setLastSavedMessage();
    form.reset();
    updateConditionalFields();
    initializeRangeOutputs();
    updateProgress();
    updateAgeFromBirthdate();
    updateBmiFromInputs();
    enforceExclusiveSelections();
    syncBodyMapButtons();
    updateBodyMapSelection();
    showSection(0);
    closePreview();
  } catch (error) {
    console.error(error);
    statusMessage.textContent = '送信に失敗しました。通信環境をご確認のうえ再度お試しください。';
    statusMessage.dataset.state = 'error';
  } finally {
    submitButton.disabled = false;
  }
}

buildSectionNavigation();
showSection(0, { preventFocus: true });
updateConditionalFields();
initializeRangeOutputs();
restoreFormState();
updateProgress();
updateAgeFromBirthdate({ enforceFormat: true });
updateBmiFromInputs();
enforceExclusiveSelections();
initializeBodyMapInteractions();
showSection(currentSectionIndex, { preventFocus: true });

sections.forEach((section, index) => {
  const prevButton = section.querySelector('[data-step="prev"]');
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (index === 0) return;
      showSection(index - 1);
    });
  }

  const nextButton = section.querySelector('[data-step="next"]');
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      if (!validateSection(index)) {
        return;
      }

      if (index === sections.length - 1) {
        updateActionsVisibility();
        openPreview();
        return;
      }

      showSection(index + 1);
    });
  }
});

form.addEventListener('submit', handleSubmit);
form.addEventListener('change', (event) => {
  if (event && event.target && typeof event.target.name === 'string' && event.target.name) {
    enforceExclusiveSelections(event.target.name);
  } else {
    enforceExclusiveSelections();
  }
  updateConditionalFields();
  initializeRangeOutputs();
  updateProgress();
  updateBmiFromInputs();
  syncBodyMapButtons();
  updateBodyMapSelection();
  scheduleSave();
});

form.addEventListener('input', (event) => {
  if (event.target.matches('input[type="range"]')) {
    initializeRangeOutputs();
  }
  if (event.target === heightInput || event.target === weightInput) {
    updateBmiFromInputs();
  }
  scheduleSave();
});

if (birthdateInput) {
  birthdateInput.addEventListener('input', () => {
    updateAgeFromBirthdate();
  });
  birthdateInput.addEventListener('blur', () => {
    updateAgeFromBirthdate({ enforceFormat: true, fromBlur: true });
    scheduleSave();
  });
}

previewButton.addEventListener('click', () => {
  openPreview();
});

closePreviewButton.addEventListener('click', () => {
  closePreview();
});

closePreviewFooter.addEventListener('click', () => {
  closePreview();
});

modalOverlay.addEventListener('click', () => {
  closePreview();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && previewModal.classList.contains('is-visible')) {
    closePreview();
  }
});

clearStorageButton.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  form.reset();
  updateConditionalFields();
  initializeRangeOutputs();
  updateProgress();
  updateAgeFromBirthdate();
  updateBmiFromInputs();
  enforceExclusiveSelections();
  syncBodyMapButtons();
  updateBodyMapSelection();
  showSection(0);
  setLastSavedMessage();
  statusMessage.textContent = '保存データを削除しました。';
  statusMessage.dataset.state = 'success';
  window.setTimeout(() => {
    if (statusMessage.dataset.state === 'success') {
      statusMessage.textContent = '';
      statusMessage.dataset.state = '';
    }
  }, 3000);
});
