/**
 * API Client helper
 */

const API_BASE = '/api';

const api = {
  async get(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `GET error: ${res.status}`);
    return data;
  },

  async post(endpoint, body = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `POST error: ${res.status}`);
    return data;
  },

  async put(endpoint, body = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `PUT error: ${res.status}`);
    return data;
  },

  async delete(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `DELETE error: ${res.status}`);
    return data;
  },

  async upload(endpoint, formData) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `Upload error: ${res.status}`);
    return data;
  }
};

window.api = api;
