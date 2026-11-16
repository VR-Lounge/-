"""Run locally: python import_assets.py. Standard library only; no uploads or writes to the store."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlparse
import json, re, time
BASE='https://xn--80aannlcfckh.xn--p1ai/'
ROOT=Path(__file__).resolve().parent
ASSETS=ROOT/'assets'; ASSETS.mkdir(exist_ok=True)
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.images=[]; self.links=[]; self.current=None; self.og=None
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='meta' and d.get('property')=='og:image': self.og=d.get('content')
        if tag=='a': self.current={'url':d.get('href',''),'text':d.get('title','')}; self.links.append(self.current)
        if tag=='img':
            src=d.get('data-src') or d.get('data-lazy-src') or d.get('src','')
            if src.startswith('data:'): src=d.get('data-src','')
            self.images.append({'src':src,'alt':d.get('alt',''),'width':d.get('width',''),'link':self.current['url'] if self.current else ''})
    def handle_data(self,data):
        if self.current:self.current['text']+=' '+data
    def handle_endtag(self,tag):
        if tag=='a':self.current=None

def read(url):
    req=Request(url,headers={'User-Agent':'Mozilla/5.0 (MELOMANIAK design prototype asset importer)'})
    with urlopen(req,timeout=30) as r:return r.read()

def parse(url):
    parser=Page();parser.feed(read(url).decode('utf-8',errors='replace'));return parser

def norm(s):return re.sub(r'[^a-z0-9]+','',s.lower())
def download(src,stem):
    url=urljoin(BASE,src)
    if urlparse(url).scheme not in ('https','http'):return None
    req=Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':BASE})
    with urlopen(req,timeout=30) as r:
        ctype=r.headers.get('Content-Type','').split(';')[0]
        if not ctype.startswith('image/'):raise ValueError('Not an image: '+ctype)
        data=r.read(16*1024*1024)
    if not data:raise ValueError('Empty image')
    ext={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/avif':'.avif','image/gif':'.gif','image/svg+xml':'.svg'}.get(ctype,'.img')
    target=ASSETS/(stem+ext);target.write_bytes(data)
    return target.relative_to(ROOT).as_posix(),url

def main():
    page=parse(BASE)
    catalog=json.loads((ROOT/'catalog-source.json').read_text(encoding='utf-8'))
    manifest={'products':{},'hero':None,'stories':{}};log=[]
    for idx,prod in enumerate(catalog):
        tokens=[norm(x) for x in prod['keys']]
        candidates=[l for l in page.links if '/product/' in l['url'] and any(k in norm(l['text']+' '+l['url']) for k in tokens)]
        url=prod.get('source') or (urljoin(BASE,candidates[0]['url']) if candidates else None)
        try:
            image=None
            if url:
                detail=parse(url)
                image=detail.og
                if not image:
                    imgs=[im for im in detail.images if any(k in norm(im['alt']+' '+im['src']) for k in tokens)]
                    if imgs:image=imgs[0]['src']
            if not image:
                imgs=[im for im in page.images if any(k in norm(im['alt']+' '+im['src']) for k in tokens)]
                if imgs:image=imgs[0]['src']
            if image:
                local,remote=download(image,'product-'+str(idx+1));manifest['products'][prod['name']]=local
                log.append({'product':prod['name'],'page':url,'image':remote,'local':local,'review':'Проверьте соответствие модели вручную'})
                print('Imported:',prod['name'])
            else:print('No verified image:',prod['name'])
        except Exception as e:print('Skipped:',prod['name'],str(e))
        time.sleep(.3)
    hero=[i for i in page.images if any(s in (i['src']+' '+i['alt']).lower() for s in ['dianno','di-anno','di_anno','дианно','ди’анно','paul'])]
    if hero:
        try:
            local,remote=download(hero[0]['src'],'hero-original');manifest['hero']=local;log.append({'hero':remote,'local':local})
        except Exception as e:print('Hero skipped:',str(e))
    (ROOT/'assets-manifest.js').write_text('window.MELO_ASSETS = '+json.dumps(manifest,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    (ROOT/'assets-provenance.json').write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Done. Review assets-provenance.json and open index.html. Photos must be reviewed before publishing.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('Import failed:',str(e),'\nNo stock photos were substituted.')
