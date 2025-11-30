const API_URL = "/api/signup";

// Configuration
const CONFIG = {
    MAX_SLOTS_PER_BOOKING: 10,
    API_COOLDOWN: 1000, // 1 second between submissions
    RETRY_DELAY: 3000, // 3 seconds before allowing retry
    CLIENT_CACHE_TTL: 30000, // 30 seconds client-side cache
};

// State management
let selectedSlots = [];
let lastApiCall = 0;
let isSubmitting = false;

// Client-side cache
const API_CACHE = {
    data: null,
    timestamp: 0,
    TTL: CONFIG.CLIENT_CACHE_TTL
};

// --- Add skeleton styles immediately ---
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shimmer {
            0% { background-position: -468px 0; }
            100% { background-position: 468px 0; }
        }
        .skeleton-card {
            background: #f8f8f8;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            animation: fadeIn 0.3s ease;
        }
        .skeleton-title {
            height: 24px;
            width: 150px;
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: 4px;
            margin-bottom: 16px;
        }
        .skeleton-slot {
            background: linear-gradient(90deg, #f8f8f8 25%, #f0f0f0 50%, #f8f8f8 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border: 1px solid #e0e0e0;
            pointer-events: none;
            min-height: 64px;
            border-radius: 8px;
            padding: 16px;
        }
        .skeleton-text {
            height: 16px;
            background: #e0e0e0;
            border-radius: 4px;
            margin: 8px auto;
            width: 80%;
        }
        .skeleton-text-small {
            height: 12px;
            background: #e8e8e8;
            border-radius: 4px;
            margin: 4px auto;
            width: 50%;
        }
        .fade-in {
            animation: fadeInUp 0.4s ease-out forwards;
        }
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(style);
})();

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
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    loadSlots();
}

