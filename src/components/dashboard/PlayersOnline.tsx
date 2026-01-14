import { User, Shield, Clock, MoreVertical } from "lucide-react";

interface Player {
  id: string;
  name: string;
  avatar?: string;
  server: string;
  joinedAt: string;
  isAdmin: boolean;
}

const players: Player[] = [
  { id: "1", name: "Player123", server: "Minecraft Survival", joinedAt: "vor 2 Std.", isAdmin: false },
  { id: "2", name: "AdminMax", server: "Minecraft Survival", joinedAt: "vor 4 Std.", isAdmin: true },
  { id: "3", name: "Gamer456", server: "ARK Survival", joinedAt: "vor 30 Min.", isAdmin: false },
  { id: "4", name: "ProPlayer", server: "Minecraft Survival", joinedAt: "vor 1 Std.", isAdmin: false },
  { id: "5", name: "ModHelper", server: "Rust Server", joinedAt: "vor 15 Min.", isAdmin: true },
];

export function PlayersOnline() {
  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Spieler Online</h3>
        <span className="text-sm text-muted-foreground">{players.length} aktiv</span>
      </div>

      <div className="space-y-3">
        {players.map((player) => (
          <div 
            key={player.id}
            className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{player.name}</span>
                  {player.isAdmin && (
                    <Shield className="w-4 h-4 text-warning" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{player.server}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{player.joinedAt}</span>
              </div>
              <button className="p-1 hover:bg-secondary rounded transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
