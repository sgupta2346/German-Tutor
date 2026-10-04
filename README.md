# German Tutor

I wanted to learn German, and most of the apps that teach German along with
pronunciation were paid. So I made this AI-based German tutor. It takes you
from the alphabet up to full sentences and paragraphs, and it listens to you
speak and tells you which sounds you got wrong and how to fix them.

## What it does

- **Alphabet and sounds.** Every letter with audio, plus a guide to the
  sounds English speakers usually get wrong (ü, ö, the two ch sounds, the
  German r, z, w, final devoicing, vowel length). Each one has an
  explanation of how to make it, the typical English mistake, and ear
  training with minimal pairs like *schön / schon* and *Nacht / nackt*.
- **Flashcards.** Vocabulary decks with audio, der/die/das colour coding,
  plurals and example sentences. Swipe or grade each card, and spaced
  repetition (FSRS) decides when you see it again.
- **Lessons.** A path from A1 to C1. Each lesson mixes a short grammar
  explanation, listen-and-repeat, multiple choice, sentence building,
  dictation and speaking.
- **Pronunciation feedback.** Record a word, sentence or paragraph. A
  phoneme recognition model works out which sounds you actually made,
  compares them against standard German, and shows you per word what was
  off, e.g. you said *oo* where *ü* should be, or used an English r.
- **Practice built around your accent.** Every recording updates a score
  for each German sound. The "For you" tab finds your weakest sounds and
  builds drills from course words and sentences that contain them, moving
  from single words to long sentences as each one improves.
- **Live tutor.** Chat with Lena, a tutor running on Google's Gemini, in
  situations like ordering at a café, seeing a doctor or a job interview.
  She replies at your level, corrects your mistakes in English, and new
  words go straight into your flashcards. You can talk instead of typing,
  and your pronunciation gets scored along the way. It needs your own free
  Gemini API key, which stays in your browser.

## How the scoring works

Everything runs in the browser, nothing gets uploaded. The recording goes
through `wav2vec2-xlsr-53-espeak-cv-ft` (an ONNX export, run with
transformers.js in a web worker), which outputs the phonemes it heard
rather than words, so it doesn't auto-correct your mistakes the way normal
speech recognition does. The expected phonemes for every German word in the
course are generated ahead of time with espeak-ng
(`scripts/build_phonemes.py`). The two sequences are aligned, and the
differences are matched against common English-speaker errors. If the
browser has speech recognition (Chrome, Edge), it's used as a second check
on whether each word was understandable.

The model is downloaded once (about 240 MB) and cached by the browser.

### How well it works

Measured in `kaggle/phoneme_eval/` on 120 clips (30 minutes) of real
native German speech from Multilingual LibriSpeech, plus 60 course
sentences read by a German Piper voice and by an English one reading the
German text with English pronunciation rules:

| | mean score | words flagged |
|---|---|---|
| Native German speakers | 91 | 9% |
| German voice | 94 | 6% |
| English voice reading German | 57 | 56% |

The most common things caught in the English reading were the English r,
dropping the final -e, w said as English w, -ig said as -ik, and missing
final devoicing, which are the usual English-speaker mistakes.

The 4-bit model (240 MB) scored within a point of the full 1.26 GB one,
so the app uses the small one. The first version also flagged vowel length,
but that caused most of the false alarms on native speech (the model doesn't
hear length reliably), so length differences now count very little and
aren't reported as mistakes.

`server/` has the same scoring logic in Python, used by the Kaggle
evaluation in `kaggle/phoneme_eval/`.

## Audio

German audio for every word and sentence is pre-generated with Piper
(two voices, Thorsten and Kerstin) in `kaggle/audio_gen/` and served from a
Hugging Face dataset. If a phrase has no recording, the browser's own German
voice reads it.

## Where it's at

- A1 vocabulary (12 decks) and the first four A1 units are written. The
  rest of the curriculum is outlined unit by unit and being filled in.
- Progress is saved in the browser. You can export and import it from
  Settings.

## Running it

Web app:

```
cd frontend
npm install
npm run dev
```

After changing anything in `content/`, regenerate the reference phonemes:

```
python -m venv .venv
.venv\Scripts\activate
pip install phonemizer espeakng-loader
python scripts/build_phonemes.py
```

Tests:

```
cd frontend && npm test
cd server && pytest tests/
```

## License

MIT, see `LICENSE`.
