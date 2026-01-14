import { 
  LayoutDashboard, 
  Server, 
  Terminal, 
  Users, 
  FolderOpen, 
  Settings, 
  Bell,
  Plus,
  Gamepad2,
  LogOut,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "instances", label: "Instanzen", icon: Server },
  { id: "console", label: "Konsole", icon: Terminal },
  { id: "players", label: "Spieler", icon: Users },
  { id: "files", label: "Dateien", icon: FolderOpen },
  { id: "settings", label: "Einstellungen", icon: Settings },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { profile, role, signOut, isAdmin } = useAuth();

  const displayName = profile?.username || profile?.email?.split("@")[0] || "Benutzer";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Gamepad2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">GamePanel</h1>
            <p className="text-xs text-muted-foreground">Server Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "nav-item w-full",
              activeTab === item.id && "active"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Quick Actions */}
      <div className="p-4 border-t border-sidebar-border">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
          <Plus className="w-5 h-5" />
          <span>Neue Instanz</span>
        </button>
      </div>

      {/* User */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <span className="text-sm font-medium">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{displayName}</p>
              {isAdmin && (
                <Shield className="w-4 h-4 text-warning shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate capitalize">{role || "Benutzer"}</p>
          </div>
          <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
            <Bell className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <button 
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Abmelden</span>
        </button>
      </div>
    </aside>
  );
}
