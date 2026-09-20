document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('video-grid');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const chipsBar = document.getElementById('category-filter');
  const clearBtn = document.getElementById('search-clear');
  const resultBar = document.getElementById('result-bar');

  let debounceTimer = null;
  let activeCategory = 'All';

  // Seed search box from a ?search= link (e.g. the footer category links)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('search')) searchInput.value = urlParams.get('search');
  const urlCategory = urlParams.get('category');

  const syncClearBtn = () => clearBtn.classList.toggle('hidden', !searchInput.value);
  syncClearBtn();

  // --- Build category chips from the API ---
  try {
    const catData = await api.get('/videos/categories');
    const categories = (catData.categories || []).filter(Boolean);

    categories.forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.dataset.category = cat;
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', 'false');
      chip.textContent = cat;
      chipsBar.appendChild(chip);
    });

    // Honor ?category= from the URL if it exists
    if (urlCategory && categories.includes(urlCategory)) {
      activeCategory = urlCategory;
    }
  } catch (err) {
    // Non-critical — the "All" chip still works.
  }

  // --- Chip click handling (event delegation) ---
  chipsBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    activeCategory = chip.dataset.category;
    paintActiveChip();
    loadVideos();
  });

  function paintActiveChip() {
    chipsBar.querySelectorAll('.chip').forEach(c => {
      const on = c.dataset.category === activeCategory;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-selected', String(on));
    });
  }

  // --- Load videos for the current search + category ---
  async function loadVideos() {
    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');
    renderSkeletons(grid, 8);

    try {
      const params = new URLSearchParams();
      const search = searchInput.value.trim();
      if (search) params.set('search', search);
      if (activeCategory && activeCategory !== 'All') params.set('category', activeCategory);

      const data = await api.get(`/videos?${params.toString()}`);
      const videos = data.videos || [];

      if (videos.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        resultBar.textContent = '';
      } else {
        grid.innerHTML = videos.map(createVideoCardHTML).join('');
        resultBar.innerHTML = renderResultLabel(videos.length, search, activeCategory);
      }
    } catch (err) {
      grid.innerHTML = '<div class="alert alert-error">Failed to load videos. Please try again.</div>';
      resultBar.textContent = '';
    }
  }

  function renderResultLabel(count, search, category) {
    const n = `<strong>${count}</strong> ${count === 1 ? 'video' : 'videos'}`;
    let suffix = '';
    if (search) suffix += ` for “${escapeHtml(search)}”`;
    if (category && category !== 'All') suffix += ` in ${escapeHtml(category)}`;
    return n + suffix;
  }

  searchInput.addEventListener('input', () => {
    syncClearBtn();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadVideos, 350);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    syncClearBtn();
    searchInput.focus();
    loadVideos();
  });

  paintActiveChip();
  loadVideos();
});
