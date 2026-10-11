import numpy as np, subprocess, wave, json, os, tempfile
from scipy.signal import lfilter
sr=44100
D=os.path.dirname(os.path.abspath(__file__))+'/'
VO=D+'vo/'  # 旁白在本專案 vo/
RAW=os.path.join(tempfile.gettempdir(),os.path.basename(D.rstrip('/'))+'-v.raw')
meta=json.load(open(D+'sc.json')); T=meta['total']; voice=meta['voice']
n=int(sr*T); A=D+'flow/assets/'
def save(name,x):
    w=wave.open(A+name,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes()); w.close()
# --- voice
vo=np.zeros(n,dtype=np.float32)
for i,s in enumerate(voice,1):
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',VO+f'v{i}.mp3','-ar',str(sr),'-ac','1','-f','f32le',RAW],check=True)
    a=np.fromfile(RAW,dtype=np.float32); st=int(s*sr); vo[st:st+len(a)]+=a[:n-st]
save('vo.wav',vo*0.95)
t=np.arange(n)/sr; f=lambda p:440*2**((p-69)/12)
# --- bgm：電子脈動（使用者從四個小樣裡選的 2 號）：120 bpm、小調 16 分音符撥弦琶音、隨拍子呼吸的 pad、輕的四拍大鼓與反拍 hi-hat
#     旁白在講話時再自動壓低 5 dB
bpm=120; beat=60/bpm; bar=beat*4; rng=np.random.default_rng(5)
m=np.zeros(n)
def addm(t0,x,g=1.0):
    i0=int(t0*sr)
    if i0>=n: return
    j0=min(n,i0+len(x)); m[i0:j0]+=x[:j0-i0]*g
def tq(d): return np.arange(int(sr*d))/sr
def kick(g): q=tq(0.22); return np.sin(2*np.pi*(45+70*np.exp(-q*35))*q)*np.exp(-q*14)*g
def hat(g): q=tq(0.04); nz=rng.standard_normal(len(q)); return (nz-lfilter([0.3],[1,-0.7],nz))*np.exp(-q*150)*g
chs=[[57,60,64],[53,57,60],[55,59,62],[52,55,59]]   # Am F G Em
for k in range(int(T/bar)+2):
    s0=k*bar; c=chs[k%4]
    if s0>=T: break
    q=tq(bar)
    addm(s0,sum(np.sin(2*np.pi*f(p)*q)+0.5*np.sin(2*np.pi*f(p)*1.004*q)+0.25*np.sin(2*np.pi*2*f(p)*q) for p in c),0.022)
    for s16 in range(16):
        p=(c+[c[0]+12])[[0,1,2,3,2,1,3,2][s16%8]]+12; q2=tq(0.15)
        addm(s0+s16*beat/4,np.sin(2*np.pi*f(p)*q2)*np.exp(-q2*26),0.035)
    for bt in range(4): addm(s0+bt*beat,kick(0.16)); addm(s0+bt*beat+beat/2,hat(0.02))
m*=0.55+0.45*np.minimum(1,((t%beat)/(beat*0.6))**0.7)   # 隨拍子呼吸
m*=np.minimum(1,t/1.0)*np.minimum(1,(T-t)/2.0); m/=max(1e-6,np.abs(m).max())
env=np.abs(vo).astype(np.float64); k=int(sr*0.25); env=np.convolve(env,np.ones(k)/k,mode='same'); act=np.clip(env/0.02,0,1)
m*=1-act*(1-10**(-5/20))
save('bgm.wav',m*0.9)
# --- sfx from the timeline's own event log
#     「噹」類用柔和版（使用者 2026-10-11 從四個小樣選 2 號）：音調壓在 400–600 Hz、起音放軟、沒有尖的泛音
#     次數減半：開場只留 logo 一聲、結尾只留品牌一聲；內容裡每段最多一聲、兩聲至少隔 5 秒，見下方 BELL 規則
ev=json.load(open(D+'sfx.json')); rng=np.random.default_rng(3); out=np.zeros(n)
SC=meta['sc']
def put(t0,x,g=1.0):
    i=int(t0*sr); j=min(n,i+len(x))
    if 0<=i<n: out[i:j]+=x[:j-i]*g
def tt(d): return np.arange(int(sr*d))/sr
def att(q,a=0.012): return 1-np.exp(-q/a)   # 軟起音
def pop():
    q=tt(0.1); fr=420+480*(1-np.exp(-q*45)); return np.sin(2*np.pi*np.cumsum(fr)/sr)*np.exp(-q*34)*0.5
