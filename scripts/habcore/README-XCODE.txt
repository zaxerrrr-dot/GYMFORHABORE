Habcore Gym - projekt Xcode: iPhone + Apple Watch, darmowe Apple ID (Personal Team)
=====================================================================================

Co jest w zipie
- frontend/ios/App/App.xcworkspace  <- TO otwierasz (nie App.xcodeproj)
- frontend/ios/App/...               projekt iOS po `npx cap sync ios`: strona aplikacji juz w srodku
                                     (App/public) RAZEM ze wszystkimi obrazkami i animacjami cwiczen
                                     (App/public/exercise-media, nota licencyjna: NOTICE.md obok),
                                     Pods juz zainstalowane (folder Pods)
- frontend/node_modules/...          tylko wtyczki Capacitora, do ktorych odwoluja sie Pods (nie usuwaj)
- ustaw-identyfikator.command        zmienia identyfikator aplikacji naraz w iPhonie i w zegarku (krok 4)
- Targety (Xcode nazywa je TARGETS):
    App           - iPhone, Bundle Identifier pl.habcore.gym
    OpenGymWatch  - Apple Watch, Bundle Identifier pl.habcore.gym.watchkitapp (wbudowany w App)
  Uprawnienia: HealthKit w obu (App/App.entitlements, Watch/OpenGymWatch.entitlements).
  App Groups sa USUNIETE (darmowe konto ich nie potrzebuje: sluzyly tylko widzetom, ktorych tu nie ma).

Potrzebne
- Mac z Xcode 26 lub nowszym, iPhone (iOS 15.5+) i Apple Watch (watchOS 10+) sparowany z tym iPhone'em.
- CocoaPods NIE jest potrzebne (Pods sa w zipie).
- Darmowe Apple ID wystarczy. Ograniczenia darmowego konta: podpis wazny 7 dni, max. 3 aplikacje
  zainstalowane z Xcode naraz na urzadzeniu, max. 10 nowych identyfikatorow (App ID) na 7 dni.
  iPhone + zegarek to 2 identyfikatory.

KROK PO KROKU
--------------
1. Rozpakuj zip, najlepiej do folderu bez spacji, np. ~/HabcoreGym-xcode.

2. Tryb dewelopera:
   - iPhone: Ustawienia > Prywatnosc i ochrona > Tryb dewelopera > wlacz (telefon sie zrestartuje).
     (Opcja pojawia sie dopiero, gdy iPhone byl podlaczony do Maca z otwartym Xcode.)
   - Apple Watch: na zegarku Ustawienia > Prywatnosc i ochrona > Tryb dewelopera > wlacz (restart zegarka).
     (Pojawia sie dopiero, gdy Xcode "zobaczy" zegarek - patrz krok 7.)

3. Dwuklik frontend/ios/App/App.xcworkspace (otworzy sie Xcode).
   Xcode > Settings... > Accounts > "+" > Apple ID > zaloguj sie. Pojawi sie zespol
   "<Twoje imie> (Personal Team)".

4. Identyfikator aplikacji. Jesli przy ostatniej instalacji (test HealthKit) dzialalo pl.habcore.gym,
   zostaw. Jesli Xcode pisze, ze identyfikator jest zajety ("Failed to register bundle identifier",
   "cannot be registered to your development team"), zamknij Xcode i dwuklik
   ustaw-identyfikator.command (w Finderze: prawy klik > Open, jesli macOS ostrzega), wpisz np.
   pl.habcore.gym.sylwester. Skrypt zmieni naraz iPhone (pl.habcore.gym.sylwester),
   zegarek (pl.habcore.gym.sylwester.watchkitapp) i ich powiazanie (Watch/Info.plist,
   WKCompanionAppBundleIdentifier). Potem znow otworz App.xcworkspace.
   Recznie to samo: identyfikator zegarka MUSI byc identyfikatorem iPhone'a + ".watchkitapp",
   a WKCompanionAppBundleIdentifier w Watch/Info.plist MUSI byc identyfikatorem iPhone'a.

5. Podpis - iPhone: w lewym panelu (Project navigator) kliknij niebieska ikone "App" (projekt) >
   TARGETS: App > zakladka "Signing & Capabilities":
   - zaznacz "Automatically manage signing",
   - Team: "<Twoje imie> (Personal Team)".
   - Na liscie capabilities ma byc "HealthKit" (tak jak w udanym tescie).

6. Podpis - zegarek: TARGETS: OpenGymWatch > "Signing & Capabilities" > to samo:
   "Automatically manage signing", Team: ten sam Personal Team. HealthKit zostaje.

