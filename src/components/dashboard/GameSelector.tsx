import { cn } from "@/lib/utils";

export interface GameOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultPort: number;
  defaultRam: number;
}

export const AVAILABLE_GAMES: GameOption[] = [
  {
    id: "minecraft-java",
    name: "Minecraft Java",
    icon: "🟩",
    description: "Der Klassiker für PC-Spieler",
    defaultPort: 25565,
    defaultRam: 2048,
  },
  {
    id: "minecraft-bedrock",
    name: "Minecraft Bedrock",
    icon: "🪨",
    description: "Cross-Platform Edition",
    defaultPort: 19132,
    defaultRam: 1024,
  },
  {
    id: "ark",
    name: "ARK: Survival",
    icon: "🦖",
    description: "Überlebe mit Dinosauriern",
    defaultPort: 7777,
    defaultRam: 8192,
  },
  {
    id: "rust",
    name: "Rust",
    icon: "🔧",
    description: "Hardcore Survival PvP",
    defaultPort: 28015,
    defaultRam: 8192,
  },
  {
    id: "valheim",
    name: "Valheim",
    icon: "⚔️",
    description: "Wikinger-Survival-Abenteuer",
    defaultPort: 2456,
    defaultRam: 4096,
  },
  {
    id: "terraria",
    name: "Terraria",
    icon: "⛏️",
    description: "2D Sandbox-Abenteuer",
    defaultPort: 7777,
    defaultRam: 1024,
  },
  {
    id: "cs2",
    name: "Counter-Strike 2",
    icon: "🔫",
    description: "Kompetitiver Shooter",
    defaultPort: 27015,
    defaultRam: 4096,
  },
  {
    id: "palworld",
    name: "Palworld",
    icon: "🐾",
    description: "Pokémon trifft Survival",
    defaultPort: 8211,
    defaultRam: 16384,
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
