# Single-Instance Multiplayer Game Scoring Backend

A lightweight, high-performance, single-instance scoring and leaderboard API built with Node.js, Express, Socket.io, MongoDB Atlas, and Upstash Redis.

This backend is tailored for streamlined game sessions where players enter their display name and a 6-digit registration number, play the game, and submit their score to compete on a live Top 10 global leaderboard.

---

## Key Features

- **Frictionless Entry**: Simple registration (`POST /api/auth/register`) with `name` and `registrationNumber` (`100001` - `999999`). Works seamlessly for both first-time registrations and returning logins without conflicts.
- **Upstash Redis Top 10 Leaderboards**: Powered by Upstash Redis (`@upstash/redis` HTTP REST SDK) for $O(\log N)$ high-speed score updates and instant top player queries (`GET /api/leaderboard?limit=10`).
- **Real-Time Score Broadcasts**: Socket.io WebSocket channels emit live `score_updated` events whenever any player submits a score, allowing frontends to display real-time leaderboard animations.
- **Single-Command Reset**: A direct `DELETE /api/reset` endpoint wipes all player data from MongoDB and clears the Upstash Redis leaderboard instantly when you need to run a fresh game session.

---

## Game Workflow Overview

```mermaid
sequenceDiagram
    autonumber
    actor Player1 as Player 1 (Client)
    actor Player2 as Player 2 (Client)
    participant Server as Backend API
    participant Redis as Upstash Redis

    Player1->>Server: POST /api/auth/register ("Alice", "100001")
    Server-->>Player1: { player: { name: "Alice", score: 0 }, token: "JWT..." }
    Player2->>Server: POST /api/auth/register ("Bob", "100002")
    Server-->>Player2: { player: { name: "Bob", score: 0 }, token: "JWT..." }

    Note over Player1,Server: Connect WebSocket via Authorization Token
    Player1->>Server: Socket connect + auth: { token }
    Player2->>Server: Socket connect + auth: { token }

    Note over Player1,Server: Gameplay & Score Submissions
    Player1->>Server: POST /api/score/submit (score: 850)
    Server->>Redis: ZADD leaderboard:global 850 "100001"
    Server-->>Player2: Socket broadcast: score_updated (Alice: 850)

    Player2->>Server: POST /api/score/submit (score: 920)
    Server->>Redis: ZADD leaderboard:global 920 "100002"
    Server-->>Player1: Socket broadcast: score_updated (Bob: 920)

    Note over Player1,Server: Fetch Final Standings
    Player1->>Server: GET /api/leaderboard?limit=10
    Server-->>Player1: Top 10 Players [ { rank: 1, name: "Bob", score: 920 }, ... ]
```

---

## Local Development & Setup

### 1. Prerequisites
- Node.js (`v18.x` or higher)
- MongoDB Atlas Cluster (or local MongoDB instance)
- Upstash Redis Database (HTTP REST URL & Token)

### 2. Installation
```bash
git clone <your-repo-url>
cd game-backend
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/game-backend?appName=Cluster0
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
JWT_SECRET=your_jwt_secret_key
CORS_ORIGINS=*
```
*Note: If `MONGODB_URI` or `UPSTASH_REDIS_REST_URL` are omitted in development mode, the server automatically falls back to in-memory mock stores.*

### 4. Running the Server
```bash
# Start development server with file watching
npm run dev

# Start production server
npm start
```

---

## API Endpoints Reference

### 1. Player Entry (`POST /api/auth/register`)
Registers a new player or logs in an existing player seamlessly by their 6-digit registration number.

**Request Body:**
```json
{
  "name": "Alice",
  "registrationNumber": "100001"
}
```

**Response (`201 Created` or `200 OK`):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "player": {
      "id": "6a4f7557fd75db09a2c25a31",
      "name": "Alice",
      "registrationNumber": "100001",
      "score": 0
    }
  }
}
```

---

### 2. Score Submission (`POST /api/score/submit`)
*(Requires Header: `Authorization: Bearer <token>`)* Submits or updates the player's final or average score. Also available via `/api/game/submit-score`.

**Request Body:**
```json
{
  "score": 850
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "player": {
      "id": "6a4f7557fd75db09a2c25a31",
      "name": "Alice",
      "registrationNumber": "100001",
      "score": 850
    }
  }
}
```

---

### 3. Top 10 Leaderboard (`GET /api/leaderboard?limit=10`)
Returns the global top players sorted descending by score (`O(log N)` lookup via Upstash Redis).

**Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "registrationNumber": "100002",
        "score": 920,
        "name": "Bob"
      },
      {
        "rank": 2,
        "registrationNumber": "100001",
        "score": 850,
        "name": "Alice"
      }
    ],
    "total": 2
  }
}
```

---

### 4. Direct Reset Endpoint (`DELETE /api/reset`)
Wipes all player data from MongoDB and purges the global Upstash Redis leaderboard. Ideal for starting fresh between test runs or live sessions.

**Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "message": "All game data and leaderboards have been reset successfully.",
    "deletedPlayers": 2,
    "leaderboardReset": true
  }
}
```

---

## WebSocket (Socket.io) Real-Time Events Reference

Connect to the Socket.io server using the JWT token returned from registration:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: {
    token: "<player_jwt_token>"
  }
});
```

### Server-to-Client Events (`socket.on`)
| Event Name | Payload Example | Description |
| :--- | :--- | :--- |
| `score_updated` | `{ registrationNumber: "100001", name: "Alice", score: 850, leaderboard: [...] }` | Broadcast immediately when any participant submits a score update. Includes the updated Top 10 standings. |
| `leaderboard_updated` | `{ leaderboard: [ { rank: 1, name: "Bob", score: 920 }, ... ] }` | Broadcast live to all screens/projectors whenever any player finishes and submits their score. |
| `data_reset` | `{ message: "All game data has been reset." }` | Broadcast to all clients when `DELETE /api/reset` is called. |

---

## Deployment on Render

1. Push this repository to GitHub.
2. In your Render Dashboard, select **New $\rightarrow$ Blueprint** and connect your repository.
3. Configure your production environment secrets (`MONGODB_URI`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `JWT_SECRET`).
4. Render will build (`npm install`) and start (`npm start`) automatically.
