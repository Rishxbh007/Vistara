document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  if (isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('login-alert');
  const submitBtn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Client-side validation
    if (!email) {
      alertBox.innerHTML = '<div class="alert alert-error">Please enter your email address</div>';
      return;
    }
    if (!password) {
      alertBox.innerHTML = '<div class="alert alert-error">Please enter your password</div>';
      return;
    }

    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      const data = await api.post('/auth/login', { email, password });
      setToken(data.token);
      setCurrentUser(data.user);
      showToast('Welcome back, ' + data.user.name + '!');
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.href = (next && next.startsWith('/')) ? next : '/';
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
});
