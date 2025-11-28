const API_URL = "/api/signup";
// CHANGE 1: Use an Array to track multiple selected slots
let selectedSlots = []; 

// Helper function to update the list of selected slots in the payload
function updateSelectedSlots(slotId, date, label, isChecked) {
    const slotData = { id: slotId, date: date, label: label };
    
    if (isChecked) {
        // Add the slot if it's checked and not already in the array
        if (!selectedSlots.some(s => s.id === slotId)) {
            selectedSlots.push(slotData);
        }
    } else {
        // Remove the slot if it's unchecked
        selectedSlots = selectedSlots.filter(s => s.id !== slotId);
    }

    // Show/hide the form based on how many slots are selected
    document.getElementById("signupForm").style.display = selectedSlots.length > 0 ? "block" : "none";
    
    // Optional: Scroll to the form if the first slot is selected
    if (selectedSlots.length === 1 && isChecked) {
        document.getElementById("signupForm").scrollIntoView({ behavior: "smooth" });
    }
}


// Fetch and display slots grouped by date
async function loadSlots() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    
    if (!data.ok) {
      document.getElementById("datesContainer").innerHTML = "<p>Failed to load slots</p>";
      return;
    }

    // Reset the selected slots array on refresh
    selectedSlots = [];
    document.getElementById("signupForm").style.display = "none";
    
    const dates = data.dates;
    const container = document.getElementById("datesContainer");
    container.innerHTML = "";

    // Sort dates
    const sortedDates = Object.keys(dates).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA - dateB;
    });

    if (sortedDates.length === 0) {
      container.innerHTML = "<p>No dates available yet. Please check back later.</p>";
      return;
    }

    sortedDates.forEach(date => {
      const dateCard = document.createElement("div");
      dateCard.className = "date-card";
      
      const dateHeader = document.createElement("h3");
      dateHeader.textContent = date;
      dateCard.appendChild(dateHeader);

      const slotsGrid = document.createElement("div");
      slotsGrid.className = "slots-grid";

      dates[date].forEach(slot => {
        const disabled = slot.available <= 0;
        const slotDiv = document.createElement("div");
        slotDiv.className = `slot ${disabled ? "disabled" : ""}`;
        
        const label = document.createElement("label");
        label.style.cursor = disabled ? "not-allowed" : "pointer";
        label.style.display = "block";
        
        const input = document.createElement("input");
        // CHANGE 2: Use checkbox instead of radio
        input.type = "checkbox";
        // CHANGE 3: Remove input.name = "slot" to allow multiple selections
        input.value = slot.id;
        input.disabled = disabled;
        
        // CHANGE 4: Update logic to handle multiple selections
        input.onchange = (e) => {
          if (e.target.checked) {
            slotDiv.classList.add("selected");
          } else {
            slotDiv.classList.remove("selected");
          }
            // Use the new helper function to track state
            updateSelectedSlots(slot.id, slot.date, slot.slotLabel, e.target.checked);
        };
        
        label.appendChild(input);
        label.appendChild(document.createTextNode(" "));
        
        const strong = document.createElement("strong");
        strong.textContent = slot.slotLabel;
        label.appendChild(strong);
        
        const availability = document.createElement("div");
        availability.style.fontSize = "0.9em";
        availability.style.marginTop = "5px";
        
        if (disabled) {
          availability.innerHTML = `<span class="full-badge">FULL</span> (${slot.taken}/${slot.capacity})`;
        } else {
          availability.textContent = `${slot.available} spot${slot.available !== 1 ? 's' : ''} left (${slot.taken}/${slot.capacity})`;
        }
        
        label.appendChild(availability);
        slotDiv.appendChild(label);
        slotsGrid.appendChild(slotDiv);
      });

      dateCard.appendChild(slotsGrid);
      container.appendChild(dateCard);
    });

  } catch (err) {
    console.error("Failed to load slots:", err);
    document.getElementById("datesContainer").innerHTML = "<p>Failed to load slots. Please try again.</p>";
  }
}

loadSlots();

// Submit form
document.getElementById("signupForm").onsubmit = async e => {
  e.preventDefault();
  
  // CHANGE 5: Check the length of the selectedSlots array
  if (selectedSlots.length === 0) {
    alert("Please select one or more time slots");
    return;
  }
  
  // CHANGE 6: Send the entire array of slot IDs to the API
  const payload = {
    slotIds: selectedSlots.map(s => s.id), // Send an array of IDs
    name: document.getElementById("name").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    notes: document.getElementById("notes").value.trim(),
  };
  
  const submitBtn = document.querySelector("#signupForm button");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    const data = await res.json();
    const msgEl = document.getElementById("msg");
    msgEl.textContent = data.ok ? data.message : data.error;
    msgEl.style.color = data.ok ? "green" : "red";
    msgEl.style.background = data.ok ? "#d4edda" : "#f8d7da";
    msgEl.style.border = data.ok ? "1px solid #c3e6cb" : "1px solid #f5c6cb";
    msgEl.style.display = "block";
    
    if (data.ok) {
      document.getElementById("signupForm").reset();
      selectedSlots = []; // Clear the array
      document.getElementById("signupForm").style.display = "none";
      
      // Remove selected class from all checkboxes
      document.querySelectorAll(".slot").forEach(s => s.classList.remove("selected"));
      
      // Refresh slots to show updated availability
      setTimeout(() => {
        loadSlots();
        msgEl.style.display = "none";
      }, 3000);
    }
  } catch (err) {
    console.error("Submission error:", err);
    const msgEl = document.getElementById("msg");
    msgEl.textContent = "Failed to submit. Please try again.";
    msgEl.style.color = "red";
    msgEl.style.background = "#f8d7da";
    msgEl.style.border = "1px solid #f5c6cb";
    msgEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Signup";
  }
};
