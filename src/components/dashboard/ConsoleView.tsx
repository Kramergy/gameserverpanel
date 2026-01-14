import { useState, useRef, useEffect } from "react";
import { Send, Trash2, Download } from "lucide-react";

interface ConsoleMessage {
  id: string;
  timestamp: string;
  type: "info" | "warn" | "error" | "success" | "command";
  message: string;
}

const demoMessages: ConsoleMessage[] = [
  { id: "1", timestamp: "14:32:01", type: "info", message: "[Server] Starting Minecraft Server..." },
  { id: "2", timestamp: "14:32:02", type: "info", message: "[Server] Loading properties..." },
  { id: "3", timestamp: "14:32:03", type: "success", message: "[Server] Done! Server is ready." },
  { id: "4", timestamp: "14:32:15", type: "info", message: "[Server] Player123 joined the game" },
  { id: "5", timestamp: "14:32:18", type: "warn", message: "[Server] Can't keep up! Is the server overloaded?" },
  { id: "6", timestamp: "14:32:45", type: "info", message: "[Server] Player456 joined the game" },
  { id: "7", timestamp: "14:33:02", type: "command", message: "> /list" },
  { id: "8", timestamp: "14:33:02", type: "info", message: "[Server] There are 2/20 players online: Player123, Player456" },
  { id: "9", timestamp: "14:34:12", type: "error", message: "[Server] Error: Could not pass event PlayerMoveEvent" },
  { id: "10", timestamp: "14:35:00", type: "info", message: "[Server] Saving world..." },
  { id: "11", timestamp: "14:35:01", type: "success", message: "[Server] World saved successfully." },
];

export function ConsoleView() {
  const [messages, setMessages] = useState<ConsoleMessage[]>(demoMessages);
  const [command, setCommand] = useState("");
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!command.trim()) return;
    
    const newMessage: ConsoleMessage = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      type: "command",
      message: `> ${command}`,
    };
    
    setMessages([...messages, newMessage]);
    setCommand("");
  };

  const getMessageColor = (type: ConsoleMessage["type"]) => {
    switch (type) {
      case "error": return "text-destructive";
      case "warn": return "text-warning";
      case "success": return "text-success";
      case "command": return "text-primary";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Server Konsole</h3>
        <div className="flex gap-2">
          <button className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-4 h-4" />
          </button>
          <button 
            className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMessages([])}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div 
        ref={consoleRef}
        className="console-output mb-4 h-80"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3 py-0.5">
            <span className="text-muted-foreground/60 shrink-0">[{msg.timestamp}]</span>
            <span className={getMessageColor(msg.type)}>{msg.message}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Befehl eingeben..."
          className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button 
          onClick={handleSend}
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
