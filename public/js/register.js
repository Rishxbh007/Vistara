document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  const form = document.getElementById('register-form');
  const alertBox = document.getElementById('register-alert');
  const submitBtn = document.getElementById('register-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Validation
    if (!name) {
      alertBox.innerHTML = '<div class="alert alert-error">Please enter your name</div>';
      return;
    }
    if (name.length < 2) {
      alertBox.innerHTML = '<div class="alert alert-error">Name must be at least 2 characters</div>';
      return;
    }
    if (!email) {
      alertBox.innerHTML = '<div class="alert alert-error">Please enter your email</div>';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alertBox.innerHTML = '<div class="alert alert-error">Please enter a valid email address</div>';
      return;
    }
    if (!password) {
      alertBox.innerHTML = '<div class="alert alert-error">Please enter a password</div>';
      return;
    }
    if (password.length < 6) {
      alertBox.innerHTML = '<div class="alert alert-error">Password must be at least 6 characters</div>';
      return;
    }
    if (password !== confirmPassword) {
      alertBox.innerHTML = '<div class="alert alert-error">Passwords do not match</div>';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      const data = await api.post('/auth/register', { name, email, password });
      setToken(data.token);
      setCurrentUser(data.user);
      showToast('Account created! Welcome to Vistara.');
      window.location.href = '/';
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
});
