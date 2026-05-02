# Deployment: Cloud Frontend + Local Backend

## Overview

Architecture for hosting the React frontend on Vercel while keeping FastAPI running on a local machine. Designed for investor demos and dev/testing where data privacy is a requirement.

```
Investor's Browser
       │
       ├──(1) fetch static files──► Vercel (React SPA)
       │
       └──(2) API + SSE calls──────► Cloudflare Tunnel URL
                                            │
                                     (encrypted tunnel)
                                            │
                                     Local Machine (FastAPI :8000)
                                     [data never leaves here]
```

API calls happen **from the browser directly** to the tunnel URL — not proxied through Vercel. This means Vercel's 30s serverless timeout is irrelevant.

---

## Stack Decision

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend hosting | Vercel | Zero-config React deploys, fast global CDN, generous free tier |
| Backend tunnel | Cloudflare Tunnel | Free forever, SSE streaming support, no port forwarding or static IP needed, data stays local |

---

## Phased Rollout

Domain `moulitech.in` was purchased but verification is pending with registrar support. Two phases:

| Phase | When | Tunnel | URL stability |
|-------|------|--------|---------------|
| **Phase 1** | Now, no domain yet | ngrok (free) | URL changes on restart — update Vercel env var manually |
| **Phase 2** | Once `moulitech.in` is verified | Cloudflare Tunnel (named) | Stable URL, no more manual updates |

---

## Prerequisites

- Node.js + Vercel CLI for frontend deploys
- For Phase 1: ngrok installed locally
- For Phase 2: `moulitech.in` DNS managed on Cloudflare + `cloudflared` CLI

---

## Setup

### Phase 1 — ngrok (no domain required)

```bash
# Install
brew install ngrok

# Start tunnel pointing to local FastAPI
ngrok http 8000
# → gives you https://a1b2c3d4.ngrok-free.app
```

Each time ngrok restarts the URL changes. Workflow:
1. Start ngrok → copy the new URL
2. Vercel dashboard → Settings → Environment Variables → update `VITE_API_URL`
3. Vercel dashboard → Deployments → Redeploy (~30 seconds)

Acceptable for dev/testing. Not suitable for live investor demos.

---

### Phase 2 — Cloudflare Tunnel (once `moulitech.in` is live)

#### 1. Cloudflare Tunnel (local machine)

```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# One-time authentication (opens browser)
cloudflared tunnel login

# Create a named tunnel (do this once)
cloudflared tunnel create smartaop-backend

# Route a subdomain to the tunnel (requires domain on Cloudflare)
cloudflared tunnel route dns smartaop-backend api.yourdomain.com

# Start the tunnel (run this whenever the backend is active)
cloudflared tunnel run --url http://localhost:8000 smartaop-backend
```

Use a **named tunnel** (not ephemeral) so the URL stays stable across restarts. Ephemeral tunnels generate a random URL each time, which would require a Vercel redeploy to update.

---

### 2. FastAPI CORS

Allow the Vercel frontend origin in FastAPI middleware:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-app.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

For SSE streaming, also ensure response buffering is disabled:

```python
from fastapi.responses import StreamingResponse

# Use Transfer-Encoding: chunked (FastAPI StreamingResponse handles this automatically)
# Do NOT wrap streaming responses in any middleware that buffers output
```

---

### 3. Frontend Environment Variable

Set the tunnel URL in Vercel dashboard → **Settings → Environment Variables**:

```
VITE_API_URL = https://api.yourdomain.com
```

Reference it in the React app:

```ts
const API_URL = import.meta.env.VITE_API_URL;
```

If the tunnel URL ever changes, update this variable and redeploy Vercel.

---

### 4. Deploy Frontend to Vercel

