/**
 * API Client — centralized fetch wrapper with auth token injection
 */
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('sv_token');
}

function setToken(token) {
  localStorage.setItem('sv_token', token);
}

function clearToken() {
  localStorage.removeItem('sv_token');
  localStorage.removeItem('sv_user');
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = options.headers || {};
  const token = getToken();

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type if body is FormData (let browser set boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // A 401 on a request we sent a token with means the session is dead
    // (expired, or signed by an older server build). Clear it and send the
    // user to login instead of surfacing a dead-end "failed to load" error.
    if (response.status === 401 && token) {
      clearToken();
      const path = window.location.pathname;
      const onAuthPage = path === '/login.html' || path === '/register.html';
      if (!onAuthPage) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/login.html?next=${next}`;
      }
    }
    throw { status: response.status, message: data.error || 'Something went wrong', data };
  }

  return data;
}

// Convenience methods
const api = {
  get: (endpoint) => apiRequest(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiRequest(endpoint, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),
  delete: (endpoint) => apiRequest(endpoint, { method: 'DELETE' }),

  // Upload with progress tracking
  upload: (endpoint, formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const token = getToken();

      xhr.open('POST', `${API_BASE}${endpoint}`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject({ status: xhr.status, message: data.error || 'Upload failed', data });
          }
        } catch {
          reject({ status: xhr.status, message: 'Upload failed' });
        }
      };

      xhr.onerror = () => reject({ message: 'Network error during upload' });
      xhr.send(formData);
    });
  }
};
