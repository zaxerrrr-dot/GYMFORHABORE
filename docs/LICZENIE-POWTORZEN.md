# Liczenie powtórzeń na Apple Watch (wersja 1)

Zegarek sam liczy powtórzenia w 30 popularnych ćwiczeniach ze sztangą, hantlami i na wyciągu.
Liczy tylko w trakcie serii. Na końcu pokazuje wynik do potwierdzenia, a po zapisie seria trafia
do treningu tą samą drogą co wpisana ręcznie (zegarek → iPhone → serwer).

## Jak to działa (w skrócie)

- Czujniki: CoreMotion, `CMMotionManager` device motion przy 50 Hz: przyspieszenie bez grawitacji
  przeliczone na układ świata (oś Z w górę, z `attitude.rotationMatrix`) i żyroskop. Czujniki działają
  **tylko podczas liczonej serii**. Po końcu serii, anulowaniu albo po 90 s bez ruchu same się wyłączają.
- Przy włączonym Apple Zdrowie (Ustawienia → Zdrowie na iPhonie) zegarek ma aktywną sesję treningu
  (`HKWorkoutSession`). Dzięki niej liczenie działa dalej, gdy opuścisz nadgarstek. **Do testów miej
  Zdrowie włączone.**
- Algorytm (`frontend/ios/App/WatchCore/Sources/WatchCore/RepCounter.swift`, czysty Swift, testy XCTest):
  1. sygnał zależny od ćwiczenia: ruch pionowy (prędkość w osi grawitacji), poziomy albo główny kierunek
     w 3D (PCA z ostatnich 3 s), albo obrót nadgarstka (żyroskop wokół głównej osi, PCA);
  2. filtr dolnoprzepustowy Butterwortha 2. rzędu 2,5 Hz, a dla osi liniowych całkowanie do prędkości
     z wolnym odjęciem średniej (pasmo ok. 0,04–2,5 Hz);
  3. połówki ruchu („płaty”) z histerezą: start po przekroczeniu progu, koniec poniżej 35% progu;
  4. powtórzenie = dwa sąsiednie płaty o przeciwnym znaku (np. w dół i w górę), gdy całe powtórzenie
     mieści się w zakresie czasu z profilu, przerwa między połówkami nie jest za długa, a połówki mają
     podobną skalę. Samotny płat, na przykład zdjęcie sztangi ze stojaka albo niedokończony ruch, nie jest liczony;
  5. próg dopasowuje się do serii (35% mediany mniejszych połówek). Druga połówka, zwykle wolniejsza
     faza ekscentryczna, ma niższy próg;
  6. koniec serii: brak nowego powtórzenia przez ~5 s (dla bardzo wolnych powtórzeń 2× ich czas)
     i nadgarstek w spoczynku, albo przycisk **Stop**.
- Nauka z poprawek (lokalnie na zegarku, osobno dla każdego ćwiczenia): stosunek poprawione/policzone
  (średnia krocząca), typowa amplituda powtórzeń oraz mnożnik progu. Ten mnożnik po każdej serii
  zmienia się łagodnie: za dużo policzonych podnosi próg, za mało obniża. Zakres mnożnika to 0,5–2,5.

## Budowanie i instalacja

Po wypchnięciu na `main` w GYMFORHABORE GitHub Actions („Build iOS (SideStore)”) buduje wydanie
`habcore-<numer>` z plikiem **HabcoreGym-xcode.zip**.

**Sposób A, zip (najprościej):**
1. GitHub → GYMFORHABORE → Releases → najnowsze `habcore-…` → pobierz `HabcoreGym-xcode.zip`.
2. Rozpakuj go (najlepiej do nowego folderu) i otwórz `frontend/ios/App/App.xcworkspace`.
3. Podpis jak dotąd (README-XCODE.txt w zipie, kroki 4–6). Target zegarka nadal nazywa się `OpenGymWatch`.
4. **Product → Clean Build Folder** (Shift+Cmd+K).
5. Schemat **App**, urządzenie: iPhone → **Product → Run**. Aplikacja zegarka buduje się razem z nią.
6. Na zegarek: aplikacja Watch na iPhonie → Habcore Gym → Instaluj. Możesz też w Xcode wybrać
   schemat **OpenGymWatch** i urządzenie: zegarek → Run.

