# Genera los favicons a partir de img/logo.png: cuadrado negro a sangre con la N centrada.
# Google muestra el favicon recortado en un círculo, así que el negro debe llegar a los bordes
# (el logo original tiene márgenes transparentes y en los resultados se veía diminuto).
# Google pide un tamaño múltiplo de 48 px: por eso existen favicon-48 y favicon-192.
from PIL import Image, ImageDraw, ImageChops
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')) + '/'

logo = Image.open(ROOT + 'img/logo.png').convert('RGBA')
x0, y0, lado = 120, 112, 1012               # recuadro del icono, centrado en la N
base = Image.new('RGBA', (lado, lado), (0, 0, 0, 255))
base.alpha_composite(logo.crop((x0, y0, x0 + lado, y0 + lado)))
rgb = base.convert('RGB')
# Solo la N (el borde redondeado y la sombra del icono original pasan a negro puro)
zona = Image.new('L', rgb.size, 0)
ImageDraw.Draw(zona).rectangle((198, 203, 815, 808), fill=255)
claro = rgb.convert('L').point(lambda v: 255 if v >= 70 else int(255 * max(0, v - 40) / 30))
n = Image.composite(rgb, Image.new('RGB', rgb.size, (0, 0, 0)), ImageChops.multiply(zona, claro))
n = n.crop(n.convert('L').point(lambda v: 255 if v else 0).getbbox())


def icono(tam, proporcion):
    """Cuadrado negro de tam px con la N ocupando `proporcion` del ancho."""
    grande = 1024
    lienzo = Image.new('RGB', (grande, grande), (0, 0, 0))
    ancho = int(grande * proporcion)
    m = n.resize((ancho, int(n.height * ancho / n.width)), Image.LANCZOS)
    lienzo.paste(m, ((grande - m.width) // 2, (grande - m.height) // 2))
    return lienzo.resize((tam, tam), Image.LANCZOS)


icono(32, 0.66).save(ROOT + 'img/favicon-32.png', optimize=True)
icono(48, 0.66).save(ROOT + 'img/favicon-48.png', optimize=True)
icono(192, 0.66).save(ROOT + 'img/favicon-192.png', optimize=True)
icono(180, 0.6).save(ROOT + 'img/apple-touch-icon.png', optimize=True)
icono(256, 0.66).save(ROOT + 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('favicons ok')
