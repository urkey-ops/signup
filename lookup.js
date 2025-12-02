// START OF CODE: lookup.js

import { 
    API_URL, 
    CONFIG, 
    API_CACHE 
} from './config.js';
import { 
    sanitizeInput, 
    sanitizeHTML, 
    isValidEmail, 
    getErrorMessage,
    showMessage 
} from './utils.js';

// --- UPDATED: Lookup Bookings Function (Now filters by ACTIVE status) ---
export async function lookupBookings() {
    const email = sanitizeInput(document.getElementById("lookupEmail").value.toLowerCase(), CONFIG.MAX_EMAIL_LENGTH);
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

        // BACKEND NOW FILTERS BY STATUS='ACTIVE', so we trust the response
        const bookings = data.bookings || [];

        if (bookings.length === 0) {
            displayEl.innerHTML = '<p class="msg-box">📭 No active bookings found for this email address.</p>';
            return;
        }

        let html = '<div class="bookings-list">';
        bookings.forEach(booking => {
            const safeDate = sanitizeHTML(booking.date);
            const safeLabel = sanitizeHTML(booking.slotLabel);
            const safeName = sanitizeHTML(booking.name);
            const safePhone = sanitizeHTML(booking.phone || '');
            const safeNotes = sanitizeHTML(booking.notes || '');
            
            // Note: The onclick in the generated HTML must call the global function (window.*)
            html += `
                <div class="booking-item">
                    <strong>📅 ${safeDate}</strong> at <strong>🕰️ ${safeLabel}</strong><br>
                    <small>Name: ${safeName}</small><br>
                    ${safePhone ? `<small>Phone: ${safePhone}</small><br>` : ''}
                    ${safeNotes ? `<small>Notes: ${safeNotes}</small><br>` : ''}
                    <button onclick="window.cancelBooking(${booking.signupRowId}, ${booking.slotRowId}, '${safeDate.replace(/'/g, "\\'")}', '${safeLabel.replace(/'/g, "\\'")}')" 
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

// --- UPDATED: Cancel Booking Function (Better error handling) ---
export async function cancelBooking(signupRowId, slotRowId, date, slotLabel) {
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

        const data = await res.json();

        if (res.ok && data.ok) {
            alert(`✅ ${data.message || "Booking cancelled successfully!"}`);
            
            // Invalidate cache
            API_CACHE.data = null;
            
            // Refresh bookings list
            lookupBookings();
        } else {
            const errorMsg = getErrorMessage(res.status, data.error || "Failed to cancel booking.");
            alert(`❌ Error: ${errorMsg}`);
            displayEl.innerHTML = originalHTML;
        }
    } catch (err) {
        alert("❌ Unable to connect to the server. Please check your internet connection and try again.");
        console.error("Cancel error:", err);
        displayEl.innerHTML = originalHTML;
    }
}

export function toggleLookup() {
    const content = document.getElementById('lookupContent');
    const toggleButton = document.getElementById('lookupToggle');
    
    content.classList.toggle('hidden');
    
    const isExpanded = content.classList.contains('hidden') ? 'false' : 'true';
    toggleButton.setAttribute('aria-expanded', isExpanded);
    
    if (isExpanded === 'true') {
        document.getElementById('lookupEmail').focus();
    }
}

// Function to attach event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Expose necessary functions to the global scope for inline onclick handlers
    window.lookupBookings = lookupBookings;
    window.cancelBooking = cancelBooking;
    window.toggleLookup = toggleLookup;

    const toggleBtn = document.getElementById("lookupToggle");
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleLookup);
    }

    const searchBtn = document.querySelector('.lookup-controls .secondary-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', lookupBookings);
    }
});

// END OF CODE: lookup.js