```bash
npm i -g vercel

# First deploy (follow prompts)
vercel

# Production deploy
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard for automatic deploys on push.

---

## Keeping the Local Machine Awake During Demos

macOS sleeps the machine when the lid closes, killing the tunnel. Prevent this during demos:

```bash
# Keep machine awake indefinitely (Ctrl+C to stop)
caffeinate -i
```

Or go to **System Settings → Battery → Prevent sleep** while on power.

---

## Known Challenges

| Challenge | Solution |
|-----------|----------|
| Tunnel URL changes on restart | Use named tunnel — URL stays fixed |
| CORS errors on first run | Add Vercel domain to FastAPI `allow_origins` |
| SSE buffering through tunnel | Cloudflare Tunnel passes SSE through correctly; ensure no buffering middleware in FastAPI |
| Machine sleeps during demo | Run `caffeinate -i` before demo |
| Tunnel URL hardcoded in build | Keep it in `VITE_API_URL` env var in Vercel; update + redeploy if it changes |
| ngrok URL blocked by corporate/office network | See troubleshooting section below |

---

## Troubleshooting

### "Failed to fetch" — ngrok URL blocked by network firewall

**Symptoms:**
- App works on your machine, fails on colleague's machine
- Network tab shows `0 B transferred`, empty response headers, "Provisional headers are shown" warning
- Colleague cannot open the ngrok URL directly in their browser
- Error says "Failed to fetch" or "ERR_CONNECTION_REFUSED"

**Root cause:**
Corporate, office, and school networks commonly block `*.ngrok-free.app` and `*.ngrok-free.dev` domains at the firewall level. The request never reaches your machine. This looks like a CORS error on the surface but is actually a network block — a real CORS error would show response headers.

**How to diagnose:**
Ask the colleague to open the backend health endpoint directly in their browser:
```
https://<your-ngrok-url>/health
```
- Loads → ngrok is reachable, look elsewhere
- Times out / connection refused → network is blocking ngrok

**Solutions ranked by effort:**

1. **Switch to Cloudflare Tunnel (Phase 2)** — Cloudflare Tunnel traffic uses standard HTTPS on port 443 with Cloudflare's IP ranges, which are rarely blocked. This is the permanent fix once `moulitech.in` domain is verified.

2. **Use a mobile hotspot for the demo** — Have the colleague join your hotspot or their phone's hotspot. Bypasses the corporate firewall entirely. Zero setup, good for one-off demos.

3. **Use ngrok paid plan with a custom domain** — ngrok paid ($10/mo) lets you use your own domain (e.g. `api.moulitech.in`). Since it's your domain on port 443, firewalls are less likely to block it.

4. **Use Tailscale Funnel** — Creates a tunnel through Tailscale's relay network using standard HTTPS. Less likely to be blocked than ngrok's known IP ranges. Requires both machines to install Tailscale.

**For investor demos specifically:** Always test on the demo machine and network at least 30 minutes before. If blocked, mobile hotspot is the fastest recovery.

### ngrok interstitial blocking API calls (CORS-like error)

**Symptoms:**
- App works on your machine, fails on a fresh machine that has never visited the ngrok URL
- CORS error in console but switching to Cloudflare Tunnel fixes it

**Root cause:**
ngrok free tier shows a browser warning page on first visit. For API fetch calls, this HTML page is returned instead of JSON, with no CORS headers. The browser's OPTIONS preflight request does not include custom headers (like `ngrok-skip-browser-warning`), so the interstitial fires before the actual request.

**Fix:**
Restart ngrok with the `--request-header-add` flag so the skip header is injected into all requests including OPTIONS preflight:

```bash
ngrok http 8000 --request-header-add "ngrok-skip-browser-warning:true"
```

Also ensure `api.ts` includes the header on all fetch calls:

```ts
const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};
```

---

## Bandwidth Estimate

Upload bandwidth: ~40 Mbps (5 MB/s)

Each streaming response is roughly 10–50 KB. This comfortably supports 20–40 concurrent streaming users — more than enough for investor demos.

---

## If Downtime Is Not Acceptable (Future)

Four escalating options ranked by complexity:

1. **Dual machine failover** — Run the tunnel on two machines (laptop + home server). Cloudflare Load Balancer health-checks both and routes to the live one. Cost: ~$5/month.

2. **Cloud warm standby** — Run a FastAPI instance on Fly.io or Railway with a recent copy of non-sensitive data. Health check flips DNS to cloud if local goes down. Requires a data sync strategy.

3. **Separate data from compute** — Store only raw sensitive data locally. Move embeddings, indexes, and cached results to cloud. Cloud FastAPI calls home only when raw data is needed. Local becomes a "data vault." Most resilient design.

4. **Ephemeral cloud deploy for high-stakes demos** — Dockerize the backend, spin it up on Fly.io/Railway with sample data 48 hours before an important demo, tear it down after. Cost: pennies per session.

---

## Alternatives Considered

### Frontend Hosting

| Option | Notes |
|--------|-------|
| Netlify | Near-identical to Vercel, slightly slower builds |
| Cloudflare Pages | Best CDN speed, native Cloudflare Tunnel integration, less polished DX |
| AWS S3 + CloudFront | Enterprise-grade, complex setup, overkill for demo stage |
| GCP Firebase Hosting | Good if using Firebase ecosystem; otherwise adds unnecessary coupling |
| Fly.io | Designed for backend containers, not static site hosting |

### Tunneling

| Option | Notes |
|--------|-------|
| ngrok | Easy setup, free tier has random URLs that change on restart; $10/mo for stable URL |
| Tailscale Funnel | VPN-based, slightly more setup, solid reliability |
| bore / frp | Self-hosted, requires a VPS relay, full control but you manage it |
