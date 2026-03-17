import crypto from 'node:crypto';

function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function normalizeLabel(label) {
  return normalizeWhitespace(String(label || '').replace(/\*\s*$/g, ''));
}

function mapInputType(tag, typeAttr) {
  const tagName = String(tag || '').toLowerCase();
  const type = String(typeAttr || '').toLowerCase();

  if (tagName === 'textarea') return 'textarea';
  if (tagName === 'select') return 'select';

  if (tagName === 'input') {
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'number') return 'number';
    if (type === 'date') return 'date';
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'file') return 'file';
    return 'text';
  }

  return 'text';
}

function getAutofillValue(field, profile) {
  const label = normalizeWhitespace(field.label).toLowerCase();

  if (!profile) return undefined;

  // Name
  if (label.includes('first name')) return profile.firstName;
  if (label.includes('last name') || label.includes('surname') || label.includes('family name')) return profile.lastName;
  if (label === 'name' || label === 'full name' || label === 'your name') return `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  // Email
  if (label.includes('email')) return profile.email;
  // Phone
  if (label.includes('phone') || label.includes('mobile') || label.includes('cell')) return profile.phone;
  // Links
  if (label.includes('linkedin')) return profile.linkedin;
  if (label.includes('github')) return profile.github;
  if (label.includes('portfolio') || label.includes('personal website') || label.includes('personal site') || label.includes('website url') || label === 'website') return profile.portfolio;
  // Location
  if (label === 'city' || (label.includes('city') && !label.includes('country'))) return profile.city;
  if ((label === 'state' || label.includes('state') || label.includes('province')) && !label.includes('united states') && !label.includes('outside')) return profile.state;
  if (label.includes('zip') || label.includes('postal code')) return profile.zipCode;
  if (label.includes('country')) return profile.country;
  if (label.includes('street') || label === 'address' || label.includes('address line 1') || label.includes('mailing address')) return profile.street;
  // Work auth
  if (label.includes('work authorization') || label.includes('authorized to work') || label.includes('visa status') || label.includes('employment eligibility') || label.includes('work visa')) return profile.workAuthorization;
  if (label.includes('sponsorship') || label.includes('require visa') || label.includes('visa sponsorship') || label.includes('need sponsorship')) {
    if (profile.requiresSponsorship === true) return 'Yes';
    if (profile.requiresSponsorship === false) return 'No';
    return undefined;
  }
  // Current position
  if ((label.includes('current company') || label.includes('current employer') || label === 'company') && profile.currentCompany) return profile.currentCompany;
  if ((label.includes('current title') || label.includes('current position') || label.includes('current role') || label.includes('job title') || label === 'title') && profile.currentTitle) return profile.currentTitle;
  // Salary
  if (label.includes('salary') || label.includes('compensation') || label.includes('expected pay') || label.includes('desired salary')) return profile.salaryExpectation;
  // Education
  if (label.includes('university') || label.includes('school') || label.includes('college') || label.includes('institution')) return profile.university;
  if (label === 'degree' || label.includes('degree type') || label.includes('highest degree') || label.includes('highest level of education')) return profile.degree;
  if (label.includes('major') || label.includes('field of study') || label.includes('concentration')) return profile.degree;
  if (label.includes('graduation year') || label.includes('graduation date') || label.includes('year of graduation')) return profile.graduationYear;
  // Skills
  if (label === 'skills' || label.includes('key skills') || label.includes('technical skills')) return profile.skills;

  return undefined;
}

async function fillField(page, field, value) {
  try {
    // 1) getByLabel
    const byLabel = page.getByLabel(field.label);
    const count = await byLabel.count().catch(() => 0);
    if (count > 0) {
      const loc = byLabel.first();
      if (field.inputType === 'select') {
        await loc.selectOption({ label: String(value) });
      } else if (field.inputType === 'checkbox') {
        if (Array.isArray(field.options) && field.options.length) {
          const selected = Array.isArray(value)
            ? value.map(String)
            : String(value)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
          for (const opt of selected) {
            await page.getByRole('checkbox', { name: opt }).check();
          }
        } else {
          await loc.setChecked(Boolean(value));
        }
      } else if (field.inputType === 'textarea') {
        await loc.fill(String(value));
      } else if (field.inputType === 'radio') {
        const scopedFieldset = page.locator('fieldset, li, .application-question, .application-field', { hasText: field.label }).first();
        const scopedOption = scopedFieldset.getByRole('radio', { name: String(value) }).first();
        if (await scopedOption.count().catch(() => 0)) await scopedOption.check();
        else await page.getByRole('radio', { name: String(value) }).first().check();
      } else if (field.inputType === 'file') {
        await loc.setInputFiles(String(value));
      } else {
        await loc.fill(String(value));
      }
      return;
    }

    // 2) getByRole fallback
    if (field.inputType === 'radio') {
      const scopedFieldset = page.locator('fieldset, li, .application-question, .application-field', { hasText: field.label }).first();
      const scopedOption = scopedFieldset.getByRole('radio', { name: String(value) }).first();
      if (await scopedOption.count().catch(() => 0)) await scopedOption.check();
      else await page.getByRole('radio', { name: String(value) }).first().check();
      return;
    }

    if (field.inputType === 'checkbox' && Array.isArray(field.options) && field.options.length) {
      const selected = Array.isArray(value)
        ? value.map(String)
        : String(value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

      for (const opt of selected) {
        await page.getByRole('checkbox', { name: opt }).check();
      }
      return;
    }

    // 3) label:has-text + associated input
    const labelLoc = page.locator('label', { hasText: field.label }).first();
    const labelCount = await labelLoc.count().catch(() => 0);
    if (labelCount > 0) {
      const forId = await labelLoc.getAttribute('for');
      if (forId) {
        const input = page.locator(`#${CSS.escape(forId)}`);
        if (field.inputType === 'select') await input.selectOption({ label: String(value) });
        else await input.fill(String(value));
        return;
      }
    }

    throw new Error(`selector_failed: unable to locate field by label: ${field.label}`);
  } catch (err) {
    throw new Error(`fill_failed: ${field.label}: ${String(err?.message || err)}`);
  }
}

