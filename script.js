const scriptURL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

const form = document.getElementById('questionnaireForm');
const statusMessage = document.getElementById('statusMessage');
const submitButton = form.querySelector('button[type="submit"]');
const conditionalFields = Array.from(document.querySelectorAll('[data-conditional]'));

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
