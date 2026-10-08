import edge_tts, asyncio
B = [
 '每個系統都要登入一次，實在太麻煩了。單一登入 S S O，只要登入一次，就能通行所有系統。',
 '使用者打開 P L M 系統，系統發現你還沒登入，就把你導向身分中心。',
 '在身分中心輸入帳號密碼，驗證成功後，身分中心會發給一組授權碼。',
 'P L M 拿著授權碼，向身分中心換取 J W T 令牌。令牌用私鑰簽章，無法偽造。',
 '之後每次呼叫 A P I，都在標頭帶上令牌。後端用公鑰驗簽，確認身分，就放行。',
 '接著打開另一個系統，身分中心已經認得你，直接發令牌，不用再登入。這就是單一登入。',
]
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-HsiaoChenNeural',rate='-4%').save(f'vo{i}.mp3')
asyncio.run(main())
