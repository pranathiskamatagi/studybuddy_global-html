document.addEventListener('DOMContentLoaded', () => {

  if (!requireLogin()) return;

  const countries = [
    'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
    'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia',
    'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia',
    'Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica',
    'Croatia','Cuba','Cyprus','Czechia','Denmark','Djibouti','Dominica','Dominican Republic','Ecuador','Egypt',
    'El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon',
    'Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti',
    'Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan',
    'Jordan','Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia',
    'Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta',
    'Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro',
    'Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger',
    'Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan','Palau','Palestine','Panama',
    'Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda',
    'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino',
    'Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia',
    'Slovenia','Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan',
    'Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo',
    'Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine',
    'United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu','Vatican City',
    'Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
  ];
  const grades = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`); // builds ['Grade 1', ..., 'Grade 12']

  function fillSelect(select, values) {
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  const countrySelect = document.getElementById('country');
  const gradeSelect = document.getElementById('grade');
  fillSelect(countrySelect, countries);
  fillSelect(gradeSelect, grades);

  // ---------------------------------------------------------------
  // Live character counter for the bio field - set up BEFORE the code
  // below that fills the form, since filling the form calls
  // updateCharCount() immediately (to reflect whatever bio just got
  // loaded in), and calling it before charCountEl exists would throw.
  // ---------------------------------------------------------------
  const bioInput = document.getElementById('bio');
  const charCountEl = document.getElementById('char-count');

  function updateCharCount() {
    charCountEl.textContent = `${bioInput.value.length}/160`;
  }
  updateCharCount(); // run once immediately so it's correct on page load, not just after typing
  bioInput.addEventListener('input', updateCharCount);

  // ---------------------------------------------------------------
  // Load the real profile from the backend (falling back to whatever's
  // cached from login, so the form isn't empty while the request is
  // still in flight).
  // ---------------------------------------------------------------
  const avatarPreview = document.getElementById('avatar-preview');
  let currentPhoto = null; // the data URL we'll actually save, once changed

  function renderAvatar(user) {
    avatarPreview.innerHTML = '';
    if (currentPhoto || user.photo) {
      const img = document.createElement('img');
      img.src = currentPhoto || user.photo;
      img.alt = '';
      avatarPreview.appendChild(img);
    } else {
      avatarPreview.textContent = (user.fullname || 'P').charAt(0).toUpperCase();
    }
  }

  function fillForm(user) {
    document.getElementById('fullname').value = user.fullname || '';
    countrySelect.value = user.country || '';
    gradeSelect.value = user.grade || '';
    bioInput.value = user.bio || '';
    updateCharCount();
    renderAvatar(user);
    renderTeachTags(user.teachesSubjects || []);
  }

  // ---------------------------------------------------------------
  // "Subjects you teach" - a plain, editable list of tags (see
  // profile.py's teachesSubjects), rendered as removable chips.
  // ---------------------------------------------------------------
  let teachSubjects = [];
  const teachTagRow = document.getElementById('teach-tag-row');
  const teachSubjectInput = document.getElementById('teach-subject-input');

  function renderTeachTags(subjects) {
    teachSubjects = subjects.slice();
    teachTagRow.innerHTML = '';
    teachSubjects.forEach((subject) => {
      const chip = document.createElement('span');
      chip.className = 'teach-tag';
      const label = document.createElement('span');
      label.textContent = subject;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'teach-tag-remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        renderTeachTags(teachSubjects.filter((s) => s !== subject));
      });
      chip.append(label, removeBtn);
      teachTagRow.appendChild(chip);
    });
  }

  function addTeachSubject() {
    const value = teachSubjectInput.value.trim();
    if (!value) return;
    if (!teachSubjects.some((s) => s.toLowerCase() === value.toLowerCase())) {
      renderTeachTags([...teachSubjects, value]);
    }
    teachSubjectInput.value = '';
  }

  document.getElementById('add-teach-subject-btn').addEventListener('click', addTeachSubject);
  teachSubjectInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTeachSubject();
    }
  });

  const cachedUser = getStoredUser();
  if (cachedUser) fillForm(cachedUser);

  apiFetch('/profile').then((data) => fillForm(data.user));

  // ---------------------------------------------------------------
  // Photo picker - resized/compressed entirely in the browser (a canvas,
  // not a server call) before it's ever sent anywhere, so even a huge
  // phone photo turns into a small upload.
  // ---------------------------------------------------------------
  let photoChanged = false;

  document.getElementById('avatar-btn').addEventListener('click', () => {
    document.getElementById('photo-input').click();
  });

  document.getElementById('photo-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Shrink to at most 200x200 (keeping the aspect ratio) - plenty
        // for a small circular avatar, and keeps the saved data tiny.
        const MAX_SIZE = 200;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX_SIZE) { height = Math.round((height * MAX_SIZE) / width); width = MAX_SIZE; }
        } else if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        currentPhoto = canvas.toDataURL('image/jpeg', 0.85);
        photoChanged = true;
        renderAvatar({ fullname: document.getElementById('fullname').value, photo: null });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // ---------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------
  document.getElementById('edit-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const body = {
        fullname: document.getElementById('fullname').value.trim(),
        country: countrySelect.value,
        grade: gradeSelect.value,
        bio: bioInput.value.trim(),
        teachesSubjects: teachSubjects,
      };
      // Only included when the person actually picked a new photo this
      // visit - otherwise the backend leaves the existing one untouched.
      if (photoChanged) body.photo = currentPhoto;

      const data = await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      // Keep the cached copy (used by home.js/profile.js for an instant
      // render before their own fresh fetch completes) in sync too.
      localStorage.setItem('studybuddy_user', JSON.stringify(data.user));
      alert('Profile updated!');
      window.location.href = 'profile.html';
    } catch (error) {
      alert(error.message);
      if (submitBtn) submitBtn.disabled = false;
    }
  });

});
