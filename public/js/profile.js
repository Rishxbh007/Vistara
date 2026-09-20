document.addEventListener('DOMContentLoaded', async () => {
  if (!requireLogin()) return;

  const loadingEl = document.getElementById('profile-loading');
  const contentEl = document.getElementById('profile-content');
  const grid = document.getElementById('my-videos-grid');
  const noVideos = document.getElementById('no-videos');

  const deleteModal = document.getElementById('delete-modal');
  const cancelDeleteBtn = document.getElementById('cancel-delete');
  const confirmDeleteBtn = document.getElementById('confirm-delete');

  let deleteVideoId = null;

  try {
    // Fetch user info
    const userData = await api.get('/auth/me');
    const user = userData.user;

    // Update profile header
    document.getElementById('profile-avatar').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;

    const sinceEl = document.getElementById('profile-since');
    if (sinceEl && user.created_at) {
      const d = new Date(user.created_at);
      if (!isNaN(d)) {
        sinceEl.textContent = `Member since ${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
      }
    }

    // Fetch user's videos
    const videoData = await api.get(`/videos/user/${user.id}`);
    const videos = videoData.videos || [];

    document.getElementById('stat-videos').textContent = videos.length;
    document.getElementById('stat-views').textContent =
      formatViews(videos.reduce((sum, v) => sum + (Number(v.views) || 0), 0));

    if (videos.length === 0) {
      grid.classList.add('hidden');
      noVideos.classList.remove('hidden');
    } else {
      grid.innerHTML = videos.map(video => `
        <div class="video-card-wrapper" id="video-wrapper-${video.id}">
          ${createVideoCardHTML({ ...video, uploader_name: user.name })}
          <div class="card-actions">
            <button class="btn btn-quiet-danger btn-sm w-full" onclick="openDeleteModal(${video.id})">
              Delete video
            </button>
          </div>
        </div>
      `).join('');
    }

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

  } catch (err) {
    console.error('Profile load error:', err);
    loadingEl.innerHTML = `
      <div class="alert alert-error">Failed to load profile. Please try again.</div>
      <a href="/profile.html" class="btn btn-secondary mt-4">Retry</a>
    `;
  }

  // --- Ads preference toggle ---
  // A per-viewer switch, stored in the browser. The player checks this in
  // addition to the server's master ADS_ENABLED switch: ads only play when
  // BOTH the server has ads on AND the viewer hasn't turned them off here.
  const adsSwitch = document.getElementById('ads-switch');
  const adsDesc = document.getElementById('ads-setting-desc');

  function adsPrefOn() {
    return localStorage.getItem('sv_ads_pref') !== 'off';
  }

  function paintAdsSwitch() {
    const on = adsPrefOn();
    adsSwitch.classList.toggle('is-on', on);
    adsSwitch.setAttribute('aria-checked', String(on));
    adsDesc.textContent = on
      ? 'Play a short ad before each video starts.'
      : 'Ads are off — videos start immediately for you.';
  }

  if (adsSwitch) {
    paintAdsSwitch();
    adsSwitch.addEventListener('click', () => {
      const turningOff = adsPrefOn();
      localStorage.setItem('sv_ads_pref', turningOff ? 'off' : 'on');
      paintAdsSwitch();
      showToast(turningOff ? 'Ads turned off' : 'Ads turned on');
    });
  }

  // --- Delete Modal ---
  window.openDeleteModal = function(videoId) {
    deleteVideoId = videoId;
    deleteModal.classList.remove('hidden');
  };

  cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    deleteVideoId = null;
  });

  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      deleteModal.classList.add('hidden');
      deleteVideoId = null;
    }
  });

  confirmDeleteBtn.addEventListener('click', async () => {
    if (!deleteVideoId) return;

    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = 'Deleting...';

    try {
      await api.delete(`/videos/${deleteVideoId}`);
      
      // Remove from DOM
      const wrapper = document.getElementById(`video-wrapper-${deleteVideoId}`);
      if (wrapper) {
        wrapper.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        wrapper.style.opacity = '0';
        wrapper.style.transform = 'scale(0.95)';
        setTimeout(() => wrapper.remove(), 300);
      }

      // Update count
      const countEl = document.getElementById('stat-videos');
      const currentCount = parseInt(countEl.textContent) - 1;
      countEl.textContent = currentCount;

      if (currentCount === 0) {
        grid.classList.add('hidden');
        noVideos.classList.remove('hidden');
      }

      showToast('Video deleted successfully');
      deleteModal.classList.add('hidden');
    } catch (err) {
      showToast(err.message || 'Failed to delete video', 'error');
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.textContent = 'Delete';
      deleteVideoId = null;
    }
  });
});
