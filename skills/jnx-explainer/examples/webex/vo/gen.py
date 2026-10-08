import edge_tts, asyncio
B = ['會議建好了，時間是十月七號早上九點五十八。','參加者一點連結，就卡在等待主持人。','這一等，要等到開會前十五分鐘。','十一點十五分，開放先進場。','十一點半，會議正式開始。','問題來了，第一個進場的人，有沒有主持人授權？','沒有，就是一般與會者，能開會，但不能主持。','有，就自動成為共同主持人。','所以，誰先進場，決定誰能主持。']
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-YunJheNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
