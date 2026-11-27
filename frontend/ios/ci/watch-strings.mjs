#!/usr/bin/env node
// Writes the Apple Watch app's strings (ios/App/Watch/<lang>.lproj/Localizable.strings) in every
// language the app speaks. Words the app already has come from its own locale packs
// (frontend/src/locales), so the watch says "Done" exactly as the phone does; the few phrases only
// the watch uses are below. Run it after changing either, and commit what it writes:
//
//   node frontend/ios/ci/watch-strings.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'ios', 'App', 'Watch')
const widgets = join(root, 'ios', 'App', 'WatchWidgets')

// app pack → watch .lproj
const LANGS = {
  de: 'de', fr: 'fr', es: 'es', it: 'it', pt: 'pt-PT', 'pt-BR': 'pt-BR', pl: 'pl', hu: 'hu', tr: 'tr',
  ru: 'ru', uk: 'uk', ar: 'ar', hi: 'hi', bn: 'bn', th: 'th', ko: 'ko', zh: 'zh-Hans', 'zh-TW': 'zh-Hant',
  cs: 'cs', fa: 'fa', id: 'id', lt: 'lt', sv: 'sv', vi: 'vi',
  da: 'da',
}

// The watch's key (what the Swift source says) → the app's key, for words the app already has.
const FROM_APP = {
  'Today': 'Today',
  'Start workout': 'Start workout',
  'Done': 'Done',
  'Warm-up': 'Warm-up',
  'Reps': 'Reps',
  'Rest': 'Rest',
  'Skip': 'Skip',
  'Finish workout': 'Finish workout',
  'Discard workout': 'Discard workout',
  'Continue workout': 'Continue workout',
  'Cancel': 'Cancel',
  'Rest’s over. Next set!': 'Rest’s over. Next set!',
  'Left': 'Left',
  'Right': 'Right',
  'Superset': 'Superset',
  'Weight': 'Weight',
  'Sets': 'Sets',
  'Volume': 'Volume',
  'Time': 'Time',
  'Skip set': 'Skip set',
  'Personal records': 'PRs',
  'Quick check-in': 'Quick check-in',
  'Save & start workout': 'Save & start workout',
  'Start without weighing in': 'Start without weighing in',
  'Body weight': 'Body weight',
  'Effort': 'Effort',
  'Muscles': 'Muscles',
  'None': 'None',
  'Exercises': 'Exercises',
  'Save': 'Save',
  'Previous set': 'Previous set',
  'Next set': 'Next set',
  'Edit': 'Edit',
  'Overview': 'Overview',
  'Discard workout?': 'Discard workout?',
  'Up next': 'Up next',
  'How hard was that set?': 'How hard was that set?',
  'Waiting to sync': 'Waiting to sync',
  'All synced': 'All synced',
  'Go!': 'Go!',
  // Forgotten workouts (1.4.5), the phone's words.
  'Still training?': 'Still training?',
  'Looks like you left the gym': 'Looks like you left the gym',
  'Keep going': 'Keep going',
  'Finish now': 'Finish now',
  // watch-apple: the rest's ‹ (VoiceOver), the phone's word.
  'Back': 'Back',
}
// Built from an app word: "Last time: %@".
const COMPOSED = {
  'Last time: %@': ['Last time', w => `${w}: %@`],
  // The phone's sentence with the time it ends by itself in the place of {0}.
  'Nothing logged for a while. If you’re done, it ends by itself at %@, saved at your last set.':
    ['Nothing logged for a while. If you’re done, it ends by itself at {0}, saved at your last set.', w => w.replace('{0}', '%@')],
  'Finish the workout now? Otherwise it ends by itself at %@.':
    ['Finish the workout now? Otherwise it ends by itself at {0}.', w => w.replace('{0}', '%@')],
}

