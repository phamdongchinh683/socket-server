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

**Redis – CHỈ sử dụng 1 trong 2 (không mix):**

### 1. Upstash Redis REST (khuyến nghị cho đa số trường hợp)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Dùng cho online user tracking (bitmap, counters). Không cần kết nối TCP liên tục, phù hợp serverless / Render free tier.

**Lưu ý:** Socket.IO Redis adapter (hỗ trợ scale nhiều instance) **không hoạt động** ở chế độ REST. Server chỉ chạy được single instance.

### 2. TCP / Redis protocol (dùng `redis` package)
- `REDIS_URL` = `rediss://...` hoặc `redis://...`

Dùng cho **cả** online tracking + Socket.IO adapter (hỗ trợ scale nhiều instance, pub/sub cho rooms).

Các biến khác:
- `REDIS_KEY_PREFIX` (mặc định `socket`)
- `ONLINE_CACHE_TTL_MS` (mặc định `30000`)

**Quy tắc quan trọng:**
- Chỉ được set **một trong hai** bộ thông tin.
- Nếu set cả UPSTASH_REDIS_REST_* lẫn REDIS_URL cùng lúc → server sẽ báo lỗi ngay khi khởi động.
- `SOCKET_REDIS_URL` vẫn được chấp nhận như alias cũ cho `REDIS_URL`.

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

## Redis permissions

- **TCP mode (REDIS_URL)**: cần quyền chạy `HINCRBY`, `HGET`, `HSET`, `HGETALL`, `INCR`, `SETBIT`, `GETBIT`, `BITCOUNT`, `EVAL`, `PUBLISH`, `SUBSCRIBE`.

- **Upstash REST mode**: các lệnh trên được hỗ trợ qua REST API (trừ một số lệnh admin như MEMORY USAGE). Adapter (scale nhiều instance) không dùng được ở chế độ này.
