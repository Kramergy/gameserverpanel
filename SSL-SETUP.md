# SSL Setup für GamePanel (Windows)

## Voraussetzungen
- Eine Domain die auf deine Server-IP zeigt (z.B. `panel.deinedomain.de`)
- Port 80 und 443 müssen offen sein

## Option 1: Caddy (Empfohlen - Automatisches SSL)

### 1. Caddy installieren

```powershell
# Mit Chocolatey
choco install caddy

# Oder manuell: https://caddyserver.com/download
# Wähle Windows amd64, lade herunter und entpacke nach C:\Caddy
```

### 2. Caddyfile erstellen

Erstelle `C:\Caddy\Caddyfile`:

```
# GamePanel Frontend
panel.deinedomain.de {
    root * C:\GamePanel\dist
    file_server
    
    # SPA Routing
    try_files {path} /index.html
}

# GamePanel Backend API
api.deinedomain.de {
    reverse_proxy localhost:3001
}
```

**Oder alles unter einer Domain:**

```
panel.deinedomain.de {
    # API Requests zum Backend
    handle /api/* {
        reverse_proxy localhost:3001
    }
    
    # Frontend
    handle {
        root * C:\GamePanel\dist
        file_server
        try_files {path} /index.html
    }
}
```

### 3. Caddy starten

```powershell
cd C:\Caddy
.\caddy.exe run
```

### 4. Als Windows-Dienst installieren

```powershell
cd C:\Caddy
.\caddy.exe install
.\caddy.exe start
```

### 5. Frontend .env anpassen

```powershell
# C:\GamePanel\.env
VITE_API_URL=https://api.deinedomain.de
# ODER bei einer Domain:
VITE_API_URL=https://panel.deinedomain.de
```

### 6. Backend CORS anpassen

```powershell
# C:\GamePanel\server\.env
CORS_ORIGINS=https://panel.deinedomain.de,http://localhost:5173
```

### 7. Neu bauen und starten

```powershell
cd C:\GamePanel
npm run build

cd C:\GamePanel\server
npm run build
pm2 restart gamepanel-backend
```

---

## Option 2: Cloudflare Tunnel (Kein Port-Forwarding nötig)

### 1. Cloudflare Account erstellen
- Gehe zu https://dash.cloudflare.com
- Füge deine Domain hinzu

### 2. Cloudflared installieren

```powershell
# Mit Chocolatey
choco install cloudflared

# Oder manuell: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

### 3. Tunnel erstellen

```powershell
cloudflared tunnel login
cloudflared tunnel create gamepanel
```

### 4. Tunnel konfigurieren

Erstelle `C:\Users\mario\.cloudflared\config.yml`:

```yaml
tunnel: gamepanel
credentials-file: C:\Users\mario\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: api.deinedomain.de
    service: http://localhost:3001
  - hostname: panel.deinedomain.de
    service: http://localhost:3000
  - service: http_status:404
```

### 5. DNS einrichten

```powershell
cloudflared tunnel route dns gamepanel api.deinedomain.de
cloudflared tunnel route dns gamepanel panel.deinedomain.de
```

### 6. Tunnel starten

```powershell
cloudflared tunnel run gamepanel
```

### 7. Als Dienst installieren

```powershell
cloudflared service install
```

---

## DNS Einstellungen

Bei deinem Domain-Anbieter:

| Typ | Name | Wert |
|-----|------|------|
| A | panel | 87.247.207.121 |
| A | api | 87.247.207.121 |

**Oder mit Cloudflare Tunnel:** Die DNS-Einträge werden automatisch erstellt.

---

## Fehlerbehebung

### Port 80/443 bereits belegt
```powershell
netstat -ano | findstr :80
netstat -ano | findstr :443
# Beende den Prozess der die Ports nutzt
```

### Zertifikat-Probleme
Caddy erneuert Zertifikate automatisch. Bei Problemen:
```powershell
caddy reload
```

### Firewall-Regeln
```powershell
New-NetFirewallRule -DisplayName "HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```
