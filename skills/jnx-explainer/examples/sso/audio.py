import os, pathlib; D=os.path.dirname(os.path.abspath(__file__))+'/'  # 專案資料夾（本機路徑）
import numpy as np, subprocess, wave, json
from scipy.signal import lfilter
sr=44100
meta=json.load(open(D+'sc.json')); T=meta['total']; voice=meta['voice']
n=int(sr*T); A=D+'flow/assets/'
def save(name,x):
    w=wave.open(A+name,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes()); w.close()
# --- voice
vo=np.zeros(n,dtype=np.float32)
for i,s in enumerate(voice,1):
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',D+f'vo/v{i}.mp3','-ar',str(sr),'-ac','1','-f','f32le','/tmp/v.raw'],check=True)
    a=np.fromfile('/tmp/v.raw',dtype=np.float32); st=int(s*sr); vo[st:st+len(a)]+=a[:n-st]
save('vo.wav',vo*0.95)
# --- bgm : 112 bpm, minor-ish pulse, quick arpeggio + soft kick, fades
bpm=112; beat=60/bpm; t=np.arange(n)/sr; m=np.zeros(n)
f=lambda p:440*2**((p-69)/12)
chords=[[45,52,57,60],[41,48,53,57],[43,50,55,59],[40,47,52,55]]  # Am F G Em voicings
bar=beat*4
for b in range(int(T/bar)+2):
    ch=chords[b%4]; s0=b*bar; i0=int(s0*sr)
    if i0>=n: break
    i1=min(n,int((s0+bar+0.3)*sr)); tt=np.arange(i1-i0)/sr
    env=np.minimum(1,tt/0.2)*np.exp(-np.maximum(0,tt-bar)*8)
    m[i0:i1]+=sum(np.sin(2*np.pi*f(p-12)*tt)+0.25*np.sin(2*np.pi*f(p)*tt) for p in ch)*env*0.035
    for k in range(16):  # sixteenth arpeggio
        p=ch[[0,1,2,3,2,1,3,2,0,1,2,3,2,1,3,1][k]]+12
        ts=s0+k*beat/4; j0=int(ts*sr)
        if j0>=n: break
        j1=min(n,j0+int(sr*0.22)); q=np.arange(j1-j0)/sr
        m[j0:j1]+=np.sin(2*np.pi*f(p)*q)*np.exp(-q*16)*0.05*(1.3 if k%4==0 else 1)
    for k in range(4):  # four on the floor, soft
        ts=s0+k*beat; j0=int(ts*sr)
        if j0>=n: break
        j1=min(n,j0+int(sr*0.2)); q=np.arange(j1-j0)/sr
        m[j0:j1]+=np.sin(2*np.pi*(50+70*np.exp(-q*35))*q)*np.exp(-q*16)*0.16
    for k in range(8):  # closed hat
        ts=s0+k*beat/2+beat/4*0; j0=int(ts*sr)
        if j0>=n: break
        j1=min(n,j0+int(sr*0.04)); q=np.arange(j1-j0)/sr
        rng=np.random.default_rng(b*8+k); nz=rng.standard_normal(len(q))
        m[j0:j1]+=(nz-lfilter([0.3],[1,-0.7],nz))*np.exp(-q*140)*0.02
m*=np.minimum(1,t/1.5)*np.minimum(1,(T-t)/2.5); m/=max(1e-6,np.abs(m).max()); save('bgm.wav',m*0.9)
# --- sfx from the timeline's own event log
ev=json.load(open(D+'sfx.json')); rng=np.random.default_rng(3); out=np.zeros(n)
def put(t0,x,g=1.0):
    i=int(t0*sr); j=min(n,i+len(x))
    if 0<=i<n: out[i:j]+=x[:j-i]*g
def tt(d): return np.arange(int(sr*d))/sr
def pop():
    q=tt(0.1); fr=420+480*(1-np.exp(-q*45)); return np.sin(2*np.pi*np.cumsum(fr)/sr)*np.exp(-q*34)*0.5
def whoosh(d,lo=0.05,hi=0.45):
    q=tt(d); nz=rng.standard_normal(len(q)); a=lfilter([lo],[1,-(1-lo)],nz); b=lfilter([hi],[1,-(1-hi)],nz); w=np.sin(np.pi*q/d)**1.4
    return (a*(1-w)+b*w)*w*0.8
def key():
    q=tt(0.045); nz=rng.standard_normal(len(q)); return (nz-lfilter([0.3],[1,-0.7],nz))*np.exp(-q*170)*0.45+np.sin(2*np.pi*2300*q)*np.exp(-q*130)*0.22
def tick():
    q=tt(0.05); return np.sin(2*np.pi*1500*q)*np.exp(-q*110)*0.45
def ding():
    q=tt(0.6); a=np.sin(2*np.pi*1318.5*q)*np.exp(-q*8); b=np.zeros_like(q); k=int(0.08*sr); b[k:]=np.sin(2*np.pi*1760*q[:len(q)-k])*np.exp(-q[:len(q)-k]*8)
    return (a+b)*0.4
def warn():
    q=tt(0.22); return (np.sin(2*np.pi*180*q)*np.exp(-q*12)+0.5*np.sin(2*np.pi*90*q)*np.exp(-q*9))*0.55
def chime():
    q=tt(1.6); return sum(np.sin(2*np.pi*fq*q)*np.exp(-q*2.4) for fq in (523.25,659.25,783.99,1046.5))*0.17
for e in ev:
    k,t0,d=e['k'],e['t'],e['d']
    if k=='pop': put(t0,pop(),0.8)
    elif k=='draw': put(t0,whoosh(max(0.3,d),0.04,0.3),0.4)
    elif k=='travel': put(t0,whoosh(max(0.4,d),0.06,0.5),0.55)
    elif k=='key': put(t0,key(),0.9)
    elif k=='tick': put(t0,tick(),0.8)
    elif k=='ding': put(t0,ding(),0.9)
    elif k=='warn': put(t0,warn(),0.8)
    elif k=='chime': put(t0,chime(),0.9)
out/=max(1,np.abs(out).max()/0.9); save('sfx.wav',out)
print('audio ok',T)
