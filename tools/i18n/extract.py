# Extrae los textos traducibles de las páginas en español, en orden de aparición.
import re, html, json, os
ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))+'/'
OUT=os.path.dirname(os.path.abspath(__file__))+'/'
PAGES=['index','nacional','internacional','asesoria-fiscal-mercantil-laboral','consultoria','holding','ley-beckham',
 'ganancias-patrimoniales','deducciones-id-cultura','cambio-residencia-fiscal','estructuras-internacionales',
 'nomadas-digitales','llc-usa','asesoria','contacto','aviso-legal','privacidad','cookies']
ATTRS=['alt','placeholder','aria-label','title','content','data-title','data-subtitle','data-submit','data-success',
 'data-error','data-price','data-plan','data-llc-plan','data-llc-pack']
TOK=re.compile(r'(<!--.*?-->|<[^>]+>)',re.S)
ATTR=re.compile(r'([\w:-]+)="([^"]*)"')
LETTER=re.compile(r'[A-Za-zÀ-ÿ]')
def norm(t): return ' '.join(t.split())
def has_letters(t): return bool(LETTER.search(html.unescape(t)))
seen=set(); listing=[]; stats={}
for p in PAGES:
    s=open(ROOT+p+'.html',encoding='utf-8').read()
    new=0; skip=None
    for tok in TOK.split(s):
        if not tok: continue
        if tok.startswith('<!--'): continue
        if tok.startswith('<'):
            m=re.match(r'<\s*(/?)\s*([a-zA-Z0-9]+)',tok)
            if m:
                name=m.group(2).lower()
                if name in('script','style'): skip=None if m.group(1) else name
            for a,v in ATTR.findall(tok):
                vals=[]
                if a in ATTRS: vals=[v]
                elif a=='data-value': vals=[v]
                elif a in('data-cns-show','data-cns-preset') and ':' in v: vals=v.split(':',1)[1].split('|')
                if a=='content' and 'width=device-width' in v: vals=[]
                for val in vals:
                    k=norm(val)
                    if k and has_letters(k) and k not in seen:
                        seen.add(k); listing.append((p,'@'+a,k)); new+=1
            continue
        if skip: continue
        k=norm(tok)
        if k and has_letters(k) and k not in seen:
            seen.add(k); listing.append((p,'txt',k)); new+=1
    stats[p]=new
json.dump([k for _,_,k in listing],open(OUT+'keys.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
with open(OUT+'listing.txt','w',encoding='utf-8') as f:
    cur=None
    for p,kind,k in listing:
        if p!=cur: f.write('\n##### %s\n'%p); cur=p
        f.write('%s\t%s\n'%(kind,k))
print(stats, 'total', len(listing), 'chars', sum(len(k) for _,_,k in listing))
