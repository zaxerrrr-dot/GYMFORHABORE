// Gym mode v2 (local patch 0003, api/gymv2/index.js): one gym, trainers lead every client.
// The texts are Polish and English only, kept here rather than in the locale packs, so the patch
// stays one self-contained piece on top of upstream.
import { api, remoteAuth } from './api.js'
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
  // Live joint training (patch 0006)
  liveNow: ['{0} trenuje teraz', '{0} is training now'],
  liveJoinWorkout: ['Dołącz do treningu', 'Join the workout'],
  // Group training (patch 0006)
  groupTitle: ['Trening grupowy', 'Group workout'],
  groupStart: ['Trenuj z grupą ({0})', 'Train the group ({0})'],
  groupPickHint: ['Zaznacz 2–5 osób, żeby trenować je naraz.', 'Tick 2–5 people to train them at once.'],
  groupResume: ['Wróć do treningu grupowego', 'Back to the group workout'],
  groupStarting: ['Uruchamianie treningów…', 'Starting the workouts…'],
  groupNone: ['Brak treningu grupowego. Wybierz klientów na ekranie Start.', 'No group workout. Pick clients on the Home screen.'],
  addAlso: ['Dodaj też:', 'Add for:'],
  addEx: ['Dodaj ćwiczenie', 'Add exercise'],
  addSet: ['Dodaj serię', 'Add set'],
  removeEx: ['Usuń ćwiczenie', 'Remove exercise'],
  nextPerson: ['Dalej: {0}', 'Next: {0}'],
  finishOne: ['Zakończ: {0}', 'Finish: {0}'],
  finishAll: ['Zakończ wszystkie', 'Finish all'],
  finishAllQ: ['Zakończyć treningi wszystkich?', 'Finish everyone\'s workout?'],
  finishAllMsg: ['Każdy trening zapisze się na koncie swojej osoby (z telefonem klienta – na jego telefonie).', 'Each workout is saved in its own person\'s account (with the client\'s phone there, on that phone).'],
  restLeft: ['przerwa {0}', 'rest {0}'],
  restOver: ['przerwa minęła', 'rest over'],
  lastHint: ['ostatnio {0} kg × {1}', 'last {0} kg × {1}'],
  firstTime: ['pierwszy raz', 'first time'],
  phoneHere: ['telefon klienta połączony', 'client\'s phone connected'],
  phoneAway: ['bez telefonu klienta – zapisze trener', 'no client phone – the trainer saves it'],
  savedPhone: ['{0}: zapisuje telefon klienta', '{0}: the client\'s phone saves it'],
  savedServer: ['{0}: zapisano na koncie klienta', '{0}: saved in the client\'s account'],
  endedTag: ['zakończony', 'finished'],
  emptyWorkout: ['Dodaj pierwsze ćwiczenie.', 'Add the first exercise.'],
  setN: ['Seria {0}', 'Set {0}'],
  weightL: ['Ciężar', 'Weight'],
  repsL: ['Powt.', 'Reps'],
  doneL: ['zrobiona', 'done'],
  more: ['Zwiększ', 'More'],
  less: ['Zmniejsz', 'Less'],
  remove: ['Usuń', 'Remove'],
  trainAs: ['Trenuj jako klient', 'Train as client'],
  allClients: ['Wszyscy klienci', 'All clients'],
  liveJoin: ['Klient trenuje teraz – dołącz', 'Client is training now – join'],
  liveJoinShort: ['Dołącz', 'Join'],
  liveInfo: ['{0} · ćwiczeń: {1} · serie {2}/{3}', '{0} · exercises: {1} · sets {2}/{3}'],
  liveJoined: ['Dołączono do treningu klienta na żywo', 'Joined the client\'s live workout'],
  liveStarted: ['Trener rozpoczął trening na żywo', 'Your trainer started a live workout'],
  liveEnded: ['Trening zakończony na drugim urządzeniu ({0})', 'The workout ended on the other device ({0})'],
  liveEndedSaved: ['zapisany', 'saved'],
  liveEndedDiscarded: ['odrzucony', 'discarded'],
  liveLeft: ['Wyszedłeś z treningu klienta – trwa dalej u klienta', 'You left the client\'s workout – it goes on for the client'],
  liveFinishSent: ['Klient zapisze trening na swoim telefonie (Apple Zdrowie)', 'The client\'s phone saves the workout (Apple Health)'],
  liveOther: ['Na koncie trwa już inny trening na żywo – ten zostaje tylko na tym urządzeniu', 'Another live workout is running on this account – this one stays on this device only'],
  liveBadge: ['NA ŻYWO', 'LIVE'],
  liveWith: ['Na żywo z: {0}', 'Live with: {0}'],
  liveClientAway: ['telefon klienta poza zasięgiem', 'client\'s phone out of reach'],
  'ev_lang-set': ['język konta ustawiony jak u trenera', 'account language set to the trainer\'s'],
  'ev_live-saved': ['{0}: trening na żywo zapisany', '{0}: live workout saved'],
  'ev_live-discarded': ['{0}: trening na żywo odrzucony', '{0}: live workout discarded'],
  'ev_live-finish-request': ['{0}: zakończył trening na żywo (zapis na telefonie klienta)', '{0}: finished the live workout (saved on the client\'s phone)'],
  // Full client list and saved groups (patch 0006.2)
  pickOneTitle: ['Trenuj jako klient – kogo?', 'Train as client – who?'],
  pickGroupTitle: ['Trening grupowy – kogo?', 'Group workout – who?'],
  searchName: ['Szukaj po imieniu', 'Search by name'],
  pickedN: ['Wybrano: {0}', 'Picked: {0}'],
  pickRange: ['2–5 osób', '2–5 people'],
  pickMin: ['Zaznacz co najmniej 2 osoby', 'Tick at least 2 people'],
  pickMax: ['To już 5 osób – więcej się nie da', 'That is 5 people – no more'],
  pickTop: ['Trenują teraz i ostatnio prowadzeni', 'Training now and led recently'],
  pickAll: ['Wszyscy klienci (A–Z)', 'All clients (A–Z)'],
  pickNone: ['Nikt nie pasuje do „{0}”.', 'Nobody matches “{0}”.'],
  trainShort: ['Trenuj', 'Train'],
  findClient: ['Znajdź klienta', 'Find a client'],
  trainGroupBtn: ['Trenuj z grupą', 'Train the group'],
  groupGo: ['Trenuj z grupą ({0})', 'Train the group ({0})'],
  saveAsGroup: ['Zapisz jako grupę', 'Save as a group'],
  groupSaveBtn: ['Zapisz grupę', 'Save the group'],
  groupName: ['Nazwa grupy', 'Group name'],
  groupNameHint: ['np. „Bartek + Sylwek” albo „Poniedziałek 18:00”', 'e.g. “Bart + Sylvester” or “Monday 6 pm”'],
  groupSaved: ['Grupa „{0}” zapisana', 'Group “{0}” saved'],
  groups: ['Grupy', 'Groups'],
  groupsFoot: ['Grupy są wspólne dla całej siłowni – widzi je każdy trener. Ktoś, kto opuści siłownię, sam znika z grup.', 'Groups belong to the whole gym – every trainer sees them. Someone who leaves the gym drops out of the groups by themselves.'],
  noGroups: ['Brak zapisanych grup. Wybierz osoby w „Trenuj z grupą” i dotknij „Zapisz jako grupę”.', 'No saved groups. Pick people in “Train the group” and tap “Save as a group”.'],
  groupEdit: ['Edytuj', 'Edit'],
  groupEditTitle: ['Edytuj grupę', 'Edit the group'],
  groupSaveChanges: ['Zapisz zmiany', 'Save changes'],
  groupDelete: ['Usuń grupę', 'Delete the group'],
  groupDeleteQ: ['Usunąć grupę „{0}”?', 'Delete the group “{0}”?'],
  groupDeleteMsg: ['Grupa zniknie u wszystkich trenerów. Treningi klientów zostają.', 'The group goes for every trainer. The clients\' workouts stay.'],
  groupDeleted: ['Grupa usunięta', 'Group deleted'],
  groupTooSmall: ['za mało osób – dodaj kogoś w „Edytuj”', 'too few people – add someone in “Edit”'],
  groupSaveQ: ['Zapisać tę grupę?', 'Save this group?'],
  groupSaveQMsg: ['Następnym razem uruchomisz ją jednym dotknięciem na Starcie.', 'Next time you start it with one tap on Home.'],
  groupNotNow: ['Nie, dziękuję', 'No, thanks'],
  groupAllDone: ['Wszyscy skończyli. Treningi są zapisane.', 'Everyone is done. The workouts are saved.'],
  backHome: ['Wróć do Startu', 'Back to Home'],
  cancel: ['Anuluj', 'Cancel'],
  'ev_group-create': ['{0} zapisał grupę{1}', '{0} saved the group{1}'],
  'ev_group-edit': ['{0} zmienił grupę{1}', '{0} changed the group{1}'],
  'ev_group-add': ['{0} dodał do grupy{1}', '{0} added to the group{1}'],
  'ev_group-remove': ['{0} usunął z grupy{1}', '{0} took out of the group{1}'],
  'ev_group-delete': ['{0} usunął grupę{1}', '{0} deleted the group{1}'],
  'ev_group-left': ['ktoś opuścił siłownię – zniknął z grupy{1}', 'someone left the gym – out of the group{1}'],
  'e_group-size': ['Grupa to 2–5 osób.', 'A group is 2–5 people.'],
  'e_group-name': ['Wpisz nazwę grupy.', 'Enter the group\'s name.'],
  'e_group-not-client': ['W grupie mogą być tylko klienci siłowni.', 'Only the gym\'s clients can be in a group.'],
  'e_no-answer': ['Brak odpowiedzi serwera. Sprawdź internet; jeśli działa – dodatek blokujący reklamy w przeglądarce mógł zablokować to okno (wyłącz go dla tej strony).', 'No answer from the server. Check the internet; if it works, an ad-blocking add-on may have stopped this (turn it off for this site).'],
  'e_not-found': ['Tego już nie ma (ktoś inny to usunął).', 'That is gone (someone else removed it).'],
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
  // No answer at all (offline, or a browser add-on stopped the request): say so in words.
  if (!e?.status && /failed to fetch|networkerror|load failed/i.test(String(e?.message || ''))) return g('e_no-answer')
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
export const claimInvite = (c, password, email, consent, legal) => post('/api/gymv2/invite/claim', { c, password, email, consent, ...(legal ? { legal } : {}) })
export const gymCode = () => api('/api/gymv2/code')
export const newGymCode = () => post('/api/gymv2/code')
export const joinGym = (code, consent) => post('/api/gymv2/join', { code, consent })
export const leaveGym = () => post('/api/gymv2/leave')
export const gymUsers = () => api('/api/gymv2/users')
export const setTrainer = (id, trainer) => post('/api/gymv2/trainer', { id, trainer })
export const setGymName = name => post('/api/gymv2/name', { name })
// Not "/log?id=": ad blockers (EasyPrivacy) drop that address before it leaves the browser (kl6.3).
export const clientLog = id => api('/api/gymv2/changes?u=' + encodeURIComponent(id))
export const undoMerge = id => post('/api/gymv2/merge/undo', { id })
// Saved groups (patch 0006.2): the gym's, every trainer's.
export const gymGroups = () => api('/api/gymv2/groups')
export const saveGroup = ({ id, name, members }) => (id ? post('/api/gymv2/groups/update', { id, name, members }) : post('/api/gymv2/groups', { name, members }))
export const deleteGroup = id => post('/api/gymv2/groups/delete', { id })
// The clients led last on this device first (Home's gym card, the client picker).
export function rememberLed(clientId) {
  try { const k = 'gymv2_recent'; const v = JSON.parse(localStorage.getItem(k) || '[]'); localStorage.setItem(k, JSON.stringify([clientId, ...(Array.isArray(v) ? v : []).filter(x => x !== clientId)].slice(0, 12))) } catch { /* order only */ }
}

