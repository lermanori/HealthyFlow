export const WEEK_VIEW_ENABLED = import.meta.env?.VITE_WEEK_VIEW_ENABLED === 'true'
export const DAILY_SIGNALS_ENABLED = import.meta.env?.VITE_DAILY_SIGNALS_ENABLED === 'true'
/** Deferred v1.1 capability. Free v1 has no Cloud entitlement to inspect or sync. */
export const CLOUD_SYNC_ENABLED = import.meta.env?.VITE_CLOUD_SYNC_ENABLED === 'true'
/** Staged behind #256–#258 until native Google Calendar sync is complete. */
/**
 * Work — Projects, Focus blocks and Work sessions.
 *
 * Opt-in like every other release flag, so production hides it until the var is
 * set. Nothing is deleted and the server is untouched: Work keeps storing and
 * returning Focus blocks, and Talk's work-planning workflow keeps running. This
 * flag governs only what a user can reach.
 */
export const WORK_ENABLED = import.meta.env?.VITE_WORK_ENABLED === 'true'
