// Gym mode v2 (local patch 0003, api/gymv2/index.js): one gym, trainers lead every client.
// The texts are Polish and English only, kept here rather than in the locale packs, so the patch
// stays one self-contained piece on top of upstream.
import { api } from './api.js'
import { getLang } from './i18n-core.js'
import { MOBILE } from './mobile.js'
import { appBase } from './app-base.js'

const W = {
  gym: ['Siłownia', 'Gym'],
  gymSub: ['Klienci, trenerzy i dołączanie', 'Clients, trainers and joining'],
  back: ['Wstecz', 'Back'],
  loading: ['Ładowanie…', 'Loading…'],
  clients: ['Klienci siłowni', 'Gym clients'],
  clientsFoot: ['Każdy trener siłowni widzi i prowadzi każdego klienta. Konto bez hasła założył trener; wyślij klientowi link zaproszenia, żeby je przejął.', 'Every trainer of the gym sees and leads every client. An account without a password was made by a trainer; send the client an invite link to take it over.'],
  noClients: ['Nie ma jeszcze klientów. Dodaj pierwszego poniżej albo daj komuś kod siłowni.', 'No clients yet. Add the first one below, or give someone the gym code.'],
  lead: ['Prowadź jako klient', 'Lead as client'],
  virtual: ['konto trenera, bez hasła', 'made by a trainer, no password'],
  own: ['własne konto', 'own account'],
  workoutsN: ['treningów: {0}', 'workouts: {0}'],
  lastW: ['ostatni: {0}', 'last: {0}'],
  never: ['jeszcze bez treningu', 'no workout yet'],
  newClient: ['Nowy klient', 'New client'],
  newClientFoot: ['Konto bez e-maila i hasła. Od razu należy do siłowni i do wszystkich trenerów.', 'An account with no e-mail or password. It belongs to the gym and all its trainers at once.'],
  clientName: ['Imię i nazwisko lub pseudonim', 'Name or nickname'],
  create: ['Utwórz konto klienta', 'Create client account'],
  created: ['Konto klienta „{0}” utworzone', 'Client account “{0}” created'],
  invite: ['Link zaproszenia', 'Invite link'],
  inviteHow: ['Wyślij ten link klientowi (SMS, komunikator). Działa raz, do {0}. Klient ustawi hasło i przejmie konto z całą historią.', 'Send this link to the client. It works once, until {0}. The client sets a password and takes the account over with its whole history.'],
  copy: ['Kopiuj', 'Copy'],
  share: ['Udostępnij', 'Share'],
  copied: ['Skopiowano', 'Copied'],
  inviteOpen: ['zaproszenie ważne do {0}', 'invite valid until {0}'],
  history: ['Dziennik zmian', 'Change log'],
  noHistory: ['Brak wpisów.', 'Nothing logged.'],
  code: ['Kod siłowni', 'Gym code'],
  codeFoot: ['Osoba z własnym kontem wpisuje ten kod w Ustawienia → Konto → Siłownia i od razu daje trenerom pełny dostęp. Możesz też wysłać link.', 'Someone with their own account enters this code in Settings → Account → Gym and gives the trainers full access at once. You can also send the link.'],
  noCode: ['Brak aktywnego kodu', 'No active code'],
  newCode: ['Nowy kod (stary przestaje działać)', 'New code (the old one stops working)'],
  makeCode: ['Utwórz kod', 'Make a code'],
  codeLink: ['Link do dołączenia', 'Join link'],
  validTo: ['ważny do {0}', 'valid until {0}'],
  trainers: ['Trenerzy', 'Trainers'],
  trainersFoot: ['Tylko admin nadaje i odbiera rolę trenera. Trener nie może być klientem, a admin nie może dołączyć jako klient.', 'Only an admin gives and takes the trainer role. A trainer cannot be a client, and an admin cannot join as one.'],
  isTrainer: ['Trener', 'Trainer'],
  isAdmin: ['admin', 'admin'],
  isClient: ['klient', 'client'],
  gymName: ['Nazwa siłowni', 'Gym name'],
  save: ['Zapisz', 'Save'],
  saved: ['Zapisano', 'Saved'],
  you: ['To Ty', 'You'],
  memberTitle: ['Jesteś w siłowni {0}', 'You are in {0}'],
  memberSub: ['Trenerzy siłowni widzą i prowadzą Twoje konto treningowe.', 'The gym\'s trainers see and lead your training account.'],
  trainersList: ['Trenerzy: {0}', 'Trainers: {0}'],
  leave: ['Opuść siłownię', 'Leave the gym'],
  leaveQ: ['Opuścić siłownię?', 'Leave the gym?'],
  leaveMsg: ['Trenerzy od razu tracą dostęp do Twojego konta. Twoje treningi zostają u Ciebie.', 'The trainers lose access to your account at once. Your workouts stay yours.'],
  left: ['Opuściłeś siłownię', 'You left the gym'],
  joinTitle: ['Dołącz do siłowni', 'Join the gym'],
  joinCode: ['Kod siłowni (SIL-…)', 'Gym code (SIL-…)'],
  agree: ['Rozumiem i daję tę zgodę', 'I understand and give this consent'],
  join: ['Dołączam', 'Join'],
  joined: ['Dołączyłeś do siłowni', 'You joined the gym'],
  consentHead: ['Co oznacza dołączenie', 'What joining means'],
  staffNoJoin: ['Jako trener lub admin nie dołączasz jako klient.', 'As a trainer or admin you do not join as a client.'],
  leading: ['Prowadzisz: {0}', 'Leading: {0}'],
  backToMine: ['Wróć do swojego konta', 'Back to my account'],
  switching: ['Przełączanie…', 'Switching…'],
  actingNoAccount: ['Prowadzisz konto klienta. Hasło, e-mail, klucze dostępu i usuwanie konta są niedostępne.', 'You are leading a client\'s account. Password, e-mail, passkeys and deleting the account are not available.'],
  claimTitle: ['Twoje konto w {0}', 'Your account at {0}'],
  claimLead: ['Trener założył dla Ciebie konto „{0}”. Ustaw hasło, a konto będzie Twoje razem z całą historią treningów.', 'A trainer made the account “{0}” for you. Set a password and the account is yours, with its whole training history.'],
  login: ['Nazwa logowania: {0}', 'Sign-in name: {0}'],
  pw: ['Hasło (min. 8 znaków)', 'Password (at least 8 characters)'],
  pw2: ['Powtórz hasło', 'Repeat the password'],
  email: ['E-mail (opcjonalnie, można nim się logować)', 'E-mail (optional, you can sign in with it)'],
  claim: ['Ustaw hasło i przejmij konto', 'Set password and take over'],
  pwMismatch: ['Hasła nie są takie same.', 'The passwords are not the same.'],
  linkBad: ['Ten link nie działa: wygasł albo został już użyty. Poproś trenera o nowy.', 'This link does not work: it expired or was used already. Ask your trainer for a new one.'],
  signedInAs: ['Jesteś teraz zalogowany jako {0}. Przejęcie konta przełączy tę przeglądarkę na konto klienta.', 'You are signed in as {0}. Taking over switches this browser to the client\'s account.'],
  welcome: ['Witaj, {0}! Konto jest Twoje.', 'Welcome, {0}! The account is yours.'],
  ev_created: ['konto założone przez {0}', 'account made by {0}'],
  ev_invite: ['{0} utworzył link zaproszenia', '{0} made an invite link'],
  ev_claimed: ['klient przejął konto', 'the client took the account over'],
  ev_joined: ['dołączył do siłowni', 'joined the gym'],
  ev_left: ['opuścił siłownię', 'left the gym'],
  'ev_act-start': ['{0} zaczął prowadzić konto', '{0} started leading'],
  'ev_act-end': ['{0} wrócił do swojego konta', '{0} went back to their account'],
  ev_write: ['{0}: {1}', '{0}: {1}'],
  w_added: ['dodany trening', 'workout added'],
  w_removed: ['usunięty trening', 'workout removed'],
  w_changed: ['zmieniony trening', 'workout changed'],
  r_added: ['dodany plan', 'routine added'],
  r_removed: ['usunięty plan', 'routine removed'],
  r_changed: ['zmieniony plan', 'routine changed'],
  bw: ['waga ciała', 'body weight'],
  ms: ['pomiary', 'measurements'],
  other: ['ustawienia ({0})', 'settings ({0})'],
  // Joint training (patch 0004)
  mergeHint: ['Gdy klient ma trening na zegarku/w aplikacji, wpisuj ćwiczenia przez Prowadź jako klient — po zakończeniu obu treningów zapisy połączą się w jeden.', 'When the client has a workout running on the watch/in the app, log the exercises through Lead as client — once both workouts are finished, they are joined into one.'],
  ev_merge: ['scalono trening trenera {0} z treningiem z zegarka{1}', 'joined trainer {0}\'s workout with the watch workout{1}'],
  'ev_merge-again': ['ponownie scalono trening trenera {0} (urządzenie przysłało starszą wersję)', 'joined trainer {0}\'s workout again (a device sent an older copy)'],
  'ev_merge-skip': ['nie scalono treningu trenera {0}: kilka treningów pasuje czasem, scal ręcznie', 'trainer {0}\'s workout not joined: more than one workout fits the time'],
  'ev_merge-undo': ['{0} cofnął scalenie treningów', '{0} undid a joint-training join'],
  undoMerge: ['Cofnij scalenie', 'Undo the join'],
  undoMergeQ: ['Cofnąć scalenie?', 'Undo the join?'],
  undoMergeMsg: ['Trening „{0}” ({1}) wróci do dwóch osobnych treningów: z zegarka klienta i wpisany przez trenera {2}.', 'The workout “{0}” ({1}) goes back to two workouts: the client\'s watch workout and the one trainer {2} logged.'],
  undoMergeDone: ['Scalenie cofnięte', 'Join undone'],
  mergedN: ['scalone: {0}', 'joined: {0}'],
  err: ['Nie udało się: {0}', 'That did not work: {0}'],
  e_name_taken: ['Ta nazwa jest już zajęta. Dodaj np. inicjał nazwiska.', 'That name is taken. Add an initial, for example.'],
  e_code_invalid: ['Ten kod siłowni nie działa.', 'That gym code does not work.'],
  'e_too-short': ['Hasło jest za krótkie.', 'The password is too short.'],
  'e_too-common': ['To hasło jest zbyt proste.', 'That password is too easy to guess.'],
  'e_email-taken': ['Ten e-mail ma już inne konto.', 'Another account uses that e-mail.'],
  'e_email-invalid': ['To nie jest adres e-mail.', 'That is not an e-mail address.'],
  'e_acting-forbidden': ['Tego nie można zrobić, prowadząc konto klienta.', 'Not possible while leading a client\'s account.'],
}

