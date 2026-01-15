#Requires -RunAsAdministrator
<#
.SYNOPSIS
    GamePanel Windows Installation Script
.DESCRIPTION
    Automatische Installation des GamePanels auf Windows Server/Desktop mit MySQL
.NOTES
    Muss als Administrator ausgeführt werden!
#>

param(
    [string]$InstallPath = "C:\GamePanel",
    [string]$RepoUrl = "https://github.com/Kramergy/gameserverpanel.git",
    [int]$BackendPort = 3001,
    [int]$FrontendPort = 3000,
    [string]$DbPassword = "gamepanel",
    [switch]$SkipMySQL,
    [switch]$SkipNodeJS,
    [switch]$SkipFirewall,
    [switch]$UseDocker,
    [switch]$UseExistingMySQL,
    [string]$MySQLHost = "localhost",
    [int]$MySQLPort = 3306,
    [string]$MySQLUser = "gamepanel",
    [string]$MySQLDatabase = "gamepanel"
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
# MySQL Hilfsfunktionen
# ============================================

function Test-MySQLConnection {
    param(
        [string]$Host,
        [int]$Port,
        [string]$User,
        [string]$Password,
        [string]$Database
    )
    
    $mysqlPath = Get-MySQLPath
    if (-not $mysqlPath) {
        return $false
    }
    
    try {
        $env:MYSQL_PWD = $Password
        $result = & $mysqlPath -h $Host -P $Port -u $User -e "SELECT 1;" $Database 2>&1
        $env:MYSQL_PWD = ""
        
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
    } catch {}
    
    return $false
}

function Get-MySQLPath {
    # Suche MySQL Client
    $paths = @(
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Server 8.1\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Server 8.2\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Server 8.3\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
        "C:\mysql\bin\mysql.exe"
    )
    
    foreach ($path in $paths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    # Versuche über PATH
    $mysqlCmd = Get-Command "mysql.exe" -ErrorAction SilentlyContinue
    if ($mysqlCmd) {
        return $mysqlCmd.Source
    }
    
    return $null
}

function Wait-ForMySQLService {
    param([int]$TimeoutSeconds = 60)
    
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        $service = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
        if ($service) {
            return $true
        }
        Start-Sleep -Seconds 2
        $elapsed += 2
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    Write-Host ""
    return $false
}

function Install-MySQL {
    param([string]$RootPassword = "rootpassword")
    
    Write-Info "Lade MySQL Community Server herunter..."
    
    $mysqlInstallerUrl = "https://dev.mysql.com/get/Downloads/MySQLInstaller/mysql-installer-community-8.0.36.0.msi"
    $mysqlInstallerPath = "$env:TEMP\mysql-installer.msi"
    
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $mysqlInstallerUrl -OutFile $mysqlInstallerPath -UseBasicParsing
        $ProgressPreference = 'Continue'
        Write-Success "Download abgeschlossen"
    } catch {
        Write-Warning "Automatischer Download fehlgeschlagen"
        Write-Host ""
        Write-Host "Bitte lade MySQL manuell herunter:" -ForegroundColor Yellow
        Write-Host "  https://dev.mysql.com/downloads/mysql/" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Nach der Installation führe dieses Script erneut aus mit:" -ForegroundColor Gray
        Write-Host "  .\install-windows.ps1 -UseExistingMySQL" -ForegroundColor Cyan
        return $false
    }
    
    Write-Info "Installiere MySQL (dies kann einige Minuten dauern)..."
    
    try {
        Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $mysqlInstallerPath, "/quiet", "/norestart" -Wait -NoNewWindow
        
        # Warte auf Service
        Write-Info "Warte auf MySQL Service"
        if (Wait-ForMySQLService -TimeoutSeconds 120) {
            Write-Success "MySQL Service läuft"
            
            # MySQL bin zum PATH hinzufügen
            $mysqlBinPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin"
            if (Test-Path $mysqlBinPath) {
                $env:Path = "$mysqlBinPath;$env:Path"
                [System.Environment]::SetEnvironmentVariable("Path", "$mysqlBinPath;" + [System.Environment]::GetEnvironmentVariable("Path", "Machine"), "Machine")
                Write-Success "MySQL zum PATH hinzugefügt"
            }
            
            return $true
        } else {
            Write-Warning "MySQL Service konnte nicht gefunden werden"
            return $false
        }
    } catch {
        Write-Error "Installation fehlgeschlagen: $_"
        return $false
    } finally {
        Remove-Item $mysqlInstallerPath -Force -ErrorAction SilentlyContinue
    }
}

function Setup-GamePanelDatabase {
    param(
        [string]$Host = "localhost",
        [int]$Port = 3306,
        [string]$RootUser = "root",
        [string]$RootPassword = "",
        [string]$DbUser = "gamepanel",
        [string]$DbPassword = "gamepanel",
        [string]$DbName = "gamepanel"
    )
    
    $mysqlPath = Get-MySQLPath
    if (-not $mysqlPath) {
        Write-Error "MySQL Client nicht gefunden"
        return $false
    }
    
    Write-Info "Richte GamePanel Datenbank ein..."
    $env:MYSQL_PWD = $RootPassword
    
    # Datenbank erstellen
    $createDbSql = "CREATE DATABASE IF NOT EXISTS $DbName;"
    $result = & $mysqlPath -h $Host -P $Port -u $RootUser -e $createDbSql 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Datenbank '$DbName' erstellt"
    } else {
        Write-Warning "Datenbank konnte nicht erstellt werden: $result"
    }
    
    # Benutzer erstellen
    $createUserSql = "CREATE USER IF NOT EXISTS '$DbUser'@'%' IDENTIFIED BY '$DbPassword';"
    $result = & $mysqlPath -h $Host -P $Port -u $RootUser -e $createUserSql 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Benutzer '$DbUser' erstellt"
    } else {
        Write-Warning "Benutzer konnte nicht erstellt werden: $result"
    }
    
    # Berechtigungen setzen
    $grantSql = "GRANT ALL PRIVILEGES ON $DbName.* TO '$DbUser'@'%'; FLUSH PRIVILEGES;"
    $result = & $mysqlPath -h $Host -P $Port -u $RootUser -e $grantSql 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Berechtigungen für '$DbUser' gesetzt"
    }
    
    $env:MYSQL_PWD = ""
    
    # Verbindung testen
    Write-Info "Teste Datenbankverbindung..."
    if (Test-MySQLConnection -Host $Host -Port $Port -User $DbUser -Password $DbPassword -Database $DbName) {
        Write-Success "Datenbankverbindung erfolgreich"
        return $true
    } else {
        Write-Warning "Datenbankverbindung fehlgeschlagen"
        return $false
    }
}

