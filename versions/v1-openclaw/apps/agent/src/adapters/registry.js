import { GreenhouseAdapter } from './greenhouseAdapter.js';
import { LeverAdapter } from './leverAdapter.js';
import { AshbyAdapter } from './ashbyAdapter.js';
import { SmartRecruitersAdapter } from './smartrecruitersAdapter.js';

export const adapters = [new GreenhouseAdapter(), new LeverAdapter(), new AshbyAdapter(), new SmartRecruitersAdapter()];

export function selectAdapter(url) {
  for (const a of adapters) {
    if (a.canHandle(url)) return a;
  }
  return null;
}
