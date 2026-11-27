/* Habcore Gym (local patch 0013, kl11): the Terms (Regulamin) and the Privacy policy (Polityka
 * prywatności), and the explicit consent to process health data (GDPR art. 9(2)(a)).
 *
 * On with LEGAL=on. Then a new profile is made only with both boxes ticked (password sign-up,
 * passkey sign-up, a client taking over an account a trainer made), and a profile that has not
 * accepted the current version is asked once, at its next sign-in (POST /api/account/legal).
 * What is kept, on the user row in db.json (no schema: the file is JSON):
 *   legal: { v: '<version>', at: '<ISO time>', terms: true, health: true, via: 'register' | 'invite' | 'prompt' }
 * The documents themselves are static pages of the web image (frontend/public/regulamin, prywatnosc,
 * terms, privacy). Raising LEGAL_VERSION asks everyone again. */
export const LEGAL_VERSION = '2026-11-28';
export const legalOn = env => /^(1|true|yes|on)$/i.test(String(env || ''));
/** Whether a request body's `legal` is a full acceptance of the current version. */
export const legalAccepted = b => !!b && typeof b === 'object' && b.v === LEGAL_VERSION && b.terms === true && b.health === true;
export const legalRecord = via => ({ v: LEGAL_VERSION, at: new Date().toISOString(), terms: true, health: true, via });
export const legalCurrent = u => !!u?.legal && u.legal.v === LEGAL_VERSION && u.legal.terms === true && u.legal.health === true;
export const LEGAL_REQUIRED = { error: 'accept the Terms and the Privacy policy, and the processing of health data', code: 'legal-required', legal: { v: LEGAL_VERSION } };
