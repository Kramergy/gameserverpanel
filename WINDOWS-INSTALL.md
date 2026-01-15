# GamePanel Windows Server Installation

Vollständige Anleitung zur Installation des GamePanels auf Windows Server.

## 📋 Voraussetzungen

- Windows Server 2019/2022 oder Windows 10/11
- Administrator-Rechte
- Mindestens 2 GB RAM
- 10 GB freier Speicherplatz

---

## ⚡ Schnellstart mit Automatischem Script

```powershell
# PowerShell als Administrator öffnen

# 1. Ausführungsrichtlinie für diese Sitzung erlauben:
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# 2. Script ausführen:
.\scripts\install-windows.ps1
```

> **💡 Hinweis:** Der `Set-ExecutionPolicy` Befehl muss nur einmal pro PowerShell-Sitzung ausgeführt werden.

**Alternative: Dauerhaft erlauben (nicht empfohlen für Produktionsserver):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 🚀 Option 1: Docker Installation (Empfohlen)

### Docker Desktop installieren

```powershell
# Als Administrator ausführen
winget install Docker.DockerDesktop
```

Nach der Installation Docker Desktop starten und WSL 2 aktivieren wenn gefragt.

### GamePanel starten

```powershell
# Repository klonen
git clone https://github.com/DEIN-USERNAME/gamepanel.git
cd gamepanel

# .env erstellen
copy server\.env.example .env

# JWT Secret generieren und in .env eintragen
# Öffne .env und setze JWT_SECRET auf einen zufälligen String

# Container starten
docker-compose up -d
```

**Fertig!** Das Panel ist erreichbar unter:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

---

## 🔧 Option 2: Manuelle Installation

### Schritt 1: MySQL installieren

```powershell
# MySQL herunterladen und installieren
winget install Oracle.MySQL
```

**Alternativ: MySQL Community Server manuell installieren:**
1. Download: https://dev.mysql.com/downloads/mysql/
2. Wähle "MySQL Installer for Windows"
3. Installiere "MySQL Server" und "MySQL Workbench" (optional)

**Datenbank einrichten:**

1. Öffne **MySQL Workbench** oder **mysql** CLI
2. Verbinde dich mit dem lokalen Server
3. Führe folgende Befehle aus:

```sql
CREATE DATABASE gamepanel;
CREATE USER 'gamepanel'@'localhost' IDENTIFIED BY 'gamepanel';
GRANT ALL PRIVILEGES ON gamepanel.* TO 'gamepanel'@'localhost';
FLUSH PRIVILEGES;
```

### Schritt 2: Node.js installieren

```powershell
# Node.js LTS installieren
winget install OpenJS.NodeJS.LTS

# Terminal neu starten, dann prüfen:
node --version   # Sollte v20+ zeigen
npm --version
```

### Schritt 3: Git installieren (falls nicht vorhanden)

```powershell
winget install Git.Git
```

### Schritt 4: GamePanel herunterladen

```powershell
# In gewünschtes Verzeichnis wechseln
cd C:\

# Repository klonen
git clone https://github.com/DEIN-USERNAME/gamepanel.git
cd gamepanel
```

### Schritt 5: Backend einrichten

```powershell
# In Server-Verzeichnis wechseln
cd server

# Dependencies installieren
npm install

# Konfiguration erstellen
copy .env.example .env
```

**`.env` Datei bearbeiten** (mit Notepad oder anderem Editor):
```env
PORT=3001
NODE_ENV=production

# MySQL Verbindung
DB_HOST=localhost
DB_PORT=3306
DB_USER=gamepanel
DB_PASSWORD=gamepanel
DB_NAME=gamepanel

JWT_SECRET=HIER-EINEN-LANGEN-ZUFAELLIGEN-STRING-EINTRAGEN
CORS_ORIGINS=http://localhost:3000,http://DEINE-SERVER-IP:3000
BACKEND_URL=http://localhost:3001
```

> 💡 **Tipp:** JWT_SECRET generieren mit PowerShell:
> ```powershell
> [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
> ```

```powershell
# TypeScript kompilieren
npm run build

# Server testen
npm start
```

Wenn "Database connected successfully" und "Server running on port 3001" erscheint, funktioniert das Backend!

### Schritt 6: Frontend einrichten

```powershell
# Zurück ins Hauptverzeichnis
cd ..

# Dependencies installieren
npm install

# Umgebungsvariable setzen
$env:VITE_API_URL = "http://localhost:3001"

# Frontend bauen
npm run build
```

Der `dist` Ordner enthält nun die fertigen Frontend-Dateien.

---

## 🌐 Webserver einrichten

### Option A: IIS (Windows-nativ)

1. **IIS Feature aktivieren:**
   ```powershell
   # Als Administrator
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer
   ```

2. **URL Rewrite Modul installieren:**
   - Download: https://www.iis.net/downloads/microsoft/url-rewrite

3. **Website einrichten:**
   - Öffne IIS Manager
   - Neue Website erstellen
   - Physischer Pfad: `C:\gamepanel\dist`
   - Port: 80 (oder 3000)

4. **web.config erstellen** in `C:\gamepanel\dist\`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <rule name="SPA Fallback" stopProcessing="true">
             <match url=".*" />
             <conditions logicalGrouping="MatchAll">
               <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
               <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
             </conditions>
             <action type="Rewrite" url="/index.html" />
           </rule>
         </rules>
       </rewrite>
       <staticContent>
         <mimeMap fileExtension=".json" mimeType="application/json" />
       </staticContent>
     </system.webServer>
   </configuration>
   ```

