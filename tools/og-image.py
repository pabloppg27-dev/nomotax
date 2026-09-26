# Genera las imágenes para compartir enlaces (WhatsApp, LinkedIn, redes): img/og-es.png e img/og-en.png
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')) + '/'
W, H = 1200, 630
BG, LIME, WHITE, GREY = (17, 17, 16), (205, 245, 100), (255, 255, 255), (160, 160, 150)
HN = '/System/Library/Fonts/HelveticaNeue.ttc'
GI = '/System/Library/Fonts/Supplemental/Georgia Italic.ttf'

TEXTOS = {
    'es': ('Asesoría fiscal', 'nacional e internacional', 'Gestoría · Consultoría · Estructuras internacionales'),
    'en': ('Tax advisory,', 'domestic and international', 'Accounting · Consulting · International structures'),
}

def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)

for lang, (l1, l2, pie) in TEXTOS.items():
    im = Image.new('RGB', (W, H), BG)
    # Brillo lima muy suave arriba a la derecha
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((760, -260, 1460, 380), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(140))
    im = Image.composite(Image.new('RGB', (W, H), LIME), im, glow)
    d = ImageDraw.Draw(im)

    # Logo + marca
    logo = Image.open(ROOT + 'img/logo.png').convert('RGBA').resize((120, 120), Image.LANCZOS)
    im.paste(logo, (72, 64), logo)
    marca = font(HN, 52, 1)  # Helvetica Neue Bold
    d.text((196, 124), 'Nomo', font=marca, fill=WHITE, anchor='lm')
    d.text((196 + d.textlength('Nomo', font=marca), 124), 'Tax', font=marca, fill=LIME, anchor='lm')

    # Titular
    d.text((80, 300), l1, font=font(HN, 76, 1), fill=WHITE, anchor='ls')
    d.text((80, 392), l2, font=font(GI, 78), fill=LIME, anchor='ls')

    # Pie
    d.line((80, 480, 1120, 480), fill=(60, 60, 55), width=2)
    d.text((80, 540), pie, font=font(HN, 30), fill=GREY, anchor='lm')
    d.text((1120, 540), 'nomotax.io', font=font(HN, 30, 1), fill=LIME, anchor='rm')

    im.save(ROOT + 'img/og-%s.png' % lang, optimize=True)
    print('img/og-%s.png' % lang)
