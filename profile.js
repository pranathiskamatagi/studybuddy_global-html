document.addEventListener('DOMContentLoaded', ()=>{

  // Animate XP bar fill on load
  setTimeout(()=>{
    document.getElementById('xpFill').style.width = '78%';
  }, 300);

  // ================= EDIT PROFILE MODAL =================
  const modalOverlay = document.getElementById('editModalOverlay');
  const editBtn = document.getElementById('editBtn');
  const editProfileBtn = document.getElementById('editProfileBtn');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  function openModal(){ modalOverlay.classList.add('active'); }
  function closeModal(){ modalOverlay.classList.remove('active'); }

  editBtn.addEventListener('click', openModal);
  editProfileBtn.addEventListener('click', openModal);
  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e)=>{
    if(e.target === modalOverlay) closeModal();
  });

  saveProfileBtn.addEventListener('click', ()=>{
    const newName = document.getElementById('editNameInput').value.trim();
    const newCountry = document.getElementById('editCountryInput').value.trim();
    const newGrade = document.getElementById('editGradeInput').value.trim();
    const newBio = document.getElementById('editBioInput').value.trim();

    if(newName) document.getElementById('profileName').innerText = newName;
    if(newBio) document.getElementById('profileBio').innerText = newBio;

    const metaEl = document.querySelector('.profile-meta');
    if(newCountry || newGrade){
      metaEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${newCountry} · ${newGrade}`;
    }

    // TODO: replace with real API call once Flask backend endpoint is ready, e.g.:
    // fetch('/api/profile/update', {
    //   method: 'PUT',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ name: newName, country: newCountry, grade: newGrade, bio: newBio })
    // });

    closeModal();
  });

  // ================= AVATAR EDIT (placeholder) =================
  const avatarEditBtn = document.getElementById('avatarEditBtn');
  avatarEditBtn.addEventListener('click', ()=>{
    alert('Profile picture upload will connect to your Flask backend later (file upload endpoint needed).');
  });

  // ================= SEE ALL BADGES (placeholder) =================
  const seeAllBadges = document.getElementById('seeAllBadges');
  seeAllBadges.addEventListener('click', ()=>{
    alert('This will open a full badges/achievements page later.');
  });

  // ================= NAV ITEM ROUTING =================
  const navRoutes = {
    0: 'home.html',
    1: 'explore.html',
    2: 'ask.html',
    3: 'chat.html',
    4: 'profile.html'
  };

  document.querySelectorAll('.nav-item').forEach((item, index)=>{
    item.addEventListener('click', ()=>{
      const target = navRoutes[index];
      if(target && target !== 'profile.html'){
        window.location.href = target;
      }
    });
  });

});