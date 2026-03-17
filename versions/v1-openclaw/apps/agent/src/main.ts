import electron from 'electron';
import Fastify from 'fastify';
import { CaptureJobRequest, StartJobRequest } from '@job-assistant/shared';

const { app, Tray, Menu } = electron;

const fastify = Fastify({ logger: true });

// In-memory job store for scaffold
const jobs = new Map<string, { id: string; url: string }>();

fastify.post('/api', async (req, reply) => {
  const body = req.body;

  const capture = CaptureJobRequest.safeParse(body);
  if (capture.success) {
    const id = crypto.randomUUID();
    jobs.set(id, { id, url: capture.data.url });
    return reply.send({ ok: true, jobId: id });
  }

  const start = StartJobRequest.safeParse(body);
  if (start.success) {
    const job = jobs.get(start.data.jobId);
    if (!job) return reply.code(404).send({ ok: false, error: 'job not found' });

    // TODO: Playwright headed runner + greenhouse adapter
    return reply.send({ ok: true, started: true });
  }

  return reply.code(400).send({ ok: false, error: 'invalid message' });
});

let tray: Tray | null = null;

async function createTray() {
  tray = new Tray(process.platform === 'darwin' ? undefined : undefined);
  const menu = Menu.buildFromTemplate([
    { label: 'Job Assistant', enabled: false },
    { type: 'separator' },
    {
      label: 'Open local status',
      click: () => {
        // TODO: open browser to local UI
      }
    },
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
  // Tray app: keep running
  e.preventDefault();
});