// Only the watch says these. %@ is a name, %lld a number, as the Swift source interpolates them.
const OWN = {
  'No workout running': {
    de: 'Kein Training läuft', fr: 'Aucune séance en cours', es: 'Ningún entreno en curso', it: 'Nessun allenamento in corso',
    'pt-PT': 'Nenhum treino a decorrer', 'pt-BR': 'Nenhum treino em andamento', pl: 'Żaden trening nie trwa', hu: 'Nincs folyamatban edzés',
    tr: 'Devam eden antrenman yok', ru: 'Тренировка не идёт', uk: 'Тренування не триває', ar: 'لا يوجد تمرين جارٍ',
    hi: 'कोई वर्कआउट नहीं चल रहा', bn: 'কোনো ওয়ার্কআউট চলছে না', th: 'ไม่มีการฝึกที่กำลังทำอยู่', ko: '진행 중인 운동이 없어요',
    'zh-Hans': '没有进行中的训练', 'zh-Hant': '沒有進行中的訓練',
    cs: 'Žádný trénink neběží', fa: 'هیچ تمرینی در جریان نیست', id: 'Tidak ada latihan berjalan', lt: 'Treniruotė nevyksta', sv: 'Inget pass pågår', vi: 'Không có buổi tập nào đang chạy',
  },
  // The start screen before anything came from the phone (it sends only while Habcore Gym runs there).
  'Not synced yet': {
    de: 'Noch nicht synchronisiert', fr: 'Pas encore synchronisé', es: 'Aún sin sincronizar', it: 'Non ancora sincronizzato',
    'pt-PT': 'Ainda não sincronizado', 'pt-BR': 'Ainda não sincronizado', pl: 'Jeszcze nie zsynchronizowano', hu: 'Még nincs szinkronizálva',
    tr: 'Henüz eşitlenmedi', ru: 'Ещё не синхронизировано', uk: 'Ще не синхронізовано', ar: 'لم تتم المزامنة بعد',
    hi: 'अभी सिंक नहीं हुआ', bn: 'এখনো সিঙ্ক হয়নি', th: 'ยังไม่ได้ซิงค์', ko: '아직 동기화되지 않았어요',
    'zh-Hans': '尚未同步', 'zh-Hant': '尚未同步',
    cs: 'Zatím nesynchronizováno', fa: 'هنوز همگام نشده', id: 'Belum disinkronkan', lt: 'Dar nesinchronizuota', sv: 'Inte synkat än', vi: 'Chưa đồng bộ',
  },
  'Open Habcore Gym on your iPhone once and your routines show up here.': {
    de: 'Öffne Habcore Gym einmal auf dem iPhone, dann tauchen deine Routinen hier auf.',
    fr: 'Ouvre Habcore Gym une fois sur ton iPhone et tes routines apparaissent ici.',
    es: 'Abre Habcore Gym una vez en tu iPhone y tus rutinas aparecerán aquí.',
    it: 'Apri Habcore Gym una volta sull’iPhone e le tue routine compariranno qui.',
    'pt-PT': 'Abre o Habcore Gym uma vez no iPhone e as tuas rotinas aparecem aqui.',
    'pt-BR': 'Abra o Habcore Gym uma vez no iPhone e suas rotinas aparecem aqui.',
    pl: 'Otwórz raz Habcore Gym na iPhonie, a twoje plany pojawią się tutaj.',
    hu: 'Nyisd meg egyszer az Habcore Gymet az iPhone-on, és itt lesznek a rutinjaid.',
    tr: 'Habcore Gym’i iPhone’unda bir kez aç, rutinlerin burada görünür.',
    ru: 'Откройте Habcore Gym на iPhone один раз, и ваши программы появятся здесь.',
    uk: 'Відкрий Habcore Gym на iPhone один раз, і твої програми з’являться тут.',
    ar: 'افتح Habcore Gym على iPhone مرة واحدة وستظهر تمارينك الروتينية هنا.',
    hi: 'iPhone पर Habcore Gym एक बार खोलें, आपके रूटीन यहाँ दिखेंगे।',
    bn: 'iPhone-এ Habcore Gym একবার খুলুন, আপনার রুটিন এখানে দেখা যাবে।',
    th: 'เปิด Habcore Gym บน iPhone สักครั้ง แล้วรูทีนของคุณจะแสดงที่นี่',
    ko: 'iPhone에서 Habcore Gym을 한 번 열면 루틴이 여기에 나타나요.',
    'zh-Hans': '在 iPhone 上打开一次 Habcore Gym，你的训练计划就会出现在这里。',
    'zh-Hant': '在 iPhone 上打開一次 Habcore Gym，你的訓練計畫就會出現在這裡。',
    cs: 'Otevři Habcore Gym jednou na iPhonu a tvoje rutiny se objeví tady.', fa: 'یک بار Habcore Gym را در iPhone باز کنید تا روال‌هایتان اینجا نمایش داده شوند.', id: 'Buka Habcore Gym sekali di iPhone kamu, rutinitasmu akan muncul di sini.', lt: 'Vieną kartą atidarykite „Habcore Gym“ iPhone ir jūsų rutinos atsiras čia.', sv: 'Öppna Habcore Gym på din iPhone en gång så dyker dina rutiner upp här.', vi: 'Mở Habcore Gym trên iPhone một lần, các lịch tập sẽ hiện ở đây.',
  },
  'Start one on your iPhone and it shows up here.': {
    de: 'Starte eins auf dem iPhone, dann taucht es hier auf.', fr: 'Lance-en une sur ton iPhone et elle apparaît ici.',
    es: 'Empieza uno en tu iPhone y aparecerá aquí.', it: 'Avviane uno sull’iPhone e comparirà qui.',
    'pt-PT': 'Começa um no iPhone e ele aparece aqui.', 'pt-BR': 'Comece um no iPhone e ele aparece aqui.',
    pl: 'Zacznij trening na iPhonie, a pojawi się tutaj.', hu: 'Indíts egyet az iPhone-on, és itt megjelenik.',
    tr: 'iPhone’unda bir tane başlat, burada görünür.', ru: 'Начните её на iPhone, и она появится здесь.',
    uk: 'Почни його на iPhone, і воно з’явиться тут.', ar: 'ابدأ تمرينًا على iPhone وسيظهر هنا.',
    hi: 'iPhone पर एक शुरू करें, यह यहाँ दिखेगा।', bn: 'iPhone-এ একটি শুরু করুন, এখানে দেখা যাবে।',
    th: 'เริ่มบน iPhone แล้วจะแสดงที่นี่', ko: 'iPhone에서 시작하면 여기에 나타나요.',
    'zh-Hans': '在 iPhone 上开始，它就会出现在这里。', 'zh-Hant': '在 iPhone 上開始，它就會出現在這裡。',
    cs: 'Spusť ho na iPhonu a objeví se tady.', fa: 'یکی را در iPhone شروع کنید تا اینجا نمایش داده شود.', id: 'Mulai di iPhone kamu dan akan muncul di sini.', lt: 'Pradėkite ją iPhone ir ji atsiras čia.', sv: 'Starta ett på din iPhone så dyker det upp här.', vi: 'Bắt đầu trên iPhone và nó sẽ hiện ở đây.',
  },
  'All sets done': {
    de: 'Alle Sätze erledigt', fr: 'Toutes les séries faites', es: 'Todas las series hechas', it: 'Tutte le serie fatte',
    'pt-PT': 'Todas as séries feitas', 'pt-BR': 'Todas as séries feitas', pl: 'Wszystkie serie zrobione', hu: 'Minden sorozat kész',
    tr: 'Tüm setler tamam', ru: 'Все подходы сделаны', uk: 'Усі підходи зроблено', ar: 'اكتملت كل المجموعات',
    hi: 'सारे सेट पूरे', bn: 'সব সেট শেষ', th: 'ครบทุกเซ็ตแล้ว', ko: '모든 세트 완료', 'zh-Hans': '所有组已完成', 'zh-Hant': '所有組已完成',
    cs: 'Všechny série hotové', fa: 'همه ست‌ها انجام شد', id: 'Semua set selesai', lt: 'Visos serijos atliktos', sv: 'Alla set klara', vi: 'Đã xong tất cả hiệp',
  },
  'measuring': {
    de: 'misst …', fr: 'mesure …', es: 'midiendo …', it: 'misuro …', 'pt-PT': 'a medir …', 'pt-BR': 'medindo …', pl: 'mierzę …',
    hu: 'mérés …', tr: 'ölçülüyor …', ru: 'измеряю …', uk: 'вимірюю …', ar: 'جارٍ القياس …', hi: 'माप रहा है …', bn: 'মাপা হচ্ছে …',
    th: 'กำลังวัด …', ko: '측정 중 …', 'zh-Hans': '测量中 …', 'zh-Hant': '測量中 …',
    cs: 'měřím …', fa: 'در حال اندازه‌گیری …', id: 'mengukur …', lt: 'matuojama …', sv: 'mäter …', vi: 'đang đo …',
  },
  '%@, set %lld': {
    de: '%@, Satz %lld', fr: '%@, série %lld', es: '%@, serie %lld', it: '%@, serie %lld', 'pt-PT': '%@, série %lld', 'pt-BR': '%@, série %lld',
    pl: '%@, seria %lld', hu: '%@, %lld. sorozat', tr: '%@, set %lld', ru: '%@, подход %lld', uk: '%@, підхід %lld', ar: '%@، المجموعة %lld',
    hi: '%@, सेट %lld', bn: '%@, সেট %lld', th: '%@ เซ็ต %lld', ko: '%@, %lld세트', 'zh-Hans': '%@，第 %lld 组', 'zh-Hant': '%@，第 %lld 組',
    cs: '%@, série %lld', fa: '%@، ست %lld', id: '%@, set %lld', lt: '%@, serija %lld', sv: '%@, set %lld', vi: '%@, hiệp %lld',
  },
  'Calories': {
    de: 'Kalorien', fr: 'Calories', es: 'Calorías', it: 'Calorie', 'pt-PT': 'Calorias', 'pt-BR': 'Calorias', pl: 'Kalorie', hu: 'Kalória', tr: 'Kalori', ru: 'Калории', uk: 'Калорії', ar: 'السعرات', hi: 'कैलोरी', bn: 'ক্যালোরি', th: 'แคลอรี', ko: '칼로리', 'zh-Hans': '卡路里', 'zh-Hant': '卡路里',
    cs: 'Kalorie', fa: 'کالری', id: 'Kalori', lt: 'Kalorijos', sv: 'Kalorier', vi: 'Calo',
  },
  'Heart rate': {
    de: 'Puls', fr: 'Pouls', es: 'Pulso', it: 'Battito', 'pt-PT': 'Frequência cardíaca', 'pt-BR': 'Frequência cardíaca', pl: 'Tętno', hu: 'Pulzus', tr: 'Nabız', ru: 'Пульс', uk: 'Пульс', ar: 'النبض', hi: 'धड़कन', bn: 'হার্ট রেট', th: 'ชีพจร', ko: '심박수', 'zh-Hans': '心率', 'zh-Hant': '心率',
    cs: 'Tep', fa: 'ضربان قلب', id: 'Detak jantung', lt: 'Širdies ritmas', sv: 'Puls', vi: 'Nhịp tim',
  },
  'Hold': {
    de: 'Halten', fr: 'Tenue', es: 'Aguanta', it: 'Tenuta', 'pt-PT': 'Aguenta', 'pt-BR': 'Segure', pl: 'Utrzymaj', hu: 'Tartás', tr: 'Tut', ru: 'Удержание', uk: 'Утримання', ar: 'ثبات', hi: 'होल्ड', bn: 'ধরে রাখুন', th: 'ค้างไว้', ko: '버티기', 'zh-Hans': '保持', 'zh-Hant': '保持',
    cs: 'Výdrž', fa: 'نگه‌داشتن', id: 'Tahan', lt: 'Išlaikymas', sv: 'Håll', vi: 'Giữ',
  },
  'Stop': {
    de: 'Stopp', fr: 'Stop', es: 'Parar', it: 'Stop', 'pt-PT': 'Parar', 'pt-BR': 'Parar', pl: 'Stop', hu: 'Stop', tr: 'Durdur', ru: 'Стоп', uk: 'Стоп', ar: 'إيقاف', hi: 'रोकें', bn: 'থামুন', th: 'หยุด', ko: '정지', 'zh-Hans': '停止', 'zh-Hant': '停止',
    cs: 'Stop', fa: 'توقف', id: 'Berhenti', lt: 'Stop', sv: 'Stopp', vi: 'Dừng',
  },
  'Start hold': {
    de: 'Halten starten', fr: 'Lancer la tenue', es: 'Empezar', it: 'Inizia la tenuta', 'pt-PT': 'Começar', 'pt-BR': 'Começar', pl: 'Start', hu: 'Indítás', tr: 'Başlat', ru: 'Начать', uk: 'Почати', ar: 'ابدأ', hi: 'शुरू करें', bn: 'শুরু করুন', th: 'เริ่ม', ko: '시작', 'zh-Hans': '开始', 'zh-Hant': '開始',
    cs: 'Začít výdrž', fa: 'شروع نگه‌داشتن', id: 'Mulai tahan', lt: 'Pradėti išlaikymą', sv: 'Starta hållet', vi: 'Bắt đầu giữ',
  },
  'Workout saved': {
    de: 'Training gespeichert', fr: 'Séance enregistrée', es: 'Entreno guardado', it: 'Allenamento salvato', 'pt-PT': 'Treino guardado', 'pt-BR': 'Treino salvo', pl: 'Trening zapisany', hu: 'Edzés mentve', tr: 'Antrenman kaydedildi', ru: 'Тренировка сохранена', uk: 'Тренування збережено', ar: 'تم حفظ التمرين', hi: 'वर्कआउट सहेजा गया', bn: 'ওয়ার্কআউট সেভ হয়েছে', th: 'บันทึกการฝึกแล้ว', ko: '운동 저장됨', 'zh-Hans': '训练已保存', 'zh-Hant': '訓練已儲存',
    cs: 'Trénink uložen', fa: 'تمرین ذخیره شد', id: 'Latihan disimpan', lt: 'Treniruotė išsaugota', sv: 'Passet sparat', vi: 'Đã lưu buổi tập',
  },
  'Ended on your iPhone': {
    de: 'Am iPhone beendet', fr: 'Terminée sur ton iPhone', es: 'Terminado en tu iPhone', it: 'Finito sull’iPhone', 'pt-PT': 'Terminado no iPhone', 'pt-BR': 'Encerrado no iPhone', pl: 'Zakończono na iPhonie', hu: 'Az iPhone-on befejezve', tr: 'iPhone’da bitirildi', ru: 'Завершено на iPhone', uk: 'Завершено на iPhone', ar: 'انتهى على iPhone', hi: 'iPhone पर खत्म हुआ', bn: 'iPhone-এ শেষ হয়েছে', th: 'จบบน iPhone แล้ว', ko: 'iPhone에서 끝났어요', 'zh-Hans': '已在 iPhone 上结束', 'zh-Hant': '已在 iPhone 上結束',
    cs: 'Ukončeno na iPhonu', fa: 'در iPhone پایان یافت', id: 'Diakhiri di iPhone kamu', lt: 'Baigta iPhone', sv: 'Avslutat på din iPhone', vi: 'Đã kết thúc trên iPhone',
  },
  'Log this one on your iPhone.': {
    de: 'Das hier trägst du am iPhone ein.', fr: 'Celui-ci se note sur ton iPhone.', es: 'Este se registra en tu iPhone.', it: 'Questo si registra sull’iPhone.', 'pt-PT': 'Este regista-se no iPhone.', 'pt-BR': 'Este você registra no iPhone.', pl: 'To zapisz na iPhonie.', hu: 'Ezt az iPhone-on rögzítsd.', tr: 'Bunu iPhone’da kaydet.', ru: 'Это записывается на iPhone.', uk: 'Це записуй на iPhone.', ar: 'سجّل هذا على iPhone.', hi: 'इसे iPhone पर दर्ज करें।', bn: 'এটা iPhone-এ লিখুন।', th: 'อันนี้บันทึกบน iPhone', ko: '이건 iPhone에서 기록하세요.', 'zh-Hans': '这个请在 iPhone 上记录。', 'zh-Hant': '這個請在 iPhone 上記錄。',
    cs: 'Tohle zapiš na iPhonu.', fa: 'این را در iPhone ثبت کنید.', id: 'Catat yang ini di iPhone kamu.', lt: 'Šią užregistruokite iPhone.', sv: 'Logga den här på din iPhone.', vi: 'Ghi bài này trên iPhone.',
  },
  'All done?': {
    de: 'Alles erledigt?', fr: 'Terminé ?', es: '¿Has terminado?', it: 'Hai finito?', 'pt-PT': 'Terminaste?', 'pt-BR': 'Terminou?', pl: 'Koniec treningu?', hu: 'Végeztél?', tr: 'Bitirdin mi?', ru: 'Тренировка окончена?', uk: 'Тренування завершено?', ar: 'هل انتهيت؟', hi: 'हो गया?', bn: 'শেষ হয়েছে?', th: 'เสร็จแล้วหรือยัง', ko: '다 끝났나요?', 'zh-Hans': '练完了吗？', 'zh-Hant': '練完了嗎？',
    cs: 'Hotovo?', fa: 'تمام شد؟', id: 'Sudah selesai?', lt: 'Viskas?', sv: 'Klar?', vi: 'Xong chưa?',
  },
  // Water Lock (the screen and the crown's press off until the crown is turned), as in Apple's Workout.
  'Lock': {
    de: 'Sperren', fr: 'Verrouiller', es: 'Bloquear', it: 'Blocca', 'pt-PT': 'Bloquear', 'pt-BR': 'Bloquear', pl: 'Zablokuj', hu: 'Zárolás', tr: 'Kilitle', ru: 'Блокировка', uk: 'Блокування', ar: 'قفل', hi: 'लॉक करें', bn: 'লক করুন', th: 'ล็อก', ko: '잠금', 'zh-Hans': '锁定', 'zh-Hant': '鎖定',
    cs: 'Zamknout', fa: 'قفل', id: 'Kunci', lt: 'Užrakinti', sv: 'Lås', vi: 'Khóa',
  },
  'Skip this set?': {
    de: 'Diesen Satz überspringen?', fr: 'Sauter cette série ?', es: '¿Saltar esta serie?', it: 'Saltare questa serie?', 'pt-PT': 'Saltar esta série?', 'pt-BR': 'Pular esta série?', pl: 'Pominąć tę serię?', hu: 'Kihagyod ezt a sorozatot?', tr: 'Bu set atlansın mı?', ru: 'Пропустить этот подход?', uk: 'Пропустити цей підхід?', ar: 'تخطي هذه المجموعة؟', hi: 'यह सेट छोड़ें?', bn: 'এই সেটটি বাদ দেবেন?', th: 'ข้ามเซ็ตนี้ไหม', ko: '이 세트를 건너뛸까요?', 'zh-Hans': '跳过这一组？', 'zh-Hant': '跳過這一組？',
    cs: 'Přeskočit tuhle sérii?', fa: 'این ست رد شود؟', id: 'Lewati set ini?', lt: 'Praleisti šią seriją?', sv: 'Hoppa över det här setet?', vi: 'Bỏ qua hiệp này?',
  },
  'Turn the Digital Crown to change it.': {
    de: 'Dreh an der Digital Crown, um es zu ändern.', fr: 'Tourne la Digital Crown pour le changer.', es: 'Gira la Digital Crown para cambiarlo.', it: 'Ruota la Digital Crown per cambiarlo.', 'pt-PT': 'Roda a Digital Crown para mudar.', 'pt-BR': 'Gire a Digital Crown para mudar.', pl: 'Obróć Digital Crown, by zmienić.', hu: 'Forgasd a Digital Crownt a módosításhoz.', tr: 'Değiştirmek için Digital Crown’u çevir.', ru: 'Поверните Digital Crown, чтобы изменить.', uk: 'Поверни Digital Crown, щоб змінити.', ar: 'أدر Digital Crown للتغيير.', hi: 'बदलने के लिए Digital Crown घुमाएँ।', bn: 'বদলাতে Digital Crown ঘোরান।', th: 'หมุน Digital Crown เพื่อเปลี่ยน', ko: '바꾸려면 Digital Crown을 돌리세요.', 'zh-Hans': '转动数码表冠来更改。', 'zh-Hant': '轉動數位錶冠來更改。',
    cs: 'Otoč korunkou Digital Crown a změň to.', fa: 'برای تغییر، Digital Crown را بچرخانید.', id: 'Putar Digital Crown untuk mengubahnya.', lt: 'Pasukite Digital Crown, kad pakeistumėte.', sv: 'Vrid på Digital Crown för att ändra.', vi: 'Xoay Digital Crown để thay đổi.',
  },
  '%lld avg · %lld max': {
    de: 'Ø %lld · max. %lld', fr: 'moy. %lld · max %lld', es: 'media %lld · máx. %lld', it: 'media %lld · max %lld', 'pt-PT': 'média %lld · máx. %lld', 'pt-BR': 'média %lld · máx. %lld', pl: 'śr. %lld · maks. %lld', hu: 'átl. %lld · max. %lld', tr: 'ort. %lld · maks. %lld', ru: 'ср. %lld · макс. %lld', uk: 'сер. %lld · макс. %lld', ar: 'متوسط %lld · أقصى %lld', hi: 'औसत %lld · अधिकतम %lld', bn: 'গড় %lld · সর্বোচ্চ %lld', th: 'เฉลี่ย %lld · สูงสุด %lld', ko: '평균 %lld · 최대 %lld', 'zh-Hans': '平均 %lld · 最高 %lld', 'zh-Hant': '平均 %lld · 最高 %lld',
    cs: 'průměr %lld · max %lld', fa: 'میانگین %lld · بیشینه %lld', id: 'rata-rata %lld · maks %lld', lt: 'vid. %lld · maks. %lld', sv: 'snitt %lld · max %lld', vi: 'TB %lld · tối đa %lld',
  },
  'Set %lld of %lld': {
    de: 'Satz %lld von %lld', fr: 'Série %lld sur %lld', es: 'Serie %lld de %lld', it: 'Serie %lld di %lld', 'pt-PT': 'Série %lld de %lld', 'pt-BR': 'Série %lld de %lld', pl: 'Seria %lld z %lld', hu: '%lld. sorozat / %lld', tr: 'Set %lld / %lld', ru: 'Подход %lld из %lld', uk: 'Підхід %lld з %lld', ar: 'المجموعة %lld من %lld', hi: 'सेट %lld / %lld', bn: 'সেট %lld / %lld', th: 'เซ็ต %lld จาก %lld', ko: '%lld/%lld세트', 'zh-Hans': '第 %lld 组，共 %lld 组', 'zh-Hant': '第 %lld 組，共 %lld 組',
    cs: 'Série %lld z %lld', fa: 'ست %lld از %lld', id: 'Set %lld dari %lld', lt: 'Serija %lld iš %lld', sv: 'Set %lld av %lld', vi: 'Hiệp %lld / %lld',
  },
  '%lld of %lld sets': {
    de: '%lld von %lld Sätzen', fr: '%lld séries sur %lld', es: '%lld de %lld series', it: '%lld serie su %lld', 'pt-PT': '%lld de %lld séries', 'pt-BR': '%lld de %lld séries', pl: '%lld z %lld serii', hu: '%lld / %lld sorozat', tr: '%lld / %lld set', ru: '%lld из %lld подходов', uk: '%lld з %lld підходів', ar: '%lld من %lld مجموعات', hi: '%lld / %lld सेट', bn: '%lld / %lld সেট', th: '%lld จาก %lld เซ็ต', ko: '%lld/%lld세트', 'zh-Hans': '%lld / %lld 组', 'zh-Hant': '%lld / %lld 組',
    cs: '%lld z %lld sérií', fa: '%lld از %lld ست', id: '%lld dari %lld set', lt: '%lld iš %lld serijų', sv: '%lld av %lld set', vi: '%lld / %lld hiệp',
  },
  'Tap to change it.': {
    de: 'Tippe, um es zu ändern.', fr: 'Touche pour le changer.', es: 'Toca para cambiarlo.', it: 'Tocca per cambiarlo.', 'pt-PT': 'Toca para mudar.', 'pt-BR': 'Toque para mudar.', pl: 'Stuknij, by zmienić.', hu: 'Koppints a módosításhoz.', tr: 'Değiştirmek için dokun.', ru: 'Нажмите, чтобы изменить.', uk: 'Торкнись, щоб змінити.', ar: 'اضغط للتغيير.', hi: 'बदलने के लिए टैप करें।', bn: 'বদলাতে ট্যাপ করুন।', th: 'แตะเพื่อเปลี่ยน', ko: '탭해서 바꾸세요.', 'zh-Hans': '轻点以更改。', 'zh-Hant': '輕點以更改。',
    cs: 'Klepni a změň to.', fa: 'برای تغییر ضربه بزنید.', id: 'Ketuk untuk mengubah.', lt: 'Bakstelėkite, kad pakeistumėte.', sv: 'Tryck för att ändra.', vi: 'Chạm để thay đổi.',
  },
  'Added weight': {
    de: 'Zusatzgewicht', fr: 'Poids ajouté', es: 'Peso añadido', it: 'Peso aggiunto', 'pt-PT': 'Peso adicional', 'pt-BR': 'Peso adicional', pl: 'Dodatkowy ciężar', hu: 'Plusz súly', tr: 'Ek ağırlık', ru: 'Доп. вес', uk: 'Додаткова вага', ar: 'وزن إضافي', hi: 'अतिरिक्त वज़न', bn: 'অতিরিক্ত ওজন', th: 'น้ำหนักเพิ่ม', ko: '추가 무게', 'zh-Hans': '附加重量', 'zh-Hant': '附加重量',
    cs: 'Přidaná váha', fa: 'وزن اضافه', id: 'Beban tambahan', lt: 'Papildomas svoris', sv: 'Extra vikt', vi: 'Tạ thêm',
  },
  'Your rest, your next set, or today\'s workout.': {
    de: 'Deine Pause, dein nächster Satz oder das Training von heute.', fr: 'Ton repos, ta prochaine série ou la séance du jour.', es: 'Tu descanso, tu próxima serie o el entreno de hoy.', it: 'Il tuo recupero, la prossima serie o l’allenamento di oggi.', 'pt-PT': 'O teu descanso, a próxima série ou o treino de hoje.', 'pt-BR': 'Seu descanso, a próxima série ou o treino de hoje.', pl: 'Twoja przerwa, następna seria albo dzisiejszy trening.', hu: 'A pihenőd, a következő sorozat vagy a mai edzés.', tr: 'Dinlenmen, sıradaki setin ya da bugünkü antrenman.', ru: 'Отдых, следующий подход или сегодняшняя тренировка.', uk: 'Відпочинок, наступний підхід або сьогоднішнє тренування.', ar: 'راحتك، أو مجموعتك التالية، أو تمرين اليوم.', hi: 'आपका आराम, अगला सेट, या आज का वर्कआउट।', bn: 'আপনার বিশ্রাম, পরের সেট, বা আজকের ওয়ার্কআউট।', th: 'ช่วงพัก เซ็ตถัดไป หรือการฝึกวันนี้', ko: '휴식, 다음 세트, 또는 오늘의 운동.', 'zh-Hans': '你的休息、下一组或今天的训练。', 'zh-Hant': '你的休息、下一組或今天的訓練。',
    cs: 'Tvoje pauza, další série nebo dnešní trénink.', fa: 'استراحت شما، ست بعدی یا تمرین امروز.', id: 'Istirahatmu, set berikutnya, atau latihan hari ini.', lt: 'Jūsų poilsis, kita serija arba šiandienos treniruotė.', sv: 'Din vila, ditt nästa set eller dagens pass.', vi: 'Thời gian nghỉ, hiệp tiếp theo hoặc buổi tập hôm nay.',
  },
  'Opens Habcore Gym.': {
    de: 'Öffnet Habcore Gym.', fr: 'Ouvre Habcore Gym.', es: 'Abre Habcore Gym.', it: 'Apre Habcore Gym.', 'pt-PT': 'Abre o Habcore Gym.', 'pt-BR': 'Abre o Habcore Gym.', pl: 'Otwiera Habcore Gym.', hu: 'Megnyitja az Habcore Gymet.', tr: 'Habcore Gym’i açar.', ru: 'Открывает Habcore Gym.', uk: 'Відкриває Habcore Gym.', ar: 'يفتح Habcore Gym.', hi: 'Habcore Gym खोलता है।', bn: 'Habcore Gym খোলে।', th: 'เปิด Habcore Gym', ko: 'Habcore Gym을 열어요.', 'zh-Hans': '打开 Habcore Gym。', 'zh-Hant': '打開 Habcore Gym。',
    cs: 'Otevře Habcore Gym.', fa: 'Habcore Gym را باز می‌کند.', id: 'Membuka Habcore Gym.', lt: 'Atidaro „Habcore Gym“.', sv: 'Öppnar Habcore Gym.', vi: 'Mở Habcore Gym.',
  },
  'Hold to finish': {
    de: 'Halten zum Beenden', fr: 'Maintiens pour terminer', es: 'Mantén para terminar', it: 'Tieni premuto per finire', 'pt-PT': 'Mantém premido para terminar', 'pt-BR': 'Segure para terminar', pl: 'Przytrzymaj, by zakończyć', hu: 'Tartsd nyomva a befejezéshez', tr: 'Bitirmek için basılı tut', ru: 'Удерживайте, чтобы завершить', uk: 'Утримуй, щоб завершити', ar: 'اضغط مطولًا للإنهاء', hi: 'खत्म करने के लिए दबाए रखें', bn: 'শেষ করতে চেপে ধরুন', th: 'กดค้างเพื่อจบ', ko: '길게 눌러 끝내기', 'zh-Hans': '按住以结束', 'zh-Hant': '按住以結束', cs: 'Podrž pro dokončení', fa: 'برای پایان نگه دارید', id: 'Tahan untuk selesai', lt: 'Palaikykite, kad baigtumėte', sv: 'Håll in för att avsluta', vi: 'Giữ để kết thúc',
  },
  'iPhone out of reach': {
    de: 'iPhone außer Reichweite', fr: 'iPhone hors de portée', es: 'iPhone fuera de alcance', it: 'iPhone fuori portata', 'pt-PT': 'iPhone fora de alcance', 'pt-BR': 'iPhone fora de alcance', pl: 'iPhone poza zasięgiem', hu: 'Az iPhone nincs a közelben', tr: 'iPhone menzil dışında', ru: 'iPhone вне зоны', uk: 'iPhone поза зоною', ar: 'iPhone خارج النطاق', hi: 'iPhone पहुँच से बाहर', bn: 'iPhone নাগালের বাইরে', th: 'iPhone อยู่นอกระยะ', ko: 'iPhone이 멀리 있어요', 'zh-Hans': 'iPhone 不在附近', 'zh-Hant': 'iPhone 不在附近', cs: 'iPhone je mimo dosah', fa: 'iPhone خارج از دسترس است', id: 'iPhone di luar jangkauan', lt: 'iPhone nepasiekiamas', sv: 'iPhone utom räckhåll', vi: 'iPhone ngoài tầm kết nối',
  },
  'No set for %lld min. Still at it?': {
    de: 'Seit %lld Min. kein Satz. Noch dabei?', fr: 'Aucune série depuis %lld min. Toujours là ?', es: 'Ninguna serie en %lld min. ¿Sigues?', it: 'Nessuna serie da %lld min. Ci sei ancora?', 'pt-PT': 'Nenhuma série há %lld min. Ainda aí?', 'pt-BR': 'Nenhuma série há %lld min. Ainda aí?', pl: 'Brak serii od %lld min. Dalej ćwiczysz?', hu: '%lld perce nincs sorozat. Még edzel?', tr: '%lld dakikadır set yok. Hâlâ orada mısın?', ru: 'Ни одного подхода %lld мин. Ещё тренируетесь?', uk: 'Жодного підходу %lld хв. Ще тренуєшся?', ar: 'لا مجموعة منذ %lld دقيقة. ما زلت تتمرن؟', hi: '%lld मिनट से कोई सेट नहीं। अभी भी लगे हैं?', bn: '%lld মিনিট ধরে কোনো সেট নেই। এখনো চলছে?', th: 'ไม่มีเซ็ตมา %lld นาทีแล้ว ยังฝึกอยู่ไหม', ko: '%lld분째 세트가 없어요. 아직 운동 중이세요?', 'zh-Hans': '已经 %lld 分钟没有记录组了。还在练吗？', 'zh-Hant': '已經 %lld 分鐘沒有記錄組了。還在練嗎？', cs: 'Už %lld min žádná série. Pořád cvičíš?', fa: '%lld دقیقه است که ستی ثبت نشده. هنوز تمرین می‌کنید؟', id: 'Tidak ada set selama %lld mnt. Masih latihan?', lt: 'Jau %lld min. be serijos. Dar treniruojatės?', sv: 'Inget set på %lld min. Kör du fortfarande?', vi: 'Đã %lld phút không có hiệp nào. Bạn còn tập không?',
  },
  'A skipped set is still waiting.': {
    de: 'Ein übersprungener Satz wartet noch.', fr: 'Une série passée attend encore.', es: 'Una serie saltada aún te espera.', it: 'Una serie saltata ti aspetta ancora.', 'pt-PT': 'Uma série saltada ainda está à espera.', 'pt-BR': 'Uma série pulada ainda está esperando.', pl: 'Pominięta seria wciąż czeka.', hu: 'Egy kihagyott sorozat még vár.', tr: 'Atlanan bir set hâlâ bekliyor.', ru: 'Пропущенный подход ещё ждёт.', uk: 'Пропущений підхід ще чекає.', ar: 'مجموعة متخطاة ما زالت تنتظر.', hi: 'छोड़ा गया एक सेट अभी बाकी है।', bn: 'বাদ দেওয়া একটি সেট এখনো বাকি।', th: 'ยังมีเซ็ตที่ข้ามไว้รออยู่', ko: '건너뛴 세트가 아직 남아 있어요.', 'zh-Hans': '还有一组跳过的在等你。', 'zh-Hant': '還有一組跳過的在等你。', cs: 'Přeskočená série pořád čeká.', fa: 'یک ست ردشده هنوز منتظر است.', id: 'Satu set yang dilewati masih menunggu.', lt: 'Praleista serija vis dar laukia.', sv: 'Ett överhoppat set väntar fortfarande.', vi: 'Vẫn còn một hiệp đã bỏ qua đang chờ.',
  },
  // The summary's calories, as two small lines beside the number (Apple's "ACTIVE / CAL").
  'Active\nkcal': {
    de: 'Aktive\nkcal', fr: 'Kcal\nactives', es: 'Kcal\nactivas', it: 'Kcal\nattive', 'pt-PT': 'Kcal\nativas', 'pt-BR': 'Kcal\nativas', pl: 'Aktywne\nkcal', hu: 'Aktív\nkcal', tr: 'Aktif\nkcal', ru: 'Активные\nккал', uk: 'Активні\nккал', ar: 'سعرات\nنشطة', hi: 'सक्रिय\nkcal', bn: 'সক্রিয়\nkcal', th: 'แคลอรี\nที่ใช้งาน', ko: '활동\nkcal', 'zh-Hans': '活动\n千卡', 'zh-Hant': '活動\n大卡',
    cs: 'Aktivní\nkcal', fa: 'کالری\nفعال', id: 'Kkal\naktif', lt: 'Aktyvios\nkcal', sv: 'Aktiva\nkcal', vi: 'Kcal\nhoạt động', da: 'Aktive\nkcal',
  },
  // The Metrics pages' titles, in the row under the clock.
  'Metrics': {
    de: 'Messwerte', fr: 'Mesures', es: 'Métricas', it: 'Metriche', 'pt-PT': 'Métricas', 'pt-BR': 'Métricas', pl: 'Pomiary', hu: 'Mérések', tr: 'Ölçümler', ru: 'Показатели', uk: 'Показники', ar: 'المقاييس', hi: 'मेट्रिक्स', bn: 'মেট্রিক্স', th: 'ตัวชี้วัด', ko: '측정값', 'zh-Hans': '指标', 'zh-Hant': '指標',
    cs: 'Metriky', fa: 'معیارها', id: 'Metrik', lt: 'Rodikliai', sv: 'Mätvärden', vi: 'Chỉ số', da: 'Målinger',
  },
  'Zones': {
    de: 'Zonen', fr: 'Zones', es: 'Zonas', it: 'Zone', 'pt-PT': 'Zonas', 'pt-BR': 'Zonas', pl: 'Strefy', hu: 'Zónák', tr: 'Bölgeler', ru: 'Зоны', uk: 'Зони', ar: 'المناطق', hi: 'ज़ोन', bn: 'জোন', th: 'โซน', ko: '구간', 'zh-Hans': '区间', 'zh-Hant': '區間',
    cs: 'Zóny', fa: 'ناحیه‌ها', id: 'Zona', lt: 'Zonos', sv: 'Zoner', vi: 'Vùng', da: 'Zoner',
  },
  // The Pulse and Effort pages of Metrics.
  'avg': {
    de: 'Ø', fr: 'moy.', es: 'media', it: 'media', 'pt-PT': 'média', 'pt-BR': 'média', pl: 'śr.', hu: 'átl.', tr: 'ort.', ru: 'ср.', uk: 'сер.', ar: 'المتوسط', hi: 'औसत', bn: 'গড়', th: 'เฉลี่ย', ko: '평균', 'zh-Hans': '平均', 'zh-Hant': '平均',
    cs: 'prům.', fa: 'میانگین', id: 'rata-rata', lt: 'vid.', sv: 'snitt', vi: 'TB',
  },
  'No effort rated yet': {
    de: 'Noch keine Anstrengung bewertet', fr: 'Aucun effort noté', es: 'Aún sin esfuerzo valorado', it: 'Nessuno sforzo valutato', 'pt-PT': 'Ainda sem esforço avaliado', 'pt-BR': 'Nenhum esforço avaliado', pl: 'Brak ocenionego wysiłku', hu: 'Még nincs értékelt erőfeszítés', tr: 'Henüz çaba puanlanmadı', ru: 'Усилие ещё не оценено', uk: 'Зусилля ще не оцінено', ar: 'لم يُقيَّم أي جهد بعد', hi: 'अभी कोई प्रयास रेट नहीं हुआ', bn: 'এখনো কোনো পরিশ্রম রেট করা হয়নি', th: 'ยังไม่ได้ให้คะแนนความหนัก', ko: '아직 평가한 강도가 없어요', 'zh-Hans': '尚未评定强度', 'zh-Hant': '尚未評定強度',
    cs: 'Zatím žádné hodnocení náročnosti', fa: 'هنوز شدتی ثبت نشده', id: 'Belum ada usaha yang dinilai', lt: 'Dar neįvertinta jokio krūvio', sv: 'Ingen ansträngning betygsatt än', vi: 'Chưa đánh giá mức nỗ lực',
  },
  // The Pulse page's highest and lowest reading.
  'max': { ar: 'الأقصى', bn: 'সর্বোচ্চ', cs: 'max', de: 'max', es: 'máx.', fa: 'بیشینه', fr: 'max', hi: 'अधिकतम', hu: 'max.', id: 'maks', it: 'max', ko: '최대', lt: 'maks.', pl: 'maks.', 'pt-BR': 'máx.', 'pt-PT': 'máx.', ru: 'макс.', sv: 'max', th: 'สูงสุด', tr: 'maks.', uk: 'макс.', vi: 'tối đa', 'zh-Hans': '最高', 'zh-Hant': '最高' },
  'min': { ar: 'الأدنى', bn: 'সর্বনিম্ন', cs: 'min', de: 'min', es: 'mín.', fa: 'کمینه', fr: 'min', hi: 'न्यूनतम', hu: 'min.', id: 'min', it: 'min', ko: '최소', lt: 'min.', pl: 'min.', 'pt-BR': 'mín.', 'pt-PT': 'mín.', ru: 'мин.', sv: 'min', th: 'ต่ำสุด', tr: 'min.', uk: 'мін.', vi: 'tối thiểu', 'zh-Hans': '最低', 'zh-Hant': '最低' },
  // watch-apple (#883): with Apple Health off nothing keeps the app in front during a workout.
  'Turn on Apple Health on your iPhone and Habcore Gym stays on screen through rests and holds.': {
    de: 'Schalte auf dem iPhone Apple Health ein, dann bleibt Habcore Gym in Pausen und beim Halten im Vordergrund.', fr: 'Active Apple Santé sur ton iPhone et Habcore Gym reste à l’écran pendant les repos et les gainages.', es: 'Activa Apple Salud en tu iPhone y Habcore Gym se queda en pantalla durante descansos y aguantes.', it: 'Attiva Apple Salute sull’iPhone e Habcore Gym resta sullo schermo durante recuperi e tenute.', 'pt-PT': 'Ativa o Apple Saúde no iPhone e o Habcore Gym fica no ecrã durante descansos e isometrias.', 'pt-BR': 'Ative o Apple Saúde no iPhone e o Habcore Gym fica na tela durante descansos e isometrias.', pl: 'Włącz Apple Zdrowie na iPhonie, a Habcore Gym zostanie na ekranie podczas przerw i utrzymań.', hu: 'Kapcsold be az Apple Egészséget az iPhone-on, és az Habcore Gym a pihenők és tartások alatt is a képernyőn marad.', tr: 'iPhone’da Apple Sağlık’ı aç, Habcore Gym dinlenmelerde ve tutuşlarda ekranda kalsın.', ru: 'Включи Apple Здоровье на iPhone, и Habcore Gym останется на экране во время отдыха и удержаний.', uk: 'Увімкни Apple Здоров’я на iPhone, і Habcore Gym залишатиметься на екрані під час відпочинку та утримань.', ar: 'فعّل Apple صحتي على iPhone ليبقى Habcore Gym على الشاشة خلال الراحة والثبات.', hi: 'iPhone पर Apple Health चालू करो, फिर आराम और होल्ड के दौरान Habcore Gym स्क्रीन पर बना रहेगा।', bn: 'iPhone-এ Apple Health চালু করো, তাহলে বিশ্রাম আর হোল্ডের সময় Habcore Gym স্ক্রিনে থাকবে।', th: 'เปิด Apple Health บน iPhone แล้ว Habcore Gym จะอยู่บนหน้าจอตลอดช่วงพักและท่าค้าง', ko: 'iPhone에서 Apple 건강을 켜면 휴식과 버티기 중에도 Habcore Gym이 화면에 남아 있어요.', 'zh-Hans': '在 iPhone 上打开 Apple 健康，休息和静力保持时 Habcore Gym 就会一直留在屏幕上。', 'zh-Hant': '在 iPhone 上開啟 Apple 健康，休息和靜態支撐時 Habcore Gym 就會一直留在螢幕上。', cs: 'Zapni na iPhonu Apple Zdraví a Habcore Gym zůstane na displeji i při pauzách a výdržích.', fa: 'Apple Health را در iPhone روشن کن تا Habcore Gym هنگام استراحت و نگه\u200cداشتن روی صفحه بماند.', id: 'Nyalakan Apple Kesehatan di iPhone, dan Habcore Gym tetap di layar saat istirahat dan tahanan.', lt: 'Įjunk Apple Health iPhone ir Habcore Gym liks ekrane per poilsį ir išlaikymus.', sv: 'Slå på Apple Hälsa på iPhone så stannar Habcore Gym kvar på skärmen under vila och hållningar.', vi: 'Bật Apple Sức khỏe trên iPhone để Habcore Gym luôn ở trên màn hình khi nghỉ và giữ tư thế.',
  },
  // The Muscles page of Metrics.
  'No sets yet': { de: 'Noch keine Sätze', fr: 'Aucune série', es: 'Aún sin series', it: 'Ancora nessuna serie', 'pt-PT': 'Ainda sem séries', 'pt-BR': 'Nenhuma série ainda', pl: 'Jeszcze bez serii', hu: 'Még nincs sorozat', tr: 'Henüz set yok', ru: 'Подходов пока нет', uk: 'Підходів ще немає', ar: 'لا مجموعات بعد', hi: 'अभी कोई सेट नहीं', bn: 'এখনো কোনো সেট নেই', th: 'ยังไม่มีเซ็ต', ko: '아직 세트가 없어요', 'zh-Hans': '还没有组', 'zh-Hant': '還沒有組', cs: 'Zatím žádné série', fa: 'هنوز ستی نیست', id: 'Belum ada set', lt: 'Dar nėra serijų', sv: 'Inga set än', vi: 'Chưa có hiệp nào' },
  '+%lld more': { de: '+%lld weitere', fr: '+%lld autres', es: '+%lld más', it: '+%lld altri', 'pt-PT': '+%lld mais', 'pt-BR': '+%lld mais', pl: '+%lld więcej', hu: '+%lld további', tr: '+%lld daha', ru: 'ещё %lld', uk: 'ще %lld', ar: '+%lld أخرى', hi: '+%lld और', bn: '+%lld আরও', th: '+%lld อื่นๆ', ko: '+%lld개 더', 'zh-Hans': '还有 %lld 个', 'zh-Hant': '還有 %lld 個', cs: '+%lld další', fa: '+%lld مورد دیگر', id: '+%lld lagi', lt: '+%lld daugiau', sv: '+%lld till', vi: '+%lld nữa' },
  '%@ sets': { de: '%@ Sätze', fr: '%@ séries', es: '%@ series', it: '%@ serie', 'pt-PT': '%@ séries', 'pt-BR': '%@ séries', pl: 'Serie: %@', hu: '%@ sorozat', tr: '%@ set', ru: 'Подходов: %@', uk: 'Підходів: %@', ar: '%@ مجموعات', hi: '%@ सेट', bn: '%@ সেট', th: '%@ เซ็ต', ko: '%@세트', 'zh-Hans': '%@ 组', 'zh-Hant': '%@ 組', cs: 'Sérií: %@', fa: '%@ ست', id: '%@ set', lt: 'Serijų: %@', sv: '%@ set', vi: '%@ hiệp' },
}

