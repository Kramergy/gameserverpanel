#Requires -RunAsAdministrator
<#
.SYNOPSIS
    GamePanel Windows Installation Script
.DESCRIPTION
    Automatische Installation des GamePanels auf Windows Server/Desktop
.NOTES
    Muss als Administrator ausgeführt werden!
#>

param(
    [string]$InstallPath = "C:\GamePanel",
    [string]$RepoUrl = "https://github.com/DEIN-USERNAME/gamepanel.git",
    [int]$BackendPort = 3001,
    [int]$FrontendPort = 3000,
    [string]$DbPassword = "gamepanel",
    [switch]$SkipPostgres,
    [switch]$SkipNodeJS,
    [switch]$SkipFirewall,
    [switch]$UseDocker
)

# ============================================
# Farben und Hilfsfunktionen
# ============================================

function Write-Step { 
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host " $Message" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Success { 
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green 
}

function Write-Warning { 
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow 
}

function Write-Error { 
    param([string]$Message)
    Write-Host "[X] $Message" -ForegroundColor Red 
}

function Write-Info { 
    param([string]$Message)
    Write-Host "[i] $Message" -ForegroundColor White 
}

function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + 
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Generate-RandomString {
    param([int]$Length = 32)
    $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    $result = -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    return $result
}

# ============================================
# Hauptlogik
# ============================================

Clear-Host
Write-Host @"

   ____                      ____                  _ 
  / ___| __ _ _ __ ___   ___|  _ \ __ _ _ __   ___| |
 | |  _ / _` | '_ ` _ \ / _ \ |_) / _` | '_ \ / _ \ |
 | |_| | (_| | | | | | |  __/  __/ (_| | | | |  __/ |
  \____|\__,_|_| |_| |_|\___|_|   \__,_|_| |_|\___|_|
                                                     
         Windows Installation Script v1.0

"@ -ForegroundColor Magenta

Write-Host "Installationspfad: $InstallPath" -ForegroundColor Gray
Write-Host "Backend Port:      $BackendPort" -ForegroundColor Gray
Write-Host "Frontend Port:     $FrontendPort" -ForegroundColor Gray
Write-Host ""

# Prüfen ob als Admin ausgeführt
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Dieses Script muss als Administrator ausgeführt werden!"
    Write-Info "Rechtsklick auf PowerShell -> 'Als Administrator ausführen'"
    exit 1
}

Write-Success "Script läuft als Administrator"

# ============================================
# Docker Installation (optional)
# ============================================

if ($UseDocker) {
    Write-Step "Docker Installation"
    
    if (-not (Test-Command "docker")) {
        Write-Info "Installiere Docker Desktop..."
        winget install Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
        
        Write-Warning "Docker Desktop wurde installiert."
        Write-Warning "Bitte starte den Computer neu und führe das Script erneut aus."
        Write-Warning "Nach dem Neustart: .\install-windows.ps1 -UseDocker"
        exit 0
    }
    
    Write-Success "Docker ist installiert"
    
    # Repository klonen
    if (-not (Test-Path $InstallPath)) {
        Write-Info "Klone Repository..."
        git clone $RepoUrl $InstallPath
    }
    
    Set-Location $InstallPath
    
    # .env erstellen
    $jwtSecret = Generate-RandomString -Length 64
    $envContent = @"
JWT_SECRET=$jwtSecret
CORS_ORIGINS=http://localhost:$FrontendPort
BACKEND_URL=http://localhost:$BackendPort
"@
    $envContent | Out-File -FilePath ".env" -Encoding UTF8
    
    Write-Info "Starte Docker Container..."
    docker-compose up -d
    
    Write-Host "`n" -NoNewline
    Write-Success "Installation abgeschlossen!"
    Write-Host ""
    Write-Host "  Frontend: http://localhost:$FrontendPort" -ForegroundColor Green
    Write-Host "  Backend:  http://localhost:$BackendPort" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ============================================
# Schritt 1: Winget prüfen
# ============================================

Write-Step "Schritt 1: Paketmanager prüfen"

if (-not (Test-Command "winget")) {
    Write-Error "Winget ist nicht installiert!"
    Write-Info "Bitte installiere App Installer aus dem Microsoft Store"
    exit 1
}

Write-Success "Winget ist verfügbar"

# ============================================
# Schritt 2: Git installieren
# ============================================

Write-Step "Schritt 2: Git installieren"

if (-not (Test-Command "git")) {
    Write-Info "Installiere Git..."
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    Refresh-Path
    
    if (-not (Test-Command "git")) {
        Write-Error "Git Installation fehlgeschlagen"
        exit 1
    }
}

Write-Success "Git ist installiert: $(git --version)"

# ============================================
# Schritt 3: Node.js installieren
# ============================================

Write-Step "Schritt 3: Node.js installieren"

