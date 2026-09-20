/**
 * Auth state + shared UI (navbar, footer, video cards, toasts, formatting).
 * Loaded on every page.
 */

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('sv_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem('sv_user', JSON.stringify(user));
}

function isLoggedIn() {
  return !!getToken() && !!getCurrentUser();
}

function logout() {
  clearToken();
  window.location.href = '/';
}

/* -------------------------------------------------------------------------
   Small inline icon set (so we don't depend on an icon library)
   ------------------------------------------------------------------------- */
const icons = {
  play:    '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>',
  menu:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
  close:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  upload:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  search:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.7" y2="16.7"/></svg>'
};

/** First letter of a name, for the avatar circle */
function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

/* -------------------------------------------------------------------------
   Navbar
   ------------------------------------------------------------------------- */

function renderNavbar() {
  const mount = document.getElementById('navbar');
  if (!mount) return;

  const user = getCurrentUser();
  const loggedIn = isLoggedIn();
  const page = window.location.pathname;
  const on = (href) => (page === href || (href === '/' && page === '/index.html') ? ' is-current' : '');

  mount.innerHTML = `
    <nav class="navbar">
      <div class="navbar-inner">
        <a href="/" class="navbar-brand">
          <span class="brand-mark">${icons.play}</span>
          Vistara
        </a>

        <button class="nav-toggle" id="nav-toggle" aria-label="Menu" aria-expanded="false">
          ${icons.menu}
        </button>

        <div class="navbar-links" id="navbar-links">
          <a href="/" class="nav-link${on('/')}">Home</a>
          <a href="/browse.html" class="nav-link${on('/browse.html')}">Browse</a>
          ${loggedIn ? `
            <a href="/upload.html" class="nav-link${on('/upload.html')}">Upload</a>
            <span class="nav-divider"></span>
            <a href="/profile.html" class="nav-account">
              <span class="avatar">${escapeHtml(initialOf(user.name))}</span>
              ${escapeHtml(user.name)}
            </a>
            <button class="btn btn-ghost btn-sm" onclick="logout()">Sign out</button>
          ` : `
            <span class="nav-divider"></span>
            <a href="/login.html" class="nav-link">Sign in</a>
            <a href="/register.html" class="btn btn-primary btn-sm">Create account</a>
          `}
        </div>
      </div>
    </nav>
  `;

  // Mobile menu toggle
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('navbar-links');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.innerHTML = open ? icons.close : icons.menu;
    toggle.setAttribute('aria-expanded', String(open));
  });
}

/* -------------------------------------------------------------------------
   Footer
   ------------------------------------------------------------------------- */

function renderFooter() {
  const mount = document.getElementById('footer');
  if (!mount) return;

  mount.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a href="/" class="navbar-brand">
              <span class="brand-mark">${icons.play}</span>
              Vistara
            </a>
            <p>A self-hosted video streaming platform. Upload, share and watch —
               with an ad system you control from a single folder.</p>
          </div>
          <div class="footer-col">
            <h4>Watch</h4>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/browse.html">Browse videos</a></li>
              <li><a href="/browse.html?category=Education">Education</a></li>
              <li><a href="/browse.html?category=Music">Music</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Account</h4>
            <ul>
              <li><a href="/upload.html">Upload a video</a></li>
              <li><a href="/profile.html">Your channel</a></li>
              <li><a href="/login.html">Sign in</a></li>
              <li><a href="/register.html">Create account</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-base">
          <span>&copy; ${new Date().getFullYear()} Vistara</span>
          <span>Built with Node.js, Express and SQLite</span>
        </div>
      </div>
    </footer>
  `;
}

/* -------------------------------------------------------------------------
   Page guard
   ------------------------------------------------------------------------- */

function requireLogin() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

/* -------------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------------- */

function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3200);
}

/* -------------------------------------------------------------------------
   Formatting helpers
   ------------------------------------------------------------------------- */

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const seconds = Math.floor((Date.now() - d) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatViews(count) {
  const n = Number(count) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/* -------------------------------------------------------------------------
   Video card
   ------------------------------------------------------------------------- */

function createVideoCardHTML(video) {
  const thumbnail = video.thumbnail_path
    ? `/uploads/thumbnails/${video.thumbnail_path}`
    : null;

  return `
    <a href="/watch.html?id=${video.id}" class="video-card" id="video-card-${video.id}">
      <div class="video-thumb">
        ${thumbnail
          ? `<img src="${thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy">`
          : `<div class="video-thumb-placeholder">${icons.play}</div>`
        }
      </div>
      <div class="video-info">
        <div class="video-title">${escapeHtml(video.title)}</div>
        <div class="video-uploader">${escapeHtml(video.uploader_name || 'Unknown')}</div>
        <div class="video-meta">
          <span>${formatViews(video.views)} views</span>
          <span>${formatDate(video.created_at)}</span>
        </div>
      </div>
    </a>
  `;
}

function renderSkeletons(container, count = 8) {
  container.innerHTML = Array(count).fill(`
    <div>
      <div class="skeleton skeleton-thumb"></div>
      <div class="skeleton skeleton-text w-75"></div>
      <div class="skeleton skeleton-text w-50"></div>
    </div>
  `).join('');
}

/* -------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  renderFooter();
});
