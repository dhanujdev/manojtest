import electron from 'electron';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { selectAdapter } from './src/adapters/registry.js';
import { CaptureJobRequest, StartJobRequest, ProvideFieldRequest, ProfileGetRequest, ProfileSetRequest, CustomValuesListRequest, CustomValuesDeleteRequest, JobSummaryRequest } from '@job-assistant/shared';

const { app, Tray, Menu } = electron;

const fastify = Fastify({ logger: true });
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS']
});

/** @typedef {{
 *  label: string,
 *  inputType: 'text'|'email'|'tel'|'number'|'date'|'select'|'radio'|'checkbox'|'file'|'textarea',
 *  required: boolean,
 *  options?: string[],
 *  signatureHash: string
 * }} Field
 */

/** @typedef {{
 *  id: string,
 *  url: string,
 *  state: string,
 *  portalType: string,
 *  fields?: Field[],
 *  pendingFieldRequest?: { requestId: string, field: Field },
 *  filledFields?: { label: string, value: string|number|boolean }[],
 *  meta?: { company: string|null, title: string|null, finalStepDetected?: boolean, adapterName?: string|null },
 *  error?: string,
 *  createdAt: number,
 *  updatedAt: number
 * }} Job
 */

/** @type {Map<string, Job>} */
const jobs = new Map();

/** @type {Map<string, import('playwright').Page>} */
const jobPages = new Map();

/** @type {Map<string, (value: any) => void>} */
const pendingResolvers = new Map();

// --- Local profile persistence (SQLite)
const dbPath = path.join(app.getPath('userData'), 'job-assistant.sqlite');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_values (
    signature_hash TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

function profileGet() {
  const row = db.prepare('SELECT data FROM profile WHERE id = ?').get('default');
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

function profileSet(data) {
  const nowMs = Date.now();
  db.prepare(
    'INSERT INTO profile (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at'
  ).run('default', JSON.stringify(data), nowMs);
}

function customValueGet(signatureHash) {
  const row = db.prepare('SELECT value FROM custom_values WHERE signature_hash = ?').get(signatureHash);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

function customValueSet(signatureHash, value) {
  const nowMs = Date.now();
  db.prepare(
    'INSERT INTO custom_values (signature_hash, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(signature_hash) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at'
  ).run(signatureHash, JSON.stringify(value), nowMs);
}

function now() {
  return Date.now();
}

function setJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: now() });
}

// Runner utilities (keep portal-specific logic inside adapters)
function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

let persistentContext = null;

async function getContext() {
  if (persistentContext) return persistentContext;

  const baseDir = app.getPath('userData');
  const userDataDir = path.join(baseDir, 'playwright-profile');
  await fs.mkdir(userDataDir, { recursive: true });

  persistentContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 }
  });

  return persistentContext;
}


async function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  setJob(jobId, {
    state: 'OPENED',
    portalType: 'unknown',
    error: undefined,
    pendingFieldRequest: undefined,
    filledFields: []
  });

  try {
    const context = await getContext();
    const page = await context.newPage();
    jobPages.set(jobId, page);

    await page.goto(job.url, { waitUntil: 'domcontentloaded' });

    const adapter = selectAdapter(job.url);
    console.log(`[runner] selected_adapter=${adapter?.name || 'none'} url=${job.url}`);
    if (!adapter) {
      const j = jobs.get(jobId);
      setJob(jobId, { meta: { ...(j?.meta || { company: null, title: null }), adapterName: null }, state: 'FAILED', error: 'unsupported_portal' });
      return;
    }

    const j0 = jobs.get(jobId);
    setJob(jobId, { portalType: adapter.name, meta: { ...(j0?.meta || { company: null, title: null }), adapterName: adapter.name } });

    const jobCtx = {
      id: jobId,
      url: job.url,
      portalType: adapter.name,
      setState: (state) => setJob(jobId, { state }),
      setFields: (fields) => setJob(jobId, { fields }),
      setPendingFieldRequest: (req) => setJob(jobId, { pendingFieldRequest: req }),
      setMeta: (metaPatch) => {
        const j = jobs.get(jobId);
        setJob(jobId, { meta: { ...(j?.meta || { company: null, title: null }), ...metaPatch } });
      },
      recordFilled: (item) => {
        const j = jobs.get(jobId);
        const prev = j?.filledFields || [];
        setJob(jobId, { filledFields: [...prev, item] });
      }
    };

    async function awaitNeedField(field) {
      const requestId = crypto.randomUUID();
      jobCtx.setPendingFieldRequest({ requestId, field });

      const value = await new Promise((resolve) => {
        pendingResolvers.set(requestId, resolve);
      });

      jobCtx.setPendingFieldRequest(undefined);
      return value;
    }

    const SUBMIT_LABEL_PATTERNS = [/^submit$/i, /^submit application$/i, /^apply$/i, /^send application$/i, /^complete application$/i, /^finish$/i, /^send my application$/i, /^submit my application$/i, /^apply now$/i, /^complete$/i, /^review & submit$/i, /^review and submit$/i];

    await adapter.run({
      page,
      job: jobCtx,
      stores: { profileGet, customValueGet, customValueSet },
      awaitNeedField,
      submitGuardPatterns: SUBMIT_LABEL_PATTERNS
    });
  } catch (err) {
    setJob(jobId, { state: 'FAILED', error: String(err?.message || err) });
  }
}

