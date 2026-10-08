import edge_tts, asyncio
B = ['Claude Desktop，把 AI 放進你的桌面。','打開它，像聊天一樣，直接下指令。','丟一份檔案進去，它讀完，直接給你重點。','專案功能，把相關資料，收在同一個地方。','連上信箱、行事曆、雲端硬碟，資料自己進來。','還能幫你整理電腦裡的資料夾。','結果不只是文字，直接變成圖表和頁面。','固定的工作，排個時間，自動幫你跑。','從對話，到交付，一個 App 搞定。']
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-YunJheNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