**Sposób B, z repozytorium (`git pull`):**
```bash
git pull                      # gałąź main z GYMFORHABORE
cd frontend
npm ci
npm run build:mobile && npx cap sync ios
NO_WATCH_WIDGETS=1 ruby ios/ci/add-watch-app.rb   # dokłada target OpenGymWatch (jak w Actions)
open ios/App/App.xcworkspace
```
Dalej jak w sposobie A, od kroku 3 (Clean Build Folder i Run).

Jeśli Xcode zgłosi błąd w nowych plikach, zrób zrzut ekranu (Report navigator, Cmd+9) albo skopiuj
linie z `error:`.
Nowe pliki: `Watch/RepCount.swift`, `Watch/RepCountView.swift`, `Watch/RepSensor.swift`,
`WatchCore/Sources/WatchCore/RepCounter.swift`, `WatchCore/Sources/WatchCore/RepProfiles.swift`.

## Ustawienia (na zegarku)

Ekran startowy zegarka (bez trwającego treningu) → przewiń na dół → **Licznik powtórzeń**:

| Przełącznik | Domyślnie | Co robi |
|---|---|---|
| Automatyczne liczenie powtórzeń | **wł.** | Przycisk „Licz automatycznie” przy 30 ćwiczeniach z listy |
| Startuj z każdą serią | wył. | Liczenie rusza samo, gdy pojawia się seria (po przerwie) |
| Tryb testowy liczenia | wył. | Zapisuje surowe próbki każdej serii do pliku |
| Zapomnij poprawki | – | Kasuje to, czego licznik nauczył się z poprawek |

## Jak używać

1. W treningu na stronie serii ćwiczenia z listy jest mały przycisk **Licz automatycznie** (obok
   oznaczeń serii). Ustaw ciężar jak zawsze, stań w pozycji i stuknij przycisk.
   Przy włączonym „Startuj z każdą serią” liczenie rusza samo.
2. Duży licznik, lekka wibracja przy każdym powtórzeniu.
3. Po ~5 s bez ruchu, albo po stuknięciu **Stop**, pojawia się „Policzone powtórzenia: 12”.
   Popraw koroną Digital Crown albo przyciskami −/+, potem **Zapisz**. Seria zapisuje się z ciężarem
   ze strony serii i tymi powtórzeniami, a potem zaczyna się przerwa, jak po „Gotowe”.
   **✕** anuluje: nic się nie zapisuje i można wpisać serię ręcznie.
4. Ćwiczenia jednorącz (wiosłowanie hantlem jednorącz, unoszenie bokiem na wyciągu): **zegarek musi
   być na ręce wykonującej ruch**. Przy serii na stronę (L/P) przycisk pojawia się tylko dla strony,
   na której jest zegarek (Ustawienia → Ogólne → Orientacja na zegarku).

Ograniczenia wersji 1:
- Licz od momentu, gdy jesteś w pozycji. Chodzenie z ciężarem między stanowiskami może dodać powtórzenie.
- Uginania naprzemienne: zegarek liczy tylko powtórzenia ręki z zegarkiem. Rób obie ręce naraz albo popraw wynik.
- Wykroki: każdy wykrok (zejście i powrót) to jedno powtórzenie.
- Ustawienia są na zegarku, nie w aplikacji na iPhonie.

## Lista 30 ćwiczeń (ID z katalogu aplikacji)

Oś: **pion** = ruch w górę/dół (prędkość), **poziom** = ruch w poziomie (PCA), **3D** = główny kierunek
(PCA), **obrót** = obrót nadgarstka (żyroskop). Próg minimalny: m/s dla osi liniowych, rad/s dla obrotu.