const isPl = () => String(getLang() || '').toLowerCase().startsWith('pl')
export function g(key, ...args) {
  const pair = W[key]
  let s = pair ? (isPl() ? pair[0] : pair[1]) : key
  args.forEach((a, i) => { s = s.split('{' + i + '}').join(String(a)) })
  return s
}
export const gErr = e => {
  const code = e?.data?.code
  if (code === 'name-taken') return g('e_name_taken')
  if (code === 'code-invalid') return g('e_code_invalid')
  if (code && W['e_' + code]) return g('e_' + code)
  return g('err', e?.message || '?')
}
export const fmtDay = iso => { try { return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(isPl() ? 'pl-PL' : undefined, { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return String(iso) } }
export const fmtWhen = ms => { try { return new Date(ms).toLocaleString(isPl() ? 'pl-PL' : undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })
export const gymStatus = () => api('/api/gymv2/status')
export const gymClients = () => api('/api/gymv2/clients')
export const createClient = name => post('/api/gymv2/clients', { name })
export const makeInvite = id => post('/api/gymv2/invite', { id })
export const lookInvite = c => api('/api/gymv2/invite?c=' + encodeURIComponent(c))
export const claimInvite = (c, password, email, consent) => post('/api/gymv2/invite/claim', { c, password, email, consent })
export const gymCode = () => api('/api/gymv2/code')
export const newGymCode = () => post('/api/gymv2/code')
export const joinGym = (code, consent) => post('/api/gymv2/join', { code, consent })
export const leaveGym = () => post('/api/gymv2/leave')
export const gymUsers = () => api('/api/gymv2/users')
export const setTrainer = (id, trainer) => post('/api/gymv2/trainer', { id, trainer })
export const setGymName = name => post('/api/gymv2/name', { name })
export const clientLog = id => api('/api/gymv2/log?id=' + encodeURIComponent(id))
export const undoMerge = id => post('/api/gymv2/merge/undo', { id })

// The address of a page of this app, for a link sent to someone (hash router).
export const appLink = hashPath => location.origin + appBase().replace(/\/?$/, '/') + '#' + hashPath
export const inviteLink = token => appLink('/zaproszenie?c=' + encodeURIComponent(token))
export const joinLink = code => appLink('/silownia?kod=' + encodeURIComponent(code))

// The act token for a paired phone (a bearer, no cookie jar): api.js sends it as X-OpenGym-Act.
export const ACT_KEY = 'gym_act_token'
const keepAct = tok => { try { if (tok) localStorage.setItem(ACT_KEY, tok); else localStorage.removeItem(ACT_KEY) } catch { /* the cookie still works in a browser */ } }

// Switching accounts goes through a reload: the app then boots as the account the server now
// names (useStore boot → setUser), and the store's own account switch keeps what the previous
// account still owed, and a workout running for it, aside for it (keepForPrevious, applyStash).
async function settleThenReload(store, hashPath) {
  try { await store.getState().pushState() } catch { /* still owed: kept aside by the switch */ }
}
export async function startLeading(store, clientId) {
  await settleThenReload(store)
  const r = await post('/api/gymv2/act', { id: clientId })
  if (MOBILE) keepAct(r.token)
  location.hash = '#/home'
  location.reload()
}
export async function stopLeading(store) {
  await settleThenReload(store)
  try { await post('/api/gymv2/act/end') } finally {
    keepAct(null)
    location.hash = '#/silownia'
    location.reload()
  }
}

// One line of the change log, in words.
export function logLine(e) {
  const by = e.by?.name || '?'
  if (e.ev === 'merge') return g('ev_merge', by, e.d ? ' (' + fmtDay(e.d) + ')' : '')
  if (e.ev !== 'write') return g('ev_' + e.ev, by)
  const c = e.changes || {}, parts = []
  const add = (k, list, label) => { for (const x of list || []) parts.push(g(k) + (label(x) ? ' ' + label(x) : '')) }
  const wl = x => [x.name, x.d ? fmtDay(x.d) : ''].filter(Boolean).join(', ')
  add('w_added', c.workouts?.added, wl); add('w_changed', c.workouts?.changed, wl); add('w_removed', c.workouts?.removed, wl)
  add('r_added', c.routines?.added, x => x.name); add('r_changed', c.routines?.changed, x => x.name); add('r_removed', c.routines?.removed, x => x.name)
  if (c.bodyweight) parts.push(g('bw'))
  if (c.measurements) parts.push(g('ms'))
  if (c.other?.length) parts.push(g('other', c.other.length))
  return g('ev_write', by, parts.join('; ') || '…')
}
