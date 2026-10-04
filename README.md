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

## How the scoring works

`server/` is a small FastAPI service. The recording goes through
`wav2vec2-xlsr-53-espeak-cv-ft`, which outputs the phonemes it heard rather
than words, so it doesn't auto-correct your mistakes the way normal speech
recognition does. The target text is converted to its expected phonemes
with espeak-ng, the two sequences are aligned, and the differences are
matched against common English-speaker errors. Whisper also transcribes the
attempt as a second check on whether the words were understandable.

If the scoring server isn't available, the app falls back to the browser's
speech recognition and only checks whether each word was recognised.

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

Scoring server (needs espeak-ng installed):

```
cd server
python -m venv .venv
.venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
uvicorn app.main:app --port 7860
```

Then set `VITE_SCORER_URL=http://localhost:7860` in `frontend/.env.local`.

Tests:

```
cd frontend && npm test
cd server && pytest tests/
```

## License

MIT, see `LICENSE`.
