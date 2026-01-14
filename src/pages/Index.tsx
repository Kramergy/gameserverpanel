import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { ConsoleView } from "@/components/dashboard/ConsoleView";
import { PlayersOnline } from "@/components/dashboard/PlayersOnline";
import { ServerInstance } from "@/components/dashboard/ServerCard";
import { CreateServerDialog } from "@/components/dashboard/CreateServerDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";

const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedServer, setSelectedServer] = useState<ServerInstance | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleServerSelect = (server: ServerInstance) => {
    navigate(`/server/${server.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onNewInstance={() => setCreateDialogOpen(true)} />
      <CreateServerDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      
      <main className="ml-64 p-8">
        {activeTab === "dashboard" && (
          <Dashboard onServerSelect={handleServerSelect} />
        )}
        
        {activeTab === "instances" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Server Instanzen</h1>
            <p className="text-muted-foreground">Verwalte alle deine Gameserver-Instanzen</p>
          </div>
        )}
        
        {activeTab === "console" && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">Konsole</h1>
              {selectedServer && (
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                  {selectedServer.name}
                </span>
              )}
            </div>
            <p className="text-muted-foreground">Server-Konsole und Befehlszeile</p>
            <ConsoleView />
          </div>
        )}
        
        {activeTab === "players" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Spieler</h1>
            <p className="text-muted-foreground">Verwalte Spieler und Berechtigungen</p>
            <PlayersOnline />
          </div>
        )}
        
        {activeTab === "files" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dateien</h1>
            <p className="text-muted-foreground">Dateiverwaltung für alle Server</p>
          </div>
        )}
        
        {activeTab === "settings" && (
          <SettingsPage />
        )}
      </main>
    </div>
  );
};

export default Index;
