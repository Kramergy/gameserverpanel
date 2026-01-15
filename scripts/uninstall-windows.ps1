#Requires -RunAsAdministrator
<#
.SYNOPSIS
    GamePanel Windows Uninstall Script
.DESCRIPTION
    Deinstalliert GamePanel vollständig von Windows (PM2, Datenbank, Firewall, Dateien)
.NOTES
    Muss als Administrator ausgeführt werden!
.PARAMETER InstallPath
    Pfad wo GamePanel installiert ist (Standard: C:\GamePanel)
.PARAMETER KeepDatabase
    Datenbank nicht löschen
.PARAMETER KeepMySQL
    MySQL nicht deinstallieren
.PARAMETER Force
    Keine Bestätigungen abfragen
.EXAMPLE
    .\uninstall-windows.ps1
    .\uninstall-windows.ps1 -KeepDatabase
    .\uninstall-windows.ps1 -Force
#>

param(
    [string]$InstallPath = "C:\GamePanel",
    [switch]$KeepDatabase,
    [switch]$KeepMySQL,
    [switch]$Force
)

# ============================================
# Hilfsfunktionen
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

function Confirm-Action {
    param([string]$Message)
    
    if ($Force) {
        return $true
    }
    
    $response = Read-Host "$Message (j/n)"
    return ($response -eq "j" -or $response -eq "J" -or $response -eq "y" -or $response -eq "Y")
}

function Get-MySQLPath {
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
    
    $mysqlCmd = Get-Command "mysql.exe" -ErrorAction SilentlyContinue
    if ($mysqlCmd) {
        return $mysqlCmd.Source
    }
    
    return $null
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
                                                     
         Windows UNINSTALL Script v2.0
              (MySQL Edition)

"@ -ForegroundColor Red

Write-Host "WARNUNG: Dieses Script deinstalliert GamePanel!" -ForegroundColor Red
Write-Host ""
Write-Host "Folgendes wird entfernt:" -ForegroundColor Yellow
Write-Host "  - PM2 Prozesse (gamepanel-backend, gamepanel-frontend)" -ForegroundColor Gray
Write-Host "  - Firewall-Regeln" -ForegroundColor Gray
if (-not $KeepDatabase) {
    Write-Host "  - Datenbank 'gamepanel' und Benutzer" -ForegroundColor Gray
}
Write-Host "  - Installationsverzeichnis: $InstallPath" -ForegroundColor Gray
Write-Host ""

# Prüfen ob als Admin ausgeführt
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Dieses Script muss als Administrator ausgeführt werden!"
    exit 1
}

if (-not $Force) {
    if (-not (Confirm-Action "Wirklich fortfahren?")) {
        Write-Info "Abgebrochen."
        exit 0
    }
}

# ============================================
# Schritt 1: PM2 Prozesse stoppen
# ============================================

Write-Step "Schritt 1: PM2 Prozesse stoppen"

if (Test-Command "pm2") {
    # Backend stoppen
    $backendExists = pm2 list 2>$null | Select-String "gamepanel-backend"
    if ($backendExists) {
        Write-Info "Stoppe gamepanel-backend..."
        pm2 stop gamepanel-backend 2>$null
        pm2 delete gamepanel-backend 2>$null
        Write-Success "gamepanel-backend entfernt"
    } else {
        Write-Info "gamepanel-backend nicht in PM2 gefunden"
    }
    
    # Frontend stoppen
    $frontendExists = pm2 list 2>$null | Select-String "gamepanel-frontend"
    if ($frontendExists) {
        Write-Info "Stoppe gamepanel-frontend..."
        pm2 stop gamepanel-frontend 2>$null
        pm2 delete gamepanel-frontend 2>$null
        Write-Success "gamepanel-frontend entfernt"
    } else {
        Write-Info "gamepanel-frontend nicht in PM2 gefunden"
    }
    
    # PM2 Konfiguration speichern
    pm2 save --force 2>$null
    Write-Success "PM2 Konfiguration aktualisiert"
    
    # PM2 Autostart entfernen (optional)
    if (Confirm-Action "PM2 Windows Autostart entfernen?") {
        if (Test-Command "pm2-startup") {
            pm2-startup uninstall 2>$null
            Write-Success "PM2 Autostart entfernt"
        }
    }
} else {
    Write-Info "PM2 nicht installiert"
}

