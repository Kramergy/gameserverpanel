import { Server, Users, Cpu, HardDrive } from "lucide-react";
import { StatsCard } from "./StatsCard";
import { ServerCard, ServerInstance } from "./ServerCard";
import { ConsoleView } from "./ConsoleView";
import { ResourceChart } from "./ResourceChart";
import { PlayersOnline } from "./PlayersOnline";

const servers: ServerInstance[] = [
  {
    id: "1",
    name: "Minecraft Survival",
    game: "Minecraft 1.20.4",
    gameIcon: "⛏️",
    status: "online",
    players: { current: 12, max: 20 },
    cpu: 45,
    ram: 62,
    network: { up: 2.4, down: 5.1 },
    uptime: "3d 14h 22m",
    ip: "192.168.1.100",
    port: 25565,
  },
  {
    id: "2",
    name: "ARK Survival",
    game: "ARK: Survival Evolved",
    gameIcon: "🦖",
    status: "online",
    players: { current: 8, max: 30 },
    cpu: 78,
    ram: 85,
    network: { up: 4.2, down: 8.7 },
    uptime: "1d 6h 45m",
    ip: "192.168.1.100",
    port: 27015,
  },
  {
    id: "3",
    name: "Rust Server",
    game: "Rust",
    gameIcon: "🔨",
    status: "starting",
    players: { current: 0, max: 50 },
    cpu: 12,
    ram: 28,
    network: { up: 0, down: 0 },
    uptime: "0m",
    ip: "192.168.1.100",
    port: 28015,
  },
  {
    id: "4",
    name: "Valheim World",
    game: "Valheim",
    gameIcon: "⚔️",
    status: "offline",
    players: { current: 0, max: 10 },
    cpu: 0,
    ram: 0,
    network: { up: 0, down: 0 },
    uptime: "-",
    ip: "192.168.1.100",
    port: 2456,
  },
];

interface DashboardProps {
  onServerSelect: (server: ServerInstance) => void;
}

export function Dashboard({ onServerSelect }: DashboardProps) {
  const onlineServers = servers.filter(s => s.status === "online").length;
  const totalPlayers = servers.reduce((acc, s) => acc + s.players.current, 0);
  const avgCpu = Math.round(servers.filter(s => s.status === "online").reduce((acc, s) => acc + s.cpu, 0) / onlineServers) || 0;
  const avgRam = Math.round(servers.filter(s => s.status === "online").reduce((acc, s) => acc + s.ram, 0) / onlineServers) || 0;

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {servers.map((server) => (
            <ServerCard 
              key={server.id} 
              server={server} 
              onSelect={onServerSelect}
            />
          ))}
        </div>
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
