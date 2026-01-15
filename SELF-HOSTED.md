# GamePanel Self-Hosted

Self-hosted GamePanel mit Node.js/Express Backend und MySQL.

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
- MySQL 8.0+

### Backend Setup

```bash
cd server
npm install
cp .env.example .env
# .env anpassen (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET)
npm run dev
```

### Frontend Setup

```bash
npm install
# API URL in .env setzen:
echo "VITE_API_URL=http://localhost:3001" > .env.local
npm run dev
```

Das Frontend verbindet sich automatisch mit dem Backend unter der angegebenen URL.

## 🔧 Konfiguration

### Environment Variables

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL Server Host | localhost |
| `DB_PORT` | MySQL Server Port | 3306 |
| `DB_USER` | MySQL Benutzer | gamepanel |
| `DB_PASSWORD` | MySQL Passwort | gamepanel |
| `DB_NAME` | MySQL Datenbank | gamepanel |
| `DATABASE_URL` | MySQL Connection URL (alternativ) | - |
| `JWT_SECRET` | Secret für JWT Tokens | - |
| `PORT` | Backend Port | 3001 |
| `CORS_ORIGINS` | Erlaubte Origins | http://localhost:5173 |
| `BACKEND_URL` | Öffentliche Backend URL | http://localhost:3001 |

### Existierenden MySQL Server verwenden

Du kannst einen bereits installierten MySQL Server verwenden. Konfiguriere einfach die Verbindungsdaten in der `.env` Datei:

```env
# Einzelne Felder (empfohlen)
DB_HOST=dein-mysql-server.de
DB_PORT=3306
DB_USER=dein_benutzer
DB_PASSWORD=dein_passwort
DB_NAME=gamepanel

# ODER als URL
DATABASE_URL=mysql://benutzer:passwort@host:3306/datenbank
```

## 🛡️ Sicherheit

1. **JWT_SECRET**: Generiere einen starken, zufälligen String
2. **CORS**: Beschränke auf deine Domain
3. **HTTPS**: Nutze einen Reverse Proxy (nginx/traefik) für SSL
4. **Firewall**: Nur nötige Ports öffnen (80/443)
5. **MySQL**: Verwende sichere Passwörter und beschränke Remote-Zugriff

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

## 🔄 Migration von PostgreSQL

Falls du von einer älteren Version mit PostgreSQL migrierst:

1. Exportiere deine Daten aus PostgreSQL
2. Installiere MySQL 8.0
3. Aktualisiere die `.env` Datei mit den neuen MySQL-Verbindungsdaten
4. Starte das Backend neu (Tabellen werden automatisch erstellt)
5. Importiere deine Daten in MySQL