# ============================================
# Schritt 2: Docker Container stoppen (falls verwendet)
# ============================================

Write-Step "Schritt 2: Docker Container prüfen"

if (Test-Command "docker") {
    $containers = docker ps -a --filter "name=gamepanel" --format "{{.Names}}" 2>$null
    
    if ($containers) {
        Write-Info "GamePanel Docker Container gefunden"
        
        if (Confirm-Action "Docker Container stoppen und entfernen?") {
            docker-compose -f "$InstallPath\docker-compose.yml" down -v 2>$null
            
            # Einzelne Container entfernen falls docker-compose nicht funktioniert
            foreach ($container in $containers) {
                docker stop $container 2>$null
                docker rm $container 2>$null
                Write-Success "Container '$container' entfernt"
            }
        }
    } else {
        Write-Info "Keine GamePanel Docker Container gefunden"
    }
} else {
    Write-Info "Docker nicht installiert"
}

# ============================================
# Schritt 3: Datenbank entfernen
# ============================================

Write-Step "Schritt 3: Datenbank entfernen"

if (-not $KeepDatabase) {
    $mysqlPath = Get-MySQLPath
    
    if ($mysqlPath) {
        $mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
        
        if ($mysqlService) {
            Write-Info "MySQL läuft, entferne Datenbank..."
            
            $rootPw = Read-Host "MySQL Root Passwort eingeben (oder leer lassen zum Überspringen)" -AsSecureString
            $rootPwPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($rootPw))
            
            if (-not [string]::IsNullOrEmpty($rootPwPlain)) {
                $env:MYSQL_PWD = $rootPwPlain
                
                # Datenbank löschen
                $result = & $mysqlPath -u root -e "DROP DATABASE IF EXISTS gamepanel;" 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Datenbank 'gamepanel' gelöscht"
                } else {
                    Write-Warning "Datenbank konnte nicht gelöscht werden: $result"
                }
                
                # Benutzer löschen
                $result = & $mysqlPath -u root -e "DROP USER IF EXISTS 'gamepanel'@'localhost'; DROP USER IF EXISTS 'gamepanel'@'%';" 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Benutzer 'gamepanel' gelöscht"
                } else {
                    Write-Warning "Benutzer konnte nicht gelöscht werden: $result"
                }
                
                $env:MYSQL_PWD = ""
            } else {
                Write-Info "MySQL Root Passwort nicht angegeben, überspringe Datenbank-Löschung"
            }
        } else {
            Write-Warning "MySQL läuft nicht - Datenbank kann nicht gelöscht werden"
            Write-Info "Starte MySQL manuell und führe aus:"
            Write-Info "  DROP DATABASE gamepanel;"
            Write-Info "  DROP USER 'gamepanel'@'localhost';"
        }
    } else {
        Write-Info "MySQL Client nicht gefunden"
    }
    
    # MySQL komplett deinstallieren?
    if (-not $KeepMySQL) {
        if (Confirm-Action "MySQL komplett deinstallieren?") {
            Write-Info "Deinstalliere MySQL..."
            
            # Service stoppen
            $mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue
            if ($mysqlService) {
                Stop-Service $mysqlService.Name -Force -ErrorAction SilentlyContinue
                Write-Success "MySQL Service gestoppt"
            }
            
            # Über winget deinstallieren
            winget uninstall Oracle.MySQL --silent 2>$null
            
            # MySQL Verzeichnisse
            $mysqlDirs = @(
                "C:\Program Files\MySQL",
                "C:\ProgramData\MySQL",
                "$env:APPDATA\MySQL"
            )
            
            foreach ($dir in $mysqlDirs) {
                if (Test-Path $dir) {
                    if (Confirm-Action "MySQL Verzeichnis löschen: $dir ?") {
                        Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
                        Write-Success "Verzeichnis gelöscht: $dir"
                    }
                }
            }
        }
    }
} else {
    Write-Info "Datenbank wird beibehalten (--KeepDatabase)"
}

# ============================================
# Schritt 4: Firewall-Regeln entfernen
# ============================================

Write-Step "Schritt 4: Firewall-Regeln entfernen"

