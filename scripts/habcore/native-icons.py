# Habcore Gym fork: the native app icons and splash screens from the KinkyLocked logo
# (frontend/src/brand/kinkylocked-*.png, added by the fork's branding patches).
# Run from the repo root:  python3 scripts/habcore/native-icons.py   (needs Pillow)
import glob, os
from PIL import Image, ImageDraw

FE = 'frontend'
BG = (12, 14, 18, 255)  # #0c0e12, the app's dark background
mark = Image.open(f'{FE}/src/brand/kinkylocked-mark-light.png').convert('RGBA')
logo = Image.open(f'{FE}/src/brand/kinkylocked-logo-light.png').convert('RGBA')

def fit(src, w):
    return src.resize((w, round(w * src.height / src.width)), Image.LANCZOS)

def tile(size, frac, bg=BG, src=mark):
    im = Image.new('RGBA', (size, size), bg)
    m = fit(src, round(size * frac))
    im.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return im

def canvas(w, h, frac, src=logo):
    im = Image.new('RGBA', (w, h), BG)
    m = fit(src, round(min(w, h) * frac))
    im.alpha_composite(m, ((w - m.width) // 2, (h - m.height) // 2))
    return im

# iOS: the main icon and the watch app's icon, 1024 px, opaque.
tile(1024, 0.78).convert('RGB').save(f'{FE}/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', optimize=True)
tile(1024, 0.80).convert('RGB').save(f'{FE}/ios/App/Watch/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png', optimize=True)
# iOS splash (light and dark both on the dark background, as the app's boot screen).
for p in glob.glob(f'{FE}/ios/App/App/Assets.xcassets/Splash.imageset/*.png'):
    w, h = Image.open(p).size
    canvas(w, h, 0.30).save(p, optimize=True)

# Android launcher icons (legacy, round, adaptive layers) and splash screens.
RES = f'{FE}/android/app/src/main/res'
for d in glob.glob(f'{RES}/mipmap-*dpi'):
    for name, frac in (('ic_launcher', 0.80), ('ic_launcher_round', 0.74)):
        p = f'{d}/{name}.png'
        if not os.path.exists(p): continue
        s = Image.open(p).size[0]
        im = tile(s, frac)
        if name.endswith('round'):
            m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).ellipse((0, 0, s - 1, s - 1), fill=255)
            im.putalpha(m)
        im.save(p, optimize=True)
    for name in ('ic_launcher_foreground', 'ic_launcher_background'):
        p = f'{d}/{name}.png'
        if not os.path.exists(p): continue
        s = Image.open(p).size[0]
        if name.endswith('background'):
            Image.new('RGBA', (s, s), BG).save(p, optimize=True)
        else:
            tile(s, 0.86, bg=(0, 0, 0, 0)).save(p, optimize=True)
for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(p).size
    canvas(w, h, 0.45).save(p, optimize=True)
print('icons and splash screens written')
