document.addEventListener('DOMContentLoaded', () => {
  if (!requireLogin()) return;

  const form = document.getElementById('upload-form');
  const alertBox = document.getElementById('upload-alert');
  const submitBtn = document.getElementById('upload-btn');

  // Video file elements
  const videoDropzone = document.getElementById('video-dropzone');
  const videoFileInput = document.getElementById('video-file');
  const videoPreview = document.getElementById('video-preview');
  const videoFileName = document.getElementById('video-file-name');
  const videoFileSize = document.getElementById('video-file-size');
  const videoFileRemove = document.getElementById('video-file-remove');

  // Thumbnail file elements
  const thumbDropzone = document.getElementById('thumb-dropzone');
  const thumbFileInput = document.getElementById('thumb-file');
  const thumbPreview = document.getElementById('thumb-preview');
  const thumbFileName = document.getElementById('thumb-file-name');
  const thumbFileSize = document.getElementById('thumb-file-size');
  const thumbFileRemove = document.getElementById('thumb-file-remove');
  const thumbPreviewImg = document.getElementById('thumb-preview-img');
  let thumbObjectUrl = null;

  // Progress elements
  const progressContainer = document.getElementById('upload-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  let selectedVideoFile = null;
  let selectedThumbFile = null;

  function formatFileSize(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  // --- Video Dropzone ---
  videoDropzone.addEventListener('click', () => videoFileInput.click());

  videoDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    videoDropzone.classList.add('drag-over');
  });

  videoDropzone.addEventListener('dragleave', () => {
    videoDropzone.classList.remove('drag-over');
  });

  videoDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    videoDropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleVideoFile(file);
  });

  videoFileInput.addEventListener('change', () => {
    if (videoFileInput.files[0]) handleVideoFile(videoFileInput.files[0]);
  });

  function handleVideoFile(file) {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/x-matroska'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mkv)$/i)) {
      alertBox.innerHTML = '<div class="alert alert-error">Please select a valid video file (MP4, WebM, or MKV)</div>';
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      alertBox.innerHTML = '<div class="alert alert-error">Video file must be under 500MB</div>';
      return;
    }

    selectedVideoFile = file;
    videoFileName.textContent = file.name;
    videoFileSize.textContent = formatFileSize(file.size);
    videoDropzone.classList.add('hidden');
    videoPreview.classList.remove('hidden');
    alertBox.innerHTML = '';
  }

  videoFileRemove.addEventListener('click', () => {
    selectedVideoFile = null;
    videoFileInput.value = '';
    videoDropzone.classList.remove('hidden');
    videoPreview.classList.add('hidden');
  });

  // --- Thumbnail Dropzone ---
  thumbDropzone.addEventListener('click', () => thumbFileInput.click());

  thumbDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    thumbDropzone.classList.add('drag-over');
  });

  thumbDropzone.addEventListener('dragleave', () => {
    thumbDropzone.classList.remove('drag-over');
  });

  thumbDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    thumbDropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleThumbFile(file);
  });

  thumbFileInput.addEventListener('change', () => {
    if (thumbFileInput.files[0]) handleThumbFile(thumbFileInput.files[0]);
  });

  function handleThumbFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alertBox.innerHTML = '<div class="alert alert-error">Please select a valid image (JPG, PNG, or WebP)</div>';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alertBox.innerHTML = '<div class="alert alert-error">Thumbnail must be under 5MB</div>';
      return;
    }

    selectedThumbFile = file;
    thumbFileName.textContent = file.name;
    thumbFileSize.textContent = formatFileSize(file.size);

    // Live preview of the chosen image
    if (thumbObjectUrl) URL.revokeObjectURL(thumbObjectUrl);
    thumbObjectUrl = URL.createObjectURL(file);
    thumbPreviewImg.src = thumbObjectUrl;

    thumbDropzone.classList.add('hidden');
    thumbPreview.classList.remove('hidden');
    alertBox.innerHTML = '';
  }

  thumbFileRemove.addEventListener('click', () => {
    selectedThumbFile = null;
    thumbFileInput.value = '';
    if (thumbObjectUrl) { URL.revokeObjectURL(thumbObjectUrl); thumbObjectUrl = null; }
    thumbPreviewImg.removeAttribute('src');
    thumbDropzone.classList.remove('hidden');
    thumbPreview.classList.add('hidden');
  });

  // --- Form Submission ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';

    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const category = document.getElementById('category').value;

    // Validate
    if (!selectedVideoFile) {
      alertBox.innerHTML = '<div class="alert alert-error">Please select a video file</div>';
      return;
    }
    if (!title) {
      alertBox.innerHTML = '<div class="alert alert-error">Please enter a video title</div>';
      return;
    }

    // Build FormData
    const formData = new FormData();
    formData.append('video', selectedVideoFile);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('category', category);
    if (selectedThumbFile) {
      formData.append('thumbnail', selectedThumbFile);
    }

    // Show progress
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    progressContainer.classList.add('active');

    try {
      const data = await api.upload('/videos', formData, (percent) => {
        progressFill.style.width = percent + '%';
        progressText.textContent = `Uploading... ${percent}%`;
      });

      progressFill.style.width = '100%';
      progressText.textContent = 'Upload complete!';

      showToast('Video uploaded successfully!');

      // Redirect to watch page after brief delay
      setTimeout(() => {
        window.location.href = `/watch.html?id=${data.video.id}`;
      }, 1000);

    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      progressContainer.classList.remove('active');
      progressFill.style.width = '0%';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload Video';
    }
  });
});
