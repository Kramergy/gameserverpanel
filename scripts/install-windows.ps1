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
    [string]$RepoUrl = "https://github.com/Kramergy/gameserverpanel.git",
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

function Wait-ForService {
    param(
        [string]$ServicePattern,
        [int]$TimeoutSeconds = 60
    )
    
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        $service = Get-Service -Name $ServicePattern -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq "Running") {
            return $service
        }
        Start-Sleep -Seconds 2
        $elapsed += 2
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    Write-Host ""
    return $null
}

function Wait-ForPostgresConnection {
    param(
        [string]$PsqlPath,
        [int]$TimeoutSeconds = 30
    )
    
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $env:PGPASSWORD = "postgres"
            $result = & $PsqlPath -U postgres -h localhost -c "SELECT 1;" 2>$null
            $env:PGPASSWORD = ""
            if ($LASTEXITCODE -eq 0) {
                return $true
            }
        } catch {}
        Start-Sleep -Seconds 2
        $elapsed += 2
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    Write-Host ""
    return $false
}

function Install-PostgreSQL {
    param(
        [string]$DbPassword
    )
    
    $pgVersion = "16"
    $pgInstallerUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe"
    $pgInstallerPath = "$env:TEMP\postgresql-installer.exe"
    $pgInstallDir = "C:\Program Files\PostgreSQL\$pgVersion"
    $pgDataDir = "C:\Program Files\PostgreSQL\$pgVersion\data"
    $pgSuperPassword = "postgres"
    
    Write-Info "Lade PostgreSQL $pgVersion herunter..."
    
    try {
        # Download mit Progress
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $pgInstallerUrl -OutFile $pgInstallerPath -UseBasicParsing
        $ProgressPreference = 'Continue'
        Write-Success "Download abgeschlossen"
    } catch {
        Write-Error "Download fehlgeschlagen: $_"
        return $false
    }
    
    Write-Info "Installiere PostgreSQL (dies kann einige Minuten dauern)..."
    Write-Info "  Installationsverzeichnis: $pgInstallDir"
    Write-Info "  Datenverzeichnis: $pgDataDir"
    Write-Info "  Superuser Passwort: $pgSuperPassword"
    Write-Host ""
    
    # Silent Installation mit Parametern
    $installArgs = @(
        "--mode", "unattended",
        "--unattendedmodeui", "minimal",
        "--prefix", $pgInstallDir,
        "--datadir", $pgDataDir,
        "--superpassword", $pgSuperPassword,
        "--serverport", "5432",
        "--servicename", "postgresql-x64-$pgVersion",
        "--serviceaccount", "NT AUTHORITY\NetworkService",
        "--install_runtimes", "0"
    )
    
    try {
        $process = Start-Process -FilePath $pgInstallerPath -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
        
        if ($process.ExitCode -ne 0) {
            Write-Warning "Installer Exit Code: $($process.ExitCode)"
        }
    } catch {
        Write-Error "Installation fehlgeschlagen: $_"
        return $false
    }
    
    # Installer aufräumen
    Remove-Item $pgInstallerPath -Force -ErrorAction SilentlyContinue
    
    # Warten auf Service
    Write-Info "Warte auf PostgreSQL Service"
    $service = Wait-ForService -ServicePattern "postgresql*" -TimeoutSeconds 60
    
    if ($service) {
        Write-Success "PostgreSQL Service läuft: $($service.Name)"
        
        # PostgreSQL bin zum PATH hinzufügen
        $pgBinPath = "$pgInstallDir\bin"
        if (Test-Path $pgBinPath) {
            $env:Path = "$pgBinPath;$env:Path"
            [System.Environment]::SetEnvironmentVariable("Path", "$pgBinPath;" + [System.Environment]::GetEnvironmentVariable("Path", "Machine"), "Machine")
            Write-Success "PostgreSQL zum PATH hinzugefügt"
        }
        
        return $true
    } else {
        Write-Error "PostgreSQL Service konnte nicht gestartet werden"
        return $false
    }
}

