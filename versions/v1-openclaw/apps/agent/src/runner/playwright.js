import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function launchHeadedPersistentContext({ baseDir }) {
  const userDataDir = path.join(baseDir, 'playwright-profile');
  await fs.mkdir(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 }
  });

  return context;
}
