# Socius promo video (30 s)

[Socius-Promo-30s.mp4](Socius-Promo-30s.mp4): 1080p, 90s-TV look, voiceover, music and sound design. The full-quality render (~133 MB) is over GitHub's file limit; re-render it from `source/`.

One continuous shot on black, no hard cuts: US AI agents fail India's tasks (IRCTC, DigiLocker, UPI, GST, 22 languages) → the same chips flip to ✓ around Baymax → Baymax becomes the app avatar → Tatkal booking with DigiLocker ID and UPI approval → use-case tiles → India marketplace wall → end card.

## Rebuild

```sh
cd source
npm install
node voice/make_vo.mjs           # Kokoro voiceover (set KOKORO_JS to a kokoro-js install)
python3 audio/mix.py             # music + SFX + voice -> public/audio/mix.wav
npx remotion render src/index.ts SociusPromo out/Socius-Promo-30s.mp4 --crf=18 --audio-codec=aac --audio-bitrate=256k
```

Edit timing in `src/timeline.json` (video and audio both read it), visuals in `src/Film.tsx`, the CRT layer in `src/Crt.tsx`, the script in `voice/lines.json`.

Notes: the India connectors are shown as the vision and are not built yet. Baymax is Disney's character and the brand logos belong to their owners (Simple Icons and Wikimedia Commons); fine for the ideathon, not for public promotion.
