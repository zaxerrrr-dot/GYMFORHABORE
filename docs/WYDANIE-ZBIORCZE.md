# Habcore Gym – wydanie zbiorcze na iPhone'a i Apple Watch (kl10–kl14 + liczenie powtórzeń)

Jedno wydanie `habcore-NN` z GitHub Actions (GYMFORHABORE → Releases, najnowsze). Zawiera wszystko,
co od ostatniej instalacji trafiło na serwer, oraz liczenie powtórzeń na zegarku.
Serwer (strona) ma już te zmiany. To wydanie zmienia tylko aplikację na telefonie i zegarku.

## Co nowego

1. **Utracony dostęp → „Zapytaj trenera”** (kl10). Klient nie wpisuje poleceń serwera. Trener daje mu kod,
   klient ustawia nowe hasło.
2. **Regulamin i Polityka prywatności** (kl11). Przy rejestracji i przy pierwszym logowaniu starszego konta
   trzeba zaznaczyć zgody, w tym osobną zgodę na dane o zdrowiu. Usunięte: trener AI, Zepp, meldowanie
   się w siłowni (NFC) i dodatkowe integracje. Działa link do kalendarza (Google, Apple, Outlook).
3. **Arkusz dnia** (kl11.1). Dzień z treningiem pokazuje „Treningi tego dnia”, a nie „Odpoczynek”.
4. **Aplikacja bez parowania** (kl12). Na starcie jest to samo co na stronie: logowanie hasłem,
   **Rejestracja** (kod zaproszenia + zgody) i **Utracony dostęp?**. Nie trzeba podawać adresu serwera.
   W Ustawieniach → Konto nie ma już „Serwer i synchronizacja” ani „Sparuj aplikację mobilną”.
   Jest tam „Wyloguj się”. Synchronizacja działa sama.
5. **Passa** zamiast „serii” (kl12). Na ekranie Start jest karta z tygodniami, bieżącym tygodniem
   i najlepszą passą. Objaśnienie pojawia się tylko raz, potem jest pod ikoną „i”.
6. **Ciało** (kl13): ważenia, BMI z kategorią, skład ciała (tłuszcz, mięśnie, woda…), wykresy, historia
   i eksport. Wymaga płci, daty urodzenia i wzrostu, które może też wpisać trener.
7. **Treningi** (kl14):
   - zakładka w Statystykach (Statystyki | Treningi | Ciało) z kartami treningów, filtrami (okres,
     ćwiczenie, plan) i wyszukiwarką;
   - karta „Ostatni trening” na Start;
   - w podsumowaniu treningu: porównanie z poprzednim takim samym treningiem, mapka mięśni, rekordy
     oraz **notatki jak komentarze**. Piszą w nich klient i trener (oznaczony „Trener”), każdy może
     edytować i usuwać tylko swoje notatki, a o nowej notatce przychodzi powiadomienie.
   - W panelu siłowni trener ma przy kliencie przycisk **Treningi** z tym samym feedem i kalendarzem.
8. **Kalendarz dnia** (kl14). Kliknięcie dowolnego dnia w każdym kalendarzu pokazuje treningi tego dnia
   oraz przycisk, który zależy od dnia:
   - dzień miniony: „Dodaj trening w tym dniu”;
   - dziś: „Zacznij trening”;
   - dzień przyszły: zaplanowanie treningu.
9. **Apple Watch: automatyczne liczenie powtórzeń** w 30 ćwiczeniach ze sztangą, hantlami i na wyciągu.
   Szczegóły są w `docs/LICZENIE-POWTORZEN.md`, skrót poniżej.

## Jak zbudować w Xcode (darmowe Apple ID)

1. GitHub → GYMFORHABORE → **Releases** → najnowsze `habcore-…` → pobierz **HabcoreGym-xcode.zip**.
   Rozpakuj do **nowego** folderu bez spacji, np. `~/HabcoreGym-xcode-NN`.
2. **Identyfikator: ten sam co ostatnio.** Darmowe konto pozwala na 10 nowych identyfikatorów w ciągu 7 dni.
   Zamknij Xcode, kliknij dwukrotnie `ustaw-identyfikator.command` (w Finderze: prawy klik → Open)
   i wpisz **dokładnie ten identyfikator, którego użyłeś przy poprzedniej instalacji**, np. `pl.habcore.gym.sylwester`.
   Skrypt ustawi zegarek (`….watchkitapp`) i jego powiązanie z iPhone'em.
3. Otwórz `frontend/ios/App/App.xcworkspace`, nie `.xcodeproj`.
4. **Signing & Capabilities:**
   - TARGETS **App**: „Automatically manage signing”, Team: Twój **Personal Team**;
   - TARGETS **OpenGymWatch**: **ten sam** Personal Team.
   - HealthKit zostaje w obu targetach.
5. **Product → Clean Build Folder** (Shift+Cmd+K).
6. Schemat **App**, urządzenie: Twój iPhone (podłączony, odblokowany) → **Product → Run** (Cmd+R).
   Aplikacja zegarka buduje się razem z aplikacją na iPhone'a.
7. **Zainstaluj na starą wersję, nie usuwaj aplikacji z telefonu.** Przy usunięciu znikają dane lokalne
   i zgody Apple Zdrowie. Przy pierwszym logowaniu dane, które były na telefonie, scalają się z serwerem.
8. Zegarek: aplikacja Watch na iPhonie → Habcore Gym → **Zainstaluj**. Możesz też w Xcode wybrać schemat
   **OpenGymWatch** z zegarkiem jako urządzeniem → Run.