function Setup-GamePanelDatabase {
    param(
        [string]$DbPassword
    )
    
    # psql finden
    $psqlPath = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue | 
                Select-Object -First 1 | 
                Select-Object -ExpandProperty FullName
    
    if (-not $psqlPath) {
        Write-Error "psql.exe nicht gefunden"
        return $false
    }
    
    Write-Info "Warte auf PostgreSQL Verbindung"
    if (-not (Wait-ForPostgresConnection -PsqlPath $psqlPath -TimeoutSeconds 30)) {
        Write-Error "Konnte keine Verbindung zu PostgreSQL herstellen"
        Write-Info "Bitte prüfe ob der PostgreSQL Service läuft:"
        Write-Info "  Get-Service postgresql* | Start-Service"
        return $false
    }
    Write-Success "PostgreSQL ist erreichbar"
    
    Write-Info "Richte GamePanel Datenbank ein..."
    $env:PGPASSWORD = "postgres"
    
    # Benutzer erstellen
    $userExists = & $psqlPath -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='gamepanel'" 2>$null
    
    if ($userExists.Trim() -ne "1") {
        $result = & $psqlPath -U postgres -h localhost -c "CREATE USER gamepanel WITH PASSWORD '$DbPassword' CREATEDB;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Benutzer 'gamepanel' erstellt (Passwort: $DbPassword)"
        } else {
            Write-Warning "Benutzer konnte nicht erstellt werden: $result"
        }
    } else {
        Write-Info "Benutzer 'gamepanel' existiert bereits"
    }
    
    # Datenbank erstellen
    $dbExists = & $psqlPath -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='gamepanel'" 2>$null
    
    if ($dbExists.Trim() -ne "1") {
        $result = & $psqlPath -U postgres -h localhost -c "CREATE DATABASE gamepanel OWNER gamepanel;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Datenbank 'gamepanel' erstellt"
        } else {
            Write-Warning "Datenbank konnte nicht erstellt werden: $result"
        }
    } else {
        Write-Info "Datenbank 'gamepanel' existiert bereits"
    }
    
    # Berechtigungen setzen
    & $psqlPath -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE gamepanel TO gamepanel;" 2>$null
    
    $env:PGPASSWORD = ""
    
    # Verbindung testen
    Write-Info "Teste Datenbankverbindung..."
    $env:PGPASSWORD = $DbPassword
    $testResult = & $psqlPath -U gamepanel -h localhost -d gamepanel -c "SELECT 'Connection OK';" 2>&1
    $env:PGPASSWORD = ""
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Datenbankverbindung erfolgreich getestet"
        return $true
    } else {
        Write-Warning "Datenbankverbindung fehlgeschlagen: $testResult"
        return $false
    }
}

if (-not $SkipPostgres) {
    # Prüfen ob PostgreSQL bereits installiert ist
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    $psqlExists = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue
    
    if (-not $pgService -and -not $psqlExists) {
        Write-Info "PostgreSQL ist nicht installiert"
        Write-Host ""
        Write-Host "PostgreSQL Konfiguration:" -ForegroundColor Yellow
        Write-Host "  Superuser:     postgres" -ForegroundColor Gray
        Write-Host "  Superpasswort: postgres" -ForegroundColor Gray
        Write-Host "  GamePanel DB:  gamepanel" -ForegroundColor Gray
        Write-Host "  GamePanel User: gamepanel" -ForegroundColor Gray
        Write-Host "  GamePanel Pass: $DbPassword" -ForegroundColor Gray
        Write-Host ""
        
        $installPg = Read-Host "PostgreSQL jetzt automatisch installieren? (j/n)"
        
        if ($installPg -eq "j") {
            if (-not (Install-PostgreSQL -DbPassword $DbPassword)) {
                Write-Error "PostgreSQL Installation fehlgeschlagen"
                Write-Host ""
                Write-Host "Manuelle Installation:" -ForegroundColor Yellow
                Write-Host "  1. Lade PostgreSQL herunter: https://www.postgresql.org/download/windows/" -ForegroundColor Gray
                Write-Host "  2. Installiere mit Standardeinstellungen" -ForegroundColor Gray
                Write-Host "  3. Setze Superuser Passwort auf: postgres" -ForegroundColor Gray
                Write-Host "  4. Führe dieses Script erneut aus" -ForegroundColor Gray
                Write-Host ""
                exit 1
            }
        } else {
            Write-Host ""
            Write-Host "Manuelle PostgreSQL Installation:" -ForegroundColor Yellow
            Write-Host "=================================" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "1. Download:" -ForegroundColor White
            Write-Host "   https://www.postgresql.org/download/windows/" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "2. Installation:" -ForegroundColor White
            Write-Host "   - Installationsverzeichnis: C:\Program Files\PostgreSQL\16" -ForegroundColor Gray
            Write-Host "   - Komponenten: PostgreSQL Server, Command Line Tools" -ForegroundColor Gray
            Write-Host "   - Datenverzeichnis: Standard belassen" -ForegroundColor Gray
            Write-Host "   - Superuser Passwort: postgres" -ForegroundColor Yellow
            Write-Host "   - Port: 5432 (Standard)" -ForegroundColor Gray
            Write-Host "   - Locale: German, Germany oder Default" -ForegroundColor Gray
            Write-Host ""
            Write-Host "3. Nach der Installation:" -ForegroundColor White
            Write-Host "   Führe dieses Script erneut aus:" -ForegroundColor Gray
            Write-Host "   .\scripts\install-windows.ps1" -ForegroundColor Cyan
            Write-Host ""
            exit 0
        }
    } else {
        # PostgreSQL existiert, prüfen ob es läuft
        if ($pgService) {
            if ($pgService.Status -ne "Running") {
                Write-Info "Starte PostgreSQL Dienst..."
                try {
                    Start-Service $pgService.Name -ErrorAction Stop
                    Start-Sleep -Seconds 3
                    Write-Success "PostgreSQL Dienst gestartet"
                } catch {
                    Write-Error "Konnte PostgreSQL nicht starten: $_"
                    Write-Info "Versuche manuell: Start-Service $($pgService.Name)"
                    exit 1
                }
            } else {
                Write-Success "PostgreSQL läuft bereits: $($pgService.Name)"
            }
        }
    }
    
    # Datenbank einrichten
    if (-not (Setup-GamePanelDatabase -DbPassword $DbPassword)) {
        Write-Warning "Datenbank-Setup hatte Probleme, aber wir fahren fort..."
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