async function extractCompanyAndTitle(page) {
  try {
    const meta = await page.evaluate(() => {
      function text(el) {
        const t = el?.textContent || '';
        return t.replace(/\s+/g, ' ').trim();
      }

      let title = null;
      const h1 = document.querySelector('h1');
      if (h1) title = text(h1) || null;
      if (!title) {
        const h2 = document.querySelector('h2');
        if (h2) title = text(h2) || null;
      }
      if (!title) title = document.title ? document.title.trim() : null;

      // Company: try Ashby-specific selectors first, then header
      let company = null;
      const companyEl =
        document.querySelector('[class*="company"]') ||
        document.querySelector('[class*="Company"]') ||
        document.querySelector('header h1');
      if (companyEl) {
        const t = text(companyEl);
        if (t && t.length < 80) company = t;
      }
      if (!company) {
        const header = document.querySelector('header');
        if (header) {
          const t = text(header);
          if (t && t.length < 80) company = t;
        }
      }

      return { company, title };
    });

    let company = meta.company;
    if (!company) {
      try {
        const u = new URL(page.url());
        const parts = u.pathname.split('/').filter(Boolean);
        // jobs.ashbyhq.com/<company>/<uuid>
        company = parts[0] ? parts[0] : null;
      } catch {
        company = null;
      }
    }

    return { company: company ?? null, title: meta.title ?? null };
  } catch {
    return { company: null, title: null };
  }
}

