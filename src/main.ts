/**
 * Apps Script entry. esbuild bundles this into an IIFE assigned to `__HaSlik`;
 * build.mjs appends top-level function stubs (web app, api, triggers, menu) that delegate here.
 */
export { api, doGet } from './gas/router';
export { backupJob, dailyJob, menuCloseNow, menuRefresh, onOpen } from './gas/jobs';
import { seedStaging as runSeed, setup as runSetup } from './gas/jobs';

/** Editor / menu entry: runs setup and logs each step (✔ / ✘). */
export function setup(): void {
  runSetup().forEach(l => console.log(l));
}

/** Editor entry, staging only. */
export function seedStaging(): void {
  runSeed().forEach(l => console.log(l));
}
