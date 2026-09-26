# SEO de todas las páginas (español e inglés): canonical, hreflang, Open Graph y datos
# estructurados en <head>, más sitemap.xml y robots.txt. Lo ejecuta tools/i18n/apply.py al final.
import re, os, json, datetime
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')) + '/'
SITE = 'https://nomotax.io/'
PAGES = ['index', 'nacional', 'internacional', 'asesoria-fiscal-mercantil-laboral', 'consultoria', 'holding',
         'ley-beckham', 'ganancias-patrimoniales', 'deducciones-id-cultura', 'cambio-residencia-fiscal',
         'estructuras-internacionales', 'nomadas-digitales', 'llc-usa', 'asesoria', 'contacto',
         'aviso-legal', 'privacidad', 'cookies']
LEGAL = {'aviso-legal', 'privacidad', 'cookies'}
BLOCK = re.compile(r'\n?  <!-- seo -->.*?<!-- /seo -->', re.S)
HREFLANG = re.compile(r'\n?  <link rel="alternate" hreflang="[^"]*" href="[^"]*" />')


def url(lang, p):
    return SITE + ('en/' if lang == 'en' else '') + ('' if p == 'index' else p)


def datos_estructurados(lang):
    org = {
        '@type': 'Organization', '@id': SITE + '#organization', 'name': 'NomoTax', 'url': SITE,
        'logo': SITE + 'img/logo.png', 'image': SITE + 'img/og-es.png',
        'email': 'info@nomotax.io', 'telephone': '+34642757633',
        'description': 'Despacho especializado en fiscalidad nacional e internacional para empresarios y autónomos.'
        if lang == 'es' else 'A firm specialising in domestic and international tax for entrepreneurs and the self-employed.',
        'contactPoint': {'@type': 'ContactPoint', 'contactType': 'customer service', 'email': 'info@nomotax.io',
                         'telephone': '+34642757633', 'availableLanguage': ['Spanish', 'English']},
    }
    graph = [org]
    if lang == 'es':
        graph.append({'@type': 'WebSite', '@id': SITE + '#website', 'name': 'NomoTax',
                      'alternateName': ['Nomotax', 'nomotax.io'], 'url': SITE, 'inLanguage': ['es', 'en'],
                      'publisher': {'@id': SITE + '#organization'}})
    return json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False)


def bloque(lang, p, s):
    title = re.search(r'<title>([^<]*)</title>', s).group(1)
    desc = re.search(r'<meta name="description" content="([^"]*)"', s).group(1)
    es, en = url('es', p), url('en', p)
    lineas = [
        '<!-- seo -->',
        '<link rel="canonical" href="%s" />' % url(lang, p),
        '<link rel="alternate" hreflang="es" href="%s" />' % es,
        '<link rel="alternate" hreflang="en" href="%s" />' % en,
        '<link rel="alternate" hreflang="x-default" href="%s" />' % es,
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="NomoTax" />',
        '<meta property="og:locale" content="%s" />' % ('en_GB' if lang == 'en' else 'es_ES'),
        '<meta property="og:locale:alternate" content="%s" />' % ('es_ES' if lang == 'en' else 'en_GB'),
        '<meta property="og:url" content="%s" />' % url(lang, p),
        '<meta property="og:title" content="%s" />' % title,
        '<meta property="og:description" content="%s" />' % desc,
        '<meta property="og:image" content="%simg/og-%s.png" />' % (SITE, lang),
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        '<meta name="twitter:card" content="summary_large_image" />',
    ]
    if p == 'index':
        lineas.append('<script type="application/ld+json">%s</script>' % datos_estructurados(lang))
    lineas.append('<!-- /seo -->')
    return '\n' + '\n'.join('  ' + l for l in lineas)


for lang in ('es', 'en'):
    for p in PAGES:
        f = ROOT + ('en/' if lang == 'en' else '') + p + '.html'
        s = open(f, encoding='utf-8').read()
        s = HREFLANG.sub('', BLOCK.sub('', s))
        m = re.search(r'  <meta name="description" content="[^"]*" />', s)
        assert m, (lang, p, 'sin meta description')
        s = s[:m.end()] + bloque(lang, p, s) + s[m.end():]
        open(f, 'w', encoding='utf-8').write(s)

# sitemap.xml con las dos versiones de cada página enlazadas entre sí
hoy = datetime.date.today().isoformat()
xml = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
for p in PAGES:
    for lang in ('es', 'en'):
        xml += ['  <url>', '    <loc>%s</loc>' % url(lang, p), '    <lastmod>%s</lastmod>' % hoy,
                '    <priority>%s</priority>' % ('1.0' if p == 'index' else '0.3' if p in LEGAL else '0.8'),
                '    <xhtml:link rel="alternate" hreflang="es" href="%s" />' % url('es', p),
                '    <xhtml:link rel="alternate" hreflang="en" href="%s" />' % url('en', p),
                '    <xhtml:link rel="alternate" hreflang="x-default" href="%s" />' % url('es', p),
                '  </url>']
xml.append('</urlset>')
open(ROOT + 'sitemap.xml', 'w', encoding='utf-8').write('\n'.join(xml) + '\n')
open(ROOT + 'robots.txt', 'w', encoding='utf-8').write(
    'User-agent: *\nAllow: /\n\nSitemap: %ssitemap.xml\n' % SITE)
print('seo ok:', len(PAGES) * 2, 'páginas, sitemap.xml y robots.txt')
