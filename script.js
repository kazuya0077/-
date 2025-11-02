const scriptURL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
const STORAGE_KEY = 'physio-questionnaire-v1';

const form = document.getElementById('questionnaireForm');
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

const conditionalFields = Array.from(document.querySelectorAll('[data-conditional]'));
const sections = Array.from(form.querySelectorAll('section[data-section]'));

let saveTimeout = null;
let isRestoring = false;

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
  const groups = conditionString.split(',').map((item) => item.trim()).filter(Boolean);
  if (groups.length === 0) return false;
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
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.textContent = heading.textContent.trim();
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    item.appendChild(link);
    sectionNav.appendChild(item);
  });

  const links = Array.from(sectionNav.querySelectorAll('a'));
  if (links.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          links.forEach((link) => {
            const isActive = link.getAttribute('href') === `#${id}`;
            link.classList.toggle('active', isActive);
          });
        }
      });
    },
    {
      rootMargin: '-40% 0px -50% 0px',
      threshold: 0,
    }
  );

  sections.forEach((section) => observer.observe(section));
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
    localStorage.removeItem(STORAGE_KEY);
    setLastSavedMessage();
    form.reset();
    updateConditionalFields();
    initializeRangeOutputs();
    updateProgress();
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
updateConditionalFields();
initializeRangeOutputs();
restoreFormState();
updateProgress();

form.addEventListener('submit', handleSubmit);
form.addEventListener('change', () => {
  updateConditionalFields();
  initializeRangeOutputs();
  updateProgress();
  scheduleSave();
});

form.addEventListener('input', (event) => {
  if (event.target.matches('input[type="range"]')) {
    initializeRangeOutputs();
  }
  scheduleSave();
});

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
