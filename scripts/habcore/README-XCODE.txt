Habcore Gym - projekt Xcode (test: czy darmowe Apple ID dostaje HealthKit)
==========================================================================

Co jest w zipie
- frontend/ios/App/App.xcworkspace  <- TO otwierasz (nie App.xcodeproj)
- frontend/ios/App/...               projekt iOS po `npx cap sync ios`, strona aplikacji juz w srodku
                                     (App/public), Pods juz zainstalowane (folder Pods)
- frontend/node_modules/...          tylko wtyczki Capacitora, do ktorych odwoluja sie Pods (nie usuwaj)
- Animacje cwiczen sa usuniete, zeby zip byl mniejszy (w aplikacji beda puste miejsca na obrazki).
- Targety: App (iPhone, bundle id pl.habcore.gym) i OpenGymWatch (zegarek, pl.habcore.gym.watchkitapp).
  Uprawnienia: HealthKit + App Group group.pl.habcore.gym (App/App.entitlements, Watch/OpenGymWatch.entitlements).

Potrzebne: Mac z Xcode 26 lub nowszym (ten sam, ktorym budowal GitHub), iPhone z Trybem dewelopera.
CocoaPods NIE jest potrzebne (Pods sa w zipie).

Krok po kroku
1. Rozpakuj zip (najlepiej do folderu bez spacji, np. ~/HabcoreGym-xcode).
2. Dwuklik frontend/ios/App/App.xcworkspace (otworzy sie Xcode).
3. Xcode > Settings... > Accounts > "+" > Apple ID > zaloguj sie swoim darmowym Apple ID.
   Pojawi sie zespol "<Twoje imie> (Personal Team)".
4. W lewym panelu kliknij niebieska ikone "App" (projekt) > TARGETS: App > zakladka "Signing & Capabilities":
   - zaznacz "Automatically manage signing",
   - Team: wybierz "(Personal Team)",
   - Bundle Identifier: zostaw pl.habcore.gym.
     Jesli Xcode napisze, ze identyfikator jest zajety ("cannot be registered"), wpisz np.
     pl.habcore.gym.sylwester - wtedy w targecie OpenGymWatch ustaw pl.habcore.gym.sylwester.watchkitapp,
     a w pliku Watch/Info.plist zmien WKCompanionAppBundleIdentifier na pl.habcore.gym.sylwester.
   - Na liscie capabilities powinny byc "HealthKit" i "App Groups". To jest wlasnie test:
     * jesli przy HealthKit pojawi sie blad typu "Personal development teams ... do not support the HealthKit
       capability" - darmowe konto NIE dostaje HealthKit (wynik testu, zapisz zrzut);
     * jesli blad dotyczy tylko "App Groups" - usun App Groups ("x"/kosz przy tej sekcji) i probuj dalej
       (aplikacja na iPhonie dziala bez App Group).
5. To samo dla TARGETS: OpenGymWatch (Team: Personal Team). Jesli zegarek sprawia klopot, wylacz go:
   TARGETS: App > zakladka "Build Phases" > "Embed Watch Content" > zaznacz OpenGymWatch.app > "-",
   oraz "Target Dependencies" > OpenGymWatch > "-". Wtedy budujesz sam iPhone.
6. U gory okna: schemat "App", urzadzenie: Twoj iPhone (podlaczony kablem, odblokowany, "Zaufaj").
7. Product > Run (Cmd+R). Pierwsza kompilacja trwa kilka minut.
8. Na iPhonie: Ustawienia > Ogolne > VPN i zarzadzanie urzadzeniami > Twoje Apple ID > Zaufaj. Potem uruchom aplikacje.
9. Test Zdrowia: w aplikacji Ustawienia > Zdrowie > wlacz. Ma sie pokazac SYSTEMOWE okno Apple Zdrowie z lista
   zgod. Jesli sie pokaze - darmowe konto dostaje HealthKit. Jesli jest komunikat "Nie przyznano uprawnienia
   Apple Zdrowie" bez okna - nie dostaje.
10. Zegarek (jesli zostal): w aplikacji Watch na iPhonie > Dostepne aplikacje > Habcore Gym > Instaluj,
    albo w Xcode wybierz schemat "OpenGymWatch" i zegarek jako urzadzenie > Product > Run.

Uwagi
- Darmowe konto: podpis wazny 7 dni, potem znow Product > Run z Maca.
- Logowanie: "Polacz z moim serwerem" (adres https://sv.metin2sp.pl/opengym jest wpisany),
  kod z przegladarki: Ustawienia > Konto > "Paruj aplikacje mobilna".
- Zrodlo: https://github.com/zaxerrrr-dot/GYMFORHABORE (fork openGym, AGPL-3.0).
