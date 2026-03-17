const API = 'http://127.0.0.1:3210';

function setProfileStatus(s) {
  document.getElementById('profileStatus').textContent = s;
}

function setSavedStatus(s) {
  document.getElementById('savedStatus').textContent = s;
}

async function loadProfile() {
  try {
    const res = await post({ type: 'profile.get' });
    if (!res?.data) {
      setProfileStatus('No profile saved yet.');
      return;
    }
    document.getElementById('p_first').value = res.data.firstName || '';
    document.getElementById('p_last').value = res.data.lastName || '';
    document.getElementById('p_email').value = res.data.email || '';
    document.getElementById('p_phone').value = res.data.phone || '';
    document.getElementById('p_linkedin').value = res.data.linkedin || '';
    document.getElementById('p_github').value = res.data.github || '';
    document.getElementById('p_portfolio').value = res.data.portfolio || '';
    document.getElementById('p_street').value = res.data.street || '';
    document.getElementById('p_city').value = res.data.city || '';
    document.getElementById('p_state').value = res.data.state || '';
    document.getElementById('p_zip').value = res.data.zipCode || '';
    document.getElementById('p_country').value = res.data.country || '';
    document.getElementById('p_work_auth').value = res.data.workAuthorization || '';
    document.getElementById('p_sponsorship').checked = Boolean(res.data.requiresSponsorship);
    document.getElementById('p_curr_company').value = res.data.currentCompany || '';
    document.getElementById('p_curr_title').value = res.data.currentTitle || '';
    document.getElementById('p_salary').value = res.data.salaryExpectation || '';
    document.getElementById('p_university').value = res.data.university || '';
    document.getElementById('p_degree').value = res.data.degree || '';
    document.getElementById('p_grad_year').value = res.data.graduationYear || '';
    document.getElementById('p_skills').value = res.data.skills || '';
    setProfileStatus('Loaded.');
  } catch (e) {
    setProfileStatus('Failed to load (agent not running?)');
  }
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

async function loadSavedAnswers() {
  try {
    setSavedStatus('Loading…');
    const res = await post({ type: 'custom_values.list' });
    const list = document.getElementById('savedList');
    list.innerHTML = '';

    const items = res.items || [];
    if (items.length === 0) {
      setSavedStatus('No saved answers yet.');
      return;
    }

    setSavedStatus(`${items.length} saved answer(s)`);

    for (const item of items) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.border = '1px solid #eee';
      row.style.borderRadius = '6px';
      row.style.padding = '8px';
      row.style.marginBottom = '6px';

      const left = document.createElement('div');
      left.style.flex = '1';

      const sig = document.createElement('div');
      sig.className = 'muted';
      sig.textContent = `sig: ${truncate(item.signatureHash, 8)}`;

      const val = document.createElement('div');
      val.textContent = truncate(typeof item.value === 'string' ? item.value : JSON.stringify(item.value), 80);

      left.appendChild(val);
      left.appendChild(sig);

      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.style.width = 'auto';
      del.style.margin = '0';
      del.addEventListener('click', async () => {
        await post({ type: 'custom_values.delete', signatureHash: item.signatureHash });
        await loadSavedAnswers();
      });

      row.appendChild(left);
      row.appendChild(del);
      list.appendChild(row);
    }
  } catch (e) {
    setSavedStatus('Failed to load (agent not running?)');
  }
}

let jobId = null;
let es = null;

function $(id) {
  return document.getElementById(id);
}

function setStatus(s) {
  $('status').textContent = s;
}

function clearFields() {
  $('fields').style.display = 'none';
  $('fieldsList').innerHTML = '';
}

function clearReview() {
  document.getElementById('review').style.display = 'none';
  document.getElementById('finalStep').style.display = 'none';
  document.getElementById('reviewUrl').textContent = '';
  document.getElementById('reviewList').innerHTML = '';
  document.getElementById('reviewStatus').textContent = '';
}

