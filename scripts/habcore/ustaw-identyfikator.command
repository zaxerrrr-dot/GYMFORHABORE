#!/bin/bash
# Habcore Gym: zmienia identyfikator aplikacji (Bundle Identifier) w calym projekcie naraz:
# iPhone (pl.habcore.gym -> NOWY), zegarek (pl.habcore.gym.watchkitapp -> NOWY.watchkitapp)
# i powiazanie zegarka z iPhone'em (Watch/Info.plist WKCompanionAppBundleIdentifier).
# Uzycie: dwuklik w Finderze (zapyta o identyfikator) albo w Terminalu:
#   ./ustaw-identyfikator.command pl.habcore.gym.sylwester
# Zamknij Xcode przed uruchomieniem.
set -e
cd "$(dirname "$0")/frontend/ios/App"
OLD=$(grep -m1 -o 'PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9.-]*;' App.xcodeproj/project.pbxproj | sed 's/.*= //; s/;//; s/\.watchkitapp$//')
NEW="$1"
if [ -z "$NEW" ]; then
  echo "Obecny identyfikator: $OLD"
  read -r -p "Nowy identyfikator (np. pl.habcore.gym.$(whoami | tr -cd 'a-z0-9')): " NEW
fi
if ! [[ "$NEW" =~ ^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$ ]]; then echo "To nie jest poprawny identyfikator: $NEW"; exit 1; fi
if [ "$NEW" = "$OLD" ]; then echo "Bez zmian ($NEW)."; exit 0; fi
OLDRE=$(printf '%s' "$OLD" | sed 's/\./\\./g')
sed -i '' -E "s/PRODUCT_BUNDLE_IDENTIFIER = ${OLDRE}(\\.watchkitapp)?;/PRODUCT_BUNDLE_IDENTIFIER = ${NEW}\\1;/g" App.xcodeproj/project.pbxproj
/usr/libexec/PlistBuddy -c "Set :WKCompanionAppBundleIdentifier $NEW" Watch/Info.plist
echo "Gotowe: iPhone = $NEW, zegarek = $NEW.watchkitapp"
grep -o 'PRODUCT_BUNDLE_IDENTIFIER = [A-Za-z0-9.-]*;' App.xcodeproj/project.pbxproj | sort | uniq -c
