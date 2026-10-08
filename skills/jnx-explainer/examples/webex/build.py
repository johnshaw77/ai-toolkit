import os, pathlib; D=os.path.dirname(os.path.abspath(__file__))+'/'  # 專案資料夾（本機路徑）
import json,re
vo=[3.84,3.6,3.048,2.88,2.808,3.96,4.44,2.976,3.6]
lead=0.12; gap=0.3
sc=[]; t=0.0
for d in vo:
    sc.append(round(t,3)); t+=d+gap
total=round(t+1.0,2)
open(D+'sc.json','w').write(json.dumps({'sc':sc,'voice':[round(x+lead,3) for x in sc],'total':total}))
s=open(D+'index.tpl.html').read().replace('__SC__',json.dumps(sc)).replace('__TOTAL__',str(total))
open(D+'flow/index.html','w').write(s)
# subset CJK font to used chars
from fontTools import subset
from fontTools.ttLib import TTFont
chars=set(re.findall(r'[^\x00-\x7f]',s))|set(chr(c) for c in range(32,127))|set('，。？：「」→·')
for w,name in (('Bold','TCBold'),('Medium','TCMed')):
    f=TTFont(D+f'../../fonts/NotoSansCJKtc-{w}.otf')
    o=subset.Options(); o.layout_features=['*']; ss=subset.Subsetter(o); ss.populate(text=''.join(chars)); ss.subset(f)
    f.save(D+f'flow/assets/fonts/{name}.ttf')
print(sc,total)
