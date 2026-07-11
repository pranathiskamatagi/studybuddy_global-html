const reportBtn = document.getElementById("reportBtn");
const blockBtn = document.getElementById("blockBtn");
const closeBtn = document.querySelector(".close-btn");

reportBtn.onclick = () => {

const reason = prompt(
"Why are you reporting this user?\n\nExamples:\nSpam\nHarassment\nFake Profile"
);

if(reason){

alert("Thank you.\nYour report has been submitted.");

}

}

blockBtn.onclick = () => {

const confirmBlock = confirm(
"Are you sure you want to block this user?"
);

if(confirmBlock){

alert("User Blocked Successfully.");

}

}

closeBtn.onclick=()=>{

window.history.back();

}