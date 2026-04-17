document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  btn.disabled = true;
  btn.textContent = 'Prijava...';
  errorMsg.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      window.location.href = '/';
    } else {
      errorMsg.textContent = data.error || 'Greška pri prijavi.';
    }
  } catch (err) {
    errorMsg.textContent = 'Greška pri konekciji.';
  }

  btn.disabled = false;
  btn.textContent = 'Prijavi se';
});