def key():
    q=tt(0.07); nz=rng.standard_normal(len(q)); hp=nz-lfilter([0.5],[1,-0.5],nz)
    click=hp*np.exp(-q*200)*0.30
    thump=np.sin(2*np.pi*(150+rng.uniform(-20,20))*q)*np.exp(-q*65)*0.38
    return (click+thump)*rng.uniform(0.6,0.9)
def tick():
    q=tt(0.05); return np.sin(2*np.pi*1100*q)*np.exp(-q*70)*0.45
def soft():
    q=tt(0.07); return np.sin(2*np.pi*900*q)*np.exp(-q*60)*0.3
def glide(d):
    q=tt(d); fr=500+500*q/d; return np.sin(2*np.pi*np.cumsum(fr)/sr)*np.sin(np.pi*q/d)**2*0.25
def ding():    # 柔和：單音 D5，沒有第二個高音
    q=tt(0.45); return np.sin(2*np.pi*587.3*q)*np.exp(-q*11)*att(q)*0.42
def chime():   # 柔和：G4 + D5 兩音
    q=tt(1.4); return (np.sin(2*np.pi*392*q)+0.7*np.sin(2*np.pi*587.3*q))*np.exp(-q*3.2)*att(q,0.03)*0.2
def sting():   # 柔和：低沉的 A 小三和弦，慢慢起來
    q=tt(1.6); return sum(np.sin(2*np.pi*f*q) for f in (220,277.2,329.6))*np.exp(-q*2.2)*att(q,0.08)*0.16
def swipe():   # 轉場：低通雜訊輕輕掃過，不用上滑音
    q=tt(0.5); nz=rng.standard_normal(len(q)); a=lfilter([0.04],[1,-0.96],nz); return a*np.sin(np.pi*q/0.5)**2*0.9
def warn():    # 柔和的低音提示（原本的版本太硬）
    q=tt(0.22); return np.sin(2*np.pi*196*q)*np.exp(-q*14)*att(q,0.005)*0.4
# BELL 規則：決定哪些「噹」（ding/chime/sting）真的播
#   1. 開場（第一個場景之前）只留 sting；結尾（最後一個 sting 前 1.5 秒內）的 ding 拿掉
#   2. 每個場景最多一聲，留該場景最後一個（通常是「完成」「結論」那一下）
#   3. 兩聲之間至少隔 5 秒，太近的拿掉（sting 永遠保留）
BELLS=('ding','chime','sting')
bl=sorted([e for e in ev if e['k'] in BELLS],key=lambda e:e['t'])
stings=[e['t'] for e in bl if e['k']=='sting']
def scene(t): return sum(1 for s in SC if t>=s-0.2)
keep=[]
for e in bl:
    if e['k']=='sting': keep.append(e); continue
    if e['t']<SC[0]-0.2: continue
    if any(0<=s-e['t']<1.5 for s in stings): continue
    keep.append(e)
last={}
for e in keep:
    if e['k']!='sting': last[scene(e['t'])]=e
keep=[e for e in keep if e['k']=='sting' or last.get(scene(e['t'])) is e]
fin=[]
for e in keep:
    if e['k']!='sting' and fin and e['t']-fin[-1]['t']<5: continue
    fin.append(e)
play=set(id(e) for e in fin)
last_tick=-9; last_pop=-9
dings=[e['t'] for e in fin if e['k']=='ding']
for e in ev:
    k,t0,d=e['k'],e['t'],e['d']
    if k in BELLS and id(e) not in play: continue
    if k=='pop':
        if t0-last_pop>=0.45: put(t0,pop(),0.08); last_pop=t0
    elif k=='draw': put(t0,soft(),0.5)
    elif k=='travel': put(t0,glide(max(0.4,d)),0.5)
    elif k=='key': put(t0,key(),0.12)   # 終端機打字：很輕
    elif k=='enter': put(t0,key(),0.25)
    elif k=='fill': pass
    elif k=='tick':
        if t0-last_tick>=1.5 and not any(abs(t0-d)<0.8 for d in dings): put(t0,tick(),0.25); last_tick=t0
    elif k=='ding': put(t0,ding(),0.6)
    elif k=='warn': put(t0,warn(),0.8)
    elif k=='chime': put(t0,chime(),0.9)
    elif k=='sting': put(t0,sting(),0.9)
    elif k=='swipe': put(t0,swipe(),0.5)
out/=max(1,np.abs(out).max()/0.9); save('sfx.wav',out)
print('audio ok',T,'bells',len(bl),'->',len(fin),[(e['k'],round(e['t'],1)) for e in fin])
