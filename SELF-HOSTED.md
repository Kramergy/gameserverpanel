# GamePanel Self-Hosted

Self-hosted GamePanel mit Node.js/Express Backend und PostgreSQL.

## 🚀 Quick Start mit Docker

```bash
# 1. .env erstellen
cp server/.env.example .env

# 2. JWT_SECRET setzen (wichtig!)
# Generiere einen sicheren Key: openssl rand -base64 32

# 3. Starten
docker-compose up -d
```

Das Panel ist dann erreichbar:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## 📦 Manuelle Installation

### Voraussetzungen
- Node.js 20+
- PostgreSQL 14+

### Backend Setup

```bash
cd server
npm install
cp .env.example .env
# .env anpassen (DATABASE_URL, JWT_SECRET)
npm run dev
```

### Frontend Setup

```bash
npm install
# API URL in .env setzen:
echo "VITE_API_URL=http://localhost:3001" > .env
npm run dev
```

## 🔧 Konfiguration

### Environment Variables

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL Connection String | - |
| `JWT_SECRET` | Secret für JWT Tokens | - |
| `PORT` | Backend Port | 3001 |
| `CORS_ORIGINS` | Erlaubte Origins | http://localhost:5173 |
| `BACKEND_URL` | Öffentliche Backend URL | http://localhost:3001 |

## 🛡️ Sicherheit

1. **JWT_SECRET**: Generiere einen starken, zufälligen String
2. **CORS**: Beschränke auf deine Domain
3. **HTTPS**: Nutze einen Reverse Proxy (nginx/traefik) für SSL
4. **Firewall**: Nur nötige Ports öffnen (80/443)

## 📝 API Endpoints

- `POST /api/auth/signup` - Registrierung
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Aktueller User
- `GET /api/nodes` - Server Nodes
- `GET /api/servers` - Game Server
- `POST /api/agent/heartbeat` - Agent Heartbeat
- `POST /api/agent/poll-commands` - Agent Commands

## 🎮 Agent Installation

1. Node im Panel erstellen
2. "Agent installieren" klicken
3. Script auf dem Server ausführen

Der erste registrierte Benutzer wird automatisch Admin.