### Option B: Nginx für Windows

```powershell
# Nginx herunterladen
Invoke-WebRequest -Uri "https://nginx.org/download/nginx-1.24.0.zip" -OutFile nginx.zip
Expand-Archive nginx.zip -DestinationPath C:\nginx
```

**nginx.conf anpassen:**
```nginx
server {
    listen 3000;
    server_name localhost;
    root C:/gamepanel/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 🔄 Als Windows-Dienst einrichten

### PM2 für automatischen Start

```powershell
# PM2 global installieren
npm install -g pm2
npm install -g pm2-windows-startup

# PM2 Windows Service einrichten
pm2-startup install

# Backend mit PM2 starten
cd C:\gamepanel\server
pm2 start dist/index.js --name "gamepanel-backend"

# Aktuelle Prozesse speichern
pm2 save
```

### Alternative: NSSM (Non-Sucking Service Manager)

```powershell
# NSSM herunterladen
winget install NSSM.NSSM

# Dienst erstellen
nssm install GamePanelBackend "C:\Program Files\nodejs\node.exe"
nssm set GamePanelBackend AppDirectory "C:\gamepanel\server"
nssm set GamePanelBackend AppParameters "dist\index.js"
nssm set GamePanelBackend Description "GamePanel Backend API"

# Dienst starten
nssm start GamePanelBackend
```

---

## 🛡️ Firewall konfigurieren

```powershell
# Backend Port freigeben
New-NetFirewallRule -DisplayName "GamePanel Backend" -Direction Inbound -Port 3001 -Protocol TCP -Action Allow

# Frontend Port freigeben
New-NetFirewallRule -DisplayName "GamePanel Frontend" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow

# Alternativ für HTTP/HTTPS
New-NetFirewallRule -DisplayName "GamePanel HTTP" -Direction Inbound -Port 80 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GamePanel HTTPS" -Direction Inbound -Port 443 -Protocol TCP -Action Allow
```

---

## 🔐 SSL/HTTPS einrichten (Produktion)

### Mit Let's Encrypt (win-acme)

```powershell
# win-acme herunterladen
Invoke-WebRequest -Uri "https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip" -OutFile wacs.zip
Expand-Archive wacs.zip -DestinationPath C:\wacs

# Zertifikat erstellen
cd C:\wacs
.\wacs.exe
```

Folge dem Assistenten und wähle deine IIS-Website aus.

---

## ✅ Installation prüfen

1. **Backend testen:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3001/api/auth/me" -Method GET
   # Sollte 401 Unauthorized zurückgeben (kein Token)
   ```

2. **Frontend öffnen:**
   - Browser: http://localhost:3000
   - Registrierungsseite sollte erscheinen

3. **Ersten Admin erstellen:**
   - Registriere dich mit E-Mail und Passwort
   - Der erste Benutzer wird automatisch Admin

---

## 🔧 Troubleshooting

### MySQL Verbindungsfehler
```powershell
# Prüfen ob Dienst läuft
Get-Service MySQL*

# Dienst starten
Start-Service MySQL80
```

### Port bereits belegt
```powershell
# Prüfen welcher Prozess Port nutzt
netstat -ano | findstr :3001

# Prozess beenden (PID aus obigem Befehl)
Stop-Process -Id <PID> -Force
```

### Node.js nicht gefunden
```powershell
# PATH neu laden
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")
```

### Frontend zeigt Verbindungsfehler
- Prüfe ob Backend läuft: `http://localhost:3001`
- Prüfe CORS_ORIGINS in `.env`
- Prüfe Firewall-Regeln

---

## 📝 Zusammenfassung der Befehle

```powershell
# Alles in einem Script (als Admin ausführen):

# 1. Tools installieren
winget install Oracle.MySQL
winget install OpenJS.NodeJS.LTS
winget install Git.Git

# 2. Repository klonen
cd C:\
git clone https://github.com/DEIN-USERNAME/gamepanel.git
cd gamepanel

# 3. Backend
cd server
npm install
copy .env.example .env
# .env bearbeiten!
npm run build

# 4. Frontend
cd ..
npm install
$env:VITE_API_URL = "http://localhost:3001"
npm run build

# 5. PM2 einrichten
npm install -g pm2 pm2-windows-startup
pm2-startup install
cd server
pm2 start dist/index.js --name "gamepanel-backend"
pm2 save

# 6. Firewall
New-NetFirewallRule -DisplayName "GamePanel" -Direction Inbound -Port 3000,3001 -Protocol TCP -Action Allow
```

---

## 🎮 Agent auf Game-Servern installieren

Nach der Panel-Installation kannst du Game-Server hinzufügen:

1. Im Panel: **Einstellungen → Nodes → Node hinzufügen**
2. Server-Daten eingeben (Name, IP, etc.)
3. **"Agent installieren"** klicken
4. Das generierte PowerShell-Script auf dem Game-Server ausführen

Der Agent läuft dann als Windows-Dienst und kommuniziert mit deinem Panel.

---

## 🗄️ Existierenden MySQL Server verwenden

Wenn du bereits einen MySQL Server hast, kannst du diesen verwenden:

1. Erstelle die Datenbank und den Benutzer (siehe Schritt 1)
2. Passe die `.env` Datei an:

```env
DB_HOST=dein-mysql-server
DB_PORT=3306
DB_USER=dein_benutzer
DB_PASSWORD=dein_passwort
DB_NAME=gamepanel
```

Das Backend erstellt die benötigten Tabellen automatisch beim ersten Start.
