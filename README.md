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

**Redis (required for online user tracking via bitmap + optional Socket.IO scaling):**

You can use either:

### Option A: Upstash Redis (recommended for most deployments)
- `UPSTASH_REDIS_REST_URL` = Upstash REST URL (e.g. `https://xxx.upstash.io`)
- `UPSTASH_REDIS_REST_TOKEN` = Upstash REST token

These are used for online user tracking (bitmap + counters). No persistent TCP connection required.

If you also want to scale the socket server across multiple instances (rooms, broadcast), additionally set:
- `REDIS_URL` = Upstash **Redis** connection string (from Upstash dashboard → Redis → "Redis" connection, rediss://...) for the Socket.IO adapter pub/sub.

### Option B: Self-hosted / Redis Cloud / direct rediss://
- `REDIS_URL` = full connection string used for **both** online tracking and the Socket.IO adapter.
  Example: `rediss://default:<password>@<host>:<port>`

Other Redis settings:
- `REDIS_KEY_PREFIX` = namespace prefix for keys (default: `socket`)
- `ONLINE_CACHE_TTL_MS` = short in-memory cache time for online count & list (default: `30000` ms).

`SOCKET_REDIS_URL` is accepted as a temporary backwards-compatible alias for `REDIS_URL`.

`UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` are also accepted as aliases for the REST credentials.

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

- `memory.redis`: Approximate memory used by the online bitmap keys (in bytes).
- `memory.node`: Node.js process memory usage.

This allows your main backend to query who is currently online.

Render automatically provides `PORT`, and the server already supports it.

### 5) Test after deploy

- Health check: `https://<your-render-domain>/health`
- Socket.IO URL in client/Postman: `https://<your-render-domain>`

For auth, send a valid JWT: `Authorization: Bearer <token>`, or `auth.token`, or query `token`. The token must include `sub` (or `userId` / `id`) for the account id.

## Redis permissions (for REDIS_URL or Upstash Redis protocol)

When using a direct `REDIS_URL` (Redis protocol), the user/role must be allowed to run:
`HINCRBY`, `HGET`, `HSET`, `HGETALL`, `INCR`, `SETBIT`, `GETBIT`, `BITCOUNT`, `EVAL`, `PUBLISH`, and `SUBSCRIBE`.

When using Upstash REST (`UPSTASH_REDIS_REST_*`), most commands above are supported via their REST API (EVAL, bitmap ops, hashes etc. work). The adapter (scaling) still needs the protocol URL.
