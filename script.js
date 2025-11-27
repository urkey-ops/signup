const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbw7Xr0WbIYM81C-rc_raJeQ5nzNBOSA1ZcOQb0VVbKH1FCXHsfWGuCu-xl30tAgO_U4gg/exec";
const SECRET = "SECRET_HERE";

// ----- CONFIG -----
const timeSlots = [
  "10am-12pm",
  "12pm-2pm",
  "2pm-4pm",
  "4pm-6pm"
];

// Example: Next 14 days
function generateDates(days = 14) {
  const arr = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    arr.push(d.toISOString().split("T")[0]);
  }
  return arr;
}

const dates = generateDates(14);

// Render dates with checkboxes
const div = document.getElementById("dates");

dates.forEach(date => {
  const section = document.createElement("div");
  section.className = "date-block";
  section.innerHTML = `<h3>${date}</h3>`;

  timeSlots.forEach(slot => {
    const id = `${date}-${slot}`;
    section.innerHTML += `
      <label>
        <input type="checkbox" name="slot" data-date="${date}" data-slot="${slot}">
        ${slot}
      </label><br>
    `;
  });

  div.appendChild(section);
});

// Handle form submission
document.getElementById("infoForm").onsubmit = async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const phone = document.getElementById("phone").value;

  const selections = [];
  document.querySelectorAll("input[name='slot']:checked").forEach(cb => {
    selections.push({
      date: cb.dataset.date,
      slot: cb.dataset.slot
    });
  });

  if (selections.length === 0) {
    document.getElementById("msg").innerText = "Please select at least one date/slot.";
    return;
  }

  const payload = {
    secret: SECRET,
    name, email, phone,
    selections
  };

  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" }
  });

  const json = await res.json();
  document.getElementById("msg").innerText = json.ok ?
    "Thank you! Your selections were submitted." :
    "Error: " + json.error;
};
