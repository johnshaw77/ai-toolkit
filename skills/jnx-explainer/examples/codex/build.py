import os, pathlib; D=os.path.dirname(os.path.abspath(__file__))+'/'  # 專案資料夾（本機路徑）
import json,re
vo=[3.6,2.832,3.84,2.952,3.96,2.64,2.616]
lead=0.12; gap=0.3
sc=[]; t=3.0
for d in vo:
    sc.append(round(t,3)); t+=d+gap
total=round(sc[-1]+5.8,2)
open(D+'sc.json','w').write(json.dumps({'sc':sc,'voice':[round(x+lead,3) for x in sc],'total':total}))
iw,ih=open(D+'img.txt').read().split()
s=open(D+'index.tpl.html').read().replace('__SC__',json.dumps(sc)).replace('__TOTAL__',str(total)).replace('__WM__','data:image/png;base64,'+open(D+'wm.b64').read()).replace('__WMH__',open(D+'wmh.txt').read()).replace('__IMG__','data:image/jpeg;base64,'+open(D+'img.b64').read()).replace('__IW__',iw).replace('__IH__',ih)
open(D+'flow/index.html','w').write(s)
from fontTools import subset
from fontTools.ttLib import TTFont
chars=set(re.findall(r'[^\x00-\x7f]',s.replace(open(D+'img.b64').read(),'')))|set(chr(c) for c in range(32,127))|set('，。？：「」→·')
for w,name in (('Bold','TCBold'),('Medium','TCMed')):
    f=TTFont(D+f'../../fonts/NotoSansCJKtc-{w}.otf')
    o=subset.Options(); o.layout_features=['*']; ss=subset.Subsetter(o); ss.populate(text=''.join(chars)); ss.subset(f)
    f.save(D+f'flow/assets/fonts/{name}.ttf')
print(sc,total)
