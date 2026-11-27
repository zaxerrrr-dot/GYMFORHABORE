// Mobile build only: "connect to my server" mode (see mobile.js's header comment for why the
// mobile flavor has no backend at all by default). This is the alternative — pairing the app to
// an already self-hosted Habcore Gym server instead of keeping data device-local.
//
// Passkeys can't be used from inside the app's own WebView (its origin never matches the
// server's RP_ID), so auth here is a short one-time code redeemed from an already signed-in
// browser tab (Settings → "Pair the mobile app") for a bearer token — see api/server.js's
// /api/pair/create + /api/pair/redeem.
import { pairRedeem, setRemoteAuth, currentRemoteBase, appSignInRequest } from './api.js'
import { HABCORE_SERVER } from './habcore-server.js'
import { phoneSignIn } from './oidc-app.js'
import { loadRemoteFile, saveRemoteFile } from './mobile.js'
import { clearCfAccess } from './cf-access.js'

// Accepts what someone actually types: bare host, no scheme, trailing slash, stray whitespace.
// Defaults to https:// (self-hosting docs already push for HTTPS; the one exception, localhost,
// still parses fine without a scheme). Returns null for anything that isn't a usable URL at all.
export function normalizeServerUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s
  try {
    const u = new URL(withScheme)
    if (!u.hostname) return null
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch (e) { return null }
}

export async function loadRemote() {
  return loadRemoteFile()
}

export async function chooseLocal() {
  await saveRemoteFile({ mode: 'local' })
}

// The server's Cloudflare Access token goes with it (lib/cf-access.js).
export async function forgetRemote() {
  await saveRemoteFile({ mode: 'local' })
  setRemoteAuth('', null)
  await clearCfAccess()
}

// The server renewed the token (GET /api/me hands one out once the old is past half its life):
// every request from now on carries it, and the pairing file keeps it for the next start. The
// old one stays valid until its own expiry, so a write that fails here costs nothing but a
// renewal on a later start.
export async function renewToken(remote, token) {
  setRemoteAuth(remote.base, token)
  await saveRemoteFile({ ...remote, token })
}

// Redeems the pairing code, wires api.js at the resolved base, and persists the connection so
// boot() can restore it on the next launch.
export async function connect(rawUrl, code) {
  const base = normalizeServerUrl(rawUrl)
  if (!base) throw new Error('Enter a valid server address')
  const { token, user } = await pairRedeem(base, String(code || '').trim())
  setRemoteAuth(base, token)
  await saveRemoteFile({ mode: 'remote', base, token, user })
  return user
}

// The same, through the server's identity provider instead of a pairing code (lib/oidc-app.js).
export async function connectWithProvider(rawUrl, label, signIn = phoneSignIn) {
  const base = normalizeServerUrl(rawUrl)
  if (!base) throw new Error('Enter a valid server address')
  const { token, user } = await signIn(base, label)
  setRemoteAuth(base, token)
  await saveRemoteFile({ mode: 'remote', base, token, user })
  return user
}

// Habcore Gym (patch 0014, kl12): the app signs in with the site's name and password, straight
// against the gym's server, with no pairing. The server's /api/app/* routes answer the same bearer
// token a pairing gave (and no cookie); it is kept in the same file, so boot() restores it the way
// it restored a pairing. A phone paired before keeps its address; a new one uses HABCORE_SERVER.
export function appServer(remote) {
  return normalizeServerUrl(remote?.base) || HABCORE_SERVER
}
async function appAuth(path, body) {
  const base = currentRemoteBase() || HABCORE_SERVER
  const { token, user } = await appSignInRequest(base, path, body)
  setRemoteAuth(base, token)
  await saveRemoteFile({ mode: 'remote', base, token, user })
  return user
}
export const appPasswordLogin = (name, password) => appAuth('/api/app/login', { name, password })
export const appPasswordRegister = (name, password, code, email, legal) =>
  appAuth('/api/app/register', { name, password, code: code || '', ...(email ? { email } : {}), ...(legal ? { legal } : {}) })
export const appPasswordReset = (name, code, next) => appAuth('/api/app/password-reset', { name, code, next })
export const appRecover = (code, next) => appAuth('/api/app/recover', { code, next })
// Signed out (or the account deleted): the token goes, the address stays, and the next start
// opens on the sign-in screen. The server has already revoked the token (POST /api/logout).
export async function forgetAppToken() {
  const base = currentRemoteBase() || HABCORE_SERVER
  setRemoteAuth(base, null)
  await saveRemoteFile({ mode: 'remote', base, token: null })
}
