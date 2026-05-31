# socket-server

## Deploy on Render

### 1) Push code to GitHub

Render deploys from your git repository, so push this project first.

### 2) Create Web Service on Render

- Go to [Render Dashboard](https://dashboard.render.com/)
- New + -> Web Service
- Connect your repository

### 3) Use these settings

- **Runtime**: Node
- **Build Command**: `yarn install --frozen-lockfile`
- **Start Command**: `yarn start`
- **Health Check Path**: `/health`

### 4) Environment variables

Set these in Render -> Environment:

- `JWT_SECRET` = same secret your API uses to sign user JWTs (HS256, etc.)
- `API_URL` = base URL of your HTTP API (**no trailing slash**), e.g. `https://api.example.com` — used for `readUnreadCount` and similar calls.
- `HOST` = `0.0.0.0`
- `NODE_ENV` = `production`

**Redis (required for distributed online user tracking via bitmap):**

You can use either:

**A. Upstash Redis (recommended for Render / serverless-friendly)**

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**B. Standard Redis / self-hosted**

- `REDIS_URL` = full connection string, e.g. `redis://:password@host:6379/0`
- OR individual vars:
  - `REDIS_HOST`
  - `REDIS_PORT` (default: 6379)
  - `REDIS_PASSWORD`
  - `REDIS_DB` (default: 0)

Optional for both:

- `REDIS_KEY_PREFIX` = namespace prefix for keys (default: `socket`)

- `ONLINE_CACHE_TTL_MS` = short in-memory cache time for online count & list (default: `4000` ms).
  Strongly recommended when using **Upstash REST** to reduce HTTP requests.

### Health endpoint

`GET /health` now returns memory usage:

```json
{
  "message": "OK",
  "clients": 42,
  "onlineUsers": 38,
  "memory": {
    "redis": {
      "bitmap": 12345,
      "counts": 67890,
      "map": 23456,
      "total": 103691
    },
    "node": {
      "rss": 76234752,
      "heapUsed": 15725096,
      "heapTotal": 17809408,
      "external": 3622048
    }
  }
}
```

- `memory.redis`: Approximate memory used by the online bitmap keys (in bytes). May be `null` on some Upstash plans.
- `memory.node`: Node.js process memory usage.

This allows your main backend to query who is currently online.

Render automatically provides `PORT`, and the server already supports it.

### 5) Test after deploy

- Health check: `https://<your-render-domain>/health`
- Socket.IO URL in client/Postman: `https://<your-render-domain>`

For auth, send a valid JWT: `Authorization: Bearer <token>`, or `auth.token`, or query `token`. The token must include `sub` (or `userId` / `id`) for the account id.
