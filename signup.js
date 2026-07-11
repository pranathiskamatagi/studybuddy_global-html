document.getElementById('signupForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const termsChecked = document.getElementById('terms').checked;

  if (!fullName || !email || !password || !confirmPassword) {
    alert('Please fill in all fields');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match');
    return;
  }

  if (!termsChecked) {
    alert('Please agree to the Terms & Privacy Policy');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Creating account...';
  submitBtn.disabled = true;

  try {
    const response = await fetch('http://127.0.0.1:5000/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        full_name: fullName,
        email: email,
        password: password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Something went wrong. Please try again.');
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      return;
    }

    localStorage.setItem('studybuddy_token', data.access_token);
    localStorage.setItem('studybuddy_user', JSON.stringify(data.user));

    submitBtn.textContent = 'Account created! Redirecting...';

    setTimeout(function () {
      window.location.href = 'login.html';
    }, 1500);

  } catch (error) {
    console.error('Signup error:', error);
    alert('Could not connect to the server. Make sure the backend is running.');
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});
