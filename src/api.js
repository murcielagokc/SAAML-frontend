/**
 * Cliente de Conexión a la API RESTful de SAAML (FastAPI)
 * Soporta almacenamiento de JWT, conmutación dinámica de URL base (Local vs Render)
 * y llamadas completas a los módulos RF01-RF06.
 */

const DEFAULT_API_URL = 'https://saaml.onrender.com/api/v1';

export class SaamlApiClient {
  constructor() {
    this.baseUrl = localStorage.getItem('saaml_api_url') || DEFAULT_API_URL;
    this.token = localStorage.getItem('saaml_jwt_token') || null;
    this.currentUser = JSON.parse(localStorage.getItem('saaml_user_info') || 'null');
  }

  setBaseUrl(url) {
    this.baseUrl = url.trim().replace(/\/+$/, '');
    localStorage.setItem('saaml_api_url', this.baseUrl);
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  setAuth(token, user) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem('saaml_jwt_token', token);
    localStorage.setItem('saaml_user_info', JSON.stringify(user));
  }

  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('saaml_jwt_token');
    localStorage.removeItem('saaml_user_info');
  }

  isAuthenticated() {
    return !!this.token;
  }

  getUser() {
    return this.currentUser;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.status === 401) {
        this.logout();
        throw new Error('Sesión expirada o credenciales inválidas. Por favor inicia sesión nuevamente.');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.detail || response.statusText || 'Error en la petición al servidor';
        throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  }

  // Diagnóstico
  async getHealth() {
    return this.request('/health');
  }

  // Autenticación (RNF-SEG)
  async login(email, password) {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const url = `${this.baseUrl}/auth/login`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Error de autenticación');
    }

    this.setAuth(data.access_token, { email: data.email, rol: data.rol });

    // Cargar perfil completo
    try {
      const me = await this.getMe();
      this.currentUser = me;
      localStorage.setItem('saaml_user_info', JSON.stringify(me));
    } catch (_) {}

    return data;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // RF01: Catálogo y Proveedores
  async getProducts() {
    return this.request('/products/?limit=100');
  }

  async getSuppliers() {
    return this.request('/suppliers/');
  }

  // RF03: Ciclos Presupuestales
  async getBudgetCycles() {
    return this.request('/budget/');
  }

  // RF02 & RF06: Machine Learning
  async getForecastSku(skuCode, horizonDays = 14) {
    return this.request(`/ml/forecast/${skuCode}?horizon_days=${horizonDays}`);
  }

  async getForecastAll(horizonDays = 14) {
    return this.request(`/ml/forecast-all?horizon_days=${horizonDays}`);
  }

  async getModelAudits() {
    return this.request('/ml/models');
  }

  async triggerTrainML() {
    return this.request('/ml/train', { method: 'POST' });
  }

  // RF04: Optimización Presupuestal Knapsack
  async runOptimization(payload) {
    return this.request('/optimization/run', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getOptimizationSessions(cicloId = null) {
    const q = cicloId ? `?ciclo_id=${cicloId}` : '';
    return this.request(`/optimization/sessions${q}`);
  }

  async getOptimizationSessionById(sessionId) {
    return this.request(`/optimization/sessions/${sessionId}`);
  }

  // RF05: Órdenes de Compra
  async generateOrdersFromSession(sessionId) {
    return this.request(`/orders/generate-from-session/${sessionId}`, {
      method: 'POST'
    });
  }

  async getOrders(estado = null) {
    const q = estado ? `?estado=${estado}` : '';
    return this.request(`/orders/${q}`);
  }

  async getOrderById(orderId) {
    return this.request(`/orders/${orderId}`);
  }

  async adjustOrderItems(orderId, items) {
    return this.request(`/orders/${orderId}/items`, {
      method: 'PATCH',
      body: JSON.stringify({ items })
    });
  }

  async approveOrder(orderId) {
    return this.request(`/orders/${orderId}/approve`, {
      method: 'PATCH'
    });
  }

  async cancelOrder(orderId) {
    return this.request(`/orders/${orderId}/cancel`, {
      method: 'PATCH'
    });
  }
}

export const api = new SaamlApiClient();
