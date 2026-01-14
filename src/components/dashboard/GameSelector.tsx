import { cn } from "@/lib/utils";

export interface GameOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultPort: number;
  defaultRam: number;
  // Installation info
  steamAppId?: number;
  installType: "steamcmd" | "direct" | "java";
  downloadUrl?: string;
  executable?: string;
  startArgs?: string;
}

export const AVAILABLE_GAMES: GameOption[] = [
  {
    id: "minecraft-java",
    name: "Minecraft Java",
    icon: "🟩",
    description: "Der Klassiker für PC-Spieler",
    defaultPort: 25565,
    defaultRam: 2048,
    installType: "java",
    downloadUrl: "https://piston-data.mojang.com/v1/objects/45810d238246d90e811d896f87b14695b7fb6839/server.jar",
    executable: "server.jar",
    startArgs: "-Xmx{RAM}M -Xms{RAM}M -jar server.jar nogui",
  },
  {
    id: "minecraft-bedrock",
    name: "Minecraft Bedrock",
    icon: "🪨",
    description: "Cross-Platform Edition",
    defaultPort: 19132,
    defaultRam: 1024,
    installType: "direct",
    downloadUrl: "https://minecraft.azureedge.net/bin-win/bedrock-server-1.21.51.02.zip",
    executable: "bedrock_server.exe",
  },
  {
    id: "ark",
    name: "ARK: Survival",
    icon: "🦖",
    description: "Überlebe mit Dinosauriern",
    defaultPort: 7777,
    defaultRam: 8192,
    installType: "steamcmd",
    steamAppId: 376030,
    executable: "ShooterGameServer.exe",
    startArgs: "TheIsland?listen?SessionName={NAME}?ServerPassword= -server -log",
  },
  {
    id: "rust",
    name: "Rust",
    icon: "🔧",
    description: "Hardcore Survival PvP",
    defaultPort: 28015,
    defaultRam: 8192,
    installType: "steamcmd",
    steamAppId: 258550,
    executable: "RustDedicated.exe",
    startArgs: "-batchmode +server.port {PORT} +server.level Procedural Map +server.seed 12345 +server.worldsize 3000 +server.maxplayers {MAXPLAYERS} +server.hostname \"{NAME}\"",
  },
  {
    id: "valheim",
    name: "Valheim",
    icon: "⚔️",
    description: "Wikinger-Survival-Abenteuer",
    defaultPort: 2456,
    defaultRam: 4096,
    installType: "steamcmd",
    steamAppId: 896660,
    executable: "valheim_server.exe",
    startArgs: "-nographics -batchmode -name \"{NAME}\" -port {PORT} -world \"Dedicated\" -password \"changeme\"",
  },
  {
    id: "terraria",
    name: "Terraria",
    icon: "⛏️",
    description: "2D Sandbox-Abenteuer",
    defaultPort: 7777,
    defaultRam: 1024,
    installType: "steamcmd",
    steamAppId: 105600,
    executable: "TerrariaServer.exe",
    startArgs: "-port {PORT} -maxplayers {MAXPLAYERS} -world worlds\\world.wld -autocreate 3",
  },
  {
    id: "cs2",
    name: "Counter-Strike 2",
    icon: "🔫",
    description: "Kompetitiver Shooter",
    defaultPort: 27015,
    defaultRam: 4096,
    installType: "steamcmd",
    steamAppId: 730,
    executable: "cs2.exe",
    startArgs: "-dedicated +map de_dust2 +maxplayers {MAXPLAYERS}",
  },
  {
    id: "palworld",
    name: "Palworld",
    icon: "🐾",
    description: "Pokémon trifft Survival",
    defaultPort: 8211,
    defaultRam: 16384,
    installType: "steamcmd",
    steamAppId: 2394010,
    executable: "PalServer.exe",
    startArgs: "-port={PORT}",
  },
];

interface GameSelectorProps {
  selectedGame: string | null;
  onSelect: (game: GameOption) => void;
}

export function GameSelector({ selectedGame, onSelect }: GameSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {AVAILABLE_GAMES.map((game) => (
        <button
          key={game.id}
          type="button"
          onClick={() => onSelect(game)}
          className={cn(
            "flex flex-col items-center p-4 rounded-lg border-2 transition-all hover:border-primary/50 hover:bg-primary/5",
            selectedGame === game.id
              ? "border-primary bg-primary/10"
              : "border-border bg-card"
          )}
        >
          <span className="text-3xl mb-2">{game.icon}</span>
          <span className="font-medium text-sm text-center">{game.name}</span>
          <span className="text-xs text-muted-foreground text-center mt-1">
            {game.description}
          </span>
        </button>
      ))}
    </div>
  );
}
