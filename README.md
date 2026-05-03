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

Render automatically provides `PORT`, and the server already supports it.

### 5) Test after deploy

- Health check: `https://<your-render-domain>/health`
- Socket.IO URL in client/Postman: `https://<your-render-domain>`

For auth, send a valid JWT: `Authorization: Bearer <token>`, or `auth.token`, or query `token`. The token must include `sub` (or `userId` / `id`) for the account id.
