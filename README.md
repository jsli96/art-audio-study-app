# Art Audio Study App (Prototype)

A research prototype web app to support a user study on how:
1) TTS,
2) emotional intonation, and
3) emotional intonation + music
affect understanding/feeling of visual art style.

## What’s included (MVP)

- Image input via URL or file upload (stored only in-memory; no S3 yet)
- AI-generated description + style hints (OpenAI vision models)
- TTS audio generation (OpenAI Audio API)
- Emotional intonation via TTS `instructions`
- Music: placeholder “music bed” generated in the browser (WebAudio oscillators)
- Basic session + trial response logging via Prisma (SQLite default)

## Local run

1) Install deps
```bash
npm install
```

2) Configure env
```bash
cp .env.example .env.local
# edit OPENAI_API_KEY
```

3) Init database
```bash
npx prisma migrate dev --name init
```

4) Start dev server
```bash
npm run dev
```

Open http://localhost:3000

## Deployment (recommended path)

- Vercel for hosting (Next.js)
- Postgres via Neon/Supabase (switch Prisma provider and DATABASE_URL)
- Object storage (S3/R2) for uploaded images and generated audio (optional)

See the design notes in the chat for the next upgrade steps.


## Azure Speech (SSML) for Condition 2

Condition 2 can use Azure Text-to-Speech via SSML to allow word-/phrase-level prosody control.

### Environment variables

Add to `.env.local`:

- `SPEECH_KEY`
- `SPEECH_REGION` (e.g., `eastus`)

### Implementation

- API: `src/app/api/azure-tts/route.ts`
- UI: `src/app/page.tsx`
- Player: `src/components/AudioPlayer.tsx`