$firewallRules = @(
    "GamePanel Backend",
    "GamePanel Frontend",
    "GamePanel"
)

foreach ($ruleName in $firewallRules) {
    $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    
    if ($rule) {
        Remove-NetFirewallRule -DisplayName $ruleName
        Write-Success "Firewall-Regel '$ruleName' entfernt"
    } else {
        Write-Info "Firewall-Regel '$ruleName' nicht gefunden"
    }
}

# ============================================
# Schritt 5: Installationsverzeichnis löschen
# ============================================

Write-Step "Schritt 5: Installationsverzeichnis löschen"

if (Test-Path $InstallPath) {
    Write-Warning "Verzeichnis: $InstallPath"
    
    # Wichtige Dateien sichern?
    $envFile = Join-Path $InstallPath "server\.env"
    if (Test-Path $envFile) {
        if (Confirm-Action "Backend .env Datei sichern?") {
            $backupPath = "$env:USERPROFILE\Desktop\gamepanel-backup"
            New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
            Copy-Item $envFile "$backupPath\.env.backup"
            Write-Success "Backup erstellt: $backupPath\.env.backup"
        }
    }
    
    if (Confirm-Action "Installationsverzeichnis jetzt löschen?") {
        # Sicherstellen dass wir nicht im Verzeichnis sind
        Set-Location $env:USERPROFILE
        
        try {
            Remove-Item -Path $InstallPath -Recurse -Force
            Write-Success "Verzeichnis gelöscht: $InstallPath"
        } catch {
            Write-Error "Konnte Verzeichnis nicht löschen: $_"
            Write-Info "Bitte manuell löschen: $InstallPath"
        }
    } else {
        Write-Info "Verzeichnis beibehalten"
    }
} else {
    Write-Info "Installationsverzeichnis nicht gefunden: $InstallPath"
}

# ============================================
# Schritt 6: Globale NPM Pakete (optional)
# ============================================

Write-Step "Schritt 6: Globale NPM Pakete"

if (Test-Command "npm") {
    Write-Info "Folgende globale Pakete wurden für GamePanel installiert:"
    Write-Host "  - pm2" -ForegroundColor Gray
    Write-Host "  - pm2-windows-startup" -ForegroundColor Gray
    Write-Host "  - serve" -ForegroundColor Gray
    Write-Host ""
    
    if (Confirm-Action "Globale NPM Pakete deinstallieren?") {
        npm uninstall -g pm2 pm2-windows-startup serve 2>$null
        Write-Success "Globale Pakete deinstalliert"
    } else {
        Write-Info "Globale Pakete beibehalten"
    }
}

# ============================================
# Schritt 7: Umgebungsvariablen bereinigen
# ============================================

Write-Step "Schritt 7: Umgebungsvariablen bereinigen"

# PATH bereinigen (MySQL Pfad entfernen falls MySQL deinstalliert)
if (-not $KeepMySQL) {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $mysqlPathPattern = "C:\\Program Files\\MySQL\\MySQL Server [0-9.]+\\bin;?"
    
    if ($machinePath -match $mysqlPathPattern) {
        $newPath = $machinePath -replace $mysqlPathPattern, ""
        [System.Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
        Write-Success "MySQL aus PATH entfernt"
    }
}

# ============================================
# Abschluss
# ============================================

Write-Host "`n"
Write-Host "============================================" -ForegroundColor Green
Write-Host "    Deinstallation abgeschlossen!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

$remainingItems = @()

if ($KeepDatabase) {
    $remainingItems += "Datenbank 'gamepanel' (--KeepDatabase)"
}

if ($KeepMySQL) {
    $remainingItems += "MySQL (--KeepMySQL)"
}

if (Test-Path $InstallPath) {
    $remainingItems += "Verzeichnis: $InstallPath"
}

if ($remainingItems.Count -gt 0) {
    Write-Host "Folgendes wurde beibehalten:" -ForegroundColor Yellow
    foreach ($item in $remainingItems) {
        Write-Host "  - $item" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "GamePanel wurde erfolgreich entfernt." -ForegroundColor White
Write-Host ""
Write-Host "Neuinstallation:" -ForegroundColor Gray
Write-Host "  .\scripts\install-windows.ps1" -ForegroundColor Cyan
Write-Host ""
