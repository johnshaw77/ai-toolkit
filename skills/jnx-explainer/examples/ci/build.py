import os, pathlib; D=os.path.dirname(os.path.abspath(__file__))+'/'  # 專案資料夾（本機路徑）
import json,subprocess
vo=[2.256,3.72,3.048,3.24,3.216,3.432,3.0,2.976,3.504,4.176,2.496,2.592]
lead=0.12; gap=0.3
sc=[]; t=0.0
for i,d in enumerate(vo):
    sc.append(round(t,3)); t+=d+gap+(0.0)
total=round(t+1.2,2)
sc_voice=[round(x+lead,3) for x in sc]
open(D+'sc.json','w').write(json.dumps({'sc':sc,'voice':sc_voice,'total':total}))
s=open(D+'index.tpl.html').read().replace('__SC__',json.dumps(sc)).replace('__TOTAL__',str(total))
open(D+'flow/index.html','w').write(s)
print(sc,total)
