const API_URL = "/signup"; // FIX: Corrected API path to match your 'signup.js' back-end file

// Global variables to hold the selected slot data
let selectedDate = null;
let selectedSlotLabel = null;
let selectedRowId = null;

// --- Helper for message display ---
function showMessage(elementId, message, isError) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = isError ? "msg-box error" : "msg-box success";
}

// --- Navigation Functions ---
function resetSelection() {
    document.getElementById("signupSection").style.display = "none";
    document.getElementById("slotsDisplay").style.display = "block";
    document.getElementById("selectedSlotSummary").style.display = 'none'; 
}

function resetPage() {
    document.getElementById("successMessage").style.display = "none";
    document.getElementById("loadingMsg").style.display = "block";
    loadSlots();
}

// --- Core Logic ---

async function loadSlots() {
    document.getElementById("loadingMsg").textContent = "Loading available slots...";
    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("signupSection").style.display = "none";

    try {
        const res = await fetch(API_URL);
        
        if (!res.ok) {
            document.getElementById("loadingMsg").textContent = `Error: Failed to fetch available slots. Server responded with status ${res.status} at ${API_URL}.`;
            console.error(`API Call failed with status: ${res.status}`);
            return;
        }

        const data = await res.json();
        
        if (!data.ok) {
            document.getElementById("loadingMsg").textContent = `Error: API reported failure. Details: ${data.error}`;
            return;
        }

        // Access the 'dates' object from the response (based on your back-end code)
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
                        html += `
                            <button class="btn secondary-btn" 
                                    onclick="showSignupForm('${slot.date}', '${slot.slotLabel}', ${slot.id})">
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

    } catch (err) {
        document.getElementById("loadingMsg").textContent = "An error occurred while connecting to the server. Check console for details.";
        console.error("Load Slots Catch Error:", err);
    }
}

// Function to handle the selection and open the signup form
function showSignupForm(date, slotLabel, rowId) {
    selectedDate = date;
    selectedSlotLabel = slotLabel;
    selectedRowId = rowId;

    // Display Slot Summary 
    const summaryEl = document.getElementById('selectedSlotSummary');
    summaryEl.innerHTML = `
        ✅ **You Are Booking:**
        <br>
        📅 Date: **${date}**
        <br>
        🕰️ Time: **${slotLabel}**
    `;
    summaryEl.style.display = 'block';

    // Show the signup form and hide the slots display
    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("signupSection").style.display = "block";
    document.getElementById("submitSignupBtn").disabled = false;
    showMessage("signupMsg", "", false);
}

async function submitSignup() {
    const name = document.getElementById("nameInput").value;
    const email = document.getElementById("emailInput").value;
    const phone = document.getElementById("phoneInput").value;

    if (!name || !email) { 
        showMessage("signupMsg", "Please fill in all required fields (Name and Email).", true);
        return;
    }

    if (!selectedRowId) {
        showMessage("signupMsg", "Error: No slot selected.", true);
        return;
    }

    showMessage("signupMsg", "Submitting your booking...", false);
    document.getElementById("submitSignupBtn").disabled = true;

    // Send slotIds as an array, as the back-end POST handler expects it.
    const signupData = {
        name,
        email,
        phone,
        slotIds: [selectedRowId] 
    };

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(signupData)
        });
        
        const data = await res.json();
        
        if (data.ok) {
            document.getElementById("signupSection").style.display = "none";
            document.getElementById("confirmationDetails").innerHTML = `
                Thank you, **${name}**! Your spot has been reserved for:
                <br><br>
                📅 **${selectedDate}** at 🕰️ **${selectedSlotLabel}**.
            `;
            document.getElementById("successMessage").style.display = "block";
            // Clear input fields
            document.getElementById("nameInput").value = "";
            document.getElementById("emailInput").value = "";
            document.getElementById("phoneInput").value = "";
        } else {
            showMessage("signupMsg", data.error || "Booking failed. Please try again.", true);
            document.getElementById("submitSignupBtn").disabled = false;
        }
    } catch (err) {
        showMessage("signupMsg", "Failed to connect to the server for booking.", true);
        document.getElementById("submitSignupBtn").disabled = false;
    }
}

// Start loading slots when the page loads
document.addEventListener('DOMContentLoaded', loadSlots);