async function extractFields(page) {
  const selector = 'form, .ashby-application-form, [data-testid*="application"], [class*="ApplicationForm"]';

  const raw = await page.$$eval(selector, (forms) => {
    function norm(s) {
      return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function labelForInput(el) {
      const id = el.getAttribute('id');
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl?.textContent) return norm(lbl.textContent);
      }

      // Ashby often wraps input in a label-like container
      let p = el.parentElement;
      for (let i = 0; i < 6 && p; i++) {
        const lbl = p.querySelector('label');
        if (lbl?.textContent) return norm(lbl.textContent);
        p = p.parentElement;
      }

      return (
        norm(el.getAttribute('aria-label')) ||
        norm(el.getAttribute('placeholder')) ||
        norm(el.getAttribute('name')) ||
        norm(el.getAttribute('id'))
      );
    }

    function optionLabelForChoice(inputEl) {
      const id = inputEl.getAttribute('id');
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl?.textContent) return norm(lbl.textContent);
      }
      const parentLabel = inputEl.closest('label');
      if (parentLabel?.textContent) return norm(parentLabel.textContent);
      return labelForInput(inputEl);
    }

    function groupLabelFromFieldset(el) {
      const fs = el.closest('fieldset');
      if (!fs) return null;
      const legend = fs.querySelector('legend');
      if (legend?.textContent) return norm(legend.textContent);
      return null;
    }

    const roots = forms.length ? forms : [document.documentElement];
    const all = [];
    for (const root of roots) {
      all.push(...Array.from(root.querySelectorAll('input, select, textarea')));
    }

    const els = all
      .filter((el) => {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (tag === 'input' && ['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) return false;
        if (el.getAttribute('disabled') != null) return false;
        return true;
      })
      .slice(0, 400);

    const out = [];

    // Radio groups by name
    const radios = els.filter((el) => el.tagName.toLowerCase() === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'radio');
    const radioGroups = new Map();
    for (const r of radios) {
      const name = r.getAttribute('name') || '';
      if (!name) continue;
      if (!radioGroups.has(name)) radioGroups.set(name, []);
      radioGroups.get(name).push(r);
    }

    const used = new Set();

    for (const [name, group] of radioGroups.entries()) {
      if (group.length < 2) continue;
      for (const r of group) used.add(r);

      const required = group.some((r) => r.hasAttribute('required') || r.getAttribute('aria-required') === 'true');
      const legend = groupLabelFromFieldset(group[0]);
      const label = legend || labelForInput(group[0]) || name;
      const options = group.map((r) => optionLabelForChoice(r)).filter(Boolean).map((t) => norm(t)).filter(Boolean);

      out.push({ kind: 'radio_group', labelText: label, required, options, name, id: '' });
    }

    // Checkbox groups (fieldset)
    const checkboxes = els.filter((el) => el.tagName.toLowerCase() === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'checkbox');

    const checkboxFieldsets = new Map();
    for (const cb of checkboxes) {
      const fs = cb.closest('fieldset');
      if (!fs) continue;
      if (!checkboxFieldsets.has(fs)) checkboxFieldsets.set(fs, []);
      checkboxFieldsets.get(fs).push(cb);
    }

    for (const [fs, group] of checkboxFieldsets.entries()) {
      if (group.length < 2) continue;
      for (const cb of group) used.add(cb);

      const legend = fs.querySelector('legend');
      const label = legend?.textContent ? norm(legend.textContent) : labelForInput(group[0]);
      const required = group.some((c) => c.hasAttribute('required') || c.getAttribute('aria-required') === 'true');
      const options = group.map((c) => optionLabelForChoice(c)).filter(Boolean).map((t) => norm(t)).filter(Boolean);

      out.push({ kind: 'checkbox_group', labelText: label, required, options, name: group[0].getAttribute('name') || '', id: '' });
    }

    // Checkbox groups by name
    const checkboxByName = new Map();
    for (const cb of checkboxes) {
      if (used.has(cb)) continue;
      const name = cb.getAttribute('name') || '';
      if (!name) continue;
      if (!checkboxByName.has(name)) checkboxByName.set(name, []);
      checkboxByName.get(name).push(cb);
    }
    for (const [name, group] of checkboxByName.entries()) {
      if (group.length < 2) continue;
      for (const cb of group) used.add(cb);

      const required = group.some((c) => c.hasAttribute('required') || c.getAttribute('aria-required') === 'true');
      const legend = groupLabelFromFieldset(group[0]);
      const label = legend || labelForInput(group[0]) || name;
      const options = group.map((c) => optionLabelForChoice(c)).filter(Boolean).map((t) => norm(t)).filter(Boolean);

      out.push({ kind: 'checkbox_group', labelText: label, required, options, name, id: '' });
    }

    // Remaining
    for (const el of els) {
      if (used.has(el)) continue;

      const tag = el.tagName.toLowerCase();
      const typeAttr = tag === 'input' ? (el.getAttribute('type') || 'text') : tag;
      const id = el.getAttribute('id') || '';
      const name = el.getAttribute('name') || '';
      const ariaRequired = el.getAttribute('aria-required') || '';
      const required = el.hasAttribute('required') || ariaRequired === 'true';

      let options = [];
      if (tag === 'select') {
        const sel = el;
        options = Array.from(sel.options)
          .map((o) => norm(o.textContent))
          .filter(Boolean)
          .slice(0, 50);
      }

      out.push({ kind: 'field', tag, typeAttr, id, name, labelText: labelForInput(el), required, options });
    }

    return out;
  });

  return raw.map((f) => {
    const label = normalizeLabel(f.labelText);

    let inputType = 'text';
    if (f.kind === 'radio_group') inputType = 'radio';
    else if (f.kind === 'checkbox_group') inputType = 'checkbox';
    else inputType = mapInputType(f.tag, f.typeAttr);

    const options = Array.isArray(f.options) && f.options.length ? f.options : undefined;
    const optionsSorted = options ? [...options].map((x) => normalizeWhitespace(x)).filter(Boolean).sort() : undefined;

    const sigObj =
      inputType === 'radio' || (inputType === 'checkbox' && optionsSorted)
        ? { label: normalizeWhitespace(label).toLowerCase(), inputType, options: optionsSorted }
        : { label: normalizeWhitespace(label).toLowerCase(), inputType, name: f.name || '', id: f.id || '', options: optionsSorted };

    const signatureHash = crypto.createHash('sha256').update(JSON.stringify(sigObj)).digest('hex');

    return {
      label,
      inputType,
      required: Boolean(f.required),
      options: optionsSorted?.length ? optionsSorted : undefined,
      signatureHash
    };
  });
}

