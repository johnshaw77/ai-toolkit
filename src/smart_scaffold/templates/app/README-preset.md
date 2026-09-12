# app preset（尚未實作）

這個資料夾是預留的：`smart-scaffold app` 的分派機制已經接好，但模板內容
（FastAPI + Vue3 + antd）留到下一輪才做。

在 `src/smart_scaffold/presets.py` 裡這個 preset 標了 `ready=False`，所以
CLI 目前會明確告訴使用者「模板還沒有內容」，而不是生出一個空專案。

要開始做的時候：把模板檔案放進這個資料夾、把 `ready` 改成 `True` 即可，
問答與渲染的流程完全不用動。
