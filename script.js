const API_URL = "/api/signup";
let selectedSlot = null;

// Fetch slots
async function loadSlots() {
  try {
    const res = await fetch(API_URL);
    const slots = await res.json();
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
        selectedSlot = el.value;
        document.getElementById("signupForm").style.display = "block";
      };
    });
  } catch (err) {
    console.error("Failed to load slots:", err);
    document.getElementById("slots").innerText = "Failed to load slots.";
  }
}

loadSlots();

// Submit form
document.getElementById("signupForm").onsubmit = async e => {
  e.preventDefault();
  if (!selectedSlot) return alert("Please select a slot");

  const payload = {
    slotId: selectedSlot,
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    notes: document.getElementById("notes").value,
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    document.getElementById("msg").innerText = data.ok ? data.message : data.error;
    if (data.ok) document.getElementById("signupForm").reset();
  } catch (err) {
    console.error("Submission error:", err);
    document.getElementById("msg").innerText = "Failed to submit. Try again.";
  }
};