// The rep counter (Watch/RepCount.swift, RepCountView.swift, 1st version, 2026-11-27).
// Polish and English by hand, the others machine-translated.
const REPS = {
  'Count reps': { de: 'Wdh. zählen', fr: 'Compter les reps', es: 'Contar reps', it: 'Conta ripetizioni', 'pt-PT': 'Contar reps', 'pt-BR': 'Contar reps', pl: 'Licz automatycznie', hu: 'Ismétlésszámlálás', tr: 'Tekrar say', ru: 'Считать повторы', uk: 'Рахувати повтори', ar: 'عدّ التكرارات', hi: 'रेप्स गिनें', bn: 'রেপ গুনুন', th: 'นับครั้ง', ko: '반복 세기', 'zh-Hans': '自动计次', 'zh-Hant': '自動計次', cs: 'Počítat opakování', fa: 'شمارش تکرار', id: 'Hitung repetisi', lt: 'Skaičiuoti pakartojimus', sv: 'Räkna reps', vi: 'Đếm số lần', da: 'Tæl gentagelser' },
  'Counting reps': { de: 'Zähle Wiederholungen', fr: 'Comptage des reps', es: 'Contando reps', it: 'Conto le ripetizioni', 'pt-PT': 'A contar reps', 'pt-BR': 'Contando reps', pl: 'Liczę powtórzenia', hu: 'Ismétlések számlálása', tr: 'Tekrarlar sayılıyor', ru: 'Считаю повторы', uk: 'Рахую повтори', ar: 'جارٍ عدّ التكرارات', hi: 'रेप्स गिने जा रहे हैं', bn: 'রেপ গোনা হচ্ছে', th: 'กำลังนับครั้ง', ko: '반복 세는 중', 'zh-Hans': '正在计次', 'zh-Hant': '正在計次', cs: 'Počítám opakování', fa: 'در حال شمارش تکرارها', id: 'Menghitung repetisi', lt: 'Skaičiuoju pakartojimus', sv: 'Räknar reps', vi: 'Đang đếm số lần', da: 'Tæller gentagelser' },
  'Wear the watch on the arm that moves.': { de: 'Trag die Uhr am Arm, der sich bewegt.', fr: 'Porte la montre sur le bras qui bouge.', es: 'Lleva el reloj en el brazo que se mueve.', it: 'Indossa l’orologio sul braccio che si muove.', 'pt-PT': 'Usa o relógio no braço que se move.', 'pt-BR': 'Use o relógio no braço que se move.', pl: 'Zegarek musi być na ręce, która wykonuje ruch.', hu: 'Az órát a mozgó karodon viseld.', tr: 'Saati hareket eden kolunda tak.', ru: 'Часы должны быть на работающей руке.', uk: 'Годинник має бути на руці, що рухається.', ar: 'ارتدِ الساعة على الذراع التي تتحرك.', hi: 'घड़ी उसी हाथ पर पहनें जो हिलता है।', bn: 'যে হাত নড়ছে সেই হাতে ঘড়ি পরুন।', th: 'สวมนาฬิกาที่แขนข้างที่ขยับ', ko: '움직이는 팔에 시계를 차세요.', 'zh-Hans': '请把手表戴在做动作的手上。', 'zh-Hant': '請把手錶戴在做動作的手上。', cs: 'Hodinky noste na ruce, která cvičí.', fa: 'ساعت را روی دستی که حرکت می‌کند ببندید.', id: 'Pakai jam di lengan yang bergerak.', lt: 'Laikrodį nešiokite ant judančios rankos.', sv: 'Bär klockan på armen som rör sig.', vi: 'Đeo đồng hồ ở tay đang chuyển động.', da: 'Bær uret på den arm, der bevæger sig.' },
  'Reps counted': { de: 'Gezählte Wdh.', fr: 'Reps comptées', es: 'Reps contadas', it: 'Ripetizioni contate', 'pt-PT': 'Reps contadas', 'pt-BR': 'Reps contadas', pl: 'Policzone powtórzenia', hu: 'Számolt ismétlések', tr: 'Sayılan tekrar', ru: 'Посчитано повторов', uk: 'Пораховано повторів', ar: 'التكرارات المعدودة', hi: 'गिने गए रेप्स', bn: 'গোনা রেপ', th: 'ครั้งที่นับได้', ko: '센 반복 수', 'zh-Hans': '已计次数', 'zh-Hant': '已計次數', cs: 'Napočítaná opakování', fa: 'تکرارهای شمرده‌شده', id: 'Repetisi terhitung', lt: 'Suskaičiuoti pakartojimai', sv: 'Räknade reps', vi: 'Số lần đã đếm', da: 'Talte gentagelser' },
  'One more': { de: 'Eine mehr', fr: 'Une de plus', es: 'Una más', it: 'Una in più', 'pt-PT': 'Mais uma', 'pt-BR': 'Mais uma', pl: 'O jedno więcej', hu: 'Eggyel több', tr: 'Bir fazla', ru: 'На один больше', uk: 'На один більше', ar: 'واحد أكثر', hi: 'एक और', bn: 'আরও একটি', th: 'เพิ่มหนึ่ง', ko: '하나 더', 'zh-Hans': '加一次', 'zh-Hant': '加一次', cs: 'O jedno víc', fa: 'یکی بیشتر', id: 'Tambah satu', lt: 'Vienu daugiau', sv: 'En till', vi: 'Thêm một', da: 'Én mere' },
  'One fewer': { de: 'Eine weniger', fr: 'Une de moins', es: 'Una menos', it: 'Una in meno', 'pt-PT': 'Menos uma', 'pt-BR': 'Menos uma', pl: 'O jedno mniej', hu: 'Eggyel kevesebb', tr: 'Bir eksik', ru: 'На один меньше', uk: 'На один менше', ar: 'واحد أقل', hi: 'एक कम', bn: 'একটি কম', th: 'ลดหนึ่ง', ko: '하나 빼기', 'zh-Hans': '减一次', 'zh-Hant': '減一次', cs: 'O jedno míň', fa: 'یکی کمتر', id: 'Kurangi satu', lt: 'Vienu mažiau', sv: 'En färre', vi: 'Bớt một', da: 'Én mindre' },
  'Rep counter': { de: 'Wiederholungszähler', fr: 'Compteur de reps', es: 'Contador de reps', it: 'Contaripetizioni', 'pt-PT': 'Contador de reps', 'pt-BR': 'Contador de reps', pl: 'Licznik powtórzeń', hu: 'Ismétlésszámláló', tr: 'Tekrar sayacı', ru: 'Счётчик повторов', uk: 'Лічильник повторів', ar: 'عدّاد التكرارات', hi: 'रेप काउंटर', bn: 'রেপ কাউন্টার', th: 'ตัวนับครั้ง', ko: '반복 카운터', 'zh-Hans': '计次器', 'zh-Hant': '計次器', cs: 'Počítadlo opakování', fa: 'شمارنده تکرار', id: 'Penghitung repetisi', lt: 'Pakartojimų skaitiklis', sv: 'Repräknare', vi: 'Bộ đếm số lần', da: 'Gentagelsestæller' },
  'Automatic rep counting': { de: 'Automatisch Wdh. zählen', fr: 'Comptage automatique des reps', es: 'Conteo automático de reps', it: 'Conteggio automatico ripetizioni', 'pt-PT': 'Contagem automática de reps', 'pt-BR': 'Contagem automática de reps', pl: 'Automatyczne liczenie powtórzeń', hu: 'Automatikus ismétlésszámlálás', tr: 'Otomatik tekrar sayma', ru: 'Автоподсчёт повторов', uk: 'Автопідрахунок повторів', ar: 'العدّ التلقائي للتكرارات', hi: 'रेप्स की अपने-आप गिनती', bn: 'স্বয়ংক্রিয় রেপ গণনা', th: 'นับครั้งอัตโนมัติ', ko: '자동 반복 세기', 'zh-Hans': '自动计次', 'zh-Hant': '自動計次', cs: 'Automatické počítání opakování', fa: 'شمارش خودکار تکرار', id: 'Hitung repetisi otomatis', lt: 'Automatinis pakartojimų skaičiavimas', sv: 'Automatisk repräkning', vi: 'Tự động đếm số lần', da: 'Automatisk tælling af gentagelser' },
  'Counts reps for 30 barbell, dumbbell and cable exercises.': { de: 'Zählt Wdh. bei 30 Übungen mit Langhantel, Kurzhanteln und Kabelzug.', fr: 'Compte les reps de 30 exercices à la barre, aux haltères et à la poulie.', es: 'Cuenta reps en 30 ejercicios con barra, mancuernas y polea.', it: 'Conta le ripetizioni di 30 esercizi con bilanciere, manubri e cavi.', 'pt-PT': 'Conta reps em 30 exercícios com barra, halteres e polia.', 'pt-BR': 'Conta reps em 30 exercícios com barra, halteres e polia.', pl: 'Liczy powtórzenia w 30 ćwiczeniach ze sztangą, hantlami i na wyciągu.', hu: '30 rudas, kézisúlyzós és kábeles gyakorlat ismétléseit számolja.', tr: 'Halter, dambıl ve kablolu 30 egzersizde tekrarları sayar.', ru: 'Считает повторы в 30 упражнениях со штангой, гантелями и на блоке.', uk: 'Рахує повтори у 30 вправах зі штангою, гантелями та на блоці.', ar: 'يعدّ التكرارات في 30 تمرينًا بالبار والدمبل والكابل.', hi: 'बारबेल, डम्बल और केबल की 30 एक्सरसाइज़ में रेप्स गिनता है।', bn: 'বারবেল, ডাম্বেল ও কেবলের ৩০টি ব্যায়ামে রেপ গোনে।', th: 'นับครั้งใน 30 ท่าบาร์เบล ดัมเบล และเคเบิล', ko: '바벨·덤벨·케이블 운동 30가지의 반복을 세요.', 'zh-Hans': '为 30 个杠铃、哑铃和绳索动作计次。', 'zh-Hant': '為 30 個槓鈴、啞鈴和纜繩動作計次。', cs: 'Počítá opakování u 30 cviků s činkou, jednoručkami a na kladce.', fa: 'تکرارها را در ۳۰ حرکت با هالتر، دمبل و سیم‌کش می‌شمارد.', id: 'Menghitung repetisi untuk 30 latihan barbel, dumbel, dan kabel.', lt: 'Skaičiuoja pakartojimus 30 pratimų su štanga, hanteliais ir trosu.', sv: 'Räknar reps i 30 övningar med skivstång, hantlar och kabel.', vi: 'Đếm số lần cho 30 bài tập với tạ đòn, tạ đơn và cáp.', da: 'Tæller gentagelser i 30 øvelser med vægtstang, håndvægte og kabel.' },
  'Start with each set': { de: 'Mit jedem Satz starten', fr: 'Démarrer à chaque série', es: 'Empezar con cada serie', it: 'Avvia a ogni serie', 'pt-PT': 'Iniciar em cada série', 'pt-BR': 'Iniciar em cada série', pl: 'Startuj z każdą serią', hu: 'Indítás minden sorozatnál', tr: 'Her sette başlat', ru: 'Запускать с каждым подходом', uk: 'Запускати з кожним підходом', ar: 'ابدأ مع كل مجموعة', hi: 'हर सेट के साथ शुरू करें', bn: 'প্রতিটি সেটের সাথে শুরু', th: 'เริ่มทุกเซ็ต', ko: '세트마다 시작', 'zh-Hans': '每组自动开始', 'zh-Hant': '每組自動開始', cs: 'Spustit s každou sérií', fa: 'شروع با هر ست', id: 'Mulai di setiap set', lt: 'Pradėti su kiekviena serija', sv: 'Starta med varje set', vi: 'Bắt đầu theo mỗi hiệp', da: 'Start med hvert sæt' },
  'Off: start it with Count reps on the set page.': { de: 'Aus: Starte es mit „Wdh. zählen“ auf der Satzseite.', fr: 'Désactivé : lance-le avec « Compter les reps » sur la page de la série.', es: 'Desactivado: inícialo con «Contar reps» en la página de la serie.', it: 'Disattivato: avvialo con «Conta ripetizioni» nella pagina della serie.', 'pt-PT': 'Desligado: inicia com «Contar reps» na página da série.', 'pt-BR': 'Desligado: inicie com “Contar reps” na página da série.', pl: 'Wyłączone: uruchom przyciskiem „Licz automatycznie” na stronie serii.', hu: 'Ki: indítsd a sorozat oldalán az „Ismétlésszámlálás” gombbal.', tr: 'Kapalı: set sayfasında “Tekrar say” ile başlat.', ru: 'Выкл.: запускайте кнопкой «Считать повторы» на странице подхода.', uk: 'Вимк.: запускай кнопкою «Рахувати повтори» на сторінці підходу.', ar: 'متوقف: ابدأه بزر «عدّ التكرارات» في صفحة المجموعة.', hi: 'बंद: सेट पेज पर “रेप्स गिनें” से शुरू करें।', bn: 'বন্ধ: সেট পেজে “রেপ গুনুন” দিয়ে শুরু করুন।', th: 'ปิด: เริ่มด้วยปุ่ม “นับครั้ง” ในหน้าเซ็ต', ko: '끄면: 세트 화면의 ‘반복 세기’로 시작하세요.', 'zh-Hans': '关闭时：在组页面点“自动计次”开始。', 'zh-Hant': '關閉時：在組頁面點「自動計次」開始。', cs: 'Vypnuto: spusťte tlačítkem „Počítat opakování“ na stránce série.', fa: 'خاموش: با «شمارش تکرار» در صفحه ست شروع کنید.', id: 'Mati: mulai dengan Hitung repetisi di halaman set.', lt: 'Išjungta: pradėkite mygtuku „Skaičiuoti pakartojimus“ serijos puslapyje.', sv: 'Av: starta med Räkna reps på setsidan.', vi: 'Tắt: bắt đầu bằng nút Đếm số lần trên trang hiệp.', da: 'Fra: start den med Tæl gentagelser på sætsiden.' },
  'Counting test mode': { de: 'Testmodus Zählen', fr: 'Mode test du comptage', es: 'Modo de prueba del conteo', it: 'Modalità test conteggio', 'pt-PT': 'Modo de teste da contagem', 'pt-BR': 'Modo de teste da contagem', pl: 'Tryb testowy liczenia', hu: 'Számlálás tesztmód', tr: 'Sayma test modu', ru: 'Тестовый режим подсчёта', uk: 'Тестовий режим підрахунку', ar: 'وضع اختبار العدّ', hi: 'गिनती टेस्ट मोड', bn: 'গণনা টেস্ট মোড', th: 'โหมดทดสอบการนับ', ko: '세기 테스트 모드', 'zh-Hans': '计次测试模式', 'zh-Hant': '計次測試模式', cs: 'Testovací režim počítání', fa: 'حالت آزمایشی شمارش', id: 'Mode uji hitungan', lt: 'Skaičiavimo bandomasis režimas', sv: 'Testläge för räkning', vi: 'Chế độ thử đếm', da: 'Testtilstand for tælling' },
  'Samples: %lld': { de: 'Aufzeichnungen: %lld', fr: 'Enregistrements : %lld', es: 'Muestras: %lld', it: 'Registrazioni: %lld', 'pt-PT': 'Amostras: %lld', 'pt-BR': 'Amostras: %lld', pl: 'Próbki: %lld', hu: 'Minták: %lld', tr: 'Örnekler: %lld', ru: 'Записей: %lld', uk: 'Записів: %lld', ar: 'العينات: %lld', hi: 'नमूने: %lld', bn: 'নমুনা: %lld', th: 'ตัวอย่าง: %lld', ko: '기록: %lld', 'zh-Hans': '样本：%lld', 'zh-Hant': '樣本：%lld', cs: 'Záznamy: %lld', fa: 'نمونه‌ها: %lld', id: 'Sampel: %lld', lt: 'Įrašai: %lld', sv: 'Prover: %lld', vi: 'Mẫu: %lld', da: 'Prøver: %lld' },
  'Send samples to iPhone': { de: 'Aufzeichnungen ans iPhone', fr: 'Envoyer à l’iPhone', es: 'Enviar muestras al iPhone', it: 'Invia all’iPhone', 'pt-PT': 'Enviar amostras ao iPhone', 'pt-BR': 'Enviar amostras ao iPhone', pl: 'Wyślij próbki na iPhone’a', hu: 'Minták küldése az iPhone-ra', tr: 'Örnekleri iPhone’a gönder', ru: 'Отправить записи на iPhone', uk: 'Надіслати записи на iPhone', ar: 'أرسل العينات إلى iPhone', hi: 'नमूने iPhone पर भेजें', bn: 'নমুনা iPhone-এ পাঠান', th: 'ส่งตัวอย่างไป iPhone', ko: 'iPhone으로 기록 보내기', 'zh-Hans': '发送样本到 iPhone', 'zh-Hant': '傳送樣本到 iPhone', cs: 'Poslat záznamy do iPhonu', fa: 'ارسال نمونه‌ها به iPhone', id: 'Kirim sampel ke iPhone', lt: 'Siųsti įrašus į iPhone', sv: 'Skicka prover till iPhone', vi: 'Gửi mẫu sang iPhone', da: 'Send prøver til iPhone' },
  'Delete samples': { de: 'Aufzeichnungen löschen', fr: 'Supprimer les enregistrements', es: 'Borrar muestras', it: 'Elimina registrazioni', 'pt-PT': 'Apagar amostras', 'pt-BR': 'Apagar amostras', pl: 'Usuń próbki', hu: 'Minták törlése', tr: 'Örnekleri sil', ru: 'Удалить записи', uk: 'Видалити записи', ar: 'احذف العينات', hi: 'नमूने हटाएँ', bn: 'নমুনা মুছুন', th: 'ลบตัวอย่าง', ko: '기록 삭제', 'zh-Hans': '删除样本', 'zh-Hant': '刪除樣本', cs: 'Smazat záznamy', fa: 'حذف نمونه‌ها', id: 'Hapus sampel', lt: 'Ištrinti įrašus', sv: 'Radera prover', vi: 'Xóa mẫu', da: 'Slet prøver' },
  'Sent. On a Mac: Finder › iPhone › Files › Habcore Gym.': { de: 'Gesendet. Am Mac: Finder › iPhone › Dateien › Habcore Gym.', fr: 'Envoyé. Sur un Mac : Finder › iPhone › Fichiers › Habcore Gym.', es: 'Enviado. En un Mac: Finder › iPhone › Archivos › Habcore Gym.', it: 'Inviato. Su un Mac: Finder › iPhone › File › Habcore Gym.', 'pt-PT': 'Enviado. Num Mac: Finder › iPhone › Ficheiros › Habcore Gym.', 'pt-BR': 'Enviado. No Mac: Finder › iPhone › Arquivos › Habcore Gym.', pl: 'Wysłano. Na Macu: Finder › iPhone › Pliki › Habcore Gym.', hu: 'Elküldve. Macen: Finder › iPhone › Fájlok › Habcore Gym.', tr: 'Gönderildi. Mac’te: Finder › iPhone › Dosyalar › Habcore Gym.', ru: 'Отправлено. На Mac: Finder › iPhone › Файлы › Habcore Gym.', uk: 'Надіслано. На Mac: Finder › iPhone › Файли › Habcore Gym.', ar: 'أُرسلت. على Mac: Finder › iPhone › الملفات › Habcore Gym.', hi: 'भेजा गया। Mac पर: Finder › iPhone › Files › Habcore Gym।', bn: 'পাঠানো হয়েছে। Mac-এ: Finder › iPhone › Files › Habcore Gym।', th: 'ส่งแล้ว บน Mac: Finder › iPhone › ไฟล์ › Habcore Gym', ko: '보냈어요. Mac에서: Finder › iPhone › 파일 › Habcore Gym.', 'zh-Hans': '已发送。在 Mac 上：Finder › iPhone › 文件 › Habcore Gym。', 'zh-Hant': '已傳送。在 Mac 上：Finder › iPhone › 檔案 › Habcore Gym。', cs: 'Odesláno. Na Macu: Finder › iPhone › Soubory › Habcore Gym.', fa: 'ارسال شد. در Mac: Finder › iPhone › Files › Habcore Gym.', id: 'Terkirim. Di Mac: Finder › iPhone › File › Habcore Gym.', lt: 'Išsiųsta. „Mac“: Finder › iPhone › Failai › Habcore Gym.', sv: 'Skickat. På en Mac: Finder › iPhone › Filer › Habcore Gym.', vi: 'Đã gửi. Trên Mac: Finder › iPhone › Tệp › Habcore Gym.', da: 'Sendt. På en Mac: Finder › iPhone › Filer › Habcore Gym.' },
  'Nothing to send yet.': { de: 'Noch nichts zu senden.', fr: 'Rien à envoyer pour l’instant.', es: 'Aún no hay nada que enviar.', it: 'Ancora niente da inviare.', 'pt-PT': 'Ainda não há nada para enviar.', 'pt-BR': 'Ainda não há nada para enviar.', pl: 'Na razie nie ma czego wysłać.', hu: 'Még nincs mit küldeni.', tr: 'Henüz gönderilecek bir şey yok.', ru: 'Пока нечего отправить.', uk: 'Поки нічого надсилати.', ar: 'لا شيء لإرساله بعد.', hi: 'अभी भेजने को कुछ नहीं है।', bn: 'এখনও পাঠানোর কিছু নেই।', th: 'ยังไม่มีอะไรให้ส่ง', ko: '아직 보낼 기록이 없어요.', 'zh-Hans': '还没有可发送的内容。', 'zh-Hant': '還沒有可傳送的內容。', cs: 'Zatím není co poslat.', fa: 'هنوز چیزی برای ارسال نیست.', id: 'Belum ada yang bisa dikirim.', lt: 'Kol kas nėra ką siųsti.', sv: 'Inget att skicka än.', vi: 'Chưa có gì để gửi.', da: 'Intet at sende endnu.' },
  "Keeps each set's motion as a file, to tune the counter.": { de: 'Speichert die Bewegung jedes Satzes als Datei, um den Zähler abzustimmen.', fr: 'Garde le mouvement de chaque série dans un fichier pour régler le compteur.', es: 'Guarda el movimiento de cada serie en un archivo para ajustar el contador.', it: 'Salva il movimento di ogni serie in un file per tarare il contatore.', 'pt-PT': 'Guarda o movimento de cada série num ficheiro para afinar o contador.', 'pt-BR': 'Salva o movimento de cada série em um arquivo para ajustar o contador.', pl: 'Zapisuje ruch każdej serii do pliku, żeby dostroić licznik.', hu: 'Minden sorozat mozgását fájlba menti a számláló hangolásához.', tr: 'Sayacı ayarlamak için her setin hareketini dosyaya kaydeder.', ru: 'Сохраняет движение каждого подхода в файл для настройки счётчика.', uk: 'Зберігає рух кожного підходу у файл для налаштування лічильника.', ar: 'يحفظ حركة كل مجموعة في ملف لضبط العدّاد.', hi: 'काउंटर को ट्यून करने के लिए हर सेट की हरकत फ़ाइल में रखता है।', bn: 'কাউন্টার টিউন করতে প্রতিটি সেটের নড়াচড়া ফাইলে রাখে।', th: 'เก็บการเคลื่อนไหวของแต่ละเซ็ตเป็นไฟล์เพื่อปรับตัวนับ', ko: '카운터를 다듬기 위해 세트마다 움직임을 파일로 저장해요.', 'zh-Hans': '把每组的动作存成文件，用来调校计次。', 'zh-Hant': '把每組的動作存成檔案，用來調校計次。', cs: 'Ukládá pohyb každé série do souboru pro ladění počítadla.', fa: 'حرکت هر ست را برای تنظیم شمارنده در یک فایل نگه می‌دارد.', id: 'Menyimpan gerakan setiap set sebagai file untuk menyetel penghitung.', lt: 'Kiekvienos serijos judesį įrašo į failą skaitikliui derinti.', sv: 'Sparar varje sets rörelse som en fil för att finjustera räknaren.', vi: 'Lưu chuyển động của mỗi hiệp thành tệp để tinh chỉnh bộ đếm.', da: 'Gemmer hvert sæts bevægelse som en fil til at finjustere tælleren.' },
  'Forget corrections': { de: 'Korrekturen vergessen', fr: 'Oublier les corrections', es: 'Olvidar correcciones', it: 'Dimentica le correzioni', 'pt-PT': 'Esquecer correções', 'pt-BR': 'Esquecer correções', pl: 'Zapomnij poprawki', hu: 'Javítások elfelejtése', tr: 'Düzeltmeleri unut', ru: 'Забыть поправки', uk: 'Забути виправлення', ar: 'انسَ التصحيحات', hi: 'सुधार भूल जाएँ', bn: 'সংশোধন ভুলে যান', th: 'ล้างการแก้ไข', ko: '보정 지우기', 'zh-Hans': '清除校正', 'zh-Hant': '清除校正', cs: 'Zapomenout opravy', fa: 'فراموش کردن اصلاحات', id: 'Lupakan koreksi', lt: 'Pamiršti pataisymus', sv: 'Glöm korrigeringar', vi: 'Quên các chỉnh sửa', da: 'Glem rettelser' },
}
Object.assign(OWN, REPS)

