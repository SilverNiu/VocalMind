# VocalMind Frontend

React/Vite frontend for the VocalMind companion UI.

## Local Development

```bash
npm ci
npm run dev
```

The dev server listens on `http://127.0.0.1:3000`.

## Backend

The frontend reads `VITE_API_BASE` from the Vite environment. If it is not set, it defaults to the current public VocalMind API:

```env
VITE_API_BASE="http://101.35.234.4:18080"
```

MiniCPM realtime voice uses the same backend base and connects to `/voice/minicpm` through the VocalMind FastAPI proxy. Do not put MiniCPM or LLM API keys in frontend env files.

## Build

```bash
npm run build
```

For integrated deployment, run `scripts/deploy_full_stack.sh` from the repository root. The backend serves the generated `frontend/dist` files.
