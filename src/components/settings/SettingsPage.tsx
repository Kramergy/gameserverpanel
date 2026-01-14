import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServerNodesSettings } from "./ServerNodesSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Server, Settings, Bell, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function SettingsPage() {
  const [defaultGamePath, setDefaultGamePath] = useState("/home/gameserver/servers");
  const [backupPath, setBackupPath] = useState("/home/gameserver/backups");
  const [autoStart, setAutoStart] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);

  const handleSaveGeneral = () => {
    toast.success("Einstellungen gespeichert");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Einstellungen</h1>
        <p className="text-muted-foreground mt-1">Panel und Server Konfiguration</p>
      </div>

      <Tabs defaultValue="nodes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="nodes" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Server-Nodes
          </TabsTrigger>
          <TabsTrigger value="paths" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Pfade
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Benachrichtigungen
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Sicherheit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nodes">
          <ServerNodesSettings />
        </TabsContent>

        <TabsContent value="paths">
          <Card>
            <CardHeader>
              <CardTitle>Pfad-Einstellungen</CardTitle>
              <CardDescription>
                Standard-Pfade für Gameserver-Installationen und Backups
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultGamePath">Standard Installationspfad</Label>
                <Input
                  id="defaultGamePath"
                  value={defaultGamePath}
                  onChange={(e) => setDefaultGamePath(e.target.value)}
                  placeholder="/home/gameserver/servers"
                />
                <p className="text-xs text-muted-foreground">
                  Dieser Pfad wird als Standard verwendet, wenn kein Node-spezifischer Pfad angegeben ist
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="backupPath">Backup-Pfad</Label>
                <Input
                  id="backupPath"
                  value={backupPath}
                  onChange={(e) => setBackupPath(e.target.value)}
                  placeholder="/home/gameserver/backups"
                />
                <p className="text-xs text-muted-foreground">
                  Pfad für automatische Server-Backups
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-Start bei Neustart</Label>
                  <p className="text-xs text-muted-foreground">
                    Server automatisch starten wenn der Node neu startet
                  </p>
                </div>
                <Switch checked={autoStart} onCheckedChange={setAutoStart} />
              </div>

              <Button onClick={handleSaveGeneral}>Speichern</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Benachrichtigungen</CardTitle>
              <CardDescription>
                Konfiguriere wie und wann du benachrichtigt wirst
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>E-Mail Benachrichtigungen</Label>
                  <p className="text-xs text-muted-foreground">
                    Erhalte E-Mails bei wichtigen Ereignissen
                  </p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Server Offline Warnung</Label>
                  <p className="text-xs text-muted-foreground">
                    Benachrichtigung wenn ein Server offline geht
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Hohe Ressourcenauslastung</Label>
                  <p className="text-xs text-muted-foreground">
                    Warnung bei CPU/RAM über 90%
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <Button onClick={handleSaveGeneral}>Speichern</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Sicherheit</CardTitle>
              <CardDescription>
                Sicherheitseinstellungen für dein Panel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Zwei-Faktor-Authentifizierung</Label>
                  <p className="text-xs text-muted-foreground">
                    Zusätzliche Sicherheit für dein Konto
                  </p>
                </div>
                <Button variant="outline" size="sm">Einrichten</Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>API-Zugang</Label>
                  <p className="text-xs text-muted-foreground">
                    Verwalte API-Keys für externe Integrationen
                  </p>
                </div>
                <Button variant="outline" size="sm">Verwalten</Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Aktive Sitzungen</Label>
                  <p className="text-xs text-muted-foreground">
                    Siehe alle aktiven Login-Sitzungen
                  </p>
                </div>
                <Button variant="outline" size="sm">Anzeigen</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