if (-not $SkipNodeJS) {
    if (-not (Test-Command "node")) {
        Write-Info "Installiere Node.js LTS..."
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        Refresh-Path
        
        # Manchmal muss der Pfad manuell hinzugefügt werden
        $nodePath = "C:\Program Files\nodejs"
        if (Test-Path $nodePath) {
            $env:Path = "$nodePath;$env:Path"
        }
        
        if (-not (Test-Command "node")) {
            Write-Warning "Node.js wurde installiert, aber ist noch nicht im PATH"
            Write-Warning "Bitte starte das Terminal neu und führe das Script erneut aus"
            exit 0
        }
    }
    
    Write-Success "Node.js ist installiert: $(node --version)"
    Write-Success "NPM ist installiert: $(npm --version)"
}

# ============================================
# Schritt 4: PostgreSQL installieren
# ============================================

Write-Step "Schritt 4: PostgreSQL installieren"

if (-not $SkipPostgres) {
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    
    if (-not $pgService) {
        Write-Info "Installiere PostgreSQL..."
        winget install PostgreSQL.PostgreSQL --accept-source-agreements --accept-package-agreements
        
        # Warten bis der Dienst verfügbar ist
        Start-Sleep -Seconds 5
        Refresh-Path
        
        $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    }
    
    if ($pgService) {
        if ($pgService.Status -ne "Running") {
            Write-Info "Starte PostgreSQL Dienst..."
            Start-Service $pgService.Name
        }
        Write-Success "PostgreSQL läuft: $($pgService.Name)"
    } else {
        Write-Warning "PostgreSQL Dienst nicht gefunden"
        Write-Warning "Bitte installiere PostgreSQL manuell und starte das Script erneut"
    }
    
    # Datenbank einrichten
    $psqlPath = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    
    if ($psqlPath) {
        Write-Info "Richte Datenbank ein..."
        $env:PGPASSWORD = "postgres"
        
        # Prüfen ob User existiert
        $userExists = & $psqlPath.FullName -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='gamepanel'" 2>$null
        
        if ($userExists -ne "1") {
            & $psqlPath.FullName -U postgres -h localhost -c "CREATE USER gamepanel WITH PASSWORD '$DbPassword';" 2>$null
            Write-Success "Benutzer 'gamepanel' erstellt"
        }
        
        # Prüfen ob Datenbank existiert
        $dbExists = & $psqlPath.FullName -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='gamepanel'" 2>$null
        
        if ($dbExists -ne "1") {
            & $psqlPath.FullName -U postgres -h localhost -c "CREATE DATABASE gamepanel OWNER gamepanel;" 2>$null
            Write-Success "Datenbank 'gamepanel' erstellt"
        }
        
        $env:PGPASSWORD = ""
    } else {
        Write-Warning "psql nicht gefunden - Datenbank muss manuell eingerichtet werden"
    }
}

# ============================================
# Schritt 5: Repository klonen
# ============================================

Write-Step "Schritt 5: GamePanel herunterladen"

if (Test-Path $InstallPath) {
    Write-Warning "Verzeichnis existiert bereits: $InstallPath"
    $confirm = Read-Host "Löschen und neu klonen? (j/n)"
    if ($confirm -eq "j") {
        Remove-Item -Path $InstallPath -Recurse -Force
    } else {
        Write-Info "Verwende existierendes Verzeichnis"
    }
}

if (-not (Test-Path $InstallPath)) {
    Write-Info "Klone Repository..."
    git clone $RepoUrl $InstallPath
    
    if (-not (Test-Path $InstallPath)) {
        Write-Error "Repository konnte nicht geklont werden"
        Write-Info "Prüfe die URL: $RepoUrl"
        exit 1
    }
}

Set-Location $InstallPath
Write-Success "Repository in $InstallPath"

# ============================================
# Schritt 6: Backend einrichten
# ============================================

Write-Step "Schritt 6: Backend einrichten"

Set-Location "$InstallPath\server"

Write-Info "Installiere Backend Dependencies..."
npm install 2>&1 | Out-Null

# .env erstellen
$jwtSecret = Generate-RandomString -Length 64
$envContent = @"
PORT=$BackendPort
NODE_ENV=production
DATABASE_URL=postgresql://gamepanel:$DbPassword@localhost:5432/gamepanel
JWT_SECRET=$jwtSecret
CORS_ORIGINS=http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort
BACKEND_URL=http://localhost:$BackendPort
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8
Write-Success "Backend .env erstellt"

Write-Info "Kompiliere TypeScript..."
npm run build 2>&1 | Out-Null

if (Test-Path "dist\index.js") {
    Write-Success "Backend kompiliert"
} else {
    Write-Error "Backend Kompilierung fehlgeschlagen"
    exit 1
}

# ============================================
# Schritt 7: Frontend einrichten
# ============================================

Write-Step "Schritt 7: Frontend einrichten"

Set-Location $InstallPath

Write-Info "Installiere Frontend Dependencies..."
npm install 2>&1 | Out-Null

# Umgebungsvariable für Build
$env:VITE_API_URL = "http://localhost:$BackendPort"

Write-Info "Baue Frontend..."
npm run build 2>&1 | Out-Null

if (Test-Path "dist\index.html") {
    Write-Success "Frontend gebaut"
} else {
    Write-Error "Frontend Build fehlgeschlagen"
    exit 1
}

