import edge_tts, asyncio
B = ['每次都要重新交代一遍規則，是不是很煩？','Skill，就是把規則，存成一個資料夾。','核心是一個 SKILL 檔，開頭寫名稱，和一句描述。','平常，Claude 只讀名稱和描述，幾乎不佔空間。','你一提需求，描述對上了，才載入完整內容。','需要的時候，再跑腳本、讀範本。','結果，每個人，都照同一套標準做。','放進專案資料夾，全團隊共用。','所以，Skill，就是寫給 AI 的 SOP。']
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-YunJheNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
