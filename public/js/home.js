document.addEventListener('DOMContentLoaded', async () => {
  const railsEl = document.getElementById('rails');
  const emptyState = document.getElementById('featured-empty');
  const stage = document.getElementById('hero-stage');

  const ctaPrimary = document.getElementById('cta-primary');
  const loggedIn = isLoggedIn();

  // If already signed in, the account CTA becomes "Upload a video"
  if (loggedIn && ctaPrimary) {
    ctaPrimary.textContent = 'Upload a video';
    ctaPrimary.href = '/upload.html';
  }

  // Skeleton rail while loading
  railsEl.innerHTML = railSkeleton();

  try {
    const data = await api.get('/videos');
    const videos = data.videos || [];

    renderHeroStage(videos[0], videos.length);

    if (videos.length === 0) {
      railsEl.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    renderRails(videos);
    renderCategoryTiles(videos);
  } catch (err) {
    renderHeroStage(null, 0);
    railsEl.innerHTML = '<div class="alert alert-error">Failed to load videos. Please refresh the page.</div>';
  }

  /* ---- Browse-by-category tiles ------------------------------------------
   *  Built from the real category counts. Each tile gets a stable colour
   *  pair derived from its name, so the grid reads as a coloured palette
   *  and the same category is always the same colour. Links into /browse.
   * ----------------------------------------------------------------------- */

  function renderCategoryTiles(videos) {
    const section = document.getElementById('cats-section');
    const wrap = document.getElementById('category-tiles');
    if (!section || !wrap) return;

    const counts = {};
    for (const v of videos) {
      const cat = (v.category && v.category.trim()) || 'Uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (cats.length === 0) return;

    // Curated gradient pairs; chosen by a hash of the name so it's stable
    const palettes = [
      ['#2237B8', '#0A0C18'], ['#6D28D9', '#1E1145'], ['#0E7490', '#062A33'],
      ['#B45309', '#2A1705'], ['#BE185D', '#2A0A1B'], ['#15803D', '#06210F'],
      ['#4338CA', '#0C0A2E'], ['#0F766E', '#04211E'],
    ];
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

    wrap.innerHTML = cats.map((cat) => {
      const [a, b] = palettes[hash(cat) % palettes.length];
      const n = counts[cat];
      return `
        <a href="/browse.html?category=${encodeURIComponent(cat)}" class="cat-tile" style="--tile-a:${a};--tile-b:${b}">
          <span class="cat-tile-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </span>
          <span class="cat-tile-name">${escapeHtml(cat)}</span>
          <span class="cat-tile-count">${n} ${n === 1 ? 'video' : 'videos'}</span>
        </a>`;
    }).join('');

    section.classList.remove('hidden');
  }

  /* ---- Rails: "Latest" first, then one row per category ------------------ */

  function renderRails(videos) {
    const rows = [];

    // Latest — newest first (the API already returns newest-first)
    rows.push(buildRail('Latest on Vistara', videos.slice(0, 12), null));

    // Group the rest by category, largest groups first
    const byCategory = {};
    for (const v of videos) {
      const cat = (v.category && v.category.trim()) || 'Uncategorized';
      (byCategory[cat] = byCategory[cat] || []).push(v);
    }

    Object.keys(byCategory)
      .sort((a, b) => byCategory[b].length - byCategory[a].length)
      .forEach((cat) => {
        // Skip tiny one-off rows only if there's a single video total in it
        rows.push(buildRail(cat, byCategory[cat], cat));
      });

    railsEl.innerHTML = rows.join('');
    wireRailScrolling();
  }

  function buildRail(title, items, category) {
    if (!items || items.length === 0) return '';
    const seeAll = category
      ? `/browse.html?category=${encodeURIComponent(category)}`
      : '/browse.html';

    return `
      <section class="rail">
        <div class="rail-head">
          <h2 class="rail-title">${escapeHtml(title)}</h2>
          <a href="${seeAll}" class="link-quiet">See all</a>
        </div>
        <div class="rail-viewport">
          <button class="rail-arrow rail-arrow-left" aria-label="Scroll left" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="rail-track">
            ${items.map(railCardHTML).join('')}
          </div>
          <button class="rail-arrow rail-arrow-right" aria-label="Scroll right">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </section>`;
  }

  function railCardHTML(video) {
    const thumb = video.thumbnail_path ? `/uploads/thumbnails/${video.thumbnail_path}` : null;
    return `
      <a href="/watch.html?id=${video.id}" class="rail-card">
        <div class="rail-thumb">
          ${thumb
            ? `<img src="${thumb}" alt="${escapeHtml(video.title)}" loading="lazy">`
            : `<div class="video-thumb-placeholder">${icons.play}</div>`}
          <span class="rail-thumb-play">${icons.play}</span>
        </div>
        <div class="rail-card-title">${escapeHtml(video.title)}</div>
        <div class="rail-card-meta">${escapeHtml(video.uploader_name || 'Unknown')} · ${formatViews(video.views)} views</div>
      </a>`;
  }

  /** Arrow buttons scroll the track; arrows hide at the ends. */
  function wireRailScrolling() {
    document.querySelectorAll('.rail-viewport').forEach((vp) => {
      const track = vp.querySelector('.rail-track');
      const left = vp.querySelector('.rail-arrow-left');
      const right = vp.querySelector('.rail-arrow-right');

      const update = () => {
        const max = track.scrollWidth - track.clientWidth - 2;
        left.hidden = track.scrollLeft <= 2;
        right.hidden = track.scrollLeft >= max;
      };

      const step = () => Math.max(track.clientWidth * 0.8, 240);
      left.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
      right.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
      track.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    });
  }

  function railSkeleton() {
    const cards = Array.from({ length: 6 }, () =>
      '<div class="rail-card"><div class="rail-thumb skeleton"></div><div class="skeleton skeleton-line" style="width:80%;height:14px;margin-top:10px"></div><div class="skeleton skeleton-line" style="width:55%;height:11px;margin-top:8px"></div></div>'
    ).join('');
    return `
      <section class="rail">
        <div class="rail-head"><h2 class="rail-title">Latest on Vistara</h2></div>
        <div class="rail-viewport"><div class="rail-track">${cards}</div></div>
      </section>`;
  }

  /* ---- Immersive hero stage ---------------------------------------------
   *  The featured video streams muted + looping behind designed headline
   *  copy. Interactive: pointer parallax on the copy, a live sound toggle,
   *  and a "watch full video" action. When the library is empty we show a
   *  genuine invitation instead. All vanilla — the video is a real <video>
   *  pointed at the same /stream endpoint the watch page uses.
   * ----------------------------------------------------------------------- */

  function renderHeroStage(video, libraryCount) {
    if (!video) {
      stage.classList.add('stage-blank');
      stage.innerHTML = `
        <div class="stage-empty">
          <span class="stage-eyebrow">Your streaming platform</span>
          <h1 class="stage-headline">Nothing is streaming yet.</h1>
          <p class="stage-sub">Upload your first video and it takes over this stage — playing right here on the home page.</p>
          <a href="${loggedIn ? '/upload.html' : '/register.html'}" class="btn btn-light btn-lg">
            ${loggedIn ? 'Upload a video' : 'Create an account'}
          </a>
        </div>`;
      return;
    }

    const poster = video.thumbnail_path ? `/uploads/thumbnails/${video.thumbnail_path}` : '';
    const streamSrc = `/api/videos/${video.id}/stream`;
    const countLabel = libraryCount === 1 ? '1 video' : `${libraryCount} videos`;

    stage.innerHTML = `
      <div class="stage-bg">
        <video class="stage-video" id="stage-video" ${poster ? `poster="${poster}"` : ''}
               muted loop playsinline preload="metadata">
          <source src="${streamSrc}" type="video/mp4">
        </video>
        <div class="stage-scrim"></div>
        <div class="stage-grain"></div>
      </div>

      <div class="stage-inner">
        <div class="stage-copy" id="stage-copy">
          <span class="stage-eyebrow">Now featured on Vistara</span>
          <h1 class="stage-headline">${escapeHtml(video.title)}</h1>
          <p class="stage-sub">
            ${video.description
              ? escapeHtml(truncate(video.description, 140))
              : `Streaming now from ${escapeHtml(video.uploader_name || 'the library')}. Your own platform, ${countLabel} and counting.`}
          </p>
          <div class="stage-actions">
            <a href="/watch.html?id=${video.id}" class="btn btn-light btn-lg stage-play">
              ${icons.play} Watch full video
            </a>
            <a href="/browse.html" class="btn btn-ghost-light btn-lg">Browse library</a>
          </div>
          <div class="stage-meta">
            <span>${escapeHtml(video.uploader_name || 'Unknown')}</span>
            <span class="stage-dot"></span>
            <span>${formatViews(video.views)} views</span>
            <span class="stage-dot"></span>
            <span>${escapeHtml(video.category || 'Uncategorized')}</span>
          </div>
        </div>
      </div>

      <button class="stage-sound" id="stage-sound" aria-label="Unmute preview" title="Unmute preview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
        <span>Sound off</span>
      </button>`;

    wireStage();
  }

  /** Autoplay the muted preview, pointer parallax, and the sound toggle. */
  function wireStage() {
    const video = document.getElementById('stage-video');
    const copy = document.getElementById('stage-copy');
    const soundBtn = document.getElementById('stage-sound');

    if (video) {
      // Muted autoplay is allowed by browsers; ignore the promise rejection
      // that some browsers throw if it's blocked (poster still shows).
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      video.classList.add('is-loading');
      video.addEventListener('canplay', () => video.classList.remove('is-loading'), { once: true });
    }

    // Pointer parallax — copy drifts slightly opposite the cursor
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (copy && !reduce) {
      stage.addEventListener('pointermove', (e) => {
        const r = stage.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        copy.style.transform = `translate3d(${dx * -14}px, ${dy * -10}px, 0)`;
      });
      stage.addEventListener('pointerleave', () => { copy.style.transform = ''; });
    }

    if (video && soundBtn) {
      soundBtn.addEventListener('click', () => {
        video.muted = !video.muted;
        if (!video.muted) { video.play().catch(() => {}); }
        soundBtn.classList.toggle('is-on', !video.muted);
        soundBtn.querySelector('span').textContent = video.muted ? 'Sound off' : 'Sound on';
        soundBtn.setAttribute('aria-label', video.muted ? 'Unmute preview' : 'Mute preview');
      });
    }
  }

  function truncate(s, n) {
    s = String(s).trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }
});
