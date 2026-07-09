# Multiplayer Game Backend API

A production-ready, server-authoritative backend for real-time multiplayer games. Built with Node.js, Express, Socket.io, MongoDB Atlas, and Upstash Redis.

This API handles player authentication, real-time room management, anti-cheat score validation, and high-performance global leaderboards.

---

## Key Features

- **Lightweight Authentication**: Frictionless player registration using a display name and a unique 6-digit registration number (`100001` - `999999`). Stateless JWT session management (`7d` expiry).
- **Server-Authoritative Game Engine**: Anti-cheat score validation ensuring score submissions only occur when game rooms are actively in progress, alongside mathematical bounds checking ($0 \le \text{score} \le 1,000,000$).
- **Upstash Redis Leaderboards**: Powered by Upstash Redis (`@upstash/redis` HTTP REST SDK) for stable connection management across serverless and free tiers. Provides $O(\log N)$ sorted set queries for global rank, top players, and neighborhood rankings.
- **Real-Time Room Management**: Socket.io WebSocket channels for room matchmaking, player join/leave broadcasts, live score synchronization, and game lifecycle tracking (`waiting` $\rightarrow$ `in_progress` $\rightarrow$ `ended`).
- **Admin Control Panel**: Authenticated admin system (`ADMIN_SECRET`) to create game rooms with flexible player limits, control game states, and perform complete data resets for testing.
- **Persistent Match & Stats Storage**: MongoDB Atlas storage for comprehensive match histories and cumulative player lifetime statistics (`totalGames`, `wins`, `losses`, `bestScore`, `avgScore`).

---

## System Workflow Overview

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Game Admin
    actor Player1 as Player 1 (Client)
    actor Player2 as Player 2 (Client)
    participant Server as Backend API
    participant Redis as Upstash Redis

    Admin->>Server: POST /api/admin/login
    Server-->>Admin: Admin JWT Token
    Admin->>Server: POST /api/admin/rooms (create "ROOM-001")
    
    Player1->>Server: POST /api/auth/register ("Alice", "100001")
    Server-->>Player1: Player JWT Token + Profile
    Player2->>Server: POST /api/auth/register ("Bob", "100002")
    Server-->>Player2: Player JWT Token + Profile

    Note over Player1,Server: Connect WebSocket via Authorization Token
    Player1->>Server: Socket connect + auth: { token }
    Player2->>Server: Socket connect + auth: { token }

    Player1->>Server: POST /api/game/join ("ROOM-001")
    Player2->>Server: POST /api/game/join ("ROOM-001")
    Server-->>Player1: Socket broadcast: player_joined

    Admin->>Server: POST /api/admin/rooms/ROOM-001/start
    Server-->>Player1: Socket broadcast: game_started
    Server-->>Player2: Socket broadcast: game_started

    Player1->>Server: POST /api/game/submit-score (score: 850)
    Server->>Redis: ZADD leaderboard:global 850 "100001"
    Server-->>Player2: Socket broadcast: score_updated

    Player2->>Server: POST /api/game/submit-score (score: 720)
    Server->>Redis: ZADD leaderboard:global 720 "100002"
    Server-->>Player1: Socket broadcast: score_updated

    Admin->>Server: POST /api/admin/rooms/ROOM-001/end
    Server-->>Player1: Socket broadcast: game_ended (Winner: Alice)
```

---

## Local Development & Setup

### 1. Prerequisites
- Node.js (`v18.x` or higher)
- MongoDB Atlas Cluster (or local MongoDB instance)
- Upstash Redis Database (HTTP REST URL & Token)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone <your-repo-url>
cd game-backend
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and fill in your connection parameters:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/game-backend?appName=Cluster0
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
JWT_SECRET=your_jwt_secret_key
ADMIN_SECRET=your_admin_secret_key
CORS_ORIGINS=*
```
*Note: If `MONGODB_URI` or `UPSTASH_REDIS_REST_URL` are omitted in development mode, the server will automatically fall back to clean in-memory mock stores.*

### 4. Running the Server
```bash
# Start development server with file watching
npm run dev

# Start production server
npm start
```

---

## API Endpoints Reference

### Authentication Requirements
All protected player endpoints require a valid JWT token in the request header:
```http
Authorization: Bearer <player_jwt_token>
```
Admin endpoints require the admin JWT token obtained from `/api/admin/login`:
```http
Authorization: Bearer <admin_jwt_token>
```

---

### 1. Player Authentication (`/api/auth`)

| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Registers a player or logs in an existing player by registration number. Returns JWT token (`7d` expiry) and lifetime profile stats. | `{ "name": "Alice", "registrationNumber": "100001" }` |
| `GET` | `/api/auth/profile` | Returns the currently authenticated player's full profile and stats (`wins`, `losses`, `bestScore`, `avgScore`). | *None (Requires Player Auth)* |

---

### 2. Game Rooms & Scoring (`/api/game`)

| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/game/join` | Joins a specific game room by ID. Subscribes the player to real-time socket events for that room. | `{ "roomId": "ROOM-001" }` |
| `POST` | `/api/game/submit-score` | Submits a score for the player in their active game room. Validates room state and mathematical bounds ($0 \le score \le 1,000,000$). | `{ "roomId": "ROOM-001", "score": 850 }` |
| `GET` | `/api/game/scoreboard/:roomId` | Retrieves the current real-time scoreboard for the specified room, ordered descending by score. | *None (Requires Player Auth)* |

---

### 3. Global Leaderboard (`/api/leaderboard`)

| Method | Endpoint | Description | Query / Path Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/leaderboard` | Returns the global Top-N players sorted descending by score in $O(\log N)$ time. | `?limit=10` (Default: `10`, Max: `100`) |
| `GET` | `/api/leaderboard/:registrationNumber` | Returns the exact global rank (`1-indexed`) and best score for a specific player. | `:registrationNumber` (e.g., `100001`) |
| `GET` | `/api/leaderboard/:registrationNumber/around` | Returns the surrounding leaderboard neighborhood ($\pm \text{range}$ rank positions) around a specific player. | `?range=5` (Default: `5`, Max: `25`) |

---

### 4. Statistics & Match History (`/api/stats` & `/api/matches`)

| Method | Endpoint | Description | Path Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/stats/:registrationNumber` | Retrieves summary statistics (`totalGames`, `wins`, `losses`, `bestScore`, `avgScore`) for the given player. | `:registrationNumber` |
| `GET` | `/api/matches/:registrationNumber` | Retrieves paginated historical match records (`roomId`, `startedAt`, `endedAt`, `winner`, `scoreboard`) for the given player. | `:registrationNumber` |

---

### 5. Admin Management (`/api/admin`)

| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/admin/login` | Authenticates an admin using `ADMIN_SECRET`. Returns an admin JWT token (`24h` expiry). | `{ "adminSecret": "your_admin_secret" }` |
| `POST` | `/api/admin/rooms` | Creates a new game room with configurable player capacity. *(Requires Admin Auth)* | `{ "roomId": "ROOM-001", "name": "Battle Arena", "maxPlayers": 10 }` |
| `POST` | `/api/admin/rooms/:roomId/start` | Starts the room match (`status` transitions to `in_progress`). Broadcasts `game_started` socket event. *(Requires Admin Auth)* | *None* |
| `POST` | `/api/admin/rooms/:roomId/end` | Ends the room match (`status` transitions to `ended`), calculates the winner, records match history, and updates lifetime win/loss statistics. *(Requires Admin Auth)* | *None* |
| `DELETE` | `/api/admin/data/reset` | **Complete Reset**: Deletes all active rooms, purges all player and match records in MongoDB, and resets the global Upstash Redis leaderboard. *(Requires Admin Auth)* | *None* |

---

## WebSocket (Socket.io) Integration Reference

Establish a real-time connection from your game client passing the JWT token inside the handshake `auth` object:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: {
    token: "<player_jwt_token>"
  }
});
```

### Client-to-Server Events (`socket.emit`)
| Event Name | Payload Format | Description |
| :--- | :--- | :--- |
| `join_room` | `{ "roomId": "ROOM-001" }` | Subscribes the socket instance to the designated room channel. |
| `leave_room` | `{ "roomId": "ROOM-001" }` | Unsubscribes the socket instance from the designated room channel. |
| `player_ready` | `{ "roomId": "ROOM-001", "ready": true }` | Updates the player's lobby readiness status prior to game start. |
| `submit_action` | `{ "roomId": "ROOM-001", "actionType": "MOVE", "payload": {...} }` | Relays client gameplay actions directly to all other connected participants in the room. |

### Server-to-Client Events (`socket.on`)
| Event Name | Payload Format | Description |
| :--- | :--- | :--- |
| `room_state` | `{ room: { id, name, status, playerCount, players: [...] } }` | Transmitted immediately after joining a room to provide the initial lobby state. |
| `player_joined` | `{ playerId, name, regNo, playerCount }` | Broadcast to all room participants when a new player joins. |
| `player_left` | `{ playerId, name, regNo, playerCount }` | Broadcast to all room participants when a player leaves or disconnects. |
| `game_started` | `{ roomId, startedAt }` | Broadcast when the administrator initiates the match (`status` becomes `in_progress`). |
| `score_updated` | `{ playerId, score, scoreboard: [...] }` | Broadcast in real time whenever any participant submits a valid score. |
| `game_ended` | `{ roomId, results: { winner: {...}, scoreboard: [...] } }` | Broadcast when the match ends, containing final standings and winner determination. |
| `error` | `{ message: "Room is currently full." }` | Sent directly to the emitting socket if an action fails validation check. |

---

## Deployment on Render

This project includes a ready-to-use `render.yaml` blueprint for immediate deployment on [Render](https://render.com/):

1. Push this repository to GitHub.
2. In your Render Dashboard, select **New $\rightarrow$ Blueprint** and connect your repository.
3. Configure your production environment secrets when prompted:
   - `MONGODB_URI`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `JWT_SECRET`
   - `ADMIN_SECRET`
4. Render will build (`npm install`) and start (`npm start`) the application automatically.

For further architectural details, code examples, and full request/response payloads, refer to `API_DOCUMENTATION.md`.
