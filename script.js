
const WEBAPP_URL = "WEBAPP_URL_HERE"; // <-- REPLACE with your Apps Script Web App URL (see README below)
const SECRET = "SECRET_HERE";         // <-- REPLACE with the same secret string you set in Apps Script
const DAYS_TO_SHOW = 14;             // number of consecutive days to offer (change as needed)
const timeSlots = [
  "10am-12pm",
  "12pm-2pm",
  "2pm-4pm",
  "4pm-6pm"
];
// ======================================

/* Utility: format date as YYYY-MM-DD and readable label */
function isoDate(d){ return d.toISOString().split("T")[0]; }
function prettyDate(d){
  // Example: Tue, Dec 2
  return d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
}

/* Build date list */
function generateDates(n){
  const a = [];
  const today = new Date();
  // start from today (change to offset if you want to skip today)
  for(let i=0;i<n;i++){
    const d = new Date(today);
    d.setDate(today.getDate()+i);
    a.push(d);
  }
  return a;
}

/* Render UI */
function renderDates(){
  const container = document.getElementById('datesSection');
  const dates = generateDates(DAYS_TO_SHOW);
  container.innerHTML = '';

  dates.forEach(d => {
    const iso = isoDate(d);
    const card = document.createElement('div');
    card.className = 'date-card';

    const left = document.createElement('div');
    left.className = 'date-left';
    left.innerHTML = `<div class="date-title">${prettyDate(d)}</div><div class="muted">${iso}</div>`;

    const slotsWrap = document.createElement('div');
    slotsWrap.className = 'slots';
    timeSlots.forEach(slot => {
      const id = `cb_${iso}_${slot.replace(/\s|:/g,'')}`;
      const label = document.createElement('label');
      label.className = 'slot';
      label.innerHTML = `<input id="${id}" type="checkbox" data-date="${iso}" data-slot="${slot}" /> <span>${slot}</span>`;
      slotsWrap.appendChild(label);
    });

    card.appendChild(left);
    card.appendChild(slotsWrap);
    container.appendChild(card);
  });
}

/* Read selections */
function getSelections(){
  const arr = [];
  document.querySelectorAll('input[type="checkbox"][data-date]').forEach(cb=>{
    if(cb.checked){
      arr.push({ date: cb.dataset.date, slot: cb.dataset.slot });
    }
  });
  return arr;
}

/* Submit to Apps Script web app */
async function submitSelections(payload){
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

/* Wiring */
document.addEventListener('DOMContentLoaded', ()=>{
  renderDates();

  const form = document.getElementById('signupForm');
  const msg = document.getElementById('msg');
  const clearBtn = document.getElementById('clearBtn');

  clearBtn.onclick = ()=>{
    document.querySelectorAll('input[type="checkbox"][data-date]').forEach(cb => cb.checked = false);
    msg.textContent = '';
  };

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    msg.textContent = '';

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();

    if(!name || !email){ msg.textContent = 'Please fill name and email.'; return; }

    const selections = getSelections();
    if(selections.length === 0){ msg.textContent = 'Please select at least one date/time slot.'; return; }

    // Prepare payload expected by Apps Script
    const payload = { secret: SECRET, name, email, phone, selections };

    try{
      const result = await submitSelections(payload);
      if(result && result.ok){
        msg.textContent = 'Thank you — your selections were submitted!';
        // Optionally clear form
        form.reset();
        document.querySelectorAll('input[type="checkbox"][data-date]').forEach(cb => cb.checked = false);
      } else {
        msg.textContent = 'Error: ' + (result && result.error ? result.error : 'unknown error');
      }
    } catch(err){
      console.error(err);
      msg.textContent = 'Network error. Could not contact backend.';
    }
  });
});
