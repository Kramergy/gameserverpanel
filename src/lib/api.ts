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

  // Server control endpoints
  async startServer(id: string) {
    return this.request<any>(`/api/servers/${id}/start`, {
      method: 'POST',
    });
  }

  async stopServer(id: string) {
    return this.request<any>(`/api/servers/${id}/stop`, {
      method: 'POST',
    });
  }

  async restartServer(id: string) {
    return this.request<any>(`/api/servers/${id}/restart`, {
      method: 'POST',
    });
  }

  async installServer(id: string) {
    return this.request<any>(`/api/servers/${id}/install`, {
      method: 'POST',
    });
  }

  async sendServerCommand(id: string, command: string) {
    return this.request<any>(`/api/servers/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
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