export class AshbyAdapter {
  constructor() {
    this.name = 'ashby';
  }

  canHandle(url) {
    try {
      const u = new URL(url);
      return u.hostname.includes('ashbyhq.com') || u.hostname.includes('ashby.io');
    } catch {
      return String(url || '').includes('ashbyhq.com') || String(url || '').includes('ashby.io');
    }
  }

  /**
   * @param {import('./portalAdapter.js').AdapterRunParams} params
   */
  async run(params) {
    const { page, job, stores, awaitNeedField, submitGuardPatterns } = params;
    console.log(`[adapter:${this.name}] run url=${job.url}`);

    const meta = await extractCompanyAndTitle(page);
    job.setMeta({ company: meta.company, title: meta.title });

    const pageUrl = page.url();
    try {
      const u = new URL(pageUrl);
      // Ashby application forms are at /company/uuid/application
      // Job pages are at /company/uuid (no /application suffix)
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length === 2 && !pageUrl.includes('/application')) {
        // On job listing page — navigate to application form
        await page.goto(pageUrl + '/application', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);
      }
    } catch {}

    // Wait for form to actually render (React SPA)
    await page.waitForSelector('form, [data-testid*="form"], [class*="Form"]', { state: 'visible', timeout: 8000 }).catch(() => null);

    const hasForm = await page.locator('form, .ashby-application-form, [data-testid*="application"], [class*="ApplicationForm"]').first().isVisible().catch(() => false);
    if (!hasForm) {
      throw new Error('No visible form detected on page.');
    }

