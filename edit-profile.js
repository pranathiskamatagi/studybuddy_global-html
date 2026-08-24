document.addEventListener('DOMContentLoaded', () => {

  const STORAGE_KEY = 'studybuddy_profile';

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
  const languages = [
    'English','Spanish','French','German','Hindi','Mandarin Chinese','Arabic','Portuguese','Russian','Japanese',
    'Korean','Italian','Bengali','Punjabi','Urdu','Vietnamese','Turkish','Swahili','Tamil','Telugu',
  ];

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
  const languageSelect = document.getElementById('language');
  fillSelect(countrySelect, countries);
  fillSelect(gradeSelect, grades);
  fillSelect(languageSelect, languages);

  // ---------------------------------------------------------------
  // Load whatever was saved before (if anything), otherwise fall back
  // to the same defaults profile.js originally showed.
  // ---------------------------------------------------------------
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const current = saved || {
    fullname: 'Pranathi K',
    country: 'India',
    grade: 'Grade 10',
    language: 'English',
    bio: "Passionate about learning new things and helping others understand tricky topics.",
  };

  document.getElementById('fullname').value = current.fullname;
  countrySelect.value = current.country;
  gradeSelect.value = current.grade;
  languageSelect.value = current.language;
  document.getElementById('bio').value = current.bio;

  // ---------------------------------------------------------------
  // Live character counter for the bio field
  // ---------------------------------------------------------------
  const bioInput = document.getElementById('bio');
  const charCountEl = document.getElementById('char-count');

  function updateCharCount() {
    charCountEl.textContent = `${bioInput.value.length}/160`;
  }
  updateCharCount(); // run once immediately so it's correct on page load, not just after typing
  bioInput.addEventListener('input', updateCharCount);

  // ---------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------
  document.getElementById('edit-form').addEventListener('submit', (event) => {
    event.preventDefault();

    const updatedProfile = {
      fullname: document.getElementById('fullname').value.trim() || current.fullname,
      country: countrySelect.value,
      grade: gradeSelect.value,
      language: languageSelect.value,
      bio: bioInput.value.trim(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfile));
    alert('Profile updated!');
    window.location.href = 'profile.html';
  });

});
