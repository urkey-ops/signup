// ================================================================================================
// LOOKUP.JS (UPDATED FOR PHONE NORMALIZATION + DEFENSIVE DOM CHECKS)
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    API_CACHE,
    normalizePhone 
} from './config.js';
import { 
    sanitizeInput, 
    sanitizeHTML, 
    getErrorMessage,
    isValidPhone,
    debounce
} from './utils.js';

// ================================================================================================
// STATE MANAGEMENT
// ================================================================================================
let isSearching = false;
let isCancelling = false;

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================
function showLoadingState(displayEl, message = '⏳ Loading...') {
    if (!displayEl) return;
    displayEl.innerHTML = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'msg-box info';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.padding = '20px';
    loadingDiv.textContent = message;
    displayEl.appendChild(loadingDiv);
}

function showError(displayEl, message) {
    if (!displayEl) return;
    displayEl.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'msg-box error';
    errorDiv.textContent = `⚠️ ${message}`;
    displayEl.appendChild(errorDiv);
}

function showInfo(displayEl, message) {
    if (!displayEl) return;
    displayEl.innerHTML = '';
    const infoDiv = document.createElement('div');
    infoDiv.className = 'msg-box info';
    infoDiv.textContent = message;
    displayEl.appendChild(infoDiv);
}

function showSuccess(displayEl, message) {
    if (!displayEl) return;
    displayEl.innerHTML = '';
    const successDiv = document.createElement('div');
    successDiv.className = 'msg-box success';
    successDiv.style.padding = '20px';
    successDiv.style.textAlign = 'center';
    successDiv.textContent = `✅ ${message}`;
    displayEl.appendChild(successDiv);
}

// ================================================================================================
// LOOKUP BOOKINGS BY PHONE NUMBER (PHONE NORMALIZATION FIXED)
// ================================================================================================
export async function lookupBookings() {
    if (isSearching) {
        console.warn('Search already in progress');
        return;
    }

    const phoneInput = document.getElementById("lookupPhone");
    const displayEl = document.getElementById("userBookingsDisplay");
    const searchBtn = document.getElementById("lookupSearchBtn");

    if (!phoneInput || !displayEl) {
        console.error('Lookup elements not found');
        return;
    }

    const rawPhone = phoneInput.value.trim();
    const normalizedPhone = normalizePhone(rawPhone);

    if (!rawPhone) {
        showError(displayEl, 'Please enter your phone number.');
        phoneInput.focus();
        return;
    }

    if (!isValidPhone(rawPhone)) {
        showError(displayEl, 'Please enter a valid 10-digit phone number.');
        phoneInput.focus();
        return;
    }

    isSearching = true;
    if (searchBtn) {
        searchBtn.disabled = true;
        const originalBtnText = searchBtn.textContent;
        searchBtn.textContent = '🔍 Searching...';
        searchBtn._originalText = originalBtnText;
    }
    
    showLoadingState(displayEl, '🔍 Searching for your bookings...');

    try {
        // ✅ USE NORMALIZED PHONE for API lookup
        const res = await fetch(`${API_URL}?phone=${encodeURIComponent(normalizedPhone)}`);
        
        if (!res.ok) {
            const errorMsg = getErrorMessage(res.status, "Failed to look up bookings.");
            showError(displayEl, errorMsg);
            return;
        }
        
        const data = await res.json();

        if (!data.ok) {
            showError(displayEl, data.error || 'Failed to retrieve bookings.');
            return;
        }

        const bookings = data.bookings || [];

        if (bookings.length === 0) {
            showInfo(displayEl, '📭 No active bookings found for this phone number.');
            return;
        }

        // Build sorted booking list
        displayEl.innerHTML = '';
        const sortedBookings = [...bookings].sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
        });
        
        const listDiv = document.createElement('div');
        listDiv.className = 'bookings-list';

        sortedBookings.forEach((booking) => {
            const item = document.createElement('div');
            item.className = 'booking-item';

            // Date and time header
            const title = document.createElement('div');
            title.style.marginBottom = '10px';
            title.style.fontSize = '1.05rem';
            
            const dateStrong = document.createElement('strong');
            dateStrong.textContent = `📅 ${booking.date}`;
            title.appendChild(dateStrong);
            
            title.appendChild(document.createTextNode(' at '));
            
            const timeStrong = document.createElement('strong');
            timeStrong.textContent = `🕰️ ${booking.slotLabel}`;
            title.appendChild(timeStrong);
            
            item.appendChild(title);

            // Details
            const detailsDiv = document.createElement('div');
            detailsDiv.style.marginBottom = '12px';
            detailsDiv.style.color = '#64748b';

            const nameDiv = document.createElement('div');
            const nameSmall = document.createElement('small');
            nameSmall.textContent = `Name: ${booking.name}`;
            nameDiv.appendChild(nameSmall);
            detailsDiv.appendChild(nameDiv);

            if (booking.category) {
                const catDiv = document.createElement('div');
                const catSmall = document.createElement('small');
                catSmall.textContent = `Category: ${booking.category}`;
                catDiv.appendChild(catSmall);
                detailsDiv.appendChild(catDiv);
            }

            if (booking.notes) {
                const notesDiv = document.createElement('div');
                const notesSmall = document.createElement('small');
                notesSmall.textContent = `Notes: ${booking.notes}`;
                notesDiv.appendChild(notesSmall);
                detailsDiv.appendChild(notesDiv);
            }

            item.appendChild(detailsDiv);

            // Cancel button
            const btn = document.createElement('button');
            btn.className = 'btn secondary-btn';
            btn.style.marginTop = '8px';
            btn.style.background = '#ef4444';
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.cursor = 'pointer';
            btn.textContent = '❌ Cancel This Booking';
            btn.setAttribute('aria-label', `Cancel booking for ${booking.date} at ${booking.slotLabel}`);

            btn.dataset.signup_row_id = booking.signupRowId;
            btn.dataset.slot_row_id = booking.slotRowId;
            btn.dataset.date = booking.date;
            btn.dataset.slot_label = booking.slotLabel;

            btn.addEventListener('click', (ev) => {
                const sId = Number(ev.currentTarget.dataset.signup_row_id);
                const slId = Number(ev.currentTarget.dataset.slot_row_id);
                const date = ev.currentTarget.dataset.date;
                const label = ev.currentTarget.dataset.slot_label;
                cancelBooking(sId, slId, date, label, ev.currentTarget);
            });

            // Hover effects
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#dc2626';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = '#ef4444';
            });

            item.appendChild(btn);
            listDiv.appendChild(item);
        });

        displayEl.appendChild(listDiv);

    } catch (err) {
        console.error("Lookup error:", err);
        const errorMsg = err.message === 'Failed to fetch'
            ? 'Unable to connect to the server. Please check your internet connection.'
            : 'An unexpected error occurred. Please try again.';
        showError(displayEl, errorMsg);
    } finally {
        isSearching = false;
        if (searchBtn && searchBtn._originalText) {
            searchBtn.disabled = false;
            searchBtn.textContent = searchBtn._originalText;
        }
    }
}

