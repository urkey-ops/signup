const API_URL = "/api/signup";

// Array to hold multiple selected slots
let selectedSlots = [];

// --- Helper for message display ---
function showMessage(elementId, message, isError) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = isError ? "msg-box error" : "msg-box success";
    el.style.display = message ? "block" : "none";
}

// --- Update floating button ---
function updateFloatingButton() {
    const btnContainer = document.getElementById("floatingSignupBtnContainer");
    const btn = document.getElementById("floatingSignupBtn");
    const count = selectedSlots.length;
    
    if (count > 0) {
        btnContainer.style.display = "block";
        btn.textContent = `Continue to Sign Up (${count} Slot${count > 1 ? 's' : ''} Selected)`;
    } else {
        btnContainer.style.display = "none";
    }
}

// --- Toggle slot selection ---
function toggleSlot(date, slotLabel, rowId, buttonElement) {
    const existingIndex = selectedSlots.findIndex(slot => slot.id === rowId);
    
    if (existingIndex > -1) {
        // Remove slot
        selectedSlots.splice(existingIndex, 1);
        buttonElement.classList.remove("slot-btn-selected");
    } else {
        // Add slot
        selectedSlots.push({
            id: rowId,
            date: date,
            label: slotLabel
        });
        buttonElement.classList.add("slot-btn-selected");
    }
    
    updateFloatingButton();
}

// --- Navigation Functions ---
function backToSlotSelection() {
    document.getElementById("signupSection").style.display = "none";
    document.getElementById("slotsDisplay").style.display = "block";
    document.getElementById("floatingSignupBtnContainer").style.display = "block";
}

function resetPage() {
    selectedSlots = [];
    document.getElementById("successMessage").style.display = "none";
    document.getElementById("loadingMsg").style.display = "block";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    loadSlots();
}

// --- Core Logic ---

async function loadSlots() {
    document.getElementById("loadingMsg").textContent = "Loading available slots...";
    document.getElementById("loadingMsg").style.display = "block";
    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("signupSection").style.display = "none";

    try {
        const res = await fetch(API_URL);
        
        if (!res.ok) {
            document.getElementById("loadingMsg").textContent = `Error: Failed to fetch available slots. Server responded with status ${res.status}.`;
            console.error(`API Call failed with status: ${res.status}`);
            return;
        }

        const data = await res.json();
        
        if (!data.ok) {
            document.getElementById("loadingMsg").textContent = `Error: API reported failure. Details: ${data.error}`;
            return;
        }

        // Access the 'dates' object from the response
        const groupedSlotsByDate = data.dates || {};
        
        let html = "";
        const sortedDates = Object.keys(groupedSlotsByDate).sort();
        const datesContainer = document.getElementById("datesContainer");

        if (sortedDates.length === 0) {
            html = "<p>No available slots at this time. Please check back later!</p>";
            datesContainer.innerHTML = html;
        } else {
            sortedDates.forEach(date => {
                const dateSlots = groupedSlotsByDate[date];
                
                // Filter slots that are actually available (> 0) for this date
                const availableSlotsForDate = dateSlots.filter(slot => slot.available > 0);
                
                if (availableSlotsForDate.length > 0) {
                    html += `
                        <div class="date-section">
                            <h4>📅 ${date}</h4>
                            <div class="slot-buttons">
                    `;
                    
                    availableSlotsForDate.forEach(slot => {
                        const isSelected = selectedSlots.some(s => s.id === slot.id);
                        const selectedClass = isSelected ? 'slot-btn-selected' : '';
                        
                        html += `
                            <button class="btn secondary-btn ${selectedClass}" 
                                    id="slot-btn-${slot.id}"
                                    onclick="toggleSlot('${slot.date}', '${slot.slotLabel}', ${slot.id}, this)">
                                ${slot.slotLabel} (${slot.available} available)
                            </button>
                        `;
                    });
                    html += `
                            </div>
                        </div>
                    `;
                }
            });
            
            if (html === "") {
                 datesContainer.innerHTML = "<p>No available slots at this time. Please check back later!</p>";
            } else {
                 datesContainer.innerHTML = html;
            }
        }

        document.getElementById("loadingMsg").style.display = "none";
        document.getElementById("slotsDisplay").style.display = "block";
        updateFloatingButton();

    } catch (err) {
        document.getElementById("loadingMsg").textContent = "An error occurred while connecting to the server. Check console for details.";
        console.error("Load Slots Catch Error:", err);
    }
}

// Function to show signup form with selected slots summary
function showSignupForm() {
    if (selectedSlots.length === 0) {
        alert("Please select at least one time slot.");
        return;
    }

    // Display selected slots summary
    const summaryEl = document.getElementById('selectedSlotSummary');
    let summaryHTML = `<strong>📋 You Are Booking ${selectedSlots.length} Slot${selectedSlots.length > 1 ? 's' : ''}:</strong><br><br>`;
    
    // Group by date for better display
    const slotsByDate = {};
    selectedSlots.forEach(slot => {
        if (!slotsByDate[slot.date]) {
            slotsByDate[slot.date] = [];
        }
        slotsByDate[slot.date].push(slot.label);
    });
    
    Object.keys(slotsByDate).sort().forEach(date => {
        summaryHTML += `<div class="selected-slot-item">`;
        summaryHTML += `📅 <strong>${date}</strong><br>`;
        summaryHTML += `🕰️ ${slotsByDate[date].join(', ')}`;
        summaryHTML += `</div>`;
    });
    
    summaryEl.innerHTML = summaryHTML;

    // Show signup form and hide slots display
    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    document.getElementById("signupSection").style.display = "block";
    showMessage("signupMsg", "", false);
}