// The address of a page of this app, for a link sent to someone (hash router).
// In the phone app the page is the app's own (capacitor://localhost): a link goes to the paired server.
export const appLink = hashPath => {
  const remote = MOBILE ? remoteAuth()?.base : null
  if (remote) return remote.replace(/\/?$/, '/') + '#' + hashPath
  return location.origin + appBase().replace(/\/?$/, '/') + '#' + hashPath
}
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
// While leading a client the app speaks the TRAINER's language, not the client account's (patch
// 0006.1): kept here when the trainer starts leading, read by App.jsx while `user.acting`.
export const ACTOR_LANG_KEY = 'gymv2_actor_lang'
export function actorLang() {
  try { const v = localStorage.getItem(ACTOR_LANG_KEY); return v && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(v) ? v : null } catch { return null }
}
export async function startLeading(store, clientId, hashPath = '#/home') {
  try { const l = getLang(); if (l) localStorage.setItem(ACTOR_LANG_KEY, l) } catch { /* the client's own language then */ }
  // Home's gym card puts the clients led last first (components/GymHomeCard.jsx).
  rememberLed(clientId)
  await settleThenReload(store)
  const r = await post('/api/gymv2/act', { id: clientId })
  if (MOBILE) keepAct(r.token)
  location.hash = hashPath
  location.reload()
}
// Live joint training (patch 0006): who of the gym's clients trains right now (a trainer's banner).
export const liveNow = () => api('/api/gymv2/live-now')
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
  // Saved groups (patch 0006.2); a client reading their own log gets no group name.
  if (String(e.ev).startsWith('group-')) {
    const nm = e.group?.name ? ` „${e.group.name}”` : ''
    const was = e.from && e.from !== e.group?.name ? ` (${isPl() ? 'było' : 'was'} „${e.from}”)` : ''
    if (e.ev === 'group-edit' && !e.by) return g('ev_group-left', '', nm)
    return g('ev_' + e.ev, by, nm + was)
  }
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
