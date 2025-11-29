const API_URL = "/api/signup";

// Configuration
const CONFIG = {
    MAX_SLOTS_PER_BOOKING: 10,
    API_COOLDOWN: 1000, // 1 second between submissions
    RETRY_DELAY: 3000, // 3 seconds before allowing retry
};

// State management
let selectedSlots = [];
let lastApiCall = 0;
let isSubmitting = false;

// --- Security: Input Sanitization ---
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function sanitizeInput(str, maxLength = 255) {
    if (!str) return '';
    return str
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .substring(0, maxLength);
}

// --- Validation Functions ---
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

function isValidPhone(phone) {
    if (!phone) return true; // Optional field
    return /^[\d\s\-\+\(\)]{7,20}$/.test(phone);
}

// --- Helper for message display ---
function showMessage(elementId, message, isError) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = isError ? "msg-box error" : "msg-box success";
    el.style.display = message ? "block" : "none";
}

// --- Improved Error Messages ---
function getErrorMessage(status, defaultMessage) {
    const errorMessages = {
        400: "Invalid request. Please check your information and try again.",
        401: "Authentication required. Please refresh the page.",
        403: "Access denied. Please contact support.",
        404: "Service not found. Please contact support.",
        409: "This slot was just booked by someone else. Please select another.",
        429: "Too many requests. Please wait a moment and try again.",
        500: "Server error. Please try again in a few moments.",
        503: "Service temporarily unavailable. Please try again later.",
    };
    
    return errorMessages[status] || defaultMessage || "An unexpected error occurred. Please try again.";
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

// --- Toggle slot selection with limit ---
function toggleSlot(date, slotLabel, rowId, element) {
    const existingIndex = selectedSlots.findIndex(slot => slot.id === rowId);
    
    if (existingIndex > -1) {
        // Remove slot
        selectedSlots.splice(existingIndex, 1);
        element.classList.remove("selected");
    } else {
        // Check limit before adding
        if (selectedSlots.length >= CONFIG.MAX_SLOTS_PER_BOOKING) {
            alert(`You can only select up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots at a time. Please complete your current booking first.`);
            return;
        }
        
        // Add slot
        selectedSlots.push({
            id: rowId,
            date: date,
            label: slotLabel
        });
        element.classList.add("selected");
    }
    
    updateFloatingButton();
}

// --- Navigation Functions ---
function backToSlotSelection() {
    // Clear selections when going back
    selectedSlots = [];
    document.getElementById("signupSection").style.display = "none";
    loadSlots(); // Reload to reset selection state
}

function resetPage() {
    selectedSlots = [];
    isSubmitting = false;
    document.getElementById("successMessage").style.display = "none";
    document.getElementById("loadingMsg").style.display = "block";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    loadSlots();
}

// --- Core Logic with Error Recovery ---

async function loadSlots() {
    const loadingMsg = document.getElementById("loadingMsg");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const signupSection = document.getElementById("signupSection");
    
    loadingMsg.innerHTML = "Loading available slots...";
    loadingMsg.style.display = "block";
    slotsDisplay.style.display = "none";
    signupSection.style.display = "none";

    try {
        const res = await fetch(API_URL);
        
        if (!res.ok) {
            const errorMsg = getErrorMessage(res.status, "Failed to fetch available slots.");
            loadingMsg.innerHTML = `
                <p style="color: #dc2626; margin-bottom: 15px;">⚠️ ${errorMsg}</p>
                <button onclick="loadSlots()" class="btn secondary-btn" style="max-width: 200px; margin: 0 auto;">
                    🔄 Retry
                </button>
            `;
            console.error(`API Call failed with status: ${res.status}`);
            return;
        }

        const data = await res.json();
        
        if (!data.ok) {
            loadingMsg.innerHTML = `
                <p style="color: #dc2626; margin-bottom: 15px;">⚠️ ${sanitizeHTML(data.error || 'Failed to load slots')}</p>
                <button onclick="loadSlots()" class="btn secondary-btn" style="max-width: 200px; margin: 0 auto;">
                    🔄 Retry
                </button>
            `;
            return;
        }

        // Access the 'dates' object from the response
        const groupedSlotsByDate = data.dates || {};
        
        let html = "";
        
        // Filter out past dates before sorting
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to compare only dates
        
        const futureDates = Object.keys(groupedSlotsByDate).filter(dateStr => {
            const slotDate = new Date(dateStr);
            return slotDate >= today; // Only show today and future dates
        });
        
        // Sort dates chronologically
        const sortedDates = futureDates.sort((a, b) => {
            const dateA = new Date(a);
            const dateB = new Date(b);
            return dateA - dateB;
        });
        
        const datesContainer = document.getElementById("datesContainer");

        if (sortedDates.length === 0) {
            html = `
                <div style="text-align: center; padding: 40px 20px;">
                    <p style="font-size: 1.1rem; color: #64748b; margin-bottom: 20px;">
                        📅 No available slots at this time.
                    </p>
                    <p style="color: #94a3b8;">Please check back later!</p>
                    <button onclick="loadSlots()" class="btn secondary-btn" style="max-width: 200px; margin: 20px auto 0;">
                        🔄 Refresh
                    </button>
                </div>
            `;
            datesContainer.innerHTML = html;
        } else {
            sortedDates.forEach(date => {
                const dateSlots = groupedSlotsByDate[date];
                
                // Filter and sort slots by time
                const availableSlotsForDate = dateSlots
                    .filter(slot => slot.available > 0)
                    .sort((a, b) => {
                        // Sort by slot label (time) to ensure chronological order
                        return a.slotLabel.localeCompare(b.slotLabel);
                    });
                
                if (availableSlotsForDate.length > 0) {
                    html += `
                        <div class="date-card card">
                            <h3>📅 ${sanitizeHTML(date)}</h3>
                            <div class="slots-grid">
                    `;
                    
                    availableSlotsForDate.forEach(slot => {
                        const isSelected = selectedSlots.some(s => s.id === slot.id);
                        const selectedClass = isSelected ? 'selected' : '';
                        const safeDate = sanitizeHTML(slot.date);
                        const safeLabel = sanitizeHTML(slot.slotLabel);
                        
                        html += `
                            <div class="slot ${selectedClass}" 
                                 id="slot-btn-${slot.id}"
                                 onclick="toggleSlot('${safeDate}', '${safeLabel}', ${slot.id}, this)">
                                ${safeLabel}<br>
                                <small>(${slot.available} left)</small>
                            </div>
                        `;
                    });
                    html += `
                            </div>
                        </div>
                    `;
                }
            });
            
            if (html === "") {
                datesContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <p style="font-size: 1.1rem; color: #64748b; margin-bottom: 20px;">
                            📅 No available slots at this time.
                        </p>
                        <p style="color: #94a3b8;">Please check back later!</p>
                        <button onclick="loadSlots()" class="btn secondary-btn" style="max-width: 200px; margin: 20px auto 0;">
                            🔄 Refresh
                        </button>
                    </div>
                `;
            } else {
                datesContainer.innerHTML = html;
            }
        }

        loadingMsg.style.display = "none";
        slotsDisplay.style.display = "block";
        updateFloatingButton();

    } catch (err) {
        loadingMsg.innerHTML = `
            <p style="color: #dc2626; margin-bottom: 15px;">
                ⚠️ Unable to connect to the server. Please check your internet connection.
            </p>
            <button onclick="loadSlots()" class="btn secondary-btn" style="max-width: 200px; margin: 0 auto;">
                🔄 Retry
            </button>
        `;
        console.error("Load Slots Error:", err);
    }
}

// Helper function to parse time from slot label and convert to comparable number
function parseTimeForSorting(slotLabel) {
    // Extract time like "10:00 AM - 12:00 PM" -> "10:00 AM"
    const startTime = slotLabel.split('-')[0].trim();
    
    // Parse hour and AM/PM
    const match = startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return 0;
    
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const period = match[3].toUpperCase();
    
    // Convert to 24-hour format
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    return hour * 60 + minute; // Return total minutes for comparison
}

// Function to remove a slot from selection (used in summary)
function removeSlotFromSummary(slotId) {
    const index = selectedSlots.findIndex(slot => slot.id === slotId);
    if (index > -1) {
        selectedSlots.splice(index, 1);
        
        // Update the slot button visual state on the main page
        const slotElement = document.getElementById(`slot-btn-${slotId}`);
        if (slotElement) {
            slotElement.classList.remove("selected");
        }
        
        // If no slots left, go back to selection page
        if (selectedSlots.length === 0) {
            backToSlotSelection();
            return;
        }
        
        // Refresh the summary display
        updateSummaryDisplay();
        updateFloatingButton();
    }
}

// Function to update the summary display (compact chip design)
function updateSummaryDisplay() {
    const summaryEl = document.getElementById('selectedSlotSummary');
    let summaryHTML = `<div style="margin-bottom: 12px;"><strong>📋 Selected ${selectedSlots.length} Slot${selectedSlots.length > 1 ? 's' : ''}:</strong></div>`;
    
    summaryHTML += `<div class="chips-container">`;
    
    // Sort all slots by date first, then by time
    const sortedSlots = [...selectedSlots].sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        return parseTimeForSorting(a.label) - parseTimeForSorting(b.label);
    });
    
    // Create a chip for each slot
    sortedSlots.forEach(slot => {
        const safeDate = sanitizeHTML(slot.date);
        const safeLabel = sanitizeHTML(slot.label);
        
        // Format date to be shorter (e.g., "Dec 15" instead of "December 15, 2024")
        const dateObj = new Date(slot.date);
        const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        // Shorten time format (e.g., "10AM-12PM" instead of "10:00 AM - 12:00 PM")
        const shortTime = slot.label
            .replace(/:\d{2}/g, '') // Remove minutes if :00
            .replace(/\s*-\s*/g, '-') // Remove spaces around dash
            .replace(/\s/g, ''); // Remove remaining spaces
        
        summaryHTML += `
            <div class="slot-chip" data-slot-id="${slot.id}">
                <span class="chip-content">
                    <span class="chip-date">${shortDate}</span>
                    <span class="chip-time">${shortTime}</span>
                </span>
                <button onclick="removeSlotFromSummary(${slot.id}, event)" 
                        class="chip-remove-btn" 
                        aria-label="Remove ${safeDate} ${safeLabel}"
                        title="Remove this booking">
                    ✕
                </button>
            </div>
        `;
    });
    
    summaryHTML += `</div>`;
    
    summaryEl.innerHTML = summaryHTML;
}

// Function to remove all slots for a specific date
function removeAllSlotsForDate(date, event) {
    if (event) event.preventDefault();
    
    // Find all slots for this date
    const slotsToRemove = selectedSlots.filter(slot => sanitizeHTML(slot.date) === date);
    
    // Remove visual selection from main page
    slotsToRemove.forEach(slot => {
        const slotElement = document.getElementById(`slot-btn-${slot.id}`);
        if (slotElement) {
            slotElement.classList.remove("selected");
        }
    });
    
    // Remove from selectedSlots array
    selectedSlots = selectedSlots.filter(slot => sanitizeHTML(slot.date) !== date);
    
    // If no slots left, go back to selection page
    if (selectedSlots.length === 0) {
        backToSlotSelection();
        return;
    }
    
    // Refresh the summary display
    updateSummaryDisplay();
    updateFloatingButton();
}

// Function to show signup form with selected slots summary
function showSignupForm() {
    if (selectedSlots.length === 0) {
        alert("Please select at least one time slot.");
        return;
    }

    // Update and display the summary
    updateSummaryDisplay();

    // Show signup form and hide slots display
    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    document.getElementById("signupSection").style.display = "block";
    showMessage("signupMsg", "", false);
}

async function submitSignup() {
    // Prevent double submission
    if (isSubmitting) {
        showMessage("signupMsg", "Please wait, your booking is being processed...", true);
        return;
    }
    
    // Rate limiting
    const now = Date.now();
    if (now - lastApiCall < CONFIG.API_COOLDOWN) {
        showMessage("signupMsg", "Please wait a moment before submitting again.", true);
        return;
    }

    const name = sanitizeInput(document.getElementById("nameInput").value, 100);
    const email = sanitizeInput(document.getElementById("emailInput").value.toLowerCase(), 254);
    const phone = sanitizeInput(document.getElementById("phoneInput").value, 20);
    const notes = sanitizeInput(document.getElementById("notesInput").value, 500);

    // Client-side validation
    if (!name || !email) { 
        showMessage("signupMsg", "Please fill in all required fields (Name and Email).", true);
        return;
    }

    if (!isValidEmail(email)) {
        showMessage("signupMsg", "Please enter a valid email address (e.g., name@example.com).", true);
        return;
    }

    if (!isValidPhone(phone)) {
        showMessage("signupMsg", "Please enter a valid phone number (numbers, spaces, dashes, and parentheses only).", true);
        return;
    }

    if (selectedSlots.length === 0) {
        showMessage("signupMsg", "Error: No slots selected. Please go back and select at least one slot.", true);
        return;
    }

    if (selectedSlots.length > CONFIG.MAX_SLOTS_PER_BOOKING) {
        showMessage("signupMsg", `Error: You can only book up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots at once.`, true);
        return;
    }

    // Set submitting state
    isSubmitting = true;
    lastApiCall = now;
    
    showMessage("signupMsg", "📤 Submitting your booking...", false);
    const submitBtn = document.getElementById("submitSignupBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";

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
            headers: { 
                "Content-Type": "application/json",
            },
            body: JSON.stringify(signupData)
        });
        
        const data = await res.json();
        
        if (data.ok) {
            // Build confirmation message with sanitized data
            let confirmationHTML = `Thank you, <strong>${sanitizeHTML(name)}</strong>! Your spot${selectedSlots.length > 1 ? 's have' : ' has'} been reserved for:<br><br>`;
            
            const slotsByDate = {};
            selectedSlots.forEach(slot => {
                const safeDate = sanitizeHTML(slot.date);
                if (!slotsByDate[safeDate]) {
                    slotsByDate[safeDate] = [];
                }
                slotsByDate[safeDate].push(sanitizeHTML(slot.label));
            });
            
            // Sort dates chronologically
            Object.keys(slotsByDate).sort((a, b) => new Date(a) - new Date(b)).forEach(date => {
                // Sort time slots chronologically within each date
                const sortedSlots = slotsByDate[date].sort((a, b) => {
                    return parseTimeForSorting(a) - parseTimeForSorting(b);
                });
                
                confirmationHTML += `📅 <strong>${date}</strong><br>`;
                confirmationHTML += `🕰️ ${sortedSlots.join(', ')}<br><br>`;
            });
            
            confirmationHTML += `<p style="color: #64748b; margin-top: 15px;">A confirmation has been sent to <strong>${sanitizeHTML(email)}</strong></p>`;
            
            document.getElementById("signupSection").style.display = "none";
            document.getElementById("confirmationDetails").innerHTML = confirmationHTML;
            document.getElementById("successMessage").style.display = "block";
            
            // Clear form and selections
            document.getElementById("nameInput").value = "";
            document.getElementById("emailInput").value = "";
            document.getElementById("phoneInput").value = "";
            document.getElementById("notesInput").value = "";
            selectedSlots = [];
            
        } else {
            const errorMessage = data.error || "Booking failed. Please try again.";
            showMessage("signupMsg", sanitizeHTML(errorMessage), true);
        }
    } catch (err) {
        console.error("Submit signup error:", err);
        showMessage("signupMsg", "Unable to connect to the server. Please check your internet connection and try again.", true);
    } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Signup";
    }
}

// --- Lookup Bookings Function ---
async function lookupBookings() {
    const email = sanitizeInput(document.getElementById("lookupEmail").value.toLowerCase(), 254);
    const displayEl = document.getElementById("userBookingsDisplay");
    const searchBtn = document.querySelector('.lookup-controls .secondary-btn');

    if (!email) {
        displayEl.innerHTML = '<p class="msg-box error">⚠️ Please enter an email address.</p>';
        return;
    }

    if (!isValidEmail(email)) {
        displayEl.innerHTML = '<p class="msg-box error">⚠️ Please enter a valid email address.</p>';
        return;
    }

    // Disable button and show loading state
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
    displayEl.innerHTML = '<p>🔍 Searching for your bookings...</p>';

    try {
        const res = await fetch(`${API_URL}?email=${encodeURIComponent(email)}`);
        
        if (!res.ok) {
            const errorMsg = getErrorMessage(res.status, "Failed to lookup bookings.");
            displayEl.innerHTML = `<p class="msg-box error">⚠️ ${errorMsg}</p>`;
            return;
        }
        
        const data = await res.json();

        if (!data.ok) {
            displayEl.innerHTML = `<p class="msg-box error">⚠️ ${sanitizeHTML(data.error)}</p>`;
            return;
        }

        const bookings = data.bookings || [];

        if (bookings.length === 0) {
            displayEl.innerHTML = '<p class="msg-box">📭 No bookings found for this email address.</p>';
            return;
        }

        // Display bookings with sanitized data
        let html = '<div class="bookings-list">';
        bookings.forEach(booking => {
            const safeDate = sanitizeHTML(booking.date);
            const safeLabel = sanitizeHTML(booking.slotLabel);
            const safeName = sanitizeHTML(booking.name);
            const safePhone = sanitizeHTML(booking.phone || '');
            const safeNotes = sanitizeHTML(booking.notes || '');
            
            html += `
                <div class="booking-item">
                    <strong>📅 ${safeDate}</strong> at <strong>🕰️ ${safeLabel}</strong><br>
                    <small>Name: ${safeName}</small><br>
                    ${safePhone ? `<small>Phone: ${safePhone}</small><br>` : ''}
                    ${safeNotes ? `<small>Notes: ${safeNotes}</small><br>` : ''}
                    <button onclick="cancelBooking(${booking.signupRowId}, ${booking.slotRowId}, '${safeDate.replace(/'/g, "\\'")}', '${safeLabel.replace(/'/g, "\\'")}')" 
                            class="btn secondary-btn" style="margin-top: 8px; background: #ef4444; color: white;">
                        ❌ Cancel This Booking
                    </button>
                </div>
            `;
        });
        html += '</div>';
        displayEl.innerHTML = html;

    } catch (err) {
        displayEl.innerHTML = '<p class="msg-box error">⚠️ Unable to connect to the server. Please check your internet connection and try again.</p>';
        console.error("Lookup error:", err);
    } finally {
        // Re-enable button
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
    }
}

// --- Cancel Booking Function ---
async function cancelBooking(signupRowId, slotRowId, date, slotLabel) {
    const safeDate = sanitizeHTML(date);
    const safeLabel = sanitizeHTML(slotLabel);
    
    if (!confirm(`⚠️ Are you sure you want to cancel your booking for:\n\n📅 ${safeDate}\n🕰️ ${safeLabel}\n\nThis action cannot be undone.`)) {
        return;
    }

    const displayEl = document.getElementById("userBookingsDisplay");
    const originalHTML = displayEl.innerHTML;

    try {
        displayEl.innerHTML = '<p>⏳ Cancelling your booking...</p>';
        
        const res = await fetch(API_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signupRowId, slotRowId })
        });

        if (!res.ok) {
            const errorMsg = getErrorMessage(res.status, "Failed to cancel booking.");
            alert(`❌ Error: ${errorMsg}`);
            displayEl.innerHTML = originalHTML;
            return;
        }

        const data = await res.json();

        if (data.ok) {
            alert(`✅ ${data.message || "Booking cancelled successfully!"}`);
            // Refresh the bookings list
            lookupBookings();
        } else {
            alert(`❌ Error: ${sanitizeHTML(data.error)}`);
            displayEl.innerHTML = originalHTML;
        }
    } catch (err) {
        alert("❌ Unable to connect to the server. Please check your internet connection and try again.");
        console.error("Cancel error:", err);
        displayEl.innerHTML = originalHTML;
    }
}

// Start loading slots when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadSlots();
    
    // Add keyboard accessibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById("signupSection").style.display === "block") {
            backToSlotSelection();
        }
    });
});

// Warn before leaving page if slots are selected
window.addEventListener('beforeunload', (e) => {
    if (selectedSlots.length > 0 && document.getElementById("signupSection").style.display === "none") {
        e.preventDefault();
        e.returnValue = 'You have selected slots but haven\'t completed your booking. Are you sure you want to leave?';
        return e.returnValue;
    }
});
