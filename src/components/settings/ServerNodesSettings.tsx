import { useState } from "react";
import { useServerNodes, ServerNode } from "@/hooks/useServerNodes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddNodeDialog } from "./AddNodeDialog";
import { NodeCommandDialog } from "./NodeCommandDialog";
import { 
  Server, 
  Plus, 
  Pencil, 
  Trash2, 
  Wifi, 
  WifiOff, 
  HelpCircle,
  Loader2,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface TestResult {
  success: boolean;
  connectionTest: boolean;
  pathTest: boolean;
  message: string;
  details?: string;
}

export function ServerNodesSettings() {
  const { nodes, isLoading, deleteNode } = useServerNodes();
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editNode, setEditNode] = useState<ServerNode | null>(null);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testResultDialogOpen, setTestResultDialogOpen] = useState(false);
  const [testedNodeName, setTestedNodeName] = useState("");
  const [commandNode, setCommandNode] = useState<ServerNode | null>(null);

  const handleEdit = (node: ServerNode) => {
    setEditNode(node);
    setAddDialogOpen(true);
  };

  const handleCloseDialog = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) setEditNode(null);
  };

  const handleDelete = async () => {
    if (deleteNodeId) {
      await deleteNode.mutateAsync(deleteNodeId);
      setDeleteNodeId(null);
    }
  };

  const handleTestConnection = async (node: ServerNode) => {
    setTestingNodeId(node.id);
    setTestedNodeName(node.name);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-node-connection', {
        body: { nodeId: node.id }
      });

      if (error) {
        toast.error("Verbindungstest fehlgeschlagen: " + error.message);
        setTestResult({
          success: false,
          connectionTest: false,
          pathTest: false,
          message: "Test fehlgeschlagen",
          details: error.message
        });
      } else {
        setTestResult(data as TestResult);
        if (data.success) {
          toast.success("Verbindung erfolgreich!");
        } else {
          toast.error(data.message);
        }
      }

      setTestResultDialogOpen(true);
      // Refresh nodes to get updated status
      queryClient.invalidateQueries({ queryKey: ["server-nodes"] });
    } catch (err) {
      toast.error("Verbindungstest fehlgeschlagen");
      setTestResult({
        success: false,
        connectionTest: false,
        pathTest: false,
        message: "Unbekannter Fehler",
        details: err instanceof Error ? err.message : "Ein Fehler ist aufgetreten"
      });
      setTestResultDialogOpen(true);
    } finally {
      setTestingNodeId(null);
    }
  };

  const osIcons = {
    linux: "🐧",
    windows: "🪟",
  };

  const statusIcons = {
    online: <Wifi className="h-4 w-4 text-success" />,
    offline: <WifiOff className="h-4 w-4 text-destructive" />,
    unknown: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
    error: <AlertCircle className="h-4 w-4 text-warning" />,
  };

  const statusLabels = {
    online: "Online",
    offline: "Offline",
    unknown: "Unbekannt",
    error: "Fehler",
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Externe Server-Nodes
              </CardTitle>
              <CardDescription>
                Verwalte externe Server, auf denen Gameserver installiert werden
              </CardDescription>
            </div>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Node hinzufügen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Keine Server-Nodes</h3>
              <p className="text-muted-foreground mt-1 mb-4">
                Füge einen externen Server hinzu, um Gameserver zu hosten
              </p>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Ersten Node hinzufügen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Benutzer</TableHead>
                  <TableHead>Installationspfad</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusIcons[node.status]}
                        <span className="text-sm">{statusLabels[node.status]}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xl" title={node.os_type === "windows" ? "Windows" : "Linux"}>
                        {osIcons[node.os_type || "linux"]}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{node.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {node.host}:{node.port}
                    </TableCell>
                    <TableCell>{node.username}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FolderOpen className="h-3.5 w-3.5" />
                        {node.game_path}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCommandNode(node)}
                          title="Befehle senden / Agent installieren"
                        >
                          <Terminal className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleTestConnection(node)}
                          disabled={testingNodeId === node.id}
                          title="Verbindung testen"
                        >
                          {testingNodeId === node.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(node)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteNodeId(node.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddNodeDialog 
        open={addDialogOpen} 
        onOpenChange={handleCloseDialog}
        editNode={editNode}
      />

      <NodeCommandDialog
        open={!!commandNode}
        onOpenChange={() => setCommandNode(null)}
        node={commandNode}
      />

      <AlertDialog open={!!deleteNodeId} onOpenChange={() => setDeleteNodeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Server-Node löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du diesen Server-Node wirklich löschen? Alle damit verbundenen Gameserver verlieren ihre Zuordnung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test Result Dialog */}
      <Dialog open={testResultDialogOpen} onOpenChange={setTestResultDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testResult?.success ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              Verbindungstest: {testedNodeName}
            </DialogTitle>
            <DialogDescription>
              {testResult?.message}
            </DialogDescription>
          </DialogHeader>
          
          {testResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className={cn(
                  "p-4 rounded-lg border-2",
                  testResult.connectionTest 
                    ? "border-success/50 bg-success/5" 
                    : "border-destructive/50 bg-destructive/5"
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.connectionTest ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    <span className="font-medium">Server-Verbindung</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {testResult.connectionTest 
                      ? "Server ist erreichbar" 
                      : "Server nicht erreichbar"}
                  </p>
                </div>

                <div className={cn(
                  "p-4 rounded-lg border-2",
                  testResult.pathTest 
                    ? "border-success/50 bg-success/5" 
                    : testResult.connectionTest 
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-muted bg-muted/5"
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.pathTest ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : testResult.connectionTest ? (
                      <XCircle className="h-5 w-5 text-destructive" />
                    ) : (
                      <HelpCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="font-medium">Installationspfad</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {testResult.pathTest 
                      ? "Pfad ist verfügbar" 
                      : testResult.connectionTest 
                        ? "Pfad nicht erreichbar"
                        : "Nicht getestet"}
                  </p>
                </div>
              </div>

              {testResult.details && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">Details:</p>
                  <p className="text-sm text-muted-foreground">{testResult.details}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setTestResultDialogOpen(false)}>
              Schließen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
