// Self-hosted API client for the Node.js backend

const API_URL = import.meta.env.VITE_API_URL || 'https://footwear-chips-television-festivals.trycloudflare.com';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error || 'Ein Fehler ist aufgetreten' };
      }

      return { data };
    } catch (error) {
      console.error('API error:', error);
      return { error: 'Netzwerkfehler - Server nicht erreichbar' };
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const result = await this.request<{ token: string; user: any; profile: any; role: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (result.data?.token) {
      this.setToken(result.data.token);
    }
    
    return result;
  }

  async signup(email: string, password: string, username?: string) {
    const result = await this.request<{ token: string; user: any; profile: any; role: string }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
    });
    
    if (result.data?.token) {
      this.setToken(result.data.token);
    }
    
    return result;
  }

  async getMe() {
    return this.request<{ user: any; profile: any; role: string }>('/api/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Server Nodes endpoints
  async getNodes() {
    return this.request<any[]>('/api/nodes');
  }

  async createNode(data: any) {
    return this.request<any>('/api/nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNode(id: string, data: any) {
    return this.request<any>(`/api/nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNode(id: string) {
    return this.request(`/api/nodes/${id}`, {
      method: 'DELETE',
    });
  }

  async getAgentScript(nodeId: string) {
    return this.request<{ installScript: string; windowsScript?: string; linuxScript?: string }>(`/api/nodes/${nodeId}/agent-script`);
  }

  async testNodeConnection(nodeId: string) {
    return this.request<any>(`/api/nodes/${nodeId}/test`);
  }

  // Server Instances endpoints
  async getServers() {
    return this.request<any[]>('/api/servers');
  }

  async getServer(id: string) {
    return this.request<any>(`/api/servers/${id}`);
  }

  async createServer(data: any) {
    return this.request<any>('/api/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServer(id: string, data: any) {
    return this.request<any>(`/api/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteServer(id: string) {
    return this.request(`/api/servers/${id}`, {
      method: 'DELETE',
    });
  }

  // Commands endpoints
  async sendCommand(nodeId: string, commandType: string, commandData: any) {
    return this.request<any>('/api/commands/send', {
      method: 'POST',
      body: JSON.stringify({ nodeId, commandType, commandData }),
    });
  }

  async getCommandStatus(commandId: string) {
    return this.request<any>(`/api/commands/${commandId}`);
  }

  async getServerCommands(serverId: string) {
    return this.request<any[]>(`/api/commands/server/${serverId}`);
  }

  // Logs endpoints
  async getServerLogs(serverId: string, limit = 100) {
    return this.request<any[]>(`/api/logs/server/${serverId}?limit=${limit}`);
  }

  async clearServerLogs(serverId: string) {
    return this.request(`/api/logs/server/${serverId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
