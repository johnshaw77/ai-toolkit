import edge_tts, asyncio
B = [
 '每個系統都要登入一次？太累了。',
 'S S O：登入一次，全部通行。',
 '打開 P L M。',
 '它發現你沒登入，把你導去身分中心。',
 '輸入帳密，驗證通過。',
 '身分中心發一組授權碼。',
 'P L M 拿碼去換令牌，J W T。',
 '令牌用私鑰簽章，偽造不了。',
 '之後每個請求，都帶著令牌。',
 '後端用公鑰驗簽，通過就放行。',
 '再開 A P C、G P M，不用再登入。',
 '這就是單一登入。',
]
async def main():
    for i,t in enumerate(B,1):
        await edge_tts.Communicate(t,'zh-TW-HsiaoChenNeural',rate='+20%').save(f'v{i}.mp3')
asyncio.run(main())
