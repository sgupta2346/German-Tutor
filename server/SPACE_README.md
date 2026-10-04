---
title: German Pronunciation Scorer
emoji: 🗣️
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: mit
---

Phoneme-level pronunciation scoring for German, used by the AI German Tutor web app.

`POST /api/score` with a 16 kHz mono WAV (`audio`) and the target sentence (`text`).
