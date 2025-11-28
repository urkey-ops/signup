const API_URL = "/api/signup";
// Use an Array to track multiple selected slots
let selectedSlots = [];

// --- Helper Function: Manages the selection state ---
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

    // Scroll to the form if the first slot is selected
    if (selectedSlots.length === 1 && isChecked) {
        document.getElementById("signupForm").scrollIntoView({ behavior: "smooth" });
    }
}


// --- 1. Load Slots Function (Updated for Mobile-Friendly Click Targets) ---
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

                const input = document.createElement("input");
                input.type = "checkbox";
                input.value = slot.id;
                input.disabled = disabled;
                
                // --- NEW: Handle click on the entire div for better UX ---
                if (!disabled) {
                    slotDiv.onclick = (e) => {
                        // Toggle checkbox state unless the input itself was clicked
                        if (e.target.tagName !== 'INPUT') {
                            input.checked = !input.checked;
                        }

                        // Apply the 'selected' class and update the state
                        if (input.checked) {
                            slotDiv.classList.add("selected");
                        } else {
                            slotDiv.classList.remove("selected");
                        }
                        updateSelectedSlots(slot.id, slot.date, slot.slotLabel, input.checked);
                    };
                }

                // Fallback/direct input change handler
                input.onchange = (e) => {
                    if (e.target.checked) {
                        slotDiv.classList.add("selected");
                    } else {
                        slotDiv.classList.remove("selected");
                    }
                    updateSelectedSlots(slot.id, slot.date, slot.slotLabel, e.target.checked);
                };
                
                // Label structure for presentation
                const label = document.createElement("label");
                label.style.display = "flex";
                label.style.flexDirection = "column";
                label.style.alignItems = "center";
                label.style.justifyContent = "center";
                label.style.pointerEvents = "none"; // Important: prevents double-triggering

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
                
                // Append the hidden input and the label content to the slot div
                slotDiv.appendChild(input);
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


// --- 2. Submit Form Function ---
document.getElementById("signupForm").onsubmit = async e => {
    e.preventDefault();

    if (selectedSlots.length === 0) {
        alert("Please select one or more time slots");
        return;
    }

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
            selectedSlots = [];
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


// --- 3. Booking Lookup and Cancellation Functions ---
/**
 * Sends the user's email to the backend to retrieve their bookings.
 */
async function lookupBookings() {
    const email = document.getElementById("lookupEmail").value.trim();
    const displayEl = document.getElementById("userBookingsDisplay");

    if (!email) {
        displayEl.innerHTML = '<p style="color: red;">Please enter your email address.</p>';
        return;
    }

    displayEl.innerHTML = '<p>Loading your bookings...</p>';

    try {
        // Use GET request with email as a query parameter
        const res = await fetch(`${API_URL}?email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (!data.ok) {
            displayEl.innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
            return;
        }

        renderUserBookings(data.bookings);

    } catch (err) {
        console.error("Lookup error:", err);
        displayEl.innerHTML = '<p style="color: red;">Failed to retrieve bookings.</p>';
    }
}

/**
 * Renders the fetched bookings into a table for the user.
 * @param {Array} bookings - The array of booking objects from the API.
 */
function renderUserBookings(bookings) {
    const displayEl = document.getElementById("userBookingsDisplay");

    if (bookings.length === 0) {
        displayEl.innerHTML = '<p>No signups found for this email address.</p>';
        return;
    }

    // Sort bookings by date
    bookings.sort((a, b) => new Date(a.date) - new Date(b.date));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '<h3>Your Confirmed Signups:</h3><table class="slots-table">';
    html += '<thead><tr><th>Status</th><th>Date</th><th>Time Slot</th><th>Action</th></tr></thead><tbody>';

    bookings.forEach(booking => {
        const bookingDate = new Date(booking.date);
        bookingDate.setHours(0, 0, 0, 0);

        // Determine status (Past or Future/Cancellable)
        const isPast = bookingDate < today;
        const status = isPast ? '<span style="color: gray;">Past</span>' : '<span style="color: var(--success-color); font-weight: bold;">Future</span>';

        html += `
            <tr>
                <td>${status}</td>
                <td>${booking.date}</td>
                <td>${booking.slotLabel}</td>
                <td>
                    ${isPast ? '—' : `<button onclick="cancelBooking(${booking.id}, ${booking.slotRowId})" class="btn-cancel">Cancel</button>`}
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    displayEl.innerHTML = html;
}

/**
 * Sends a PATCH request to the backend to cancel a specific booking.
 * @param {number} signupRowId - The row ID in the 'Signups' sheet.
 * @param {number} slotRowId - The row ID in the 'Slots' sheet (to decrement capacity).
 */
async function cancelBooking(signupRowId, slotRowId) {
    if (!confirm("Are you sure you want to cancel this slot?")) return;

    const displayEl = document.getElementById("userBookingsDisplay");
    displayEl.innerHTML = '<p>Processing cancellation...</p>';

    const payload = {
        signupRowId: signupRowId,
        slotRowId: slotRowId
    };

    try {
        const res = await fetch(API_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.ok) {
            displayEl.innerHTML = `<p style="color: green; font-weight: bold;">${data.message}</p>`;
            // Refresh the display after successful cancellation
            await lookupBookings();
            loadSlots(); // Refresh main slots view to reflect new availability
        } else {
            displayEl.innerHTML = `<p style="color: red;">Cancellation failed: ${data.error}</p>`;
        }
    } catch (err) {
        console.error("Cancellation submission error:", err);
        displayEl.innerHTML = '<p style="color: red;">Failed to process cancellation.</p>';
    }
}


// Initial load
loadSlots();