| # | ID | Ćwiczenie | Oś | Próg min. | Czas powt. (s) | Uwagi |
|---|---|---|---|---|---|---|
| 1 | 0025 | Wyciskanie sztangi na ławce płaskiej | pion | 0,10 | 0,8–9 | |
| 2 | 0047 | Wyciskanie sztangi na ławce skośnej | pion | 0,10 | 0,8–9 | |
| 3 | 0043 | Pełny przysiad ze sztangą | pion | 0,10 | 1–10 | |
| 4 | 0032 | Martwy ciąg ze sztangą | pion | 0,10 | 1–10 | koniec serii po 6 s |
| 5 | 0085 | Martwy ciąg rumuński ze sztangą | pion | 0,09 | 1–10 | |
| 6 | 1162 | Wyciskanie żołnierskie sztangi stojąc | pion | 0,10 | 0,8–9 | |
| 7 | 0027 | Wiosłowanie sztangą w opadzie tułowia | pion | 0,10 | 0,7–7 | |
| 8 | 0031 | Uginanie ramion ze sztangą | obrót | 0,40 | 0,8–9 | |
| 9 | 0054 | Wykrok ze sztangą | pion | 0,08 | 1–10 | każdy wykrok = 1 |
| 10 | 0060 | Wyciskanie francuskie ze sztangą w leżeniu | obrót | 0,40 | 0,8–9 | |
| 11 | 0289 | Wyciskanie hantli na ławce | pion | 0,10 | 0,8–9 | |
| 12 | 0314 | Wyciskanie hantli na ławce skośnej | pion | 0,10 | 0,8–9 | |
| 13 | 0405 | Wyciskanie hantli nad głowę w siadzie | pion | 0,10 | 0,8–9 | |
| 14 | 0308 | Rozpiętki z hantlami | obrót | 0,35 | 0,8–9 | |
| 15 | 0334 | Unoszenie hantli bokiem | obrót | 0,40 | 0,8–9 | |
| 16 | 0294 | Uginanie ramion z hantlami | obrót | 0,40 | 0,8–9 | naprzemiennie: tylko ręka z zegarkiem |
| 17 | 0313 | Uginanie ramion chwytem młotkowym | obrót | 0,40 | 0,8–9 | jw. |
| 18 | 0292 | Wiosłowanie hantlem jednorącz | pion | 0,10 | 0,7–7 | **jednorącz: zegarek na ręce z hantlem** |
| 19 | 0430 | Prostowanie ramion z hantlami stojąc (francuskie) | obrót | 0,40 | 0,8–9 | |
| 20 | 0336 | Wykrok z hantlami | pion | 0,08 | 1–10 | każdy wykrok = 1 |
| 21 | 1760 | Przysiad goblet z hantlem | pion | 0,10 | 1–10 | |
| 22 | 0198 | Ściąganie drążka wyciągu | pion | 0,10 | 0,8–8 | |
| 23 | 0861 | Wiosłowanie na wyciągu w siadzie | poziom | 0,10 | 0,8–8 | |
| 24 | 2249 | Prostowanie ramion na wyciągu (uchwyt V) | obrót | 0,35 | 0,8–9 | |
| 25 | 0200 | Prostowanie ramion na wyciągu (lina) | obrót | 0,35 | 0,8–9 | |
| 26 | 5656 | Face pull na wyciągu (lina) | poziom | 0,08 | 0,8–7 | |
| 27 | 0155 | Rozpiętki na bramie (krzyżowanie linek) | 3D | 0,08 | 0,8–8 | |
| 28 | 0868 | Uginanie ramion na wyciągu | obrót | 0,40 | 0,8–9 | |
| 29 | 0178 | Unoszenie ramienia bokiem na wyciągu | obrót | 0,40 | 0,8–9 | **jednorącz: zegarek na ręce z uchwytem** |
| 30 | 0194 | Prostowanie ramion nad głową na wyciągu (lina) | obrót | 0,40 | 0,8–9 | |

Bez maszyn na nogi i bez ćwiczeń statycznych. Inne warianty (np. inne ID ściągania) nie są jeszcze
liczone. Dodaje się je w tabeli `RepProfiles.swift` i równolegle w `port/rep-counter.mjs` (PROFILES).

## Test na siłowni

Przed testem: Zdrowie włączone, w ustawieniach zegarka **Tryb testowy liczenia: wł.**

1. Ułóż na iPhonie trening z 5–8 ćwiczeniami z listy (na jedną wizytę). Wszystkie 30 rozłóż na kilka treningów.
2. Każde ćwiczenie: **3 serie po 10** powtórzeń, normalnym tempem. Jeśli chcesz, dodaj 1 serię
   wolno (3 s w dół) i 1 serię szybko.
