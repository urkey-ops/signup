// ================================================================================================
// LOOKUP.JS (COMPACT CHIP STYLE - FIXED ANIMATION + CHRONOLOGICAL SORT)
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    API_CACHE,
    normalizePhone,
    invalidateCache
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

// Module-level button text storage
let originalSearchBtnText = null;
let originalCancelBtnText = null;

// Error recovery timeout management
let errorRecoveryTimeout = null;

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
// LOOKUP BOOKINGS BY PHONE NUMBER (CHRONOLOGICAL SORT + FIXED ANIMATION)
// ================================================================================================
export async function lookupBookings() {
    const phoneInput = document.getElementById("lookupPhone");
    const displayEl = document.getElementById("userBookingsDisplay");
    const searchBtn = document.getElementById("lookupSearchBtn");

    if (!phoneInput || !displayEl) {
        console.error('Lookup elements not found');
        return;
    }

    // ✅ Check state flag FIRST before any validation
    if (isSearching) {
        console.warn('Search already in progress');
        return;
    }

    const rawPhone = phoneInput.value.trim();
    const normalizedPhone = normalizePhone(rawPhone);

    // ✅ Validate AFTER state check
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

    // ✅ NOW set state flag AFTER validation passes
    isSearching = true;

    if (searchBtn) {
        searchBtn.disabled = true;
        originalSearchBtnText = searchBtn.textContent;
        searchBtn.textContent = '🔍 Searching...';
    }
    
    showLoadingState(displayEl, '🔍 Searching for your bookings...');

    try {
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

        // ✅ CHRONOLOGICAL SORT: Date FIRST, then Time SECOND
        displayEl.innerHTML = '';
        const sortedBookings = [...bookings].sort((a, b) => {
            // Parse full datetime for accurate chronological sorting
            const dateA = new Date(`${a.date}T${a.slotLabel.split(' - ')[0]}`);
            const dateB = new Date(`${b.date}T${b.slotLabel.split(' - ')[0]}`);
            return dateA - dateB;
        });
        
        const chipList = document.createElement('div');
        chipList.className = 'lookup-chip-list';

        sortedBookings.forEach((booking) => {
            const chip = document.createElement('div');
            chip.className = 'lookup-chip';

            // Attach ALL metadata to CHIP for safety
            chip.dataset.signup_row_id = booking.signupRowId;
            chip.dataset.slot_row_id = booking.slotRowId;
            chip.dataset.date = booking.date;
            chip.dataset.slot_label = booking.slotLabel;

            const text = document.createElement('span');
            text.textContent = `📅 ${booking.date} — 🕰️ ${booking.slotLabel}`;

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'cancel-btn';
            cancelBtn.textContent = '❌';
            cancelBtn.title = 'Cancel booking';
            cancelBtn.setAttribute('aria-label', `Cancel booking for ${booking.date} at ${booking.slotLabel}`);
            
            // Duplicate metadata on button too
            cancelBtn.dataset.signup_row_id = booking.signupRowId;
            cancelBtn.dataset.slot_row_id = booking.slotRowId;
            cancelBtn.dataset.date = booking.date;
            cancelBtn.dataset.slot_label = booking.slotLabel;

            // ✅ FIXED: Proper animation + removal handling
            const handleCancel = (ev) => {
                ev.stopPropagation();
                
                // Disable button immediately
                cancelBtn.disabled = true;
                cancelBtn.textContent = '⏳';
                
                // Animate out
                chip.classList.add('removing');
                
                // Wait for animation to complete, THEN cancel + remove
                const removeAfterAnimation = () => {
                    const sId = Number(chip.dataset.signup_row_id);
                    const slId = Number(chip.dataset.slot_row_id);
                    const date = chip.dataset.date;
                    const label = chip.dataset.slot_label;
                    
                    cancelBooking(sId, slId, date, label, cancelBtn);
                    chip.remove();
                };
                
                // Listen for animation end (most reliable)
                chip.addEventListener('animationend', removeAfterAnimation, { once: true });
                
                // Fallback timeout (300ms = --transition-slow)
                setTimeout(removeAfterAnimation, 300);
            };

            cancelBtn.addEventListener('click', handleCancel);

            chip.appendChild(text);
            chip.appendChild(cancelBtn);
            chipList.appendChild(chip);
        });

        displayEl.appendChild(chipList);

    } catch (err) {
        console.error("Lookup error:", err);
        const errorMsg = err.message === 'Failed to fetch'
            ? 'Unable to connect to the server. Please check your internet connection.'
            : 'An unexpected error occurred. Please try again.';
        showError(displayEl, errorMsg);
    } finally {
        isSearching = false;
        if (searchBtn && originalSearchBtnText) {
            searchBtn.disabled = false;
            searchBtn.textContent = originalSearchBtnText;
            originalSearchBtnText = null;
        }
    }
}

