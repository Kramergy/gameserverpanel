import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { ServerInstance } from "@/components/dashboard/ServerCard";

const Index = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedServer, setSelectedServer] = useState<ServerInstance | null>(null);

  const handleServerSelect = (server: ServerInstance) => {
    setSelectedServer(server);
    setActiveTab("console");
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
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
          </div>
        )}
        
        {activeTab === "players" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Spieler</h1>
            <p className="text-muted-foreground">Verwalte Spieler und Berechtigungen</p>
          </div>
        )}
        
        {activeTab === "files" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dateien</h1>
            <p className="text-muted-foreground">Dateiverwaltung für alle Server</p>
          </div>
        )}
        
        {activeTab === "settings" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Einstellungen</h1>
            <p className="text-muted-foreground">Panel und Server Konfiguration</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