function renderReview(summary) {
  const review = document.getElementById('review');
  review.style.display = 'block';

  document.getElementById('finalStep').style.display = summary?.finalStepDetected ? 'block' : 'none';

  const company = summary?.company;
  const title = summary?.title;
  const url = summary?.url;
  const adapterName = summary?.adapterName;

  const parts = [];
  if (adapterName) parts.push(`Adapter: ${adapterName}`);
  if (company) parts.push(`Company: ${company}`);
  if (title) parts.push(`Job Title: ${title}`);
  if (url) parts.push(`URL: ${url}`);
  document.getElementById('reviewUrl').textContent = parts.join(' • ');

  const list = document.getElementById('reviewList');
  list.innerHTML = '';

  const fields = summary?.filledFields || [];
  if (fields.length === 0) {
    document.getElementById('reviewStatus').textContent = 'No summary available.';
    return;
  }

  for (const item of fields) {
    const row = document.createElement('div');
    row.style.border = '1px solid #eee';
    row.style.borderRadius = '6px';
    row.style.padding = '8px';
    row.style.marginBottom = '6px';

    const l = document.createElement('div');
    l.style.fontWeight = '600';
    l.textContent = item.label;

    const v = document.createElement('div');
    v.className = 'muted';
    v.textContent = truncate(typeof item.value === 'string' ? item.value : JSON.stringify(item.value), 120);

    row.appendChild(l);
    row.appendChild(v);
    list.appendChild(row);
  }
}

function renderFields(fields) {
  $('fields').style.display = 'block';
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';

  for (const f of fields) {
    const row = document.createElement('div');
    row.style.border = '1px solid #ddd';
    row.style.borderRadius = '6px';
    row.style.padding = '8px';

    const title = document.createElement('div');
    title.textContent = f.label;
    title.style.fontWeight = '600';

    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `${f.inputType}${f.required ? ' • required' : ''}`;

    const sig = document.createElement('div');
    sig.className = 'muted';
    sig.textContent = `sig: ${f.signatureHash}`;

    row.appendChild(title);
    row.appendChild(meta);
    row.appendChild(sig);

    list.appendChild(row);
  }

  const container = $('fieldsList');
  container.innerHTML = '';
  container.appendChild(list);
}

async function getCurrentTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url;
}