3. W każdej serii: **Licz automatycznie**, wykonaj serię, poczekaj na wynik albo stuknij Stop.
   Zanim poprawisz, **zapisz, ile zegarek policzył**, a potem popraw do prawdziwej liczby i Zapisz.
4. Wypełnij tabelę (kartka albo notatka w telefonie):

| Ćwiczenie (ID) | Seria | Zegarek policzył | Naprawdę | Uwagi (tempo, przerwa, „zaczął za wcześnie”…) |
|---|---|---|---|---|
| 0025 | 1 | 10 | 10 | |
| 0025 | 2 | 11 | 10 | +1 przy zdjęciu sztangi |

5. Sprawdź też: jednorącz z zegarkiem na złej ręce (przycisk ma zniknąć przy serii na stronę),
   koniec serii (ile sekund do wyniku), anulowanie ✕, korekta koroną.

## Tryb testowy i wysyłanie próbek

- Przy włączonym **Tryb testowy liczenia** każda liczona seria zapisuje się na zegarku jako plik
  `reps-<data>-<ID>.csv`. Zegarek trzyma 30 najnowszych plików. W pierwszej linii są: ID, oś, ile
  zegarek policzył, ile potwierdziłeś, ręka i próg. Dalej są próbki 50 Hz: przyspieszenie w układzie
  świata, żyroskop, surowe `userAcceleration` i `gravity`, sygnał i licznik.
- Wysyłka: ekran startowy zegarka → Licznik powtórzeń → **Wyślij próbki na iPhone’a**. iPhone musi
  być w pobliżu, a Habcore Gym zainstalowany. Pliki trafiają do folderu aplikacji na iPhonie (`RepSamples`).
- Pobranie z iPhone’a: podłącz iPhone do Maca kablem → **Finder** → iPhone → zakładka **Pliki** →
  Habcore Gym → przeciągnij folder `RepSamples` na biurko. Spakuj go i przekaż do strojenia razem
  z tabelą z testu.
- Strojenie z próbek (na serwerze, bez Maca):
  `node frontend/ios/App/WatchCore/port/replay.mjs RepSamples/*.csv` pokazuje, ile liczy obecny
  algorytm, a ile potwierdziłeś. Z `--lobes` wypisuje każdą połówkę ruchu.
- Po testach wyłącz tryb testowy i usuń próbki (**Usuń próbki**).

## Testy algorytmu (bez Maca)

- Swift (XCTest): `cd frontend/ios/App/WatchCore && swift test --filter RepCounterTests`
  (na Macu albo w Linuksie z obrazem `swift:5.10`). 22 testy.
- JavaScript (ten sam algorytm krok po kroku, `WatchCore/port/rep-counter.mjs`):
  `node --test "frontend/ios/App/WatchCore/port/*.test.mjs"`. Te same 22 testy na tych samych
  syntetycznych sygnałach: sinus/rampa z szumem, różne tempo, przerwy, drgania 9 Hz, przesunięcie
  czujnika, zdjęcie i odłożenie sztangi, niedokończone powtórzenie. Swift i JS dają identyczne wyniki
  (sprawdzone na 64 płatach do 6 miejsc po przecinku).
- Szerszy przebieg: `node frontend/ios/App/WatchCore/port/report.mjs 100` (30 ćwiczeń × 100 losowych serii).
- Workflow `Watch check` w Actions (każda gałąź poza main): testy JS, `swift test` i kompilacja
  aplikacji zegarka na watchOS.

## Serwer

Bez zmian po stronie serwera i aplikacji na iPhonie (poza odbiorem plików testowych z zegarka).
Seria policzona automatycznie zapisuje się jak zwykła seria. W historii nie ma informacji, że
policzył ją zegarek. Gdyby było to potrzebne (np. statystyka trafności), trzeba by:
1. dodać pole `repsAuto: { counted, confirmed }` do zdarzenia `setDone` z zegarka (WatchCore SessionCore.tick);
2. przenieść je w `frontend/src/lib/watch-sync.js` do serii (np. `auto: true`);
3. przepuścić pole w API (`api/` walidacja serii, `openapi.yaml`).
Na razie tego nie wdrażałem.
