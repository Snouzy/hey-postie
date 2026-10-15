import { emit } from '@tauri-apps/api/event';
import { LazyStore } from '@tauri-apps/plugin-store';
import { check } from '@tauri-apps/plugin-updater';

/** Emitted with `{ version, currentVersion }` when a newer release is published; no UI yet. */
export const UPDATE_AVAILABLE_EVENT = 'update-available';

/** Starting the app ten times in a row asks the release server once. */
export const MIN_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const STORE_FILE = 'updater.json';
const LAST_CHECK_KEY = 'lastCheckedAt';

/** True when no check is recorded, or the last one is older than the interval. */
export function isCheckDue(lastCheckedAt: number | undefined, now: number): boolean {
  if (lastCheckedAt === undefined || !Number.isFinite(lastCheckedAt)) return true;
  // A clock set back in time would otherwise silence the check until it catches up.
  if (lastCheckedAt > now) return true;
  return now - lastCheckedAt >= MIN_CHECK_INTERVAL_MS;
}

/**
 * Asks `plugins.updater.endpoints` (tauri.conf.json) for a newer release, at most once an hour
 * across restarts. Downloading and installing wait for the interface that shows the update.
 */
export async function checkForUpdatesAtStartup(): Promise<void> {
  const store = new LazyStore(STORE_FILE);
  const lastCheckedAt = await store.get<number>(LAST_CHECK_KEY);
  if (!isCheckDue(lastCheckedAt, Date.now())) return;

  await store.set(LAST_CHECK_KEY, Date.now());
  await store.save();

  const update = await check();
  if (!update) return;
  console.info(`[updater] ${UPDATE_AVAILABLE_EVENT}`);
  await emit(UPDATE_AVAILABLE_EVENT, {
    version: update.version,
    currentVersion: update.currentVersion,
  });
}
