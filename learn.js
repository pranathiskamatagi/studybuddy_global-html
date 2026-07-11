const titles = [
  "Find a Teacher",
  "Matched With Teacher",
  "Live Learning Session",
  "Rate Your Teacher",
  "Session Summary"
];
let current = 0;
const total = titles.length;

function renderDots(){
  document.querySelectorAll('.dot').forEach((d,i)=>{
    d.classList.remove('done','active');
    if(i < current) d.classList.add('done');
    if(i === current) d.classList.add('active');
  });
}

function goToScreen(i){
  document.getElementById('screen-'+current).classList.remove('active');
  current = i;
  document.getElementById('screen-'+current).classList.add('active');
  document.getElementById('screenTitle').innerText = titles[current];
  document.getElementById('stepIndicator').innerText = (current+1)+' / '+total;
  renderDots();
  window.scrollTo({top:0, behavior:'smooth'});

  if(current === 4){
    setTimeout(()=>{ document.getElementById('xpFill').style.width = '80%'; }, 300);
  }
}

function prevScreen(){
  if(current > 0){ goToScreen(current-1); }
}

function selectTeacher(name){
  const initials = name.split(' ').map(n=>n[0]).join('');
  document.getElementById('matchedName').innerText = name;
  document.getElementById('matchedInitials').innerText = initials;
  goToScreen(1);
}

function toggleTag(el){
  el.classList.toggle('selected');
}

document.querySelectorAll('#starRow i').forEach(star=>{
  star.addEventListener('click', ()=>{
    const val = parseInt(star.dataset.v);
    document.querySelectorAll('#starRow i').forEach(s=>{
      s.classList.toggle('active', parseInt(s.dataset.v) <= val);
    });
  });
});

function sendMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;

  const chatWindow = document.getElementById('chatWindow');
  const typing = chatWindow.querySelector('.typing-indicator');

  const row = document.createElement('div');
  row.className = 'msg-row me';
  row.innerHTML = `
    <div class="msg-avatar">You</div>
    <div>
      <div class="msg-bubble">${text}</div>
    </div>
  `;
  chatWindow.insertBefore(row, typing);
  input.value = '';
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

document.addEventListener('DOMContentLoaded', ()=>{
  const input = document.getElementById('chatInput');
  if(input){
    input.addEventListener('keypress', (e)=>{
      if(e.key === 'Enter') sendMessage();
    });
  }
});

function goHome(){
  alert('Redirecting to Home screen (connect this to your Home page navigation).');
}

renderDots();