/**
 * Watch page.
 *
 * Playback order is guaranteed by construction:
 *
 *   1. video metadata loads
 *   2. the ad break runs to completion (or is skipped entirely)
 *   3. only then is a src attached to <video id="main-video"> and playback starts
 *
 * The main video element deliberately starts with no `src` and preload="none",
 * so there is no way for the feature to begin behind the ad overlay.
 */

const AD_LAST_ID_KEY = 'sv_last_ad';
const AD_MUTED_KEY = 'sv_ad_muted';
const AD_STALL_TIMEOUT_MS = 10000;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get('id');

  const loadingEl = document.getElementById('watch-loading');
  const contentEl = document.getElementById('watch-content');
  const errorEl = document.getElementById('watch-error');
  const errorText = document.getElementById('watch-error-text');

  if (!videoId) return showError('No video was specified in the link.');

  let video;
  try {
    const data = await api.get(`/videos/${videoId}`);
    video = data.video;
  } catch (err) {
    return showError(err.status === 404
      ? 'This video may have been deleted, or the link is incorrect.'
      : 'Something went wrong while loading this video. Please try again.');
  }

  // --- Render the details -------------------------------------------------
  document.title = `${video.title} — Vistara`;
  document.getElementById('video-title').textContent = video.title;
  document.getElementById('video-views').textContent = formatViews(video.views);
  document.getElementById('video-uploader').textContent = video.uploader_name || 'Unknown';
  document.getElementById('video-date').textContent = formatDate(video.created_at);

  const categoryEl = document.getElementById('video-category');
  if (video.category && video.category !== 'Uncategorized') {
    categoryEl.textContent = video.category;
  } else {
    categoryEl.classList.add('hidden');
  }

  const descEl = document.getElementById('video-description');
  if (video.description) {
    descEl.textContent = video.description;
  } else {
    descEl.classList.add('hidden');
  }

  loadingEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  // --- Player -------------------------------------------------------------
  const mainVideo = document.getElementById('main-video');
  const playerControls = document.getElementById('player-controls');
  let mainStarted = false;

  initPlayerControls();

  // Run the ad break first. Whatever happens — ads off, no ads configured,
  // network failure, broken ad file — control always reaches startMainVideo().
  try {
    await runAdBreak();
  } catch (err) {
    console.error('[Ads] Ad break failed, continuing to the video:', err);
  }
  startMainVideo();

  /* ======================================================================
     Ad break
     ====================================================================== */

  async function runAdBreak() {
    const overlay = document.getElementById('ad-overlay');

    // 0. Viewer's own ad preference (set on the profile page). If they've
    //    turned ads off for themselves, skip the break entirely.
    if (localStorage.getItem('sv_ads_pref') === 'off') {
      console.log('[Ads] Skipped — turned off by the viewer in their profile settings.');
      return;
    }

    // 1. Master ON/OFF switch (ADS_ENABLED in .env, read by the server).
    let settings;
    try {
      settings = await api.get('/ads/settings');
    } catch (err) {
      console.warn('[Ads] Could not read ad settings — skipping the ad break.');
      return;
    }

    if (!settings.enabled) {
      // Ads are off: no overlay, no countdown, no skip button. The overlay
      // element is never un-hidden, so none of it can appear.
      console.log('[Ads] Ads are OFF' +
        (settings.adsConfigured === false ? ' (no ad files in the ads/ folder)' : ' (ADS_ENABLED=false)'));
      return;
    }

    // 2. Pick an ad from the ads/ folder. `exclude` asks the server to avoid
    //    repeating the ad that played last time, when more than one exists.
    let payload;
    try {
      const lastId = localStorage.getItem(AD_LAST_ID_KEY) || '';
      payload = await api.get(`/ads/next${lastId ? `?exclude=${encodeURIComponent(lastId)}` : ''}`);
    } catch (err) {
      console.warn('[Ads] Could not fetch an ad — skipping the ad break.');
      return;
    }

    if (!payload.ad) {
      console.log(`[Ads] No ad to play (${payload.reason || 'unknown'}).`);
      return;
    }

    localStorage.setItem(AD_LAST_ID_KEY, payload.ad.id);

    const skipSeconds = Number.isFinite(payload.skipSeconds)
      ? payload.skipSeconds
      : (settings.skipSeconds ?? 5);

    await playAd(overlay, payload.ad, skipSeconds);
  }

  /**
   * Play one advertisement. Resolves when the ad is over — whether it ended
   * naturally, was skipped, failed to load, or stalled.
   */
  function playAd(overlay, ad, skipSeconds) {
    return new Promise((resolve) => {
      const adVideo = document.getElementById('ad-video');
      const adState = document.getElementById('ad-state');
      const adTitle = document.getElementById('ad-title');
      const skipBtn = document.getElementById('btn-skip-ad');
      const skipLabel = document.getElementById('skip-label');
      const muteBtn = document.getElementById('btn-ad-mute');
      const progressFill = document.getElementById('ad-progress-fill');

      let settled = false;
      let stallTimer = null;
      let started = false;

      // --- Reset the UI for this ad ---
      adTitle.textContent = ad.advertiser ? `${ad.title} — ${ad.advertiser}` : ad.title;
      skipBtn.disabled = true;
      skipBtn.classList.remove('is-ready');
      skipLabel.textContent = skipSeconds > 0 ? `Skip in ${skipSeconds}s` : 'Skip ad';
      progressFill.style.width = '0%';
      showAdState(`<div class="spinner spinner-lg spinner-light"></div><p>Loading advertisement&hellip;</p>`);

      // Browsers only allow unattended playback when muted, so every ad starts
      // muted. The viewer can unmute, and we remember that for the next ad.
      const preferMuted = localStorage.getItem(AD_MUTED_KEY) !== 'false';
      adVideo.muted = preferMuted;
      adVideo.volume = 1;
      updateMuteIcon();

      overlay.classList.remove('hidden');

      // --- Listeners are attached BEFORE the src is set, so no event can be
      //     missed between assignment and subscription. ---
      const on = (el, evt, fn) => {
        el.addEventListener(evt, fn);
        listeners.push(() => el.removeEventListener(evt, fn));
      };
      const listeners = [];

      on(adVideo, 'playing', () => {
        started = true;
        clearTimeout(stallTimer);
        hideAdState();
      });

      on(adVideo, 'timeupdate', () => {
        const duration = adVideo.duration;
        if (Number.isFinite(duration) && duration > 0) {
          progressFill.style.width = `${Math.min(100, (adVideo.currentTime / duration) * 100)}%`;
        }
        // The countdown is driven by how much of the ad has actually played,
        // not by wall-clock time, so buffering doesn't eat the countdown.
        const remaining = Math.ceil(skipSeconds - adVideo.currentTime);
        if (remaining > 0) {
          skipLabel.textContent = `Skip in ${remaining}s`;
        } else {
          enableSkip();
        }
      });

      on(adVideo, 'ended', () => finish('ended'));

      on(adVideo, 'error', () => {
        const code = adVideo.error ? adVideo.error.code : '?';
        console.error(`[Ads] "${ad.title}" failed to play (media error ${code}). ` +
                      `Check that ${ad.streamUrl} is a valid, browser-playable video file.`);
        failAd();
      });

      on(adVideo, 'stalled', () => {
        if (!started) console.warn('[Ads] Ad stalled while buffering.');
      });

      on(skipBtn, 'click', () => {
        if (skipBtn.disabled) return;
        finish('skipped');
      });

      on(muteBtn, 'click', () => {
        adVideo.muted = !adVideo.muted;
        localStorage.setItem(AD_MUTED_KEY, String(adVideo.muted));
        updateMuteIcon();
      });

      // If a zero-second skip is configured, the button is live immediately.
      if (skipSeconds <= 0) enableSkip();

      // Watchdog: if the ad never reaches 'playing', don't trap the viewer.
      stallTimer = setTimeout(() => {
        if (!started) {
          console.error('[Ads] Ad did not start within ' + (AD_STALL_TIMEOUT_MS / 1000) + 's.');
          failAd();
        }
      }, AD_STALL_TIMEOUT_MS);

      // --- Now load and play ---
      adVideo.src = ad.streamUrl;
      adVideo.play().catch(err => {
        // A rejected play() with a muted video means something is actually
        // wrong (a blocked or undecodable source), so surface it.
        console.error('[Ads] play() was rejected:', err && err.name);
        failAd();
      });

      /* ---- helpers ---- */

      function enableSkip() {
        if (skipBtn.disabled === false) return;
        skipBtn.disabled = false;
        skipBtn.classList.add('is-ready');
        skipLabel.textContent = 'Skip ad';
      }

      function updateMuteIcon() {
        muteBtn.setAttribute('aria-label', adVideo.muted ? 'Unmute advertisement' : 'Mute advertisement');
        muteBtn.title = adVideo.muted ? 'Unmute' : 'Mute';
        muteBtn.innerHTML = adVideo.muted
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
               <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
               <path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
      }

      function showAdState(html) {
        adState.innerHTML = html;
        adState.classList.remove('hidden');
      }

      function hideAdState() {
        adState.classList.add('hidden');
      }

      /** The ad is broken — say so briefly, then move on to the video. */
      function failAd() {
        if (settled) return;
        showAdState(`
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/>
          </svg>
          <p>This advertisement couldn't be played.</p>
          <p class="ad-state-sub">Starting your video&hellip;</p>`);
        setTimeout(() => finish('error'), 1200);
      }

      /** Single-shot teardown. Any later event is a no-op. */
      function finish(reason) {
        if (settled) return;
        settled = true;
        clearTimeout(stallTimer);
        listeners.forEach(off => off());

        adVideo.pause();
        // Never assign src = '' — an empty src resolves to the page URL, the
        // browser tries to decode the HTML as video and fires a fresh error
        // event. removeAttribute + load() is the correct way to detach.
        adVideo.removeAttribute('src');
        adVideo.load();

        overlay.classList.add('hidden');
        console.log(`[Ads] Ad finished (${reason}).`);
        resolve(reason);
      }
    });
  }

  /* ======================================================================
     Main video
     ====================================================================== */

  function startMainVideo() {
    if (mainStarted) return;
    mainStarted = true;

    mainVideo.preload = 'metadata';
    mainVideo.src = `/api/videos/${videoId}/stream`;
    playerControls.classList.remove('hidden');

    mainVideo.play().catch(() => {
      // Autoplay with sound is commonly blocked — that's fine, the viewer
      // just presses play. Show the centre play hint so it's obvious.
      document.getElementById('tap-hint').classList.add('is-visible');
    });
  }

  /* ======================================================================
     Custom controls
     ====================================================================== */

  function initPlayerControls() {
    const container = document.getElementById('player-container');
    const tapHint = document.getElementById('tap-hint');

    const btnPlay = document.getElementById('btn-play');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');

    const btnMute = document.getElementById('btn-mute');
    const iconVolume = document.getElementById('icon-volume');
    const iconMuted = document.getElementById('icon-muted');
    const volumeSlider = document.getElementById('volume-slider');

    const progressContainer = document.getElementById('progress-container');
    const progressPlayed = document.getElementById('progress-played');
    const progressBuffered = document.getElementById('progress-buffered');
    const progressHandle = document.getElementById('progress-handle');
    const timeLabel = document.getElementById('player-time');

    const btnSpeed = document.getElementById('btn-speed');
    const speedMenu = document.getElementById('speed-menu');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const iconExpand = document.getElementById('icon-expand');
    const iconCompress = document.getElementById('icon-compress');

    let hideControlsTimer = null;
    let scrubbing = false;

    function formatTime(seconds) {
      if (!Number.isFinite(seconds)) return '0:00';
      const s = Math.floor(seconds % 60);
      const m = Math.floor((seconds / 60) % 60);
      const h = Math.floor(seconds / 3600);
      const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
      return (h > 0 ? `${h}:` : '') + `${mm}:${String(s).padStart(2, '0')}`;
    }

    // --- Play / pause ---
    function togglePlay() {
      if (mainVideo.paused) mainVideo.play().catch(() => {});
      else mainVideo.pause();
    }

    btnPlay.addEventListener('click', togglePlay);

    // Clicking the video area toggles playback, but only once the ad is over.
    container.addEventListener('click', (e) => {
      if (!mainStarted) return;
      if (e.target === mainVideo || e.target === tapHint || tapHint.contains(e.target)) {
        togglePlay();
      }
    });

    mainVideo.addEventListener('play', () => {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      btnPlay.setAttribute('aria-label', 'Pause');
      tapHint.classList.remove('is-visible');
      scheduleHideControls();
    });

    mainVideo.addEventListener('pause', () => {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      btnPlay.setAttribute('aria-label', 'Play');
      tapHint.classList.add('is-visible');
      showControls();
    });

    // --- Progress ---
    mainVideo.addEventListener('loadedmetadata', updateTime);
    mainVideo.addEventListener('timeupdate', () => {
      if (!scrubbing) updateProgress();
      updateTime();
    });
    mainVideo.addEventListener('progress', updateBuffered);

    function updateProgress() {
      const pct = mainVideo.duration ? (mainVideo.currentTime / mainVideo.duration) * 100 : 0;
      progressPlayed.style.width = `${pct}%`;
      progressHandle.style.left = `${pct}%`;
    }

    function updateBuffered() {
      if (!mainVideo.buffered.length || !mainVideo.duration) return;
      const end = mainVideo.buffered.end(mainVideo.buffered.length - 1);
      progressBuffered.style.width = `${(end / mainVideo.duration) * 100}%`;
    }

    function updateTime() {
      timeLabel.textContent = `${formatTime(mainVideo.currentTime)} / ${formatTime(mainVideo.duration)}`;
    }

    function seekFromEvent(e) {
      const rect = progressContainer.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      progressPlayed.style.width = `${ratio * 100}%`;
      progressHandle.style.left = `${ratio * 100}%`;
      return ratio;
    }

    progressContainer.addEventListener('mousedown', (e) => {
      if (!mainVideo.duration) return;
      scrubbing = true;
      seekFromEvent(e);
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (scrubbing) seekFromEvent(e);
    });

    document.addEventListener('mouseup', (e) => {
      if (!scrubbing) return;
      scrubbing = false;
      if (mainVideo.duration) mainVideo.currentTime = seekFromEvent(e) * mainVideo.duration;
    });

    progressContainer.addEventListener('click', (e) => {
      if (!mainVideo.duration) return;
      mainVideo.currentTime = seekFromEvent(e) * mainVideo.duration;
    });

    // --- Volume ---
    btnMute.addEventListener('click', () => {
      mainVideo.muted = !mainVideo.muted;
      volumeSlider.value = mainVideo.muted ? 0 : mainVideo.volume;
      updateVolumeIcon();
    });

    volumeSlider.addEventListener('input', () => {
      mainVideo.volume = Number(volumeSlider.value);
      mainVideo.muted = mainVideo.volume === 0;
      updateVolumeIcon();
    });

    function updateVolumeIcon() {
      const silent = mainVideo.muted || mainVideo.volume === 0;
      iconVolume.classList.toggle('hidden', silent);
      iconMuted.classList.toggle('hidden', !silent);
      btnMute.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
    }

    // --- Playback speed ---
    btnSpeed.addEventListener('click', (e) => {
      e.stopPropagation();
      speedMenu.classList.toggle('hidden');
    });

    speedMenu.querySelectorAll('.speed-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const speed = Number(option.dataset.speed);
        mainVideo.playbackRate = speed;
        btnSpeed.textContent = speed === 1 ? '1x' : `${speed}x`;
        speedMenu.querySelectorAll('.speed-option').forEach(o => o.classList.remove('active'));
        option.classList.add('active');
        speedMenu.classList.add('hidden');
      });
    });

    document.addEventListener('click', () => speedMenu.classList.add('hidden'));

    // --- Fullscreen ---
    btnFullscreen.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else container.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err));
    });

    document.addEventListener('fullscreenchange', () => {
      const full = !!document.fullscreenElement;
      iconExpand.classList.toggle('hidden', full);
      iconCompress.classList.toggle('hidden', !full);
    });

    // --- Auto-hide the control bar ---
    function showControls() {
      playerControls.classList.remove('controls-hidden');
      clearTimeout(hideControlsTimer);
    }

    function scheduleHideControls() {
      clearTimeout(hideControlsTimer);
      hideControlsTimer = setTimeout(() => {
        if (!mainVideo.paused) playerControls.classList.add('controls-hidden');
      }, 2600);
    }

    container.addEventListener('mousemove', () => {
      showControls();
      if (!mainVideo.paused) scheduleHideControls();
    });

    container.addEventListener('mouseleave', () => {
      if (!mainVideo.paused) playerControls.classList.add('controls-hidden');
    });

    // --- Keyboard shortcuts (ignored while an ad is playing) ---
    document.addEventListener('keydown', (e) => {
      if (!mainStarted) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault(); togglePlay(); break;
        case 'ArrowRight':
          mainVideo.currentTime = Math.min(mainVideo.duration || 0, mainVideo.currentTime + 5); break;
        case 'ArrowLeft':
          mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 5); break;
        case 'ArrowUp':
          e.preventDefault();
          mainVideo.volume = Math.min(1, mainVideo.volume + 0.1);
          volumeSlider.value = mainVideo.volume; updateVolumeIcon(); break;
        case 'ArrowDown':
          e.preventDefault();
          mainVideo.volume = Math.max(0, mainVideo.volume - 0.1);
          volumeSlider.value = mainVideo.volume; updateVolumeIcon(); break;
        case 'm':
          btnMute.click(); break;
        case 'f':
          btnFullscreen.click(); break;
      }
      showControls();
      if (!mainVideo.paused) scheduleHideControls();
    });

    mainVideo.addEventListener('error', () => {
      if (!mainVideo.src) return;
      console.error('[Player] The main video failed to load.');
      showToast('This video could not be played.', 'error');
    });
  }

  /* ====================================================================== */

  function showError(message) {
    loadingEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    errorText.textContent = message;
    errorEl.classList.remove('hidden');
  }
});
