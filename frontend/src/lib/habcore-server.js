// Habcore Gym: the gym's own server. The phone app always talks to it (patch 0014, kl12: no
// pairing, no server question); the public Terms and Privacy pages live beside it. A build for
// another address sets VITE_HABCORE_SERVER (after the move to the target server, see
// APP-STORE-PRYWATNOSC.md, step 7).
export const HABCORE_SERVER = ((import.meta.env || {}).VITE_HABCORE_SERVER || 'https://sv.metin2sp.pl/opengym').replace(/\/+$/, '')
