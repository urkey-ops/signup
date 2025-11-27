const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbw7Xr0WbIYM81C-rc_raJeQ5nzNBOSA1ZcOQb0VVbKH1FCXHsfWGuCu-xl30tAgO_U4gg/exec";
const SECRET = "SECRET_HERE";

let selectedSlot = null;

// Fetch slots
fetch(WEBAPP_URL + "?getSlots=1")
  .then(r => r.json())
  .then(slots => {
    const div = document.getElementById("slots");
    div.innerHTML = "";

    slots.forEach(s => {
      const disabled = s.available <= 0 ? "disabled" : "";
      div.innerHTML += `
        <div class="slot">
          <label>
            <input type="radio" name="slot" value="${s.slotId}" ${disabled}>
            <strong>${s.slotLabel}</strong>
            (${s.taken}/${s.capacity})
            ${s.available <= 0 ? "<span style='color:red'>FULL</span>" : ""}
          </label>
        </div>
      `;
    });

    document.querySelectorAll("input[name=slot]").forEach(el => {
      el.onchange = () => {
        selectedSlot = slots.find(s => s.slotId === el.value);
        document.getElementById("signupForm").style.display = "block";
      };
    });
  });

// Submit form
document.getElementById("signupForm").onsubmit = async (e) => {
  e.preventDefault();

  const payload = {
    secret: SECRET,
    slotId: selectedSlot.slotId,
    slotLabel: selectedSlot.slotLabel,
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    notes: document.getElementById("notes").value,
  };

  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" }
  });

  const data = await res.json();
  document.getElementById("msg").innerText = data.ok ? 
    "Signup completed!" : "Error: " + data.error;
};
