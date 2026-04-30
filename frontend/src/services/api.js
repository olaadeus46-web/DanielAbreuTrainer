import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
const publicApi = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('fc_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const clientsApi = {
  list: () => api.get('/clients'),
  get: (id) => api.get(`/clients/${id}`),
  createOnlineLink: (data) => api.post('/clients/online-links', data),
  listFeedback: (id) => api.get(`/clients/${id}/feedback`),
  listFeedbackLinks: (id) => api.get(`/clients/${id}/feedback-links`),
  createFeedbackLink: (id, data) => api.post(`/clients/${id}/feedback-links`, data),
  extractIntakeAi: (formData) => api.post('/clients/extract-intake-ai', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  create: (data) => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  delete: (id) => api.delete(`/clients/${id}`),
  dashboard: (id) => api.get(`/clients/${id}/dashboard`),
};

export const metricsApi = {
  listDefinitions: (clientId) => api.get('/metrics/definitions', { params: { clientId } }),
  createDefinition: (data) => api.post('/metrics/definitions', data),
  copyDefinitionsFromClient: (data) => api.post('/metrics/definitions/copy-from-client', data),
  updateDefinition: (id, data) => api.put(`/metrics/definitions/${id}`, data),
  deleteDefinition: (id) => api.delete(`/metrics/definitions/${id}`),
  listPresets: () => api.get('/metrics/presets'),
  createPreset: (data) => api.post('/metrics/presets', data),
  applyPreset: (id, data) => api.post(`/metrics/presets/${id}/apply`, data),
  listEntries: (params) => api.get('/metrics/entries', { params }),
  listCheckIns: (clientId) => api.get('/metrics/checkins', { params: { clientId } }),
  listCheckInLinks: (clientId) => api.get('/metrics/checkin-links', { params: { clientId } }),
  createCheckInLink: (data) => api.post('/metrics/checkin-links', data),
  createEntry: (data) => api.post('/metrics/entries', data),
  updateEntry: (id, data) => api.put(`/metrics/entries/${id}`, data),
  bulkUpsertEntries: (data) => api.post('/metrics/entries/bulk-upsert', data),
  createCheckIn: (data) => api.post('/metrics/checkins', data),
  importPdfSheet: (formData) => api.post('/metrics/import-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

export const publicCheckInApi = {
  getLink: (token) => publicApi.get(`/metrics/public/checkin-links/${token}`),
  submit: (token, data) => publicApi.post(`/metrics/public/checkin-links/${token}/submit`, data),
};

export const publicOnlineClientApi = {
  getLink: (token) => publicApi.get(`/clients/public/online-links/${token}`),
  submit: (token, data) => publicApi.post(`/clients/public/online-links/${token}/submit`, data),
};

export const publicFeedbackApi = {
  getLink: (token) => publicApi.get(`/clients/public/feedback-links/${token}`),
  submit: (token, data) => publicApi.post(`/clients/public/feedback-links/${token}/submit`, data),
};

export const automationsApi = {
  list: () => api.get('/automations'),
  create: (data) => api.post('/automations', data),
  update: (id, data) => api.patch(`/automations/${id}`, data),
  execute: (id) => api.post(`/automations/${id}/execute`),
  delete: (id) => api.delete(`/automations/${id}`),
};

export const workoutsApi = {
  get: (clientId) => api.get(`/workouts/${clientId}`),
  save: (data) => api.post('/workouts', data),
  duplicate: (data) => api.post('/workouts/duplicate', data),
  extractAi: (formData) => api.post('/workouts/extract-ai', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

export const photosApi = {
  list: (clientId) => api.get(`/photos/${clientId}`),
  upload: (formData) => api.post('/photos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id) => api.delete(`/photos/${id}`),
};

export const financeApi = {
  overview: () => api.get('/finance/overview'),
  stats: () => api.get('/finance/stats'),
  updatePayment: (clientId, data) => api.patch(`/finance/payments/${clientId}`, data),
};

export const packagesApi = {
  list: () => api.get('/packages'),
  create: (data) => api.post('/packages', data),
  update: (id, data) => api.put(`/packages/${id}`, data),
  delete: (id) => api.delete(`/packages/${id}`),
};