# ============================================
# Schritt 8: PM2 einrichten
# ============================================

Write-Step "Schritt 8: PM2 Process Manager einrichten"

if (-not (Test-Command "pm2")) {
    Write-Info "Installiere PM2 global..."
    npm install -g pm2 2>&1 | Out-Null
    Refresh-Path
}

if (Test-Command "pm2") {
    Write-Success "PM2 ist installiert"
    
    # Backend mit PM2 starten
    Set-Location "$InstallPath\server"
    
    # Alte Instanz stoppen falls vorhanden
    pm2 delete gamepanel-backend 2>$null
    
    Write-Info "Starte Backend mit PM2..."
    pm2 start dist/index.js --name "gamepanel-backend"
    pm2 save
    
    Write-Success "Backend läuft unter PM2"
} else {
    Write-Warning "PM2 konnte nicht installiert werden"
    Write-Info "Backend muss manuell gestartet werden: node dist/index.js"
}

# ============================================
# Schritt 9: Serve für Frontend
# ============================================

Write-Step "Schritt 9: Frontend Server einrichten"

if (-not (Test-Command "serve")) {
    Write-Info "Installiere serve global..."
    npm install -g serve 2>&1 | Out-Null
    Refresh-Path
}

if ((Test-Command "pm2") -and (Test-Command "serve")) {
    Set-Location $InstallPath
    
    # Alte Instanz stoppen falls vorhanden
    pm2 delete gamepanel-frontend 2>$null
    
    Write-Info "Starte Frontend mit PM2..."
    pm2 start serve --name "gamepanel-frontend" -- -s dist -l $FrontendPort
    pm2 save
    
    Write-Success "Frontend läuft unter PM2"
} else {
    Write-Warning "Frontend Server muss manuell gestartet werden"
}

# ============================================
# Schritt 10: Firewall konfigurieren
# ============================================

Write-Step "Schritt 10: Firewall konfigurieren"

if (-not $SkipFirewall) {
    # Backend Regel
    $backendRule = Get-NetFirewallRule -DisplayName "GamePanel Backend" -ErrorAction SilentlyContinue
    if (-not $backendRule) {
        New-NetFirewallRule -DisplayName "GamePanel Backend" -Direction Inbound -Port $BackendPort -Protocol TCP -Action Allow | Out-Null
        Write-Success "Firewall-Regel für Backend erstellt (Port $BackendPort)"
    } else {
        Write-Info "Firewall-Regel für Backend existiert bereits"
    }
    
    # Frontend Regel
    $frontendRule = Get-NetFirewallRule -DisplayName "GamePanel Frontend" -ErrorAction SilentlyContinue
    if (-not $frontendRule) {
        New-NetFirewallRule -DisplayName "GamePanel Frontend" -Direction Inbound -Port $FrontendPort -Protocol TCP -Action Allow | Out-Null
        Write-Success "Firewall-Regel für Frontend erstellt (Port $FrontendPort)"
    } else {
        Write-Info "Firewall-Regel für Frontend existiert bereits"
    }
}

# ============================================
# Schritt 11: PM2 Autostart
# ============================================

Write-Step "Schritt 11: Autostart einrichten"

if (Test-Command "pm2") {
    Write-Info "Installiere pm2-windows-startup..."
    npm install -g pm2-windows-startup 2>&1 | Out-Null
    
    Refresh-Path
    
    if (Test-Command "pm2-startup") {
        pm2-startup install 2>&1 | Out-Null
        Write-Success "PM2 Autostart eingerichtet"
    } else {
        Write-Warning "pm2-windows-startup konnte nicht eingerichtet werden"
        Write-Info "Autostart muss manuell konfiguriert werden"
    }
}

# ============================================
# Abschluss
# ============================================

Write-Host "`n"
Write-Host "============================================" -ForegroundColor Green
Write-Host "    Installation erfolgreich abgeschlossen!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  GamePanel ist jetzt verfügbar:" -ForegroundColor White
Write-Host ""
Write-Host "  Frontend: " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:$FrontendPort" -ForegroundColor Cyan
Write-Host "  Backend:  " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:$BackendPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Installation: " -NoNewline -ForegroundColor Gray
Write-Host "$InstallPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Nächste Schritte:" -ForegroundColor White
Write-Host "  1. Öffne http://localhost:$FrontendPort im Browser" -ForegroundColor Gray
Write-Host "  2. Registriere den ersten Benutzer (wird Admin)" -ForegroundColor Gray
Write-Host "  3. Füge Server-Nodes hinzu" -ForegroundColor Gray
Write-Host ""
Write-Host "PM2 Befehle:" -ForegroundColor White
Write-Host "  pm2 status              - Status anzeigen" -ForegroundColor Gray
Write-Host "  pm2 logs                - Logs anzeigen" -ForegroundColor Gray
Write-Host "  pm2 restart all         - Alle neustarten" -ForegroundColor Gray
Write-Host ""

# Browser öffnen
$openBrowser = Read-Host "Browser jetzt öffnen? (j/n)"
if ($openBrowser -eq "j") {
    Start-Process "http://localhost:$FrontendPort"
}
