import edge_tts, asyncio
B = ['想在 Codex Desktop，直接生成設計概念圖？','先把需求，寫成一句 prompt。','送出後，它會先分析需求，再規劃版面。','接著，概念圖就生成出來了。','KPI、趨勢圖、表格，一張圖全部到位。','拿到初稿，再往下細修。','一句 prompt，一張概念圖。']
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-YunJheNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
