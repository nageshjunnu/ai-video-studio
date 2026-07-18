# Drishyana AI

A production-oriented foundation for a multilingual story-to-video studio. Drishyana turns scripts into locally narrated cinematic scenes and supports Telugu female/male voices or user-uploaded narration.

## Production environment

Set `DATABASE_URL` to the pooled PostgreSQL connection supplied by Neon. Set `WEB_URL` to the deployed frontend origin, `API_URL` to the server-side API URL, and `NEXT_PUBLIC_API_URL` to the public API URL used by browsers. Use a unique production `JWT_SECRET` of at least 32 random characters. Never commit `.env`.

Use these URL values locally:

```env
WEB_URL=http://localhost:3000
API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

Use these values in the deployment dashboards (not in the local `.env`):

```env
# Render API service
WEB_URL=https://your-vercel-domain.vercel.app

# Vercel web project
API_URL=https://drishyana-api.onrender.com/api/v1
NEXT_PUBLIC_API_URL=https://drishyana-api.onrender.com/api/v1
NEXT_PUBLIC_RENDER_ENDPOINT=https://your-renderer-service.onrender.com/api/render
```

`WEB_URL` accepts a comma-separated list when production and preview frontend origins both need API access. Restart both development servers after changing environment variables.

Do not use Vercel serverless functions for full FFmpeg video rendering. Vercel can terminate `/api/render` with `FUNCTION_INVOCATION_TIMEOUT`. Keep `NEXT_PUBLIC_RENDER_ENDPOINT=/api/render` only for local testing; in production point it to a Render/Railway/Fly service that hosts the renderer.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. For infrastructure services, copy `.env.example` to `.env` and run `docker compose up -d`.

### Dynamic database and API

```bash
cp .env.example .env
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
```

The NestJS API runs at `http://localhost:4000/api/v1`. Authentication, projects, dashboard summaries, credits, test purchases, and admin endpoints are database-driven. Run `npm run dev` in another terminal for the frontend.

Local seed accounts (never use in production):

- Admin: `nagesh@drishyana.com` / `Admin@123`
- Customer: `customer@voxora.local` / `Customer@123`

New customer registrations receive 1,000 credits and a registration credit transaction. Test purchases are disabled automatically when `NODE_ENV=production`.

## Architecture

- `apps/web` — Next.js App Router frontend
- `apps/api` — NestJS-ready API domain/provider contract scaffold
- `apps/worker` — BullMQ/FFmpeg worker boundary
- `packages/database` — Prisma PostgreSQL schema
- PostgreSQL stores product data; Redis drives render jobs and progress events.
- External voice, visual, storage, and payment systems sit behind provider interfaces.

## Render lifecycle

The API validates a project, persists a `RenderJob`, and enqueues its ID. A separate worker generates narration and licensed/AI media, composes scenes with FFmpeg, uploads the export, then publishes progress. This keeps CPU-heavy work outside request handling.

## Current scope

The creation wizard now produces a real MP4 without API keys. It splits the script into scenes, renders branded visual slides, generates narration with the macOS system voice, and composes the result using the project-bundled FFmpeg binary. Generated files are written to `apps/web/public/renders` and offered for download. Other operating systems currently produce a silent video until Piper is configured.

Authentication, external generative-image providers, billing, and collaboration remain later production phases.

## Optional offline Telugu voice

The renderer automatically detects Telugu and looks for Piper plus either `te_IN-padmavathi-medium` or `te_IN-venkatesh-medium` under `models/piper`. These local models require no API key. If they are absent, the complete video still renders with Telugu captions and estimated timing, but without narration.

Story visuals are searched dynamically through the Wikimedia Commons API. The renderer uses language-aware topic mappings, stores attribution metadata in the render response, and falls back to generated gradients when a suitable licensed image is unavailable. This requires internet access during rendering but no API key.

Users can also upload up to 12 related images or video clips. Uploaded media is prioritized across scenes, topic-matched Wikimedia images fill remaining scenes, and generated gradients are the final fallback. Caption text can be hidden or displayed at the top/bottom in three sizes.

Each video can include a manually configured opening title screen with title, creator/admin name, and organization/channel. Caption backgrounds are intentionally transparent; text uses a subtle outline and shadow instead.
# ai-video-studio