async function post(msg) {
  const res = await fetch(`${API}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(msg)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'request failed');
  return data;
}

// Load on popup open
loadProfile();
loadSavedAnswers();

document.getElementById('profileSave').addEventListener('click', async () => {
  try {
    setProfileStatus('Saving…');
    const data = {
      firstName: document.getElementById('p_first').value.trim(),
      lastName: document.getElementById('p_last').value.trim(),
      email: document.getElementById('p_email').value.trim(),
      phone: document.getElementById('p_phone').value.trim() || undefined,
      linkedin: document.getElementById('p_linkedin').value.trim() || undefined,
      github: document.getElementById('p_github').value.trim() || undefined,
      portfolio: document.getElementById('p_portfolio').value.trim() || undefined,
      street: document.getElementById('p_street').value.trim() || undefined,
      city: document.getElementById('p_city').value.trim() || undefined,
      state: document.getElementById('p_state').value.trim() || undefined,
      zipCode: document.getElementById('p_zip').value.trim() || undefined,
      country: document.getElementById('p_country').value.trim() || undefined,
      workAuthorization: document.getElementById('p_work_auth').value || undefined,
      requiresSponsorship: document.getElementById('p_sponsorship').checked,
      currentCompany: document.getElementById('p_curr_company').value.trim() || undefined,
      currentTitle: document.getElementById('p_curr_title').value.trim() || undefined,
      salaryExpectation: document.getElementById('p_salary').value.trim() || undefined,
      university: document.getElementById('p_university').value.trim() || undefined,
      degree: document.getElementById('p_degree').value.trim() || undefined,
      graduationYear: document.getElementById('p_grad_year').value.trim() || undefined,
      skills: document.getElementById('p_skills').value.trim() || undefined
    };

    await post({ type: 'profile.set', data });
    setProfileStatus('Saved.');
  } catch (e) {
    setProfileStatus('Save failed.');
  }
});

let pendingRequestId = null;

function openModal({ label, inputType, required }) {
  $('modalBackdrop').style.display = 'block';
  $('modal').style.display = 'block';
  $('modalLabel').textContent = label + (required ? ' (required)' : '');
  $('modalType').textContent = `Type: ${inputType}`;
  $('modalSave').checked = false;

  const control = $('modalControl');
  control.innerHTML = '';

  let input;
  if (inputType === 'select') {
    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter option text';
  } else if (inputType === 'checkbox') {
    input = document.createElement('input');
    input.type = 'checkbox';
  } else if (inputType === 'number') {
    input = document.createElement('input');
    input.type = 'number';
  } else if (inputType === 'email') {
    input = document.createElement('input');
    input.type = 'email';
  } else if (inputType === 'tel') {
    input = document.createElement('input');
    input.type = 'tel';
  } else if (inputType === 'date') {
    input = document.createElement('input');
    input.type = 'date';
  } else if (inputType === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else {
    input = document.createElement('input');
    input.type = 'text';
  }

  input.id = 'modalInput';
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.padding = '8px';
  control.appendChild(input);
}

function closeModal() {
  $('modalBackdrop').style.display = 'none';
  $('modal').style.display = 'none';
  $('modalControl').innerHTML = '';
}

function connectEvents(id) {
  if (es) es.close();
  clearFields();
  clearReview();
  closeModal();

  es = new EventSource(`${API}/events/${id}`);

  es.addEventListener('status', async (e) => {
    const data = JSON.parse(e.data);
    setStatus(`Job ${data.state} (portal=${data.portalType}, fields=${data.fieldsCount})`);

    if (data.state === 'READY_TO_SUBMIT') {
      try {
        document.getElementById('reviewStatus').textContent = 'Loading summary…';
        const res = await post({ type: 'job.summary', jobId: id });
        if (!res.summary) {
          document.getElementById('review').style.display = 'block';
          document.getElementById('reviewStatus').textContent = 'No summary available.';
        } else {
          renderReview(res.summary);
          document.getElementById('reviewStatus').textContent = '';
        }
      } catch {
        document.getElementById('review').style.display = 'block';
        document.getElementById('reviewStatus').textContent = 'No summary available.';
      }
    }
  });

  es.addEventListener('fields_ready', (e) => {
    const data = JSON.parse(e.data);
    renderFields(data.fields);
  });

  es.addEventListener('need_field', (e) => {
    const data = JSON.parse(e.data);
    pendingRequestId = data.requestId;
    openModal(data.field);
    setStatus(`Need: ${data.field.label}`);
  });

  es.onerror = () => {
    // ignore
  };
}

$('capture').addEventListener('click', async () => {
  try {
    setStatus('Capturing…');
    const url = await getCurrentTabUrl();
    if (!url) throw new Error('no active tab url');

    const res = await post({ type: 'job.capture', url });
    jobId = res.jobId;

    $('start').disabled = false;
    setStatus(`Captured jobId=${jobId}`);
    connectEvents(jobId);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

$('start').addEventListener('click', async () => {
  try {
    if (!jobId) throw new Error('capture a job first');
    setStatus('Starting…');
    await post({ type: 'job.start', jobId });
    setStatus(`Started jobId=${jobId}`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});

$('modalSubmit').addEventListener('click', async () => {
  try {
    if (!jobId) throw new Error('no jobId');
    if (!pendingRequestId) throw new Error('no pending request');

    const input = document.getElementById('modalInput');
    let value;
    if (input?.type === 'checkbox') value = input.checked;
    else value = input.value;

    const save = document.getElementById('modalSave').checked;
    await post({ type: 'field.provide', jobId, requestId: pendingRequestId, value, save });
    pendingRequestId = null;
    closeModal();
    setStatus('Value submitted; continuing…');
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
});