async function submitSignup() {
    const name = document.getElementById("nameInput").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const phone = document.getElementById("phoneInput").value.trim();
    const notes = document.getElementById("notesInput").value.trim();

    if (!name || !email) { 
        showMessage("signupMsg", "Please fill in all required fields (Name and Email).", true);
        return;
    }

    if (selectedSlots.length === 0) {
        showMessage("signupMsg", "Error: No slots selected.", true);
        return;
    }

    showMessage("signupMsg", "Submitting your booking...", false);
    document.getElementById("submitSignupBtn").disabled = true;

    // Extract slot IDs for backend
    const slotIds = selectedSlots.map(slot => slot.id);

    const signupData = {
        name,
        email,
        phone,
        notes,
        slotIds: slotIds
    };

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(signupData)
        });
        
        const data = await res.json();
        
        if (data.ok) {
            // Build confirmation message
            let confirmationHTML = `Thank you, <strong>${name}</strong>! Your spot${selectedSlots.length > 1 ? 's have' : ' has'} been reserved for:<br><br>`;
            
            const slotsByDate = {};
            selectedSlots.forEach(slot => {
                if (!slotsByDate[slot.date]) {
                    slotsByDate[slot.date] = [];
                }
                slotsByDate[slot.date].push(slot.label);
            });
            
            Object.keys(slotsByDate).sort().forEach(date => {
                confirmationHTML += `📅 <strong>${date}</strong><br>`;
                confirmationHTML += `🕰️ ${slotsByDate[date].join(', ')}<br><br>`;
            });
            
            document.getElementById("signupSection").style.display = "none";
            document.getElementById("confirmationDetails").innerHTML = confirmationHTML;
            document.getElementById("successMessage").style.display = "block";
            
            // Clear form and selections
            document.getElementById("nameInput").value = "";
            document.getElementById("emailInput").value = "";
            document.getElementById("phoneInput").value = "";
            document.getElementById("notesInput").value = "";
            selectedSlots = [];
            document.getElementById("submitSignupBtn").disabled = false;
        } else {
            showMessage("signupMsg", data.error || "Booking failed. Please try again.", true);
            document.getElementById("submitSignupBtn").disabled = false;
        }
    } catch (err) {
        showMessage("signupMsg", "Failed to connect to the server for booking.", true);
        document.getElementById("submitSignupBtn").disabled = false;
        console.error("Submit signup error:", err);
    }
}

// --- Lookup Bookings Function ---
async function lookupBookings() {
    const email = document.getElementById("lookupEmail").value.trim();
    const displayEl = document.getElementById("userBookingsDisplay");

    if (!email) {
        displayEl.innerHTML = '<p class="msg-box error">Please enter an email address.</p>';
        return;
    }

    displayEl.innerHTML = '<p>Searching for your bookings...</p>';

    try {
        const res = await fetch(`${API_URL}?email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (!data.ok) {
            displayEl.innerHTML = `<p class="msg-box error">Error: ${data.error}</p>`;
            return;
        }

        const bookings = data.bookings || [];

        if (bookings.length === 0) {
            displayEl.innerHTML = '<p class="msg-box">No bookings found for this email address.</p>';
            return;
        }

        // Display bookings
        let html = '<div class="bookings-list">';
        bookings.forEach(booking => {
            html += `
                <div class="booking-item" style="margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background: #f9f9f9;">
                    <strong>📅 ${booking.date}</strong> at <strong>🕰️ ${booking.slotLabel}</strong><br>
                    <small>Name: ${booking.name}</small><br>
                    ${booking.phone ? `<small>Phone: ${booking.phone}</small><br>` : ''}
                    ${booking.notes ? `<small>Notes: ${booking.notes}</small><br>` : ''}
                    <button onclick="cancelBooking(${booking.signupRowId}, ${booking.slotRowId}, '${booking.date}', '${booking.slotLabel}')" 
                            class="btn secondary-btn" style="margin-top: 8px; background: #f44336; color: white;">
                        Cancel This Booking
                    </button>
                </div>
            `;
        });
        html += '</div>';
        displayEl.innerHTML = html;

    } catch (err) {
        displayEl.innerHTML = '<p class="msg-box error">Failed to lookup bookings. Please try again.</p>';
        console.error("Lookup error:", err);
    }
}

// --- Cancel Booking Function ---
async function cancelBooking(signupRowId, slotRowId, date, slotLabel) {
    if (!confirm(`Are you sure you want to cancel your booking for ${date} at ${slotLabel}?`)) {
        return;
    }

    try {
        const res = await fetch(API_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signupRowId, slotRowId })
        });

        const data = await res.json();

        if (data.ok) {
            alert(data.message || "Booking cancelled successfully!");
            // Refresh the bookings list
            lookupBookings();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (err) {
        alert("Failed to cancel booking. Please try again.");
        console.error("Cancel error:", err);
    }
}

// Start loading slots when the page loads
document.addEventListener('DOMContentLoaded', loadSlots);