// Debounced version for keypress events
export const lookupBookingsDebounced = debounce(lookupBookings, 500);

// ================================================================================================
// CANCEL BOOKING BY PHONE (NORMALIZED PHONE)
// ================================================================================================
export async function cancelBooking(signupRowId, slotRowId, date, slotLabel, buttonElement) {
    if (isCancelling) {
        console.warn('Cancellation already in progress');
        return;
    }

    const phoneInput = document.getElementById("lookupPhone");
    const displayEl = document.getElementById("userBookingsDisplay");

    if (!phoneInput || !displayEl) {
        console.error('Lookup elements not found for cancellation');
        return;
    }

    const rawPhone = phoneInput.value.trim();
    const normalizedPhone = normalizePhone(rawPhone);

    if (!rawPhone || !isValidPhone(rawPhone)) {
        alert('❌ Error: Valid phone number is required for cancellation.');
        phoneInput.focus();
        return;
    }

    if (!confirm(`⚠️ Are you sure you want to cancel your booking for:\n\n📅 ${date}\n🕰️ ${slotLabel}\n\nThis action cannot be undone.`)) {
        return;
    }

    const originalHTML = displayEl.innerHTML;
    
    if (buttonElement) {
        buttonElement.disabled = true;
        const originalText = buttonElement.textContent;
        buttonElement.textContent = '⏳ Cancelling...';
        buttonElement._originalText = originalText;
    }

    isCancelling = true;

    try {
        showLoadingState(displayEl, '⏳ Cancelling your booking...');
        
        const res = await fetch(API_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                signupRowId, 
                slotRowId,
                phone: normalizedPhone  // ✅ SEND NORMALIZED PHONE
            })
        });

        const data = await res.json();

        if (res.ok && data.ok) {
            showSuccess(displayEl, data.message || "Booking cancelled successfully!");
            
            // Invalidate cache
            API_CACHE.data = null;
            API_CACHE.timestamp = 0;
            
            // Refresh bookings after success
            setTimeout(() => {
                lookupBookings();
            }, 1500);
            
        } else {
            const errorMsg = data.error || getErrorMessage(res.status, "Failed to cancel booking.");
            showError(displayEl, errorMsg);
            
            // Restore original list after error
            setTimeout(() => {
                displayEl.innerHTML = originalHTML;
            }, 3000);
        }

    } catch (err) {
        console.error("Cancel error:", err);
        const errorMsg = err.message === 'Failed to fetch'
            ? 'Unable to connect to the server. Please check your internet connection.'
            : 'An unexpected error occurred. Please try again.';
        
        showError(displayEl, errorMsg);
        setTimeout(() => {
            displayEl.innerHTML = originalHTML;
        }, 3000);
        
    } finally {
        isCancelling = false;
        
        if (buttonElement && buttonElement._originalText) {
            buttonElement.disabled = false;
            buttonElement.textContent = buttonElement._originalText;
        }
    }
}

// ================================================================================================
// TOGGLE LOOKUP SECTION
// ================================================================================================
export function toggleLookup() {
    const content = document.getElementById('lookupContent');
    const displayEl = document.getElementById('userBookingsDisplay');
    const phoneInput = document.getElementById('lookupPhone');
    const toggleButton = document.getElementById('lookupToggle');

    if (!content) return;

    const wasHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden');
    content.setAttribute('aria-hidden', content.classList.contains('hidden').toString());
    
    const isExpanded = !content.classList.contains('hidden');
    if (toggleButton) {
        toggleButton.setAttribute('aria-expanded', isExpanded.toString());
    }

    if (isExpanded) {
        setTimeout(() => {
            if (phoneInput) {
                phoneInput.focus();
                phoneInput.value = '';
            }
            content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    } else {
        // Clear everything when closing
        if (phoneInput) phoneInput.value = '';
        if (displayEl) displayEl.innerHTML = '';
        
        isSearching = false;
        isCancelling = false;
    }
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById("lookupToggle");
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleLookup);
        toggleBtn.setAttribute('aria-expanded', 'false');
    }

    const searchBtn = document.getElementById('lookupSearchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            lookupBookings();
        });
    }

    const lookupPhone = document.getElementById('lookupPhone');
    if (lookupPhone) {
        lookupPhone.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                lookupBookings();
            }
        });
        
        lookupPhone.addEventListener('input', () => {
            lookupPhone.style.borderColor = '';
        });
    }
});
