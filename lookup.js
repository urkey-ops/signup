// START OF CODE: lookup.js (UPDATED - avoids inline onclick handlers)

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

        // Build DOM nodes safely
        displayEl.innerHTML = ''; // clear
        const listDiv = document.createElement('div');
        listDiv.className = 'bookings-list';

        bookings.forEach(booking => {
            const item = document.createElement('div');
            item.className = 'booking-item';

            const title = document.createElement('div');
            title.innerHTML = `<strong>📅 ${sanitizeHTML(booking.date)}</strong> at <strong>🕰️ ${sanitizeHTML(booking.slotLabel)}</strong>`;
            item.appendChild(title);

            const smallName = document.createElement('div');
            smallName.innerHTML = `<small>Name: ${sanitizeHTML(booking.name)}</small>`;
            item.appendChild(smallName);

            if (booking.phone) {
                const phoneDiv = document.createElement('div');
                phoneDiv.innerHTML = `<small>Phone: ${sanitizeHTML(booking.phone)}</small>`;
                item.appendChild(phoneDiv);
            }
            if (booking.notes) {
                const notesDiv = document.createElement('div');
                notesDiv.innerHTML = `<small>Notes: ${sanitizeHTML(booking.notes)}</small>`;
                item.appendChild(notesDiv);
            }

            const btn = document.createElement('button');
            btn.className = 'btn secondary-btn';
            btn.style.marginTop = '8px';
            btn.style.background = '#ef4444';
            btn.style.color = 'white';
            btn.textContent = '❌ Cancel This Booking';

            // attach data attributes
            btn.dataset.signupRowId = booking.signupRowId;
            btn.dataset.slotRowId = booking.slotRowId;
            btn.dataset.date = booking.date;
            btn.dataset.slotLabel = booking.slotLabel;

            // safe event listener
            btn.addEventListener('click', (ev) => {
                const sId = Number(ev.currentTarget.dataset.signuprowid);
                const slId = Number(ev.currentTarget.dataset.slotrowid);
                const date = ev.currentTarget.dataset.date;
                const label = ev.currentTarget.dataset.slotlabel;
                cancelBooking(sId, slId, date, label);
            });

            item.appendChild(btn);
            listDiv.appendChild(item);
        });

        displayEl.appendChild(listDiv);

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
    // Expose necessary functions to the global scope (still safe to call externally)
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
