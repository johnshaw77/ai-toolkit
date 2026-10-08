import os, pathlib; D=os.path.dirname(os.path.abspath(__file__))+'/'  # 專案資料夾（本機路徑）
import json, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome')
    pg=b.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(pathlib.Path(D,'flow/index.html').as_uri()); pg.wait_for_timeout(800)
    data=pg.evaluate('JSON.stringify(window.SFX)')
    open(D+'sfx.json','w').write(data)
    print(len(json.loads(data)),'events; errors:',errs[:5])
    b.close()
