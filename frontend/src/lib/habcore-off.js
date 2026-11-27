// Habcore Gym (local patch 0013, kl11): parts of upstream this app does not offer, switched off for
// the whole build. Each comes back only with its build variable set to 1 (the test suite sets them,
// so upstream's own tests keep covering that code):
//   VITE_AI_COACH  the AI Coach (CoachChat/Setup/Intake, the admin's Coach card, "Use your
//                  subscription" / Assistants, the OpenRouter sign-in). The server has its own lock
//                  (AI_COACH, off): its Coach routes answer 410.
//   VITE_ZEPP      the Zepp OS watch page and the watch relay (the server's /api/watch/* are off
//                  without ZEPP=1). Garmin, Apple Watch and Wear OS stay.
//   VITE_CHECKIN   "Gym check-in": membership codes on Home and the NFC stickers (the gym has RFID
//                  cards). The codes people saved stay in their data (S.gymCards), unused and unshown.
// import.meta.env is Vite's: plain node (the api's tests import some of these modules) has none.
const env = import.meta.env || {}
export const AI_BUILT = env.VITE_AI_COACH === '1'
export const ZEPP_BUILT = env.VITE_ZEPP === '1'
export const CHECKIN_BUILT = env.VITE_CHECKIN === '1'
// The integrations below come back only with VITE_INTEGRATIONS_FULL=1 (the test suite).
export const INTEGRATIONS_FULL = env.VITE_INTEGRATIONS_FULL === '1'
export const WEBDAV_BUILT = INTEGRATIONS_FULL
//   Integrations: no WebDAV backup, webhooks, MCP server, openNutrition (and no word of the
//                 "sister apps"), no Strava (until Strava approves it, STRAVA-WNIOSEK.md) and no
//                 personal API tokens (the server's API_TOKENS is off). The health stores, Hevy and
//                 file import, the CSV export and the calendar feed stay; so does the "Works with" list.
export const HABCORE_OFF_CARDS = [...(INTEGRATIONS_FULL ? [] : ['strava', 'webdav', 'webhook', 'mcp', 'opennutrition']), ...(AI_BUILT ? [] : ['coach'])]
/** Settings search rows of the parts above (views/settings-pages.js SEARCH titles). */
export const HABCORE_OFF_SEARCH = [...(INTEGRATIONS_FULL ? [] : ['Back up to WebDAV', 'WebDAV backup', 'Webhooks', 'MCP server', 'Strava', 'openNutrition']), ...(AI_BUILT ? [] : ['AI Coach'])]
/** Modules (lib/modules.js) this build does not have at all. */
export const HABCORE_OFF_MODULES = [!AI_BUILT && 'coach', !CHECKIN_BUILT && 'checkin'].filter(Boolean)
