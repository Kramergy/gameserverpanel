import { User, Shield, Clock, MoreVertical } from "lucide-react";

interface Player {
  id: string;
  name: string;
  avatar?: string;
  server: string;
  joinedAt: string;
  isAdmin: boolean;
}

const players: Player[] = [];

export function PlayersOnline() {
  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Spieler Online</h3>
        <span className="text-sm text-muted-foreground">{players.length} aktiv</span>
      </div>

      {players.length === 0 ? (
        <div className="text-center py-8">
          <User className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Keine Spieler online</p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