    job.setState('FORM_DETECTED');

    const NEXT_LABEL_PATTERNS = [/^next$/i, /^continue$/i, /^review$/i, /^save and continue$/i, /^next step$/i, /^proceed$/i, /^next page$/i, /^save & continue$/i, /^continue to next step$/i];
    const SUBMIT_LABEL_PATTERNS = submitGuardPatterns;
    const MAX_STEPS = 10;

    async function findFirstButtonByPatterns(patterns) {
      for (const pattern of patterns) {
        const loc = page.getByRole('button', { name: pattern }).first();
        const visible = await loc.isVisible().catch(() => false);
        if (visible) return loc;
      }
      return null;
    }

    async function anySubmitVisible() {
      for (const pattern of SUBMIT_LABEL_PATTERNS) {
        const loc = page.getByRole('button', { name: pattern }).first();
        const visible = await loc.isVisible().catch(() => false);
        if (visible) return true;
      }
      const inputSubmit = await page.locator('button[type="submit"], input[type="submit"]').first().isVisible().catch(() => false);
      return inputSubmit;
    }

    async function guardedClick(buttonLocator) {
      const name = (await buttonLocator.getAttribute('aria-label').catch(() => null)) ||
        (await buttonLocator.textContent().catch(() => '')) ||
        '';
      const normalized = normalizeWhitespace(name).toLowerCase();

      for (const pattern of SUBMIT_LABEL_PATTERNS) {
        if (pattern.test(normalized)) {
          throw new Error(`submit_guard: refusing to click submit-like button: ${normalized}`);
        }
      }

      await buttonLocator.click();
    }

    const prof = stores.profileGet();
    const processed = new Set();

    let stopped = false;
    for (let step = 1; step <= MAX_STEPS; step++) {
      console.log(`[adapter:${this.name}] step=${step}/${MAX_STEPS}`);
      const fields = await extractFields(page);
      job.setFields(fields);
      job.setState('FILLING');

      for (const field of fields) {
        if (processed.has(field.signatureHash)) continue;

        let value = getAutofillValue(field, prof);

        if (value === undefined || value === null || value === '') {
          const remembered = stores.customValueGet(field.signatureHash);
          if (remembered !== undefined && remembered !== null && remembered !== '') {
            value = remembered;
          }
        }

        if ((value === undefined || value === null || value === '') && field.required) {
          value = await awaitNeedField(field);
        }

        if (value !== undefined && value !== null && value !== '') {
          try {
            await fillField(page, field, value);
            const v = typeof value === 'boolean' || typeof value === 'number' ? value : String(value);
            job.recordFilled({ label: field.label, value: v });
          } catch (fillErr) {
            console.warn(`[adapter:${this.name}] fill_skip field=${JSON.stringify(field.label)} err=${fillErr?.message}`);
          }
        }

        processed.add(field.signatureHash);
      }

      const submitVisible = await anySubmitVisible();
      if (submitVisible) {
        console.log(`[adapter:${this.name}] submit_detected -> READY_TO_SUBMIT`);
        job.setMeta({ finalStepDetected: true });
        job.setState('READY_TO_SUBMIT');
        stopped = true;
        break;
      }

      const nextButton = await findFirstButtonByPatterns(NEXT_LABEL_PATTERNS);
      if (nextButton) {
        const txt = normalizeWhitespace((await nextButton.textContent().catch(() => '')) || '');
        console.log(`[adapter:${this.name}] next_detected label=${JSON.stringify(txt)}`);
        await guardedClick(nextButton);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(250);
        continue;
      }

      throw new Error('multi_step_terminal: neither next nor submit detected');
    }

    if (!stopped) {
      console.log(`[adapter:${this.name}] max_steps_guard_triggered MAX_STEPS=${MAX_STEPS}`);
      job.setMeta({ finalStepDetected: false });
      throw new Error(`multi_step_guard: exceeded MAX_STEPS=${MAX_STEPS}`);
    }
  }
}
