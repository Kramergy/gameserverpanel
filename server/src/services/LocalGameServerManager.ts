import { spawn, ChildProcess, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Get gameserver base path from env
const GAMESERVER_PATH = process.env.GAMESERVER_PATH || 'C:\\GamePanel\\Gameservers';

interface ServerProcess {
  process: ChildProcess;
  serverId: string;
  game: string;
  startedAt: Date;
}

interface GameConfig {
  id: string;
  name: string;
  executable: string;
  stopCommand?: string;
  installType: 'steamcmd' | 'download' | 'java';
  steamAppId?: string;
  downloadUrl?: string;
  javaArgs?: string;
}

// Game configurations
const GAME_CONFIGS: Record<string, GameConfig> = {
  minecraft: {
    id: 'minecraft',
    name: 'Minecraft',
    executable: 'server.jar',
    stopCommand: 'stop',
    installType: 'java',
    javaArgs: '-Xmx{RAM}M -Xms512M -jar server.jar nogui',
  },
  palworld: {
    id: 'palworld',
    name: 'Palworld',
    executable: 'PalServer.exe',
    stopCommand: undefined,
    installType: 'steamcmd',
    steamAppId: '2394010',
  },
  valheim: {
    id: 'valheim',
    name: 'Valheim',
    executable: 'valheim_server.exe',
    installType: 'steamcmd',
    steamAppId: '896660',
  },
  terraria: {
    id: 'terraria',
    name: 'Terraria',
    executable: 'TerrariaServer.exe',
    stopCommand: 'exit',
    installType: 'steamcmd',
    steamAppId: '105600',
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    executable: 'RustDedicated.exe',
    installType: 'steamcmd',
    steamAppId: '258550',
  },
  csgo: {
    id: 'csgo',
    name: 'CS2',
    executable: 'cs2.exe',
    installType: 'steamcmd',
    steamAppId: '730',
  },
  ark: {
    id: 'ark',
    name: 'ARK: Survival Evolved',
    executable: 'ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe',
    installType: 'steamcmd',
    steamAppId: '2430930',
  },
  satisfactory: {
    id: 'satisfactory',
    name: 'Satisfactory',
    executable: 'FactoryServer.exe',
    installType: 'steamcmd',
    steamAppId: '1690800',
  },
};

class LocalGameServerManager extends EventEmitter {
  private runningServers: Map<string, ServerProcess> = new Map();
  private steamCmdPath: string;

  constructor() {
    super();
    this.steamCmdPath = process.env.STEAMCMD_PATH || 'C:\\SteamCMD\\steamcmd.exe';
  }

  /**
   * Get the installation path for a server
   */
  getServerPath(serverId: string): string {
    return path.join(GAMESERVER_PATH, serverId);
  }

  /**
   * Ensure the gameserver directory exists
   */
  async ensureDirectories(): Promise<void> {
    await fs.mkdir(GAMESERVER_PATH, { recursive: true });
  }

  /**
   * Install a game server
   */
  async installServer(
    serverId: string,
    game: string,
    options: {
      port?: number;
      maxPlayers?: number;
      ram?: number;
      serverName?: string;
    } = {}
  ): Promise<{ success: boolean; installPath: string; error?: string }> {
    const gameConfig = GAME_CONFIGS[game];
    if (!gameConfig) {
      return { success: false, installPath: '', error: `Unbekanntes Spiel: ${game}` };
    }

    const serverPath = this.getServerPath(serverId);
    
    try {
      await this.ensureDirectories();
      await fs.mkdir(serverPath, { recursive: true });

      this.emit('install_progress', { serverId, stage: 'init', percent: 5, message: 'Verzeichnis erstellt...' });

      if (gameConfig.installType === 'steamcmd') {
        await this.installViaSteamCMD(serverId, serverPath, gameConfig);
      } else if (gameConfig.installType === 'java') {
        await this.installJavaServer(serverId, serverPath, gameConfig, options);
      } else if (gameConfig.installType === 'download') {
        await this.installViaDownload(serverId, serverPath, gameConfig);
      }

      this.emit('install_progress', { serverId, stage: 'complete', percent: 100, message: 'Installation abgeschlossen!' });

      return { success: true, installPath: serverPath };
    } catch (error: any) {
      this.emit('install_progress', { serverId, stage: 'error', percent: 0, message: error.message });
      return { success: false, installPath: serverPath, error: error.message };
    }
  }

  /**
   * Install via SteamCMD
   */
  private async installViaSteamCMD(serverId: string, serverPath: string, gameConfig: GameConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.emit('install_progress', { serverId, stage: 'steamcmd', percent: 20, message: 'SteamCMD wird gestartet...' });

      const args = [
        '+force_install_dir', serverPath,
        '+login', 'anonymous',
        '+app_update', gameConfig.steamAppId!,
        'validate',
        '+quit'
      ];

      const steamProcess = spawn(this.steamCmdPath, args, {
        cwd: path.dirname(this.steamCmdPath),
        shell: true,
      });

      let lastPercent = 20;

      steamProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[SteamCMD]', output);
        
        // Parse progress from SteamCMD output
        const progressMatch = output.match(/Update state \(0x\d+\) (\d+)/);
        if (progressMatch) {
          const progress = parseInt(progressMatch[1]);
          if (progress > lastPercent && progress <= 95) {
            lastPercent = progress;
            this.emit('install_progress', { 
              serverId, 
              stage: 'downloading', 
              percent: progress, 
              message: `Herunterladen... ${progress}%` 
            });
          }
        }
      });

      steamProcess.stderr.on('data', (data) => {
        console.error('[SteamCMD Error]', data.toString());
      });

      steamProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`SteamCMD exited with code ${code}`));
        }
      });

      steamProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Install Java-based server (Minecraft)
   */
  private async installJavaServer(
    serverId: string,
    serverPath: string,
    gameConfig: GameConfig,
    options: { port?: number; maxPlayers?: number; ram?: number; serverName?: string }
  ): Promise<void> {
    this.emit('install_progress', { serverId, stage: 'downloading', percent: 30, message: 'Lade Minecraft Server...' });

    // Download vanilla Minecraft server
    const mcVersion = '1.21.4';
    const downloadUrl = `https://piston-data.mojang.com/v1/objects/e6ec2f64e6080b9b5d9b471b291c33cc7f509733/server.jar`;
    
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error('Konnte Minecraft Server nicht herunterladen');
    }

    const jarPath = path.join(serverPath, 'server.jar');
    const buffer = await response.arrayBuffer();
    await fs.writeFile(jarPath, Buffer.from(buffer));

    this.emit('install_progress', { serverId, stage: 'configuring', percent: 70, message: 'Konfiguriere Server...' });

    // Accept EULA
    await fs.writeFile(path.join(serverPath, 'eula.txt'), 'eula=true\n');

    // Create server.properties
    const properties = `
#Minecraft server properties
server-port=${options.port || 25565}
max-players=${options.maxPlayers || 20}
motd=${options.serverName || 'GamePanel Minecraft Server'}
enable-rcon=true
rcon.port=${(options.port || 25565) + 10}
rcon.password=gamepanel${serverId.slice(0, 8)}
`.trim();
    await fs.writeFile(path.join(serverPath, 'server.properties'), properties);

    // Create start script
    const ram = options.ram || 2048;
    const startScript = `@echo off
cd /d "%~dp0"
java -Xmx${ram}M -Xms512M -jar server.jar nogui
pause`;
    await fs.writeFile(path.join(serverPath, 'start.bat'), startScript);

    this.emit('install_progress', { serverId, stage: 'complete', percent: 100, message: 'Installation abgeschlossen!' });
  }

  /**
   * Install via direct download
   */
  private async installViaDownload(serverId: string, serverPath: string, gameConfig: GameConfig): Promise<void> {
    if (!gameConfig.downloadUrl) {
      throw new Error('Keine Download-URL konfiguriert');
    }

    this.emit('install_progress', { serverId, stage: 'downloading', percent: 30, message: 'Herunterladen...' });

    const response = await fetch(gameConfig.downloadUrl);
    if (!response.ok) {
      throw new Error('Download fehlgeschlagen');
    }

    const fileName = path.basename(gameConfig.downloadUrl);
    const filePath = path.join(serverPath, fileName);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(buffer));

    this.emit('install_progress', { serverId, stage: 'complete', percent: 100, message: 'Installation abgeschlossen!' });
  }

  /**
   * Start a server
   */
  async startServer(
    serverId: string,
    game: string,
    options: { port?: number; ram?: number } = {}
  ): Promise<{ success: boolean; error?: string }> {
    if (this.runningServers.has(serverId)) {
      return { success: false, error: 'Server läuft bereits' };
    }

    const gameConfig = GAME_CONFIGS[game];
    if (!gameConfig) {
      return { success: false, error: `Unbekanntes Spiel: ${game}` };
    }

    const serverPath = this.getServerPath(serverId);
    
    try {
      // Check if server is installed
      await fs.access(serverPath);
    } catch {
      return { success: false, error: 'Server nicht installiert' };
    }

    try {
      let serverProcess: ChildProcess;

      if (gameConfig.installType === 'java') {
        // Start Java server
        const ram = options.ram || 2048;
        serverProcess = spawn('java', [
          `-Xmx${ram}M`,
          '-Xms512M',
          '-jar',
          'server.jar',
          'nogui'
        ], {
          cwd: serverPath,
          shell: true,
        });
      } else {
        // Start executable
        const execPath = path.join(serverPath, gameConfig.executable);
        serverProcess = spawn(execPath, [], {
          cwd: serverPath,
          shell: true,
        });
      }

      serverProcess.stdout?.on('data', (data) => {
        this.emit('server_log', { serverId, type: 'info', message: data.toString() });
      });

      serverProcess.stderr?.on('data', (data) => {
        this.emit('server_log', { serverId, type: 'error', message: data.toString() });
      });

      serverProcess.on('close', (code) => {
        this.runningServers.delete(serverId);
        this.emit('server_stopped', { serverId, exitCode: code });
      });

      serverProcess.on('error', (error) => {
        this.runningServers.delete(serverId);
        this.emit('server_error', { serverId, error: error.message });
      });

      this.runningServers.set(serverId, {
        process: serverProcess,
        serverId,
        game,
        startedAt: new Date(),
      });

      this.emit('server_started', { serverId, game });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop a server
   */
  async stopServer(serverId: string, game?: string): Promise<{ success: boolean; error?: string }> {
    const serverInfo = this.runningServers.get(serverId);
    
    if (!serverInfo) {
      return { success: false, error: 'Server läuft nicht' };
    }

    const gameConfig = GAME_CONFIGS[game || serverInfo.game];
    
    try {
      // Try graceful shutdown first
      if (gameConfig?.stopCommand && serverInfo.process.stdin) {
        serverInfo.process.stdin.write(gameConfig.stopCommand + '\n');
        
        // Wait up to 30 seconds for graceful shutdown
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            serverInfo.process.kill('SIGTERM');
            resolve();
          }, 30000);

          serverInfo.process.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } else {
        // Force kill
        serverInfo.process.kill('SIGTERM');
        
        // Wait for process to exit
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            serverInfo.process.kill('SIGKILL');
            resolve();
          }, 10000);

          serverInfo.process.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      this.runningServers.delete(serverId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a command to a running server
   */
  sendCommand(serverId: string, command: string): { success: boolean; error?: string } {
    const serverInfo = this.runningServers.get(serverId);
    
    if (!serverInfo) {
      return { success: false, error: 'Server läuft nicht' };
    }

    if (!serverInfo.process.stdin) {
      return { success: false, error: 'Server unterstützt keine Befehle' };
    }

    try {
      serverInfo.process.stdin.write(command + '\n');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get status of a server
   */
  getServerStatus(serverId: string): 'online' | 'offline' {
    return this.runningServers.has(serverId) ? 'online' : 'offline';
  }

  /**
   * Get all running servers
   */
  getRunningServers(): string[] {
    return Array.from(this.runningServers.keys());
  }

  /**
   * Delete a server's files
   */
  async deleteServer(serverId: string): Promise<{ success: boolean; error?: string }> {
    // Stop server if running
    if (this.runningServers.has(serverId)) {
      await this.stopServer(serverId);
    }

    const serverPath = this.getServerPath(serverId);
    
    try {
      await fs.rm(serverPath, { recursive: true, force: true });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
export const gameServerManager = new LocalGameServerManager();