// Info.plist's own (the Apple Health permission prompts), into InfoPlist.strings.
const PLIST = {
  NSHealthShareUsageDescription: {
    ar: 'يعرض Habcore Gym نبضك أثناء التمرين وبجانب كل مجموعة، ويستخدم تاريخ ميلادك لنطاقات النبض.',
    bn: 'Habcore Gym ওয়ার্কআউটের সময় এবং প্রতিটি সেটের পাশে তোমার হার্ট রেট দেখায়, এবং হার্ট রেট জোনের জন্য তোমার জন্মতারিখ ব্যবহার করে।',
    cs: 'Habcore Gym ukazuje tvůj tep během tréninku a u každé série a pro tepové zóny používá tvé datum narození.',
    de: 'Habcore Gym zeigt deinen Puls während des Trainings und neben jedem Satz und nutzt dein Geburtsdatum für die Pulszonen.',
    es: 'Habcore Gym muestra tu pulso durante el entreno y junto a cada serie, y usa tu fecha de nacimiento para las zonas de pulso.',
    fa: 'Habcore Gym ضربان قلبت را حین تمرین و کنار هر ست نشان می\u200cدهد و برای ناحیه\u200cهای ضربان از تاریخ تولدت استفاده می\u200cکند.',
    fr: 'Habcore Gym affiche ton pouls pendant la séance et à côté de chaque série, et utilise ta date de naissance pour les zones cardiaques.',
    hi: 'Habcore Gym वर्कआउट के दौरान और हर सेट के पास तुम्हारी हार्ट रेट दिखाता है, और हार्ट रेट ज़ोन के लिए तुम्हारी जन्मतिथि इस्तेमाल करता है।',
    hu: 'Az Habcore Gym edzés közben és minden sorozat mellett mutatja a pulzusodat, a pulzuszónákhoz pedig a születési dátumodat használja.',
    id: 'Habcore Gym menampilkan detak jantungmu selama latihan dan di samping setiap set, dan memakai tanggal lahirmu untuk zona detak jantung.',
    it: "Habcore Gym mostra il tuo battito durante l'allenamento e accanto a ogni serie, e usa la tua data di nascita per le zone cardiache.",
    ko: 'Habcore Gym은 운동 중과 각 세트 옆에 심박수를 보여 주고, 심박수 구간에 생년월일을 사용합니다.',
    lt: 'Habcore Gym rodo tavo pulsą treniruotės metu ir prie kiekvienos serijos, o pulso zonoms naudoja tavo gimimo datą.',
    pl: 'Habcore Gym pokazuje twoje tętno podczas treningu i przy każdej serii, a do stref tętna używa twojej daty urodzenia.',
    'pt-BR': 'O Habcore Gym mostra sua frequência cardíaca durante o treino e ao lado de cada série, e usa sua data de nascimento para as zonas cardíacas.',
    'pt-PT': 'O Habcore Gym mostra a tua frequência cardíaca durante o treino e junto a cada série, e usa a tua data de nascimento para as zonas cardíacas.',
    ru: 'Habcore Gym показывает пульс во время тренировки и рядом с каждым подходом, а для пульсовых зон использует твою дату рождения.',
    sv: 'Habcore Gym visar din puls under passet och vid varje set och använder ditt födelsedatum för pulszonerna.',
    th: 'Habcore Gym แสดงอัตราการเต้นของหัวใจระหว่างออกกำลังกายและข้างแต่ละเซ็ต และใช้วันเกิดของคุณสำหรับโซนหัวใจ',
    tr: 'Habcore Gym antrenman sırasında ve her setin yanında nabzını gösterir, nabız bölgeleri için doğum tarihini kullanır.',
    uk: 'Habcore Gym показує пульс під час тренування і біля кожного підходу, а для пульсових зон використовує твою дату народження.',
    vi: 'Habcore Gym hiển thị nhịp tim của bạn trong lúc tập và cạnh mỗi hiệp, và dùng ngày sinh của bạn cho các vùng nhịp tim.',
    'zh-Hans': 'Habcore Gym 会在训练中和每组旁显示你的心率，并用你的出生日期计算心率区间。',
    'zh-Hant': 'Habcore Gym 會在訓練中和每組旁顯示你的心率，並用你的出生日期計算心率區間。',
  },
  NSHealthUpdateUsageDescription: {
    de: 'Habcore Gym speichert deine Trainings in Apple Health, wenn du das einschaltest.', fr: 'Habcore Gym enregistre tes séances dans Apple Santé si tu l’actives.',
    es: 'Habcore Gym guarda tus entrenos en Apple Salud si lo activas.', it: 'Habcore Gym salva i tuoi allenamenti in Apple Salute se lo attivi.',
    'pt-PT': 'O Habcore Gym guarda os teus treinos no Apple Saúde se o ativares.', 'pt-BR': 'O Habcore Gym salva seus treinos no Apple Saúde se você ativar.',
    pl: 'Habcore Gym zapisuje treningi w Apple Zdrowie, jeśli to włączysz.', hu: 'Az Habcore Gym az Apple Egészség appba menti az edzéseidet, ha bekapcsolod.',
    tr: 'Açarsan Habcore Gym antrenmanlarını Apple Sağlık’a kaydeder.', ru: 'Habcore Gym сохраняет тренировки в Apple Здоровье, если вы это включите.',
    uk: 'Habcore Gym зберігає тренування в Apple Здоров’я, якщо ти це ввімкнеш.', ar: 'يحفظ Habcore Gym تمارينك في Apple صحتي إذا فعّلت ذلك.',
    hi: 'चालू करने पर Habcore Gym आपके वर्कआउट Apple Health में सहेजता है।', bn: 'চালু করলে Habcore Gym আপনার ওয়ার্কআউট Apple Health-এ সেভ করে।',
    th: 'Habcore Gym บันทึกการฝึกลงใน Apple Health เมื่อคุณเปิดใช้', ko: '켜면 Habcore Gym이 운동을 Apple 건강에 저장해요.',
    'zh-Hans': '打开后，Habcore Gym 会把训练保存到 Apple 健康。', 'zh-Hant': '開啟後，Habcore Gym 會把訓練儲存到 Apple 健康。',
    cs: 'Habcore Gym ukládá tvoje tréninky do Apple Zdraví, když to zapneš.', fa: 'اگر روشن کنید، Habcore Gym تمرین‌هایتان را در Apple Health ذخیره می‌کند.', id: 'Habcore Gym menyimpan latihanmu ke Apple Kesehatan jika kamu menyalakannya.', lt: 'Jei įjungsite, „Habcore Gym“ išsaugos jūsų treniruotes „Apple Health“.', sv: 'Habcore Gym sparar dina pass i Apple Hälsa om du slår på det.', vi: 'Habcore Gym lưu buổi tập của bạn vào Apple Sức khỏe khi bạn bật tính năng này.',
  },
}

