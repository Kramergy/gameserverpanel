import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { CreateServerDialog } from "@/components/dashboard/CreateServerDialog";
import { ServerInstance } from "@/components/dashboard/ServerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Play, 
  Square, 
  RotateCcw, 
  Settings, 
  Terminal, 
  BarChart3, 
  Users, 
  Cpu, 
  HardDrive,
  Wifi,
  Clock,
  Loader2,
  Save,
  Trash2
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ServerDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Form state for config
  const [serverName, setServerName] = useState("");
  const [port, setPort] = useState(25565);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [ramAllocated, setRamAllocated] = useState(2048);

  // Console logs state
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    "[INFO] Server gestartet",
    "[INFO] Welt wird geladen...",
    "[INFO] Spawn-Punkt wird berechnet...",
    "[INFO] Server bereit für Verbindungen",
  ]);
  const [consoleInput, setConsoleInput] = useState("");

  const { data: server, isLoading, error } = useQuery({
    queryKey: ["server-instance", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await api.getServer(id);
      
      if (error) throw new Error(error);
      return data as ServerInstance | null;
    },
    enabled: !!id,
  });

  // Update form when server data loads
  useEffect(() => {
    if (server) {
      setServerName(server.name);
      setPort(server.port);
      setMaxPlayers(server.max_players);
      setRamAllocated(server.ram_allocated);
    }
  }, [server]);

  const updateServer = useMutation({
    mutationFn: async (updates: Partial<ServerInstance>) => {
      if (!id) throw new Error("Server ID fehlt");
      const { error } = await api.updateServer(id, updates);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-instance", id] });
      toast.success("Einstellungen gespeichert");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!id) throw new Error("Server ID fehlt");
      const { error } = await api.updateServer(id, { status });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-instance", id] });
    },
  });

  const deleteServer = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Server ID fehlt");
      const { error } = await api.deleteServer(id);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      toast.success("Server gelöscht");
      navigate("/");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });

  const handleStart = async () => {
    toast.info("Server wird gestartet...");
    await updateStatus.mutateAsync("starting");
    setTimeout(async () => {
      await updateStatus.mutateAsync("online");
      setConsoleLogs(prev => [...prev, "[INFO] Server gestartet"]);
      toast.success("Server gestartet!");
    }, 2000);
  };

  const handleStop = async () => {
    toast.info("Server wird gestoppt...");
    await updateStatus.mutateAsync("offline");
    setConsoleLogs(prev => [...prev, "[INFO] Server gestoppt"]);
    toast.success("Server gestoppt");
  };

  const handleRestart = async () => {
    toast.info("Server wird neu gestartet...");
    await updateStatus.mutateAsync("starting");
    setConsoleLogs(prev => [...prev, "[INFO] Server wird neu gestartet..."]);
    setTimeout(async () => {
      await updateStatus.mutateAsync("online");
      setConsoleLogs(prev => [...prev, "[INFO] Server neu gestartet"]);
      toast.success("Server neu gestartet!");
    }, 3000);
  };

  const handleSaveConfig = () => {
    updateServer.mutate({
      name: serverName,
      port,
      max_players: maxPlayers,
      ram_allocated: ramAllocated,
    });
  };

  const handleConsoleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    setConsoleLogs(prev => [...prev, `> ${consoleInput}`, `[INFO] Befehl ausgeführt: ${consoleInput}`]);
    setConsoleInput("");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar activeTab="instances" onTabChange={() => {}} onNewInstance={() => setCreateDialogOpen(true)} />
        <main className="ml-64 p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar activeTab="instances" onTabChange={() => {}} onNewInstance={() => setCreateDialogOpen(true)} />
        <main className="ml-64 p-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold">Server nicht gefunden</h1>
            <p className="text-muted-foreground mt-2">Der angeforderte Server existiert nicht.</p>
            <Button onClick={() => navigate("/")} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück zum Dashboard
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const statusClasses = {
    online: "status-online",
    offline: "status-offline",
    starting: "status-starting",
    installing: "status-starting",
  };

  const statusLabels = {
    online: "Online",
    offline: "Offline",
    starting: "Startet...",
    installing: "Installiert...",
  };

  const isLoaderStatus = server.status === "starting" || server.status === "installing";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        activeTab="instances" 
        onTabChange={(tab) => navigate(tab === "dashboard" ? "/" : `/${tab}`)} 
        onNewInstance={() => setCreateDialogOpen(true)} 
      />
      <CreateServerDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      <main className="ml-64 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-3xl">
              {server.game_icon}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{server.name}</h1>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
                  statusClasses[server.status]
                )}>
                  {isLoaderStatus && <Loader2 className="w-3 h-3 animate-spin" />}
                  {statusLabels[server.status]}
                </div>
              </div>
              <p className="text-muted-foreground">{server.game} • {server.ip}:{server.port}</p>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2">
            {server.status === "online" ? (
              <Button variant="destructive" onClick={handleStop} disabled={updateStatus.isPending}>
                <Square className="h-4 w-4 mr-2" />
                Stoppen
              </Button>
            ) : (
              <Button onClick={handleStart} disabled={isLoaderStatus || updateStatus.isPending}>
                {isLoaderStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Starten
              </Button>
            )}
            <Button variant="outline" onClick={handleRestart} disabled={server.status === "offline" || updateStatus.isPending}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Neustarten
            </Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Spieler</p>
                  <p className="text-2xl font-bold">{server.current_players}/{server.max_players}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CPU</p>
                  <p className="text-2xl font-bold">{server.cpu_usage}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <HardDrive className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">RAM</p>
                  <p className="text-2xl font-bold">{server.ram_usage}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Erstellt</p>
                  <p className="text-lg font-bold">{new Date(server.created_at).toLocaleDateString("de-DE")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Übersicht
            </TabsTrigger>
            <TabsTrigger value="console" className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Konsole
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Konfiguration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>CPU Auslastung</CardTitle>
                  <CardDescription>Aktuelle Prozessorauslastung</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Aktuell</span>
                      <span className={cn(
                        "font-medium",
                        server.cpu_usage > 80 ? "text-destructive" : server.cpu_usage > 60 ? "text-warning" : "text-success"
                      )}>{server.cpu_usage}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all",
                          server.cpu_usage > 80 ? "bg-destructive" : server.cpu_usage > 60 ? "bg-warning" : "bg-success"
                        )}
                        style={{ width: `${server.cpu_usage}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>RAM Auslastung</CardTitle>
                  <CardDescription>Speicherverbrauch des Servers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Aktuell</span>
                      <span className={cn(
                        "font-medium",
                        server.ram_usage > 80 ? "text-destructive" : server.ram_usage > 60 ? "text-warning" : "text-success"
                      )}>{server.ram_usage}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all",
                          server.ram_usage > 80 ? "bg-destructive" : server.ram_usage > 60 ? "bg-warning" : "bg-success"
                        )}
                        style={{ width: `${server.ram_usage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Zugewiesen: {server.ram_allocated} MB</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Server Informationen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Server ID</p>
                    <p className="font-mono text-sm">{server.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Spiel</p>
                    <p>{server.game}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">IP Adresse</p>
                    <p className="font-mono">{server.ip}:{server.port}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Letzte Aktualisierung</p>
                    <p>{new Date(server.updated_at).toLocaleString("de-DE")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="console">
            <Card>
              <CardHeader>
                <CardTitle>Server Konsole</CardTitle>
                <CardDescription>Live-Ausgabe und Befehle</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-black/90 rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm text-green-400 mb-4">
                  {consoleLogs.map((log, i) => (
                    <div key={i} className="py-0.5">{log}</div>
                  ))}
                </div>
                <form onSubmit={handleConsoleCommand} className="flex gap-2">
                  <Input
                    value={consoleInput}
                    onChange={(e) => setConsoleInput(e.target.value)}
                    placeholder="Befehl eingeben..."
                    className="font-mono"
                    disabled={server.status !== "online"}
                  />
                  <Button type="submit" disabled={server.status !== "online"}>
                    Senden
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Server Konfiguration</CardTitle>
                <CardDescription>Grundeinstellungen für deinen Server</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Server Name</Label>
                    <Input
                      id="name"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxPlayers">Max. Spieler</Label>
                    <Input
                      id="maxPlayers"
                      type="number"
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ram">RAM (MB)</Label>
                    <Input
                      id="ram"
                      type="number"
                      value={ramAllocated}
                      onChange={(e) => setRamAllocated(Number(e.target.value))}
                      step={512}
                    />
                  </div>
                </div>
                <Button onClick={handleSaveConfig} disabled={updateServer.isPending}>
                  {updateServer.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Speichern
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Server löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du den Server "{server.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteServer.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