// --- OPTIMIZED: Show skeleton UI immediately ---
function showSkeletonUI() {
    const datesContainer = document.getElementById("datesContainer");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const loadingMsg = document.getElementById("loadingMsg");
    
    loadingMsg.style.display = "none";
    slotsDisplay.style.display = "block";
    
    const skeletonHTML = Array(3).fill(0).map(() => `
        <div class="date-card card skeleton-card">
            <div class="skeleton-title"></div>
            <div class="slots-grid">
                ${Array(4).fill(0).map(() => `
                    <div class="slot skeleton-slot">
                        <div class="skeleton-text"></div>
                        <div class="skeleton-text-small"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
    
    datesContainer.innerHTML = skeletonHTML;
}

// --- OPTIMIZED: Core Logic with Client-Side Cache ---
async function loadSlots() {
    const loadingMsg = document.getElementById("loadingMsg");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const signupSection = document.getElementById("signupSection");
    
    // Show skeleton immediately for instant feedback
    showSkeletonUI();
    signupSection.style.display = "none";

    // Check client-side cache first
    const now = Date.now();
    if (API_CACHE.data && (now - API_CACHE.timestamp) < API_CACHE.TTL) {
        console.log('✅ Using client cache');
        renderSlotsData(API_CACHE.data);
        return;
    }

    try {
        const startTime = performance.now();
        const res = await fetch(API_URL);
        const fetchTime = performance.now() - startTime;
        console.log(`⏱️ API fetch took ${fetchTime.toFixed(0)}ms`);
        
        if (!res.ok) {
            handleLoadError(res.status);
            return;
        }

        const data = await res.json();
        
        if (!data.ok) {
            handleLoadError(null, data.error || 'Failed to load slots');
            return;
        }

        // Cache the response
        API_CACHE.data = data;
        API_CACHE.timestamp = now;

        renderSlotsData(data);

    } catch (err) {
        handleLoadError(null, err.message);
        console.error("Load Slots Error:", err);
    }
}

// --- OPTIMIZED: Render slots with DocumentFragment ---
function renderSlotsData(data) {
    const datesContainer = document.getElementById("datesContainer");
    const groupedSlotsByDate = data.dates || {};
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureDates = Object.keys(groupedSlotsByDate)
        .filter(dateStr => {
            const slotDate = new Date(dateStr);
            return slotDate >= today;
        })
        .sort((a, b) => new Date(a) - new Date(b));
    
    if (futureDates.length === 0) {
        showNoSlotsMessage();
        return;
    }
    
    // Clear skeleton
    datesContainer.innerHTML = '';
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    futureDates.forEach(date => {
        const dateSlots = groupedSlotsByDate[date];
        const availableSlots = dateSlots
            .filter(slot => slot.available > 0)
            .sort((a, b) => parseTimeForSorting(a.slotLabel) - parseTimeForSorting(b.slotLabel));
        
        if (availableSlots.length > 0) {
            const card = createDateCard(date, availableSlots);
            fragment.appendChild(card);
        }
    });
    
    // Single DOM update
    datesContainer.appendChild(fragment);
    
    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("slotsDisplay").style.display = "block";
    updateFloatingButton();
}

// --- OPTIMIZED: Create DOM elements instead of HTML strings ---
function createDateCard(date, slots) {
    const card = document.createElement('div');
    card.className = 'date-card card fade-in';
    
    const title = document.createElement('h3');
    title.textContent = `📅 ${date}`;
    card.appendChild(title);
    
    const grid = document.createElement('div');
    grid.className = 'slots-grid';
    
    slots.forEach(slot => {
        const slotDiv = createSlotElement(slot);
        grid.appendChild(slotDiv);
    });
    
    card.appendChild(grid);
    return card;
}

function createSlotElement(slot) {
    const div = document.createElement('div');
    const isSelected = selectedSlots.some(s => s.id === slot.id);
    div.className = `slot ${isSelected ? 'selected' : ''}`;
    div.id = `slot-btn-${slot.id}`;
    
    const label = document.createElement('span');
    label.textContent = slot.slotLabel;
    div.appendChild(label);
    
    div.appendChild(document.createElement('br'));
    
    const small = document.createElement('small');
    small.textContent = `(${slot.available} left)`;
    div.appendChild(small);
    
    div.onclick = function() {
        toggleSlot(slot.date, slot.slotLabel, slot.id, this);
    };
    
    return div;
}

function showNoSlotsMessage() {
    const datesContainer = document.getElementById("datesContainer");
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
    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("slotsDisplay").style.display = "block";
}

function handleLoadError(status, message) {
    const loadingMsg = document.getElementById("loadingMsg");
    const datesContainer = document.getElementById("datesContainer");
    
    datesContainer.innerHTML = '';
    
    const errorMessage = status ? 
        getErrorMessage(status, "Failed to load slots") :
        (message || "Connection error. Please check your internet.");
    
    loadingMsg.innerHTML = `
        <p style="color: #dc2626; margin-bottom: 15px;">
            ⚠️ ${sanitizeHTML(errorMessage)}
        </p>
        <button onclick="loadSlots()" class="btn secondary-btn" style="max-width: 200px; margin: 0 auto;">
            🔄 Retry
        </button>
    `;
    loadingMsg.style.display = "block";
    document.getElementById("slotsDisplay").style.display = "none";
}

// Helper function to parse time from slot label and convert to comparable number
function parseTimeForSorting(slotLabel) {
    const startTime = slotLabel.split('-')[0].trim();
    const match = startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return 0;
    
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const period = match[3].toUpperCase();
    
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    return hour * 60 + minute;
}

// Function to remove a slot from selection (used in summary)
function removeSlotFromSummary(slotId) {
    const index = selectedSlots.findIndex(slot => slot.id === slotId);
    if (index > -1) {
        selectedSlots.splice(index, 1);
        
        const slotElement = document.getElementById(`slot-btn-${slotId}`);
        if (slotElement) {
            slotElement.classList.remove("selected");
        }
        
        if (selectedSlots.length === 0) {
            backToSlotSelection();
            return;
        }
        
        updateSummaryDisplay();
        updateFloatingButton();
    }
}

// Function to update the summary display (compact chip design)
function updateSummaryDisplay() {
    const summaryEl = document.getElementById('selectedSlotSummary');
    let summaryHTML = `<div style="margin-bottom: 12px;"><strong>📋 Selected ${selectedSlots.length} Slot${selectedSlots.length > 1 ? 's' : ''}:</strong></div>`;
    
    summaryHTML += `<div class="chips-container">`;
    
    const sortedSlots = [...selectedSlots].sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        return parseTimeForSorting(a.label) - parseTimeForSorting(b.label);
    });
    
    sortedSlots.forEach(slot => {
        const safeDate = sanitizeHTML(slot.date);
        const safeLabel = sanitizeHTML(slot.label);
        
        const dateObj = new Date(slot.date);
        const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const shortTime = slot.label
            .replace(/:\d{2}/g, '')
            .replace(/\s*-\s*/g, '-')
            .replace(/\s/g, '');
        
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

// Function to show signup form with selected slots summary
function showSignupForm() {
    if (selectedSlots.length === 0) {
        alert("Please select at least one time slot.");
        return;
    }

    updateSummaryDisplay();

    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    document.getElementById("signupSection").style.display = "block";
    showMessage("signupMsg", "", false);
}

async function submitSignup() {
    if (isSubmitting) {
        showMessage("signupMsg", "Please wait, your booking is being processed...", true);
        return;
    }
    
    const now = Date.now();
    if (now - lastApiCall < CONFIG.API_COOLDOWN) {
        showMessage("signupMsg", "Please wait a moment before submitting again.", true);
        return;
    }

    const name = sanitizeInput(document.getElementById("nameInput").value, 100);
    const email = sanitizeInput(document.getElementById("emailInput").value.toLowerCase(), 254);
    const phone = sanitizeInput(document.getElementById("phoneInput").value, 20);
    const notes = sanitizeInput(document.getElementById("notesInput").value, 500);

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

    isSubmitting = true;
    lastApiCall = now;
    
    showMessage("signupMsg", "📤 Submitting your booking...", false);
    const submitBtn = document.getElementById("submitSignupBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";

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
            let confirmationHTML = `Thank you, <strong>${sanitizeHTML(name)}</strong>! Your spot${selectedSlots.length > 1 ? 's have' : ' has'} been reserved for:<br><br>`;
            
            const slotsByDate = {};
            selectedSlots.forEach(slot => {
                const safeDate = sanitizeHTML(slot.date);
                if (!slotsByDate[safeDate]) {
                    slotsByDate[safeDate] = [];
                }
                slotsByDate[safeDate].push(sanitizeHTML(slot.label));
            });
            
            Object.keys(slotsByDate).sort((a, b) => new Date(a) - new Date(b)).forEach(date => {
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
            
            document.getElementById("nameInput").value = "";
            document.getElementById("emailInput").value = "";
            document.getElementById("phoneInput").value = "";
            document.getElementById("notesInput").value = "";
            selectedSlots = [];
            
            // Invalidate cache so fresh data loads on next view
            API_CACHE.data = null;
            
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
            
            // Invalidate cache
            API_CACHE.data = null;
            
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

// Add this new function to the bottom of your user-script.js
function toggleLookup() {
    const content = document.getElementById('lookupContent');
    const toggleButton = document.getElementById('lookupToggle');
    
    // Toggle the 'hidden' class to show/hide the content
    content.classList.toggle('hidden');
    
    // Update ARIA attributes for accessibility
    const isExpanded = content.classList.contains('hidden') ? 'false' : 'true';
    toggleButton.setAttribute('aria-expanded', isExpanded);
    
    // Optional: Focus the input field when the section is opened
    if (isExpanded === 'true') {
        document.getElementById('lookupEmail').focus();
    }
}