function Get-ExistingMySQLConfig {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host " MySQL Verbindungsdaten eingeben" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    
    $host = Read-Host "MySQL Host [$MySQLHost]"
    if ([string]::IsNullOrEmpty($host)) { $host = $MySQLHost }
    
    $portStr = Read-Host "MySQL Port [$MySQLPort]"
    if ([string]::IsNullOrEmpty($portStr)) { $port = $MySQLPort } else { $port = [int]$portStr }
    
    $user = Read-Host "MySQL Benutzer [$MySQLUser]"
    if ([string]::IsNullOrEmpty($user)) { $user = $MySQLUser }
    
    $password = Read-Host "MySQL Passwort" -AsSecureString
    $passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))
    if ([string]::IsNullOrEmpty($passwordPlain)) { $passwordPlain = $DbPassword }
    
    $database = Read-Host "MySQL Datenbank [$MySQLDatabase]"
    if ([string]::IsNullOrEmpty($database)) { $database = $MySQLDatabase }
    
    Write-Host ""
    Write-Info "Teste Verbindung zu $host`:$port..."
    
    if (Test-MySQLConnection -Host $host -Port $port -User $user -Password $passwordPlain -Database $database) {
        Write-Success "Verbindung erfolgreich!"
        return @{
            Host = $host
            Port = $port
            User = $user
            Password = $passwordPlain
            Database = $database
        }
    } else {
        Write-Warning "Verbindung fehlgeschlagen. Bitte prüfe die Zugangsdaten."
        $retry = Read-Host "Erneut versuchen? (j/n)"
        if ($retry -eq "j") {
            return Get-ExistingMySQLConfig
        }
        return $null
    }
}

# ============================================
# Hauptlogik
# ============================================

