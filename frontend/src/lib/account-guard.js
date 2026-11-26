// Gym mode v2 (local patch 0003): the account the store believes it syncs, set by useStore
// setUser and read by lib/api.js, which names it (X-OpenGym-As) on every request for the document.
// A module of its own so the store does not need lib/api.js for it (tests mock that one).
let expected = null
export function setExpectedAccount(uid) { expected = uid || null }
export const expectedAccount = () => expected
