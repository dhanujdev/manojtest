import crypto from 'node:crypto';

function normalizeLabel(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase();
}

function fieldSignature({ label, tagName, type, name, id, options }) {
  const payload = {
    label: normalizeLabel(label),
    tagName,
    type,
    name,
    id,
    options
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function getLabelFor(el) {
  const id = el.getAttribute('id');
  if (id) {
    const l = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (l?.textContent) return l.textContent;
  }

  // common greenhouse structure
  const field = el.closest('.field') || el.closest('.input') || el.parentElement;
  const lab = field?.querySelector('label');
  if (lab?.textContent) return lab.textContent;

  const aria = el.getAttribute('aria-label');
  if (aria) return aria;

  return '';
}

function isRequired(el, labelText) {
  if (el.hasAttribute('required')) return true;
  const ariaReq = el.getAttribute('aria-required');
  if (ariaReq === 'true') return true;
  if (String(labelText || '').includes('*')) return true;
  return false;
}

export async function extractGreenhouseFields(page) {
  // Wait for some form-ish content
  await page.waitForLoadState('domcontentloaded');

  const result = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input') {
          const t = (el.getAttribute('type') || 'text').toLowerCase();
          if (['hidden', 'submit', 'button', 'image', 'reset'].includes(t)) return false;
        }
        if (el.getAttribute('disabled') != null) return false;
        return true;
      })
      .slice(0, 200);

    return elements.map((el) => {
      const tagName = el.tagName.toLowerCase();
      const type = tagName === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tagName;
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';

      let options = undefined;
      if (tagName === 'select') {
        options = Array.from(el.querySelectorAll('option')).map((o) => ({
          value: o.getAttribute('value') || '',
          label: (o.textContent || '').trim()
        }));
      }

      return { tagName, type, name, id, options };
    });
  });

  // Need labels + required computed with access to DOM; do another eval with minimal extra.
  const labeled = await page.evaluate(() => {
    function getLabelFor(el) {
      const id = el.getAttribute('id');
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l?.textContent) return l.textContent;
      }
      const field = el.closest('.field') || el.closest('.input') || el.parentElement;
      const lab = field?.querySelector('label');
      if (lab?.textContent) return lab.textContent;
      const aria = el.getAttribute('aria-label');
      if (aria) return aria;
      return '';
    }

    function isRequired(el, labelText) {
      if (el.hasAttribute('required')) return true;
      const ariaReq = el.getAttribute('aria-required');
      if (ariaReq === 'true') return true;
      if (String(labelText || '').includes('*')) return true;
      return false;
    }

    const elements = Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input') {
          const t = (el.getAttribute('type') || 'text').toLowerCase();
          if (['hidden', 'submit', 'button', 'image', 'reset'].includes(t)) return false;
        }
        if (el.getAttribute('disabled') != null) return false;
        return true;
      })
      .slice(0, 200);

    return elements.map((el) => {
      const tagName = el.tagName.toLowerCase();
      const type = tagName === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tagName;
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';
      const label = getLabelFor(el);
      const required = isRequired(el, label);

      let options = undefined;
      if (tagName === 'select') {
        options = Array.from(el.querySelectorAll('option')).map((o) => ({
          value: o.getAttribute('value') || '',
          label: (o.textContent || '').trim()
        }));
      }

      return { tagName, type, name, id, label, required, options };
    });
  });

  return labeled.map((f) => ({
    ...f,
    signature: fieldSignature(f)
  }));
}
