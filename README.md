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

- `REDIS_URL` = Redis Cloud connection string used by online tracking, the
  Socket.IO adapter, and the `socket:events` subscriber.
  Example: `rediss://default:<password>@<host>:<port>`

- `REDIS_KEY_PREFIX` = namespace prefix for keys (default: `socket`)

- `ONLINE_CACHE_TTL_MS` = short in-memory cache time for online count & list (default: `30000` ms).

`SOCKET_REDIS_URL` is accepted as a temporary backwards-compatible alias for
`REDIS_URL`, but new deployments should only set `REDIS_URL`.

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

## Redis Cloud permissions

The Redis Cloud user must be allowed to run `HINCRBY`, `HGET`, `HSET`,
`HGETALL`, `INCR`, `SETBIT`, `GETBIT`, `BITCOUNT`, `EVAL`, `PUBLISH`, and
`SUBSCRIBE`.