// Danish (#1039): the watch's own lines.
OWN['Turn on Apple Health on your iPhone and Habcore Gym stays on screen through rests and holds.'].da = 'Slå Apple Sundhed til på din iPhone, så bliver Habcore Gym på skærmen under pauser og hold.'
for (const [k, v] of Object.entries({"No workout running": "Ingen træning i gang", "Not synced yet": "Ikke synkroniseret endnu", "Open Habcore Gym on your iPhone once and your routines show up here.": "Åbn Habcore Gym på din iPhone én gang, så dukker dine rutiner op her.", "Start one on your iPhone and it shows up here.": "Start en på din iPhone, så dukker den op her.", "All sets done": "Alle sæt klaret", "measuring": "måler …", "%@, set %lld": "%@, sæt %lld", "Calories": "Kalorier", "Heart rate": "Puls", "Hold": "Hold", "Stop": "Stop", "Start hold": "Start hold", "Workout saved": "Træning gemt", "Ended on your iPhone": "Afsluttet på din iPhone", "Log this one on your iPhone.": "Log den her på din iPhone.", "All done?": "Færdig?", "Lock": "Lås", "Skip this set?": "Spring dette sæt over?", "Turn the Digital Crown to change it.": "Drej på Digital Crown for at ændre det.", "%lld avg · %lld max": "snit %lld · maks %lld", "Set %lld of %lld": "Sæt %lld af %lld", "%lld of %lld sets": "%lld af %lld sæt", "Tap to change it.": "Tryk for at ændre det.", "Added weight": "Ekstra vægt", "Your rest, your next set, or today's workout.": "Din pause, dit næste sæt eller dagens træning.", "Opens Habcore Gym.": "Åbner Habcore Gym.", "Hold to finish": "Hold inde for at afslutte", "iPhone out of reach": "iPhone uden for rækkevidde", "No set for %lld min. Still at it?": "Intet sæt i %lld min. Er du stadig i gang?", "A skipped set is still waiting.": "Et sprunget sæt venter stadig.", "avg": "gns.", "No effort rated yet": "Ingen anstrengelse vurderet endnu", "max": "maks.", "min": "min.", "No sets yet": "Ingen sæt endnu", "+%lld more": "+%lld mere", "%@ sets": "%@ sæt"})) OWN[k].da = v
for (const [k, v] of Object.entries({"NSHealthShareUsageDescription": "Habcore Gym viser din puls under træningen og ved hvert sæt og bruger din fødselsdato til pulszonerne.", "NSHealthUpdateUsageDescription": "Habcore Gym gemmer dine træninger i Apple Sundhed, hvis du slår det til."})) PLIST[k].da = v

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
let problems = 0
for (const [pack, lproj] of Object.entries(LANGS)) {
  const { default: dict } = await import(pathToFileURL(join(root, 'src', 'locales', pack + '.js')).href)
  const lines = [`/* Habcore Gym on the Apple Watch, ${lproj}. Written by ios/ci/watch-strings.mjs: change that, not this. */`, '']
  const put = (k, v) => {
    if (!v) { console.error(`${lproj}: no word for "${k}"`); problems++; return }
    if (/—/.test(v)) { console.error(`${lproj}: em dash in "${k}"`); problems++ }
    lines.push(`"${esc(k)}" = "${esc(v)}";`)
  }
  for (const [k, appKey] of Object.entries(FROM_APP)) put(k, dict[appKey])
  for (const [k, [appKey, f]] of Object.entries(COMPOSED)) put(k, dict[appKey] && f(dict[appKey]))
  for (const [k, tr] of Object.entries(OWN)) put(k, tr[lproj])
  mkdirSync(join(out, `${lproj}.lproj`), { recursive: true })
  writeFileSync(join(out, `${lproj}.lproj`, 'Localizable.strings'), lines.join('\n') + '\n')
  // The widget says a few of the same words (Rest, Start workout).
  mkdirSync(join(widgets, `${lproj}.lproj`), { recursive: true })
  writeFileSync(join(widgets, `${lproj}.lproj`, 'Localizable.strings'), lines.join('\n') + '\n')
  const plist = [`/* Habcore Gym on the Apple Watch, ${lproj}: Info.plist. Written by ios/ci/watch-strings.mjs. */`, '']
  for (const [k, tr] of Object.entries(PLIST)) {
    if (!tr[lproj] || /—/.test(tr[lproj])) { console.error(`${lproj}: ${k} missing or with an em dash`); problems++; continue }
    plist.push(`"${k}" = "${esc(tr[lproj])}";`)
  }
  writeFileSync(join(out, `${lproj}.lproj`, 'InfoPlist.strings'), plist.join('\n') + '\n')
}
// English: every key as itself. Without an en.lproj a watch set to another language could show
// that language's words to an app in English.
{
  const keys = [...Object.keys(FROM_APP), ...Object.keys(COMPOSED), ...Object.keys(OWN)]
  const lines = ['/* Habcore Gym on the Apple Watch, en. Written by ios/ci/watch-strings.mjs: change that, not this. */', '']
  for (const k of keys) lines.push(`"${esc(k)}" = "${esc(k)}";`)
  for (const dir of [out, widgets]) {
    mkdirSync(join(dir, 'en.lproj'), { recursive: true })
    writeFileSync(join(dir, 'en.lproj', 'Localizable.strings'), lines.join('\n') + '\n')
  }
}
if (problems) process.exit(1)
console.log(`wrote ${Object.keys(LANGS).length} languages`)
