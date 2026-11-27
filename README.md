<div align="center">

# Habcore Gym

Aplikacja treningowa siłowni Habcore – plany, zapis treningów, postępy i tryb trenera.

</div>

## Co jest w środku

- **Aplikacja webowa (PWA)** – działa w przeglądarce i po dodaniu do ekranu początkowego jak zwykła aplikacja.
- **Aplikacja na iPhone'a z aplikacją na Apple Watch** – projekt Xcode w `frontend/ios/App`
  (Capacitor + natywne SwiftUI dla zegarka). Instrukcja budowania: [`scripts/habcore/README-XCODE.txt`](scripts/habcore/README-XCODE.txt).
- **Serwer** (`api/`) – konta, synchronizacja, tryb trenera v2: prowadzenie klienta, wspólny trening na żywo,
  trening grupowy, grupy siłowni i dziennik zmian.
- Aplikacja na zegarki Zepp OS (`watch-zepp/`) i wersja na Androida (`frontend/android/`).

## Budowanie

- **iPhone + Apple Watch:** `git pull`, potem w Xcode otwórz `frontend/ios/App/App.xcworkspace`
  i postępuj według [`scripts/habcore/README-XCODE.txt`](scripts/habcore/README-XCODE.txt).
- **Serwer (Docker):** `docker build --target default -t habcore-gym-api ./api` oraz
  `docker build -f web/Dockerfile -t habcore-gym-web .`

## Licencja i kod źródłowy

Habcore Gym jest oparty na oprogramowaniu open source na licencji **GNU AGPL-3.0** ([LICENSE](LICENSE)),
z dodatkowym zezwoleniem opisanym w [NOTICE.md](NOTICE.md). Prawa autorskie oryginalnego kodu i elementów
zewnętrznych (m.in. kontury mięśni MuscleMap – MIT, krój Geist – SIL OFL 1.1, media ćwiczeń – Gym visual)
są opisane w [NOTICE.md](NOTICE.md).

Pełny kod źródłowy każdej wersji, z której korzystają użytkownicy (także przez sieć, AGPL-3.0 §13), to to
repozytorium w commicie danego wydania. W aplikacji: Ustawienia → O aplikacji → Licencje.
