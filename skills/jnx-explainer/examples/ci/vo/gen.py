import edge_tts, asyncio
B = [
 '改完程式，git push。',
 'GitLab 偵測到推送，自動開一條流水線。',
 '第一關，lint，檢查程式風格。',
 '第二關，跑測試，一條一條過。',
 '有一條紅了，流水線立刻停下。',
 '修好再推，重新跑，全部通過。',
 '第三關，build，打包成映像檔。',
 '第四關，先部署到測試環境。',
 '驗過了，按下核准，才能上正式。',
 '正式環境，滾動更新，舊版一台一台換新版。',
 '要是出事，一鍵回滾。',
 '從 push 到上線，全自動。',
]
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-HsiaoChenNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
