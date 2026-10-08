import edge_tts, asyncio
B = ['想讓人一眼看懂流程走到哪？用步驟進度條。','第一步，員工填好申請，按下送出。','第二步，主管審核，同意或退回。','第三步，品保確認，這一關交給 AI 自動檢查。','最後一步，結案歸檔，整條流程走完。','Claude 在忙的時候，會出現這個橘色轉圈動畫，旁邊顯示目前的狀態。','每一步，都看得見。']
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-YunJheNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
