import json, os
import numpy as np, soundfile as sf
from scipy import signal
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(f"{R}/src/timeline.json")); CU = TL["cues"]; FPS = 30
SR = 48000; DUR = TL["durationInFrames"] / FPS; N = int(SR * DUR)
rng = np.random.default_rng(3)
out = np.zeros(N); vo = np.zeros(N)
fr = lambda f: f / FPS
def tt(d): return np.arange(int(d * SR)) / SR
def add(buf, t, x, g=1.0):
    i = int(t * SR); n = min(len(x), N - i)
    if n > 0 and i >= 0: buf[i:i + n] += x[:n] * g
def lp(x, fc): return signal.sosfilt(signal.butter(2, fc, "low", fs=SR, output="sos"), x)
def hp(x, fc): return signal.sosfilt(signal.butter(2, fc, "high", fs=SR, output="sos"), x)
def kick():
    t = tt(.4); f = 45 + 120 * np.exp(-t * 30); return np.tanh(np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t*8) * 1.6)
def hat(): return hp(rng.standard_normal(int(.05*SR)), 7000) * np.exp(-tt(.05)*90)
def clap(): return signal.sosfilt(signal.butter(2,[900,3800],"band",fs=SR,output="sos"), rng.standard_normal(int(.25*SR))) * np.exp(-tt(.25)*18)
def note(m): return 440 * 2 ** ((m - 69) / 12)
def pad(ms, d, g=.12):
    t = tt(d); x = sum(signal.sawtooth(2*np.pi*note(m)*(1+dv)*t) for m in ms for dv in (-.006, 0, .006))
    e = np.minimum(1, t/.3) * np.minimum(1, (d - t)/.4); return lp(x, 1800) * e * g / len(ms)
def pluck(m, g=.25):
    t = tt(.3); return sum(np.sin(2*np.pi*note(m)*k*t)/k*np.exp(-t*(7+4*k)) for k in range(1,6)) * g
def whoosh(d=.5, g=.35):
    x = rng.standard_normal(int(d*SR)); x = lp(hp(x, 600), 6000); return x * np.sin(np.pi*np.linspace(0,1,len(x)))**2 * g
def boom(): t = tt(2); f = 27 + 40*np.exp(-t*3); return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t*1.6)
def ping(m, g=.22): t = tt(.6); return np.sin(2*np.pi*note(m)*t)*np.exp(-t*7)*g
def pop(g=.25): t = tt(.1); f = 400 + 600*(1-np.exp(-t*60)); return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*40)*g
def click(g=.3): t = tt(.03); return np.sin(2*np.pi*3000*t)*np.exp(-t*250)*g
BEAT = .5
drop = fr(CU["drop"]); end = fr(CU["closeHit"])
# intro: dark drone, ticking hats, pops for each US agent window, red buzz on each ✕
add(out, 0, pad([38, 45, 50], drop, .15))
for b in np.arange(0, drop - .2, BEAT/2): add(out, b, hat(), .22)
for w in CU["agents"]: add(out, fr(w), pop(.3))
for w in CU["tags"]: add(out, fr(w), click(.35))
for s in CU["strikes"]:
    t = tt(.16); add(out, fr(s), signal.square(2*np.pi*110*t) * np.exp(-t*18) * .07)
add(out, fr(CU["headline1"]), kick(), .4); add(out, fr(CU["headline2"]), kick(), .5); add(out, fr(CU["headline2"]), clap(), .2)
r = tt(1.1); add(out, drop - 1.1, lp(rng.standard_normal(len(r)), 3500) * (r/1.1)**2.2 * .4)
add(out, fr(CU["converge"]), whoosh(.6, .45))
add(out, drop, boom(), .9); add(out, drop, kick(), 1)
prog = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]]
bar = 0; t = drop
while t < end - .01:
    ch = prog[bar % 4]; d = min(4 * BEAT, end - t)
    add(out, t, pad(ch, d, .13))
    for k in range(int(round(d / BEAT))):
        add(out, t + k*BEAT, kick(), .5)
        add(out, t + k*BEAT + BEAT/2, hat(), .28)
        if k % 2 == 1: add(out, t + k*BEAT, clap(), .2)
    for k in range(int(round(d / (BEAT/2)))): add(out, t + k*BEAT/2, pluck(ch[k % 4] + 12, .1))
    t += 4 * BEAT; bar += 1
for f in [CU["toApp"], CU["toTiles"], CU["toWall"]]: add(out, fr(f), whoosh(.8, .4))
add(out, fr(CU["implode"]), whoosh(.5, .45))
for i, f in enumerate(CU["flips"]): add(out, fr(f), ping(76 + i * 2, .14))
for f in [CU["step1"], CU["step2"], CU["step3"]]: add(out, fr(f), pop(.25))
add(out, fr(CU["click"]), click(.55)); add(out, fr(CU["booked"]), ping(84, .22)); add(out, fr(CU["booked"]) + .08, ping(88, .2))
add(out, fr(CU["notify"]), ping(91, .12))
for f in CU["highlights"]: add(out, fr(f), ping(79, .1))
for i in range(18): add(out, fr(CU["toWall"] + 8 + i * 1.6), pop(.08))
for f in CU["badges"]: add(out, fr(f), click(.3))
for b in CU["blinks"]: add(out, fr(b), ping(96, .04))
add(out, end, boom(), .75); add(out, end, kick(), .9)
add(out, end, pad([50, 54, 57, 62, 66], DUR - end, .2))
for i, m in enumerate([74, 78, 81, 86]): add(out, end + .3 + i*.18, ping(m, .13))
# 90s TV: tape hiss bed, CRT power-on/off, channel-change static
hiss = hp(rng.standard_normal(N), 3000) * .012
add(out, 0, hiss)
t = tt(.5); add(out, 0, (np.sin(2*np.pi*15700*t)*.03 + lp(rng.standard_normal(len(t)), 300)*np.exp(-t*10)*.6))
add(out, 0, kick(), .35)
for s0 in [CU["converge"], CU["toApp"], CU["toTiles"], CU["toWall"], CU["implode"]]:
    t = tt(.17); add(out, fr(s0), hp(rng.standard_normal(len(t)), 1200) * np.exp(-t*14) * .22)
t = tt(.4); add(out, DUR - .42, np.sin(2*np.pi*np.cumsum(900*np.exp(-t*8)+40)/SR) * np.exp(-t*7) * .25)
# voice
for k, f in TL["vo"].items():
    x, sr = sf.read(f"{R}/public/vo/{k}.wav"); x = signal.resample_poly(x, SR, sr); add(vo, fr(f), x)
env = np.convolve(np.abs(vo) > .02, np.ones(int(.15*SR))/int(.15*SR), "same")
duck = 1 - .55 * np.clip(env * 3, 0, 1)
music = out * duck
music *= 10 ** (-17 / 20) / np.sqrt(np.mean(music**2))
mixd = music + vo * 1.15
mixd[-int(.3*SR):] *= np.linspace(1, 0, int(.3*SR))
mixd = np.tanh(mixd * 1.1); mixd *= 10 ** (-1 / 20) / np.max(np.abs(mixd))
os.makedirs(f"{R}/public/audio", exist_ok=True)
sf.write(f"{R}/public/audio/mix.wav", np.stack([mixd, mixd], 1).astype(np.float32), SR, subtype="PCM_16")
print("mix ok", DUR)
