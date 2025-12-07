// ================================================================================================
// LOOKUP.JS (UPDATED FOR PHONE NUMBER LOOKUP + TOGGLE BEHAVIOR)
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    API_CACHE 
} from './config.js';
import { 
    sanitizeInput, 
    sanitizeHTML, 
    getErrorMessage
} from './utils.js';

// ================================================================================================
// LOOKUP BOOKINGS BY PHONE NUMBER
// ================================================================================================
export async function lookupBookings() {
    const phone = sanitizeInput(document.getElementById("lookupPhone").value, CONFIG.MAX_PHONE_LENGTH);
    const displayEl = document.getElementById("userBookingsDisplay");
    const searchBtn = document.querySelector('.lookup-controls .secondary-btn');

    if (!phone) {
        displayEl.innerHTML = '<p class="msg-box error">⚠️ Please enter your phone number.</p>';
        return;
    }

    if (phone.length < 8) {
        displayEl.innerHTML = '<p class="msg-box error">⚠️ Please enter a valid phone number.</p>';
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
    displayEl.innerHTML = '<p>🔍 Searching for your bookings...</p>';

    try {
        const res = await fetch(`${API_URL}?phone=${encodeURIComponent(phone)}`);
        
        if (!res.ok) {
            const errorMsg = getErrorMessage(res.status, "Failed to look up bookings.");
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
            displayEl.innerHTML = '<p class="msg-box">📭 No active bookings found for this phone number.</p>';
            return;
        }

        // ✅ Build DOM nodes instead of innerHTML
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

            // Category (if available)
            if (booking.category) {
                const catDiv = document.createElement('div');
                const catSmall = document.createElement('small');
                catSmall.textContent = `Category: ${booking.category}`;
                catDiv.appendChild(catSmall);
                item.appendChild(catDiv);
            }

            // Notes (optional)
            if (booking.notes) {
                const notesDiv = document.createElement('div');
                const notesSmall = document.createElement('small');
                notesSmall.textContent = `Notes: ${booking.notes}`;
                notesDiv.appendChild(notesSmall);
                item.appendChild(notesDiv);
            }

            // Cancel booking button
            const btn = document.createElement('button');
            btn.className = 'btn secondary-btn';
            btn.style.marginTop = '8px';
            btn.style.background = '#ef4444';
            btn.style.color = 'white';
            btn.textContent = '❌ Cancel This Booking';

            btn.dataset.signup_row_id = booking.signupRowId;
            btn.dataset.slot_row_id = booking.slotRowId;
            btn.dataset.date = booking.date;
            btn.dataset.slot_label = booking.slotLabel;

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
// CANCEL BOOKING BY PHONE
// ================================================================================================
export async function cancelBooking(signupRowId, slotRowId, date, slotLabel) {
    const phone = document.getElementById("lookupPhone").value.trim();

    if (!phone) {
        alert('❌ Error: Phone number is required for cancellation. Please ensure it is entered above.');
        return;
    }

    if (!confirm(`⚠️ Are you sure you want to cancel your booking for:\n\n📅 ${date}\n🕰️ ${slotLabel}\n\nThis action cannot be undone.`)) {
        return;
    }

    const displayEl = document.getElementById("userBookingsDisplay");
    const originalHTML = displayEl.innerHTML;

    try {
        displayEl.innerHTML = '<p>⏳ Cancelling your booking...</p>';
        
        const res = await fetch(API_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                signupRowId, 
                slotRowId,
                phone
            })
        });

        const data = await res.json();

        if (res.ok && data.ok) {
            alert(`✅ ${data.message || "Booking cancelled successfully!"}`);
            API_CACHE.data = null;
            lookupBookings(); // Refresh list after cancel
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
// TOGGLE LOOKUP SECTION (One-click open/close)
// ================================================================================================
export function toggleLookup() {
    const content = document.getElementById('lookupContent');
    const toggleButton = document.getElementById('lookupToggle');

    content.classList.toggle('hidden');
    const isExpanded = content.classList.contains('hidden') ? 'false' : 'true';
    toggleButton.setAttribute('aria-expanded', isExpanded);

    // Focus on the input when opened
    if (isExpanded === 'true') {
        const phoneInput = document.getElementById('lookupPhone');
        if (phoneInput) phoneInput.focus();
    }
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById("lookupToggle");
    if (toggleBtn) toggleBtn.addEventListener('click', toggleLookup);

    const searchBtn = document.querySelector('.lookup-controls .secondary-btn');
    if (searchBtn) searchBtn.addEventListener('click', lookupBookings);

    const lookupPhone = document.getElementById('lookupPhone');
    if (lookupPhone) {
        lookupPhone.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                lookupBookings();
            }
        });
    }
});
