// ================================================================================================
// LOOKUP.JS (FIXED)
// ================================================================================================

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

// ================================================================================================
// LOOKUP BOOKINGS FUNCTION (FIXED)
// ================================================================================================
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

        const bookings = data.bookings || [];

        if (bookings.length === 0) {
            displayEl.innerHTML = '<p class="msg-box">📭 No active bookings found for this email address.</p>';
            return;
        }

        // ✅ FIXED: Build DOM nodes instead of innerHTML for data
        displayEl.innerHTML = '';
        const listDiv = document.createElement('div');
        listDiv.className = 'bookings-list';

        bookings.forEach(booking => {
            const item = document.createElement('div');
            item.className = 'booking-item';

            // Date and time
            const title = document.createElement('div');
            const dateStrong = document.createElement('strong');
            dateStrong.textContent = `📅 ${booking.date}`;
            title.appendChild(dateStrong);
            title.appendChild(document.createTextNode(' at '));
            const timeStrong = document.createElement('strong');
            timeStrong.textContent = `🕰️ ${booking.slotLabel}`;
            title.appendChild(timeStrong);
            item.appendChild(title);

            // Name
            const nameDiv = document.createElement('div');
            const nameSmall = document.createElement('small');
            nameSmall.textContent = `Name: ${booking.name}`;
            nameDiv.appendChild(nameSmall);
            item.appendChild(nameDiv);

            // Phone (optional)
            if (booking.phone) {
                const phoneDiv = document.createElement('div');
                const phoneSmall = document.createElement('small');
                phoneSmall.textContent = `Phone: ${booking.phone}`;
                phoneDiv.appendChild(phoneSmall);
                item.appendChild(phoneDiv);
            }

            // Notes (optional)
            if (booking.notes) {
                const notesDiv = document.createElement('div');
                const notesSmall = document.createElement('small');
                notesSmall.textContent = `Notes: ${booking.notes}`;
                notesDiv.appendChild(notesSmall);
                item.appendChild(notesDiv);
            }

            // Cancel button
            const btn = document.createElement('button');
            btn.className = 'btn secondary-btn';
            btn.style.marginTop = '8px';
            btn.style.background = '#ef4444';
            btn.style.color = 'white';
            btn.textContent = '❌ Cancel This Booking';

            // ✅ FIXED: Use consistent naming for dataset
            btn.dataset.signup_row_id = booking.signupRowId;
            btn.dataset.slot_row_id = booking.slotRowId;
            btn.dataset.date = booking.date;
            btn.dataset.slot_label = booking.slotLabel;

            // Safe event listener
            btn.addEventListener('click', (ev) => {
                const sId = Number(ev.currentTarget.dataset.signup_row_id);
                const slId = Number(ev.currentTarget.dataset.slot_row_id);
                const date = ev.currentTarget.dataset.date;
                const label = ev.currentTarget.dataset.slot_label;
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

// ================================================================================================
// CANCEL BOOKING FUNCTION (FIXED - Add email verification)
// ================================================================================================
export async function cancelBooking(signupRowId, slotRowId, date, slotLabel) {
    const email = document.getElementById("lookupEmail").value.trim().toLowerCase();
    
    // ✅ FIXED: Require email for cancellation (security)
    if (!email) {
        alert('❌ Error: Email is required for cancellation. Please ensure your email is in the search field above.');
        return;
    }
    
    if (!confirm(`⚠️ Are you sure you want to cancel your booking for:\n\n📅 ${date}\n🕰️ ${slotLabel}\n\nThis action cannot be undone.`)) {
        return;
    }

    const displayEl = document.getElementById("userBookingsDisplay");
    const originalHTML = displayEl.innerHTML;

    try {
        displayEl.innerHTML = '<p>⏳ Cancelling your booking...</p>';
        
        // ✅ FIXED: Send email with cancellation request for verification
        const res = await fetch(API_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                signupRowId, 
                slotRowId,
                email  // Backend will verify this matches
            })
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

// ================================================================================================
// TOGGLE LOOKUP SECTION
// ================================================================================================
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

// ================================================================================================
// INITIALIZATION
// ================================================================================================
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById("lookupToggle");
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleLookup);
    }

    const searchBtn = document.querySelector('.lookup-controls .secondary-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', lookupBookings);
    }
    
    // Allow Enter key in email field to trigger search
    const lookupEmail = document.getElementById('lookupEmail');
    if (lookupEmail) {
        lookupEmail.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                lookupBookings();
            }
        });
    }
});
