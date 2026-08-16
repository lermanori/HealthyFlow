export const WEEK_VIEW_ENABLED = import.meta.env?.VITE_WEEK_VIEW_ENABLED === 'true'
export const DAILY_SIGNALS_ENABLED = import.meta.env?.VITE_DAILY_SIGNALS_ENABLED === 'true'
/**
 * Work — Projects, Focus blocks and Work sessions.
 *
 * Opt-in like every other release flag, so production hides it until the var is
 * set. Nothing is deleted and the server is untouched: Work keeps storing and
 * returning Focus blocks, and Talk's work-planning workflow keeps running. This
 * flag governs only what a user can reach.
 */
export const WORK_ENABLED = import.meta.env?.VITE_WORK_ENABLED === 'true'
