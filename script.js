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
      const disabled = s.available <= 0;
      const slotDiv = document.createElement("div");
      slotDiv.className = "slot";
      
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "slot";
      input.value = s.slotId;
      input.disabled = disabled;
      
      input.onchange = () => {
        selectedSlot = input.value;
        document.getElementById("signupForm").style.display = "block";
      };
      
      label.appendChild(input);
      
      // FIX: Create text nodes instead of using innerHTML
      label.appendChild(document.createTextNode(" "));
      const strong = document.createElement("strong");
      strong.textContent = s.slotLabel;
      label.appendChild(strong);
      label.appendChild(document.createTextNode(` (${s.taken}/${s.capacity}) `));
      
      if (disabled) {
        const fullSpan = document.createElement("span");
        fullSpan.style.color = "red";
        fullSpan.textContent = "FULL";
        label.appendChild(fullSpan);
      }
      
      slotDiv.appendChild(label);
      div.appendChild(slotDiv);
    });
  } catch (err) {
    console.error("Failed to load slots:", err);
    document.getElementById("slots").innerText = "Failed to load slots.";
  }
}

// Helper function to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

loadSlots();

// Submit form
document.getElementById("signupForm").onsubmit = async e => {
  e.preventDefault();
  if (!selectedSlot) return alert("Please select a slot");
  
  const payload = {
    slotId: selectedSlot,
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    notes: document.getElementById("notes").value.trim(),
  };
  
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const msgEl = document.getElementById("msg");
    msgEl.innerText = data.ok ? data.message : data.error;
    msgEl.style.color = data.ok ? "green" : "red";
    
    if (data.ok) {
      document.getElementById("signupForm").reset();
      selectedSlot = null;
      document.getElementById("signupForm").style.display = "none";
      loadSlots(); // Refresh slots to show updated availability
    }
  } catch (err) {
    console.error("Submission error:", err);
    document.getElementById("msg").innerText = "Failed to submit. Try again.";
    document.getElementById("msg").style.color = "red";
  }
};
