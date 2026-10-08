import edge_tts, asyncio
B = ['寫好的程式，要怎麼安全上線？',
     '先把程式送進檢查閘門。',
     '閘門會跑測試、掃描漏洞、比對規格。',
     '三項都通過，才放行到正式環境。',
     '每一次上線，都有人把關。']
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-YunJheNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