9. Podpis jest ważny 7 dni. Potem wystarczy w Xcode ponownie zrobić Run z tym samym identyfikatorem.

Jeśli Xcode zgłosi błąd, zrób zrzut z Report navigator (Cmd+9) albo skopiuj linie z `error:`.

## Co przetestować

| # | Co | Jak | Dobrze, gdy |
|---|---|---|---|
| 1 | Logowanie w aplikacji | Po instalacji otwórz aplikację i zaloguj się hasłem | Nie pyta o serwer. Po zalogowaniu są Twoje treningi. |
| 2 | Rejestracja i zgody | „Rejestracja” → kod zaproszenia, hasło, zaznacz obie zgody (testowe konto) | Bez zgód nie przechodzi, a z nimi konto powstaje |
| 3 | Utracony dostęp | „Utracony dostęp?” → „Mam kod” (kod z panelu admina) | Nowe hasło działa, aplikacja się loguje |
| 4 | Ustawienia → Konto | Zajrzyj | Nie ma „Serwer i synchronizacja” ani „Sparuj”. Jest „Wyloguj się”. |
| 5 | Passa | Karta na Start → szczegóły; kliknij „i” | Objaśnienie pokazuje się tylko raz |
| 6 | Ciało | Statystyki → Ciało → profil → Ważenie | BMI z kategorią, wykres, historia |
| 7 | Treningi i notatki | Statystyki → Treningi → karta → dopisz notatkę | Notatka jest w wątku. Trener widzi ją w panelu (Siłownia → klient → Treningi) i odpowiada. Odpowiedź widać po otwarciu aplikacji, a na stronie przychodzi powiadomienie. |
| 8 | Kalendarz dnia | Kliknij dzień w tygodniu na Start, w kalendarzu Passy i na mapie w Statystykach | Treningi tego dnia oraz „Dodaj trening w tym dniu” albo „Zacznij trening” |
| 9 | **Zegarek po zalogowaniu (bez parowania)** | Na iPhonie zaloguj się hasłem, otwórz Habcore Gym na zegarku i zacznij trening na iPhonie | Zegarek pokazuje trening, a seria zrobiona na zegarku trafia na iPhone'a i na serwer |
| 10 | Licznik powtórzeń | Niżej | Policzone ≈ wykonane |

### Licznik powtórzeń: test

1. Na zegarku: ekran startowy (bez treningu) → przewiń na dół → **Licznik powtórzeń**:
   - „Automatyczne liczenie powtórzeń” wł. (domyślnie);
   - **„Tryb testowy liczenia” wł.**
   Na iPhonie: Ustawienia → Zdrowie włączone, bo bez tego liczenie przerywa się po opuszczeniu nadgarstka.
2. Trening z 5–8 ćwiczeniami z listy 30 (lista w `docs/LICZENIE-POWTORZEN.md`), 3 serie po 10.
3. Na stronie serii: **Licz automatycznie** → seria → wynik po ~5 s bez ruchu (albo **Stop**).
   **Zanim poprawisz, zapisz, ile zegarek policzył.** Potem popraw koroną albo przyciskami −/+ i **Zapisz**.
4. Tabelka: ćwiczenie (ID), seria, zegarek, naprawdę, uwagi.
5. Sprawdź też:
   - ćwiczenie jednorącz z zegarkiem na złej ręce (przycisk ma zniknąć);
   - anulowanie przyciskiem ✕;
   - korektę koroną.
6. Próbki: zegarek → Licznik powtórzeń → **Wyślij próbki na iPhone'a**.
   Potem Mac → Finder → iPhone → Pliki → Habcore Gym → folder `RepSamples` → spakuj i prześlij razem z tabelką.
7. Po testach wyłącz tryb testowy i stuknij **Usuń próbki**.

## Otwarte sprawy

- **Zegarek po logowaniu bez parowania** nie był sprawdzony na fizycznym iPhonie, bo nie mieliśmy urządzenia.
  Kod jest ten sam co po parowaniu (token zapisany w tym samym miejscu), ale to trzeba przetestować (punkt 9 tabeli).
- **Apple Zdrowie: zapis % tłuszczu i masy beztłuszczowej** nie jest zrobiony, bo wtyczka Zdrowia nie ma tych
  typów zapisu. Zostaje na później.
- **LEGAL_VERSION** nie został podniesiony po dopisaniu do polityki danych ciała i notatek (ten sam cel i ta sama zgoda).
  Jeśli wszyscy mają zaakceptować politykę ponownie, trzeba go podnieść na serwerze.
- **Logowanie kluczem dostępu w aplikacji** jest ukryte, bo wymaga associated domains na docelowym serwerze
  (do zrobienia po przenosinach na Mikrusa).
- **Powiadomienia o notatkach** idą jako Web Push: do przeglądarki i do strony dodanej do ekranu
  początkowego, jeśli są włączone powiadomienia. Aplikacja na iOS (Xcode) nie ma Web Push (Apple pozwala
  na nie tylko przez APNs, którego tu nie ma), więc w niej nowa notatka pojawia się dopiero po otwarciu
  aplikacji (synchronizacja). Do testu w punkcie 7 trener niech używa strony z włączonymi powiadomieniami.
- **Wydanie habcore-17** powstało przypadkiem z gałęzi liczenia powtórzeń. Nie jest potrzebne, bo to wydanie
  ma wszystko. Możesz je usunąć: GitHub → Releases → habcore-17 → Delete (razem z tagiem).