fastify.post('/api', async (req, reply) => {
  const body = req.body;

  const capture = CaptureJobRequest.safeParse(body);
  if (capture.success) {
    const id = crypto.randomUUID();
    jobs.set(id, {
      id,
      url: capture.data.url,
      state: 'NEW',
      portalType: 'unknown',
      createdAt: now(),
      updatedAt: now()
    });
    return reply.send({ ok: true, jobId: id });
  }

  const profileGetReq = ProfileGetRequest.safeParse(body);
  if (profileGetReq.success) {
    return reply.send({ ok: true, data: profileGet() });
  }

  const profileSetReq = ProfileSetRequest.safeParse(body);
  if (profileSetReq.success) {
    profileSet(profileSetReq.data.data);
    return reply.send({ ok: true });
  }

  const listReq = CustomValuesListRequest.safeParse(body);
  if (listReq.success) {
    const rows = db
      .prepare('SELECT signature_hash, value, updated_at FROM custom_values ORDER BY updated_at DESC')
      .all();

    const items = rows.map((r) => {
      let parsed;
      try {
        parsed = JSON.parse(r.value);
      } catch {
        parsed = r.value;
      }
      return { signatureHash: r.signature_hash, value: parsed, updatedAt: r.updated_at };
    });

    return reply.send({ ok: true, items });
  }

  const delReq = CustomValuesDeleteRequest.safeParse(body);
  if (delReq.success) {
    db.prepare('DELETE FROM custom_values WHERE signature_hash = ?').run(delReq.data.signatureHash);
    return reply.send({ ok: true });
  }

  const summaryReq = JobSummaryRequest.safeParse(body);
  if (summaryReq.success) {
    const job = jobs.get(summaryReq.data.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'job not found' });
    if (!job.filledFields) return reply.send({ ok: true, summary: null });
    return reply.send({
      ok: true,
      summary: {
        url: job.url,
        company: job.meta?.company ?? null,
        title: job.meta?.title ?? null,
        adapterName: job.meta?.adapterName ?? null,
        finalStepDetected: Boolean(job.meta?.finalStepDetected),
        filledFields: job.filledFields
      }
    });
  }

  const provide = ProvideFieldRequest.safeParse(body);
  if (provide.success) {
    const job = jobs.get(provide.data.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'job not found' });

    const resolver = pendingResolvers.get(provide.data.requestId);
    if (!resolver) return reply.code(404).send({ ok: false, error: 'requestId not pending' });

    // Persist custom value if requested (signature-based memory)
    if (provide.data.save === true && job.pendingFieldRequest?.requestId === provide.data.requestId) {
      const sig = job.pendingFieldRequest.field.signatureHash;
      customValueSet(sig, provide.data.value);
    }

    resolver(provide.data.value);
    pendingResolvers.delete(provide.data.requestId);
    return reply.send({ ok: true });
  }

  const start = StartJobRequest.safeParse(body);
  if (start.success) {
    const job = jobs.get(start.data.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'job not found' });

    if (job.state === 'FILLING') return reply.send({ ok: true, started: true });

    setJob(job.id, { state: 'FILLING' });
    runJob(job.id);
    return reply.send({ ok: true, started: true, jobId: job.id });
  }

  return reply.code(400).send({ ok: false, error: 'invalid message' });
});

fastify.get('/job/:id', async (req, reply) => {
  const { id } = req.params;
  const job = jobs.get(id);
  if (!job) return reply.code(404).send({ ok: false, error: 'job not found' });
  return reply.send({ ok: true, job });
});

fastify.get('/events/:id', async (req, reply) => {
  const { id } = req.params;
  const job = jobs.get(id);
  if (!job) return reply.code(404).send({ ok: false, error: 'job not found' });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  let lastUpdatedAt = 0;
  let fieldsSentHash = null;
  let needSentId = null;

  const timer = setInterval(() => {
    const j = jobs.get(id);
    if (!j) return;

    if (j.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = j.updatedAt;
      reply.raw.write(`event: status\n`);
      reply.raw.write(
        `data: ${JSON.stringify({ state: j.state, portalType: j.portalType, error: j.error, fieldsCount: j.fields?.length || 0 })}\n\n`
      );
    }

    if (Array.isArray(j.fields) && j.fields.length > 0) {
      const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify(j.fields.map((f) => f.signatureHash)))
        .digest('hex');

      if (hash !== fieldsSentHash) {
        fieldsSentHash = hash;
        reply.raw.write(`event: fields_ready\n`);
        reply.raw.write(`data: ${JSON.stringify({ jobId: j.id, fields: j.fields })}\n\n`);
      }
    }

    if (j.pendingFieldRequest?.requestId && j.pendingFieldRequest.requestId !== needSentId) {
      needSentId = j.pendingFieldRequest.requestId;
      reply.raw.write(`event: need_field\n`);
      reply.raw.write(
        `data: ${JSON.stringify({ jobId: j.id, requestId: j.pendingFieldRequest.requestId, field: j.pendingFieldRequest.field })}\n\n`
      );
    }
  }, 400);

  req.raw.on('close', () => {
    clearInterval(timer);
  });
});

let tray = null;

async function createTray() {
  tray = new Tray(electron.nativeImage.createEmpty());

  const menu = Menu.buildFromTemplate([
    { label: 'Job Assistant', enabled: false },
    { type: 'separator' },
    { label: 'Local API: http://127.0.0.1:3210', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Job Assistant (local agent)');
  tray.setContextMenu(menu);
}

app.whenReady().then(async () => {
  await fastify.listen({ host: '127.0.0.1', port: 3210 });
  await createTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