// ================================================================================================
// CANCEL BOOKING BY PHONE (RACE CONDITION FIXED)
// ================================================================================================
export async function cancelBooking(signupRowId, slotRowId, date, slotLabel, buttonElement) {
    const phoneInput = document.getElementById("lookupPhone");
    const displayEl = document.getElementById("userBookingsDisplay");

    if (!phoneInput || !displayEl) {
        console.error('Lookup elements not found for cancellation');
        return;
    }

    // ✅ Check state flag FIRST
    if (isCancelling) {
        console.warn('Cancellation already in progress');
        return;
    }

    const rawPhone = phoneInput.value.trim();
    const normalizedPhone = normalizePhone(rawPhone);

    // ✅ Validate AFTER state check
    if (!rawPhone || !isValidPhone(rawPhone)) {
        alert('❌ Error: Valid phone number is required for cancellation.');
        phoneInput.focus();
        return;
    }

    if (!confirm(`⚠️ Are you sure you want to cancel your booking for:\n\n📅 ${date}\n🕰️ ${slotLabel}\n\nThis action cannot be undone.`)) {
        return;
    }

    // ✅ NOW set state flag AFTER validation and confirmation
    isCancelling = true;

    const originalHTML = displayEl.innerHTML;
    
    if (buttonElement) {
        buttonElement.disabled = true;
        originalCancelBtnText = buttonElement.textContent;
        buttonElement.textContent = '⏳';
        buttonElement.style.color = '#6b7280';
    }

    try {
        showLoadingState(displayEl, '⏳ Cancelling your booking...');
        
        const res = await fetch(API_URL, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                signupRowId, 
                slotRowId,
                phone: normalizedPhone
            })
        });

        const data = await res.json();

        if (res.ok && data.ok) {
            showSuccess(displayEl, data.message || "Booking cancelled successfully!");
            
            invalidateCache();
            
            errorRecoveryTimeout = setTimeout(() => {
                if (!isSearching) {
                    lookupBookings();
                }
                errorRecoveryTimeout = null;
            }, 1500);
            
        } else {
            const errorMsg = data.error || getErrorMessage(res.status, "Failed to cancel booking.");
            showError(displayEl, errorMsg);
            
            if (errorRecoveryTimeout) {
                clearTimeout(errorRecoveryTimeout);
            }
            
            errorRecoveryTimeout = setTimeout(() => {
                if (displayEl) {
                    displayEl.innerHTML = originalHTML;
                }
                errorRecoveryTimeout = null;
            }, 3000);
        }

    } catch (err) {
        console.error("Cancel error:", err);
        const errorMsg = err.message === 'Failed to fetch'
            ? 'Unable to connect to the server. Please check your internet connection.'
            : 'An unexpected error occurred. Please try again.';
        
        showError(displayEl, errorMsg);
        
        if (errorRecoveryTimeout) {
            clearTimeout(errorRecoveryTimeout);
        }
        
        errorRecoveryTimeout = setTimeout(() => {
            if (displayEl) {
                displayEl.innerHTML = originalHTML;
            }
            errorRecoveryTimeout = null;
        }, 3000);
        
    } finally {
        isCancelling = false;
        
        if (buttonElement && originalCancelBtnText) {
            buttonElement.disabled = false;
            buttonElement.textContent = originalCancelBtnText;
            buttonElement.style.color = '';
            originalCancelBtnText = null;
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
        if (phoneInput) phoneInput.value = '';
        if (displayEl) displayEl.innerHTML = '';
        
        if (errorRecoveryTimeout) {
            clearTimeout(errorRecoveryTimeout);
            errorRecoveryTimeout = null;
        }
        
        isSearching = false;
        isCancelling = false;
    }
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================
function initializeLookup() {
    console.log('🔍 Initializing lookup module...');
    
    const toggleBtn = document.getElementById("lookupToggle");
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleLookup);
        toggleBtn.setAttribute('aria-expanded', 'false');
        console.log('✅ Lookup toggle button attached');
    } else {
        console.error('❌ Lookup toggle button not found');
    }

    const searchBtn = document.getElementById('lookupSearchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            lookupBookings();
        });
        console.log('✅ Lookup search button attached');
    } else {
        console.error('❌ Lookup search button not found');
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
        console.log('✅ Lookup phone input attached');
    } else {
        console.error('❌ Lookup phone input not found');
    }
    
    console.log('✅ Lookup module initialized');
}

// Run initialization immediately when module loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLookup);
} else {
    initializeLookup();
}
