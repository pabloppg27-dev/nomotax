# Genera /en/*.html a partir de las páginas en español y translations.json
import re, html, json, os, glob
ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))+'/'
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
PAGES=['index','nacional','internacional','asesoria-fiscal-mercantil-laboral','consultoria','holding','ley-beckham',
 'ganancias-patrimoniales','deducciones-id-cultura','cambio-residencia-fiscal','estructuras-internacionales',
 'nomadas-digitales','llc-usa','asesoria','contacto','aviso-legal','privacidad','cookies','404']
ATTRS={'alt','placeholder','aria-label','title','content','data-title','data-subtitle','data-submit','data-success',
 'data-error','data-price','data-plan','data-llc-plan','data-llc-pack'}
# data-value no se traduce donde el JavaScript compara valores concretos
SKIP_DATA_VALUE={'deducciones-id-cultura','asesoria-fiscal-mercantil-laboral'}
# Ajustes de orden en títulos: (página, etiqueta que envuelve el texto, texto) -> traducción
OVERRIDES={
 ('asesoria-fiscal-mercantil-laboral','h2','Planes'):'Plans for',
 ('asesoria-fiscal-mercantil-laboral','em','Empresa'):'companies',
 ('asesoria-fiscal-mercantil-laboral','em','Autónomo'):'the self-employed',
 ('holding','h1','Estructuras'):'Holding',
 ('ley-beckham','br','Beckham'):'Law',
 ('ganancias-patrimoniales','h1','Ganancias'):'Capital',
 ('llc-usa','h2','Planes'):'LLC',
 ('llc-usa','em','LLC'):'plans',
}
TOK=re.compile(r'(<!--.*?-->|<[^>]+>)',re.S)
ATTR=re.compile(r'([\w:-]+)="([^"]*)"')
LETTER=re.compile(r'[A-Za-zÀ-ÿ]')
def norm(t): return ' '.join(t.split())
def has_letters(t): return bool(LETTER.search(html.unescape(t)))

# Traducciones guardadas por texto en español (no dependen de la numeración)
tr=json.load(open(HERE+'translations.json',encoding='utf-8'))
keys=json.load(open(HERE+'keys.json',encoding='utf-8'))
missing=[k for k in keys if k not in tr]
assert not missing, ('faltan', len(missing), missing[:5])

def T(k):
    return tr.get(k,k)

def fix_attr(page, a, v):
    k=norm(v)
    if not k: return v
    if a in ATTRS:
        if a=='content' and 'width=device-width' in v: return v
        return T(k) if has_letters(k) else v
    if a=='data-value' and page not in SKIP_DATA_VALUE:
        return T(k) if has_letters(k) else v
    if a in('data-cns-show','data-cns-preset') and ':' in v:
        g,vals=v.split(':',1)
        return g+':'+'|'.join(T(x) for x in vals.split('|'))
    if a in('href','src') and re.match(r'(css|img|js)/|favicon\.ico',v):
        return '../'+v
    return v

os.makedirs(ROOT+'en',exist_ok=True)
for p in PAGES:
    s=open(ROOT+p+'.html',encoding='utf-8').read()
    # El bloque SEO lo genera tools/seo.py en cada idioma
    s=re.sub(r'\n?  <!-- seo -->.*?<!-- /seo -->','',s,flags=re.S)
    out=[]; skip=None; last='';
    for tok in TOK.split(s):
        if not tok: out.append(tok); continue
        if tok.startswith('<!--'): out.append(tok); continue
        if tok.startswith('<'):
            m=re.match(r'<\s*(/?)\s*([a-zA-Z0-9]+)',tok)
            if m:
                name=m.group(2).lower()
                if name in('script','style'): skip=None if m.group(1) else name
                if not m.group(1): last=name
            tok=ATTR.sub(lambda mm: '%s="%s"'%(mm.group(1),fix_attr(p,mm.group(1),mm.group(2))),tok)
            out.append(tok); continue
        if skip: out.append(tok); continue
        k=norm(tok)
        if k and has_letters(k):
            t=OVERRIDES.get((p,last,k)) or T(k)
            lead=tok[:len(tok)-len(tok.lstrip())]; trail=tok[len(tok.rstrip()):]
            out.append(lead+t+trail)
        else:
            # Cifras sin texto (tablas, ejemplos): se dejan en formato europeo, igual que en español
            out.append(tok)
    s=''.join(out)
    s=s.replace('<html lang="es">','<html lang="en">',1)
    f=p+'.html'
    # Enlaces sin .html: la portada es la carpeta ("./" en español, "../" desde /en/)
    c='' if p in ('index','404') else p
    old_sw='<a href="%s" class="is-active" lang="es" aria-current="true">ES</a>\n        <a href="en/%s" lang="en" hreflang="en">EN</a>'%(c or './',c)
    new_sw='<a href="../%s" lang="es" hreflang="es">ES</a>\n        <a href="%s" class="is-active" lang="en" aria-current="true">EN</a>'%(c,c or './')
    assert s.count(old_sw)==1,(p,'selector')
    s=s.replace(old_sw,new_sw)
    if p=='404':
        # La página de error se sirve en cualquier ruta: en inglés sus enlaces cuelgan de /en/
        assert s.count('<base href="/" />')==1
        s=s.replace('<base href="/" />','<base href="/en/" />')
    open(ROOT+'en/'+f,'w',encoding='utf-8').write(s)
print('ok', len(PAGES), 'páginas en /en/')

# Canonical, hreflang, Open Graph, sitemap.xml y robots.txt
exec(open(ROOT+'tools/seo.py',encoding='utf-8').read(),{'__file__':ROOT+'tools/seo.py'})