7. Instalacja na iPhonie (zegarek przy okazji):
   - iPhone podlaczony kablem, odblokowany, "Zaufaj temu komputerowi".
   - Zegarek na rece, odblokowany, w poblizu iPhone'a (Bluetooth i Wi-Fi wlaczone na obu).
   - U gory okna Xcode: schemat "App", urzadzenie: Twoj iPhone.
   - Product > Run (Cmd+R). Pierwsza kompilacja trwa kilka minut. Xcode buduje TEZ aplikacje zegarka
     (jest wbudowana w aplikacje iPhone'a).
   - iPhone: Ustawienia > Ogolne > VPN i zarzadzanie urzadzeniami > Twoje Apple ID > Zaufaj.
     Potem uruchom Habcore Gym.

8. Instalacja na zegarku - jeden z dwoch sposobow:
   a) Najprosciej: na iPhonie aplikacja Watch > zakladka "Moj zegarek" > przewin do "Dostepne
      aplikacje" > Habcore Gym > "Instaluj". (Jesli wlaczone "Automatyczna instalacja aplikacji",
      zainstaluje sie sama po kroku 7.)
   b) Z Xcode: Window > Devices and Simulators - zegarek ma byc widoczny pod iPhone'em (za pierwszym
      razem Xcode przygotowuje zegarek "Preparing Apple Watch..." kilka-kilkanascie minut; zegarek ma
      byc odblokowany). Potem u gory: schemat "OpenGymWatch", urzadzenie: Twoj zegarek
      (np. "Apple Watch Sylwestra via iPhone") > Product > Run.
   Na zegarku przy pierwszym uruchomieniu zgodz sie na Zdrowie (tetno, trening).

9. Zdrowie: w aplikacji na iPhonie Ustawienia > Zdrowie > wlacz. Pokaze sie systemowe okno Apple Zdrowie
   - zaznacz wszystko. Trening na zegarku zapisuje sie w Apple Zdrowie (tetno, kalorie).

10. Polaczenie z serwerem: "Polacz z moim serwerem" (adres https://sv.metin2sp.pl/opengym jest wpisany),
    kod z przegladarki: Ustawienia > Konto > "Paruj aplikacje mobilna".

CO 7 DNI
- Podpis darmowego konta wygasa po 7 dniach (aplikacja przestaje sie otwierac, dane zostaja).
  Podlacz iPhone, otworz projekt, schemat "App" > Product > Run. Zegarek odswieza sie razem z iPhone'em;
  gdyby nie - krok 8.

GDY XCODE ZGLASZA BLAD PRZY ZEGARKU
- "Failed to register bundle identifier" / "is not available" przy OpenGymWatch: krok 4 (nowy
  identyfikator dla obu naraz skryptem).
- "Embedded binary's bundle identifier is not prefixed with the parent app's bundle identifier"
  albo "WKCompanionAppBundleIdentifier ... does not match": identyfikatory sie rozjechaly - krok 4.
- "No profiles for 'pl.habcore.gym.watchkitapp' were found" / "requires a provisioning profile":
  TARGETS: OpenGymWatch > Signing & Capabilities > wybierz Team ponownie (Personal Team), poczekaj,
  az zniknie czerwony komunikat; ewentualnie Product > Clean Build Folder (Shift+Cmd+K) i Run.
- "Your maximum App ID limit has been reached. You may create up to 10 App IDs every 7 days":
  nie zmieniaj juz identyfikatora - wroc do tego, ktory dzialal, albo odczekaj do 7 dni.
- "The maximum number of apps for free development profiles has been reached": usun z iPhone'a inna
  aplikacje zainstalowana z Xcode/SideStore (darmowe konto: max. 3 naraz).
- "Could not locate device support files" / "watchOS ... is not supported by this Xcode":
  zaktualizuj Xcode (App Store) do wersji, ktora zna wersje watchOS zegarka.
- "Apple Watch is not connected" / zegarek "unavailable" w Devices and Simulators: odblokuj zegarek,
  wlacz na nim Tryb dewelopera (krok 2), iPhone i Mac w tej samej sieci Wi-Fi, w Devices and
  Simulators przy zegarku "Trust"/"Pair"; restart zegarka pomaga.
- "HealthKit ... Personal development teams do not support": nie powinno wystapic (test przeszedl);
  jesli jednak - zrzut ekranu i daj znac.
- Jesli zegarek mimo wszystko nie chce sie podpisac, mozesz zbudowac sam iPhone (jak w tescie):
  TARGETS: App > "Build Phases" > "Embed Watch Content" > zaznacz OpenGymWatch.app > "-",
  oraz "Target Dependencies" > OpenGymWatch > "-". Wtedy dziala bez zegarka.

TRENING NA ZYWO Z TRENEREM
- Konto klienta w silowni: kazdy trening uruchomiony na iPhonie (lub na zegarku) widzi na zywo trener,
  ktory prowadzi Twoje konto ("Prowadz jako klient") - na stronie albo w tej aplikacji. Cwiczenia i serie,
  ktore trener doda, pojawiaja sie w trwajacym treningu na iPhonie po 1-2 s, a stamtad na zegarku.
  Na gorze treningu widac "NA ZYWO".
- Zakonczenie: zapis (i Apple Zdrowie) robi Twoj iPhone/zegarek - takze gdy "Zakoncz" nacisnie trener.

Zrodlo: https://github.com/zaxerrrr-dot/GYMFORHABORE (fork openGym, AGPL-3.0). Obrazki i animacje cwiczen:
Gym visual (gymvisual.com), na zasadach z NOTICE.md - tylko w tej aplikacji, bez kopiowania dalej.
