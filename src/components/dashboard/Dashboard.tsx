import { Server, Users, Cpu, HardDrive, Loader2 } from "lucide-react";
import { StatsCard } from "./StatsCard";
import { ServerCard, ServerInstance } from "./ServerCard";
import { ConsoleView } from "./ConsoleView";
import { ResourceChart } from "./ResourceChart";
import { PlayersOnline } from "./PlayersOnline";
import { useServerInstances } from "@/hooks/useServerInstances";
interface DashboardProps {
  onServerSelect: (server: ServerInstance) => void;
}

export function Dashboard({ onServerSelect }: DashboardProps) {
  const { servers, isLoading, startServer, stopServer, restartServer, deleteServer } = useServerInstances();
  
  const onlineServers = servers.filter(s => s.status === "online").length;
  const totalPlayers = servers.reduce((acc, s) => acc + s.current_players, 0);
  const avgCpu = Math.round(servers.filter(s => s.status === "online").reduce((acc, s) => acc + s.cpu_usage, 0) / onlineServers) || 0;
  const avgRam = Math.round(servers.filter(s => s.status === "online").reduce((acc, s) => acc + s.ram_usage, 0) / onlineServers) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Übersicht über alle deine Gameserver</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Aktive Server"
          value={`${onlineServers}/${servers.length}`}
          subtitle="Server online"
          icon={Server}
        />
        <StatsCard
          title="Spieler Online"
          value={totalPlayers}
          subtitle="Aktuell verbunden"
          icon={Users}
          trend={{ value: 12, positive: true }}
        />
        <StatsCard
          title="CPU Auslastung"
          value={`${avgCpu}%`}
          subtitle="Durchschnitt"
          icon={Cpu}
        />
        <StatsCard
          title="RAM Auslastung"
          value={`${avgRam}%`}
          subtitle="Durchschnitt"
          icon={HardDrive}
        />
      </div>

      {/* Server Grid */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Server Instanzen</h2>
        {isLoading ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <Loader2 className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-spin" />
            <h3 className="text-lg font-medium">Lade Server...</h3>
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Keine Server vorhanden</h3>
            <p className="text-muted-foreground mt-1">
              Erstelle deinen ersten Gameserver, um loszulegen.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {servers.map((server) => (
              <ServerCard 
                key={server.id} 
                server={server as ServerInstance}
                onSelect={onServerSelect as (server: ServerInstance) => void}
                onStart={startServer}
                onStop={stopServer}
                onRestart={restartServer}
                onDelete={(id) => deleteServer.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResourceChart />
        <PlayersOnline />
      </div>

      {/* Console */}
      <ConsoleView />
    </div>
  );
}
