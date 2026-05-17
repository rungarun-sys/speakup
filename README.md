# SpeakUp AI

## Local development

```powershell
npm.cmd install
npm.cmd run dev
```

To test Gemini locally, keep Vite running on `http://127.0.0.1:5173`,
then start the local API proxy in another terminal:

```powershell
$env:GEMINI_API_KEY_1="your_first_gemini_api_key_here"
$env:GEMINI_API_KEY_2="your_second_gemini_api_key_here"
$env:GEMINI_API_KEY_3="your_third_gemini_api_key_here"
$env:GEMINI_API_KEY_4="your_fourth_gemini_api_key_here"
npm.cmd run dev:local-api
```

Open `http://127.0.0.1:5174`. The `5174` local proxy adds `/api/gemini`
for testing, while the regular Vite URL `5173` only serves the React app.

## Deploy

Set these environment variables in your hosting provider before deploying:

```bash
GEMINI_API_KEY_1=your_first_gemini_api_key_here
GEMINI_API_KEY_2=your_second_gemini_api_key_here
GEMINI_API_KEY_3=your_third_gemini_api_key_here
GEMINI_API_KEY_4=your_fourth_gemini_api_key_here
```

The backend Gemini proxy uses best-effort Round Robin key rotation:
`1 -> 2 -> 3 -> 4 -> 1`. If one key is rate-limited, it tries the next key.

You can also set one comma-separated variable instead:

```bash
GEMINI_API_KEYS=key1,key2,key3,key4
```

### Vercel

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `GEMINI_API_KEY_1` to `GEMINI_API_KEY_4`

The Gemini proxy runs at `/api/gemini`.

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: `GEMINI_API_KEY_1` to `GEMINI_API_KEY_4`

Netlify routes `/api/gemini` to `/.netlify/functions/gemini`.