Clear-Host
Write-Host @"

   ____                      ____                  _ 
  / ___| __ _ _ __ ___   ___|  _ \ __ _ _ __   ___| |
 | |  _ / _`| '_ ` _ \ / _ \ |_) / _` | '_ \ / _ \ |
 | |_| | (_| | | | | | |  __/  __/ (_| | | | |  __/ |
  \____|\__,_|_| |_| |_|\___|_|   \__,_|_| |_|\___|_|
                                                     
         Windows Installation Script v2.0
              (MySQL Edition)

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
DB_PASSWORD=$DbPassword
MYSQL_ROOT_PASSWORD=rootpassword
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
# Schritt 4: MySQL konfigurieren
# ============================================

Write-Step "Schritt 4: MySQL Datenbank konfigurieren"

$dbConfig = $null

if (-not $SkipMySQL) {
    # Prüfen ob MySQL bereits installiert ist
    $mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue
    $mysqlPath = Get-MySQLPath
    
    if ($UseExistingMySQL -or $mysqlService -or $mysqlPath) {
        # Existierender MySQL Server
        if ($UseExistingMySQL) {
            Write-Info "Verwende existierenden MySQL Server..."
            $dbConfig = Get-ExistingMySQLConfig
            
            if (-not $dbConfig) {
                Write-Error "MySQL Konfiguration fehlgeschlagen"
                exit 1
            }
        } else {
            Write-Success "MySQL ist bereits installiert"
            
            Write-Host ""
            Write-Host "MySQL Optionen:" -ForegroundColor Yellow
            Write-Host "  [1] GamePanel Datenbank auf lokalem MySQL erstellen" -ForegroundColor Gray
            Write-Host "  [2] Existierenden MySQL Server/Datenbank verwenden" -ForegroundColor Gray
            Write-Host "  [3] MySQL überspringen (manuell konfigurieren)" -ForegroundColor Gray
            Write-Host ""
            
            $choice = Read-Host "Auswahl (1-3)"
            
            switch ($choice) {
                "1" {
                    $rootPw = Read-Host "MySQL Root Passwort eingeben" -AsSecureString
                    $rootPwPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($rootPw))
                    
                    Setup-GamePanelDatabase -RootPassword $rootPwPlain -DbPassword $DbPassword
                    
                    $dbConfig = @{
                        Host = "localhost"
                        Port = 3306
                        User = "gamepanel"
                        Password = $DbPassword
                        Database = "gamepanel"
                    }
                }
                "2" {
                    $dbConfig = Get-ExistingMySQLConfig
                    if (-not $dbConfig) {
                        Write-Error "MySQL Konfiguration fehlgeschlagen"
                        exit 1
                    }
                }
                "3" {
                    Write-Info "MySQL wird übersprungen"
                    $dbConfig = @{
                        Host = "localhost"
                        Port = 3306
                        User = "gamepanel"
                        Password = $DbPassword
                        Database = "gamepanel"
                    }
                }
                default {
                    $dbConfig = @{
                        Host = "localhost"
                        Port = 3306
                        User = "gamepanel"
                        Password = $DbPassword
                        Database = "gamepanel"
                    }
                }
            }
        }
    } else {
        # MySQL nicht installiert - Optionen anzeigen
        Write-Info "MySQL ist nicht installiert"
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host " MySQL Datenbank-Konfiguration" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Bitte wähle eine Option:" -ForegroundColor White
        Write-Host "  [1] Neuen MySQL Server installieren (empfohlen für lokale Installation)" -ForegroundColor Gray
        Write-Host "  [2] Existierenden MySQL Server verwenden (Remote oder bereits installiert)" -ForegroundColor Gray
        Write-Host "  [3] MySQL überspringen (später manuell konfigurieren)" -ForegroundColor Gray
        Write-Host ""
        
        $choice = Read-Host "Auswahl (1-3)"
        
        switch ($choice) {
            "1" {
                Write-Host ""
                Write-Host "MySQL wird installiert mit:" -ForegroundColor Yellow
                Write-Host "  Datenbank:  gamepanel" -ForegroundColor Gray
                Write-Host "  Benutzer:   gamepanel" -ForegroundColor Gray
                Write-Host "  Passwort:   $DbPassword" -ForegroundColor Gray
                Write-Host ""
                
                if (Install-MySQL) {
                    Start-Sleep -Seconds 5
                    Setup-GamePanelDatabase -DbPassword $DbPassword
                    
                    $dbConfig = @{
                        Host = "localhost"
                        Port = 3306
                        User = "gamepanel"
                        Password = $DbPassword
                        Database = "gamepanel"
                    }
                } else {
                    Write-Warning "MySQL Installation fehlgeschlagen"
                    Write-Host ""
                    Write-Host "Manuelle Installation:" -ForegroundColor Yellow
                    Write-Host "  1. Lade MySQL herunter: https://dev.mysql.com/downloads/mysql/" -ForegroundColor Gray
                    Write-Host "  2. Installiere MySQL Community Server" -ForegroundColor Gray
                    Write-Host "  3. Führe dieses Script erneut aus mit: -UseExistingMySQL" -ForegroundColor Gray
                    exit 1
                }
            }
            "2" {
                $dbConfig = Get-ExistingMySQLConfig
                if (-not $dbConfig) {
                    Write-Error "MySQL Konfiguration fehlgeschlagen"
                    exit 1
                }
            }
            "3" {
                Write-Info "MySQL wird übersprungen"
                Write-Warning "Du musst die .env Datei später manuell konfigurieren!"
                $dbConfig = @{
                    Host = "localhost"
                    Port = 3306
                    User = "gamepanel"
                    Password = $DbPassword
                    Database = "gamepanel"
                }
            }
            default {
                Write-Warning "Ungültige Auswahl, verwende Standard-Konfiguration"
                $dbConfig = @{
                    Host = "localhost"
                    Port = 3306
                    User = "gamepanel"
                    Password = $DbPassword
                    Database = "gamepanel"
                }
            }
        }
    }
} else {
    $dbConfig = @{
        Host = $MySQLHost
        Port = $MySQLPort
        User = $MySQLUser
        Password = $DbPassword
        Database = $MySQLDatabase
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

# .env erstellen mit MySQL Konfiguration
$jwtSecret = Generate-RandomString -Length 64
$envContent = @"
PORT=$BackendPort
NODE_ENV=production

# MySQL Datenbank Konfiguration
DB_HOST=$($dbConfig.Host)
DB_PORT=$($dbConfig.Port)
DB_USER=$($dbConfig.User)
DB_PASSWORD=$($dbConfig.Password)
DB_NAME=$($dbConfig.Database)

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
Write-Host "  MySQL:    " -NoNewline -ForegroundColor Gray
Write-Host "$($dbConfig.Host):$($dbConfig.Port)/$($dbConfig.Database)" -ForegroundColor Yellow
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
