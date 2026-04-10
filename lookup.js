// ================================================================================================
// LOOKUP.JS (COMPACT CHIP STYLE - FIXED ANIMATION + PERFECT CHRONOLOGICAL SORT)
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
// TIME PARSING HELPER (ROBUST — handles "3PM-6PM", "12PM - 3PM", "3:30PM", etc.)
// ================================================================================================
function parseSlotTime(slotLabel) {
    if (!slotLabel) return 0;
    // Take only the START time (before any dash)
    const start = slotLabel.replace(/\s*[-–]\s*/g, '-').split('-')[0].trim();
    const m = start.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return 0;
    let hour     = Number(m[1]);
    const mins   = m[2] ? Number(m[2]) : 0;
    const period = m[3] ? m[3].toLowerCase() : null;
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour  = 0;
    return hour * 60 + mins;
}
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
// LOOKUP BOOKINGS BY PHONE NUMBER (PERFECT CHRONOLOGICAL SORT + FIXED ANIMATION)
// ================================================================================================
export async function lookupBookings() {
    const phoneInput = document.getElementById("lookupPhone");
    const displayEl  = document.getElementById("userBookingsDisplay");
    const searchBtn  = document.getElementById("lookupSearchBtn");

    if (!phoneInput || !displayEl) {
        console.error('Lookup elements not found');
        return;
    }

    if (isSearching) {
        console.warn('Search already in progress');
        return;
    }

    const rawPhone        = phoneInput.value.trim();
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
        searchBtn.disabled      = true;
        originalSearchBtnText   = searchBtn.textContent;
        searchBtn.textContent   = '🔍 Searching...';
    }

    showLoadingState(displayEl, '🔍 Searching for your upcoming bookings...');

    try {
        const res = await fetch(`${API_URL}?phone=${encodeURIComponent(normalizedPhone)}`, {
            credentials: 'include'
        });

        if (!res.ok) {
            showError(displayEl, getErrorMessage(res.status, "Failed to look up bookings."));
            return;
        }

        const data = await res.json();

        if (!data.ok) {
            showError(displayEl, data.error || 'Failed to retrieve bookings.');
            return;
        }

        const bookings = data.bookings || [];

        if (bookings.length === 0) {
            displayEl.innerHTML = '';
            const noBookingsDiv = document.createElement('div');
            noBookingsDiv.className  = 'msg-box info';
            noBookingsDiv.style.cssText = 'padding: 20px; text-align: center; margin-top: 10px;';
            noBookingsDiv.innerHTML  = `
                <div style="font-size: 48px; margin-bottom: 10px;">📭</div>
                <div style="font-weight: 600; margin-bottom: 8px;">No Upcoming Bookings Found</div>
                <div style="color: #6b7280; font-size: 0.95rem;">
                    We couldn't find any upcoming bookings associated with this phone number.
                </div>
            `;
            displayEl.appendChild(noBookingsDiv);
            return;
        }

        displayEl.innerHTML = '';

        const heading = document.createElement('div');
        heading.textContent       = 'Here are your upcoming booking slots.';
        heading.style.fontWeight  = '600';
        heading.style.marginBottom = '0.5rem';
        heading.style.color       = '#0f172a';
        heading.style.fontSize    = '0.95rem';
        displayEl.appendChild(heading);

        // ── ROBUST DATE NORMALIZER ──────────────────────────────────────────────
        // Handles both ISO "2026-05-02" and Google Sheets "5/2/2026" (MM/DD/YYYY)
        const toISO = (d) => {
            if (!d) return '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
            const parts = d.split('/');
            if (parts.length === 3) {
                return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }
            return d;
        };

        // ── ROBUST TIME PARSER ─────────────────────────────────────────────────
        // Handles "3PM-6PM", "12PM - 3PM", "3:30PM", "9AM" etc.
        const parseTime = (label) => {
            if (!label) return 0;
            const start = label.replace(/\s*[-–]\s*/g, '-').split('-')[0].trim();
            const m     = start.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
            if (!m) return 0;
            let hour     = Number(m[1]);
            const mins   = m[2] ? Number(m[2]) : 0;
            const period = m[3] ? m[3].toLowerCase() : null;
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour  = 0;
            return hour * 60 + mins;
        };

        // ── SORT: date first, then chronological time within same date ──────────
        const sortedBookings = [...bookings].sort((a, b) => {
            const dateDiff = toISO(a.date).localeCompare(toISO(b.date));
            if (dateDiff !== 0) return dateDiff;
            return parseTime(a.slotLabel) - parseTime(b.slotLabel);
        });

        const chipList       = document.createElement('div');
        chipList.className   = 'lookup-chip-list';

        sortedBookings.forEach((booking) => {
            const chip       = document.createElement('div');
            chip.className   = 'lookup-chip';

            chip.dataset.signup_row_id = booking.signupRowId;
            chip.dataset.slot_row_id   = booking.slotRowId;
            chip.dataset.date          = booking.date;
            chip.dataset.slot_label    = booking.slotLabel;

            // ── FRIENDLY DATE DISPLAY ──────────────────────────────────────────
            // Show "Sat, May 2" instead of raw "2026-05-02"
            const isoDate      = toISO(booking.date);
            const displayDate  = isoDate
                ? new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month:   'long',
                      day:     'numeric'
                  })
                : booking.date;

            const text         = document.createElement('span');
            text.textContent   = `📅 ${displayDate} — 🕰️ ${booking.slotLabel}`;

            const cancelBtn    = document.createElement('button');
            cancelBtn.className = 'cancel-btn';
            cancelBtn.textContent = '❌';
            cancelBtn.title    = 'Cancel booking';
            cancelBtn.setAttribute('aria-label', `Cancel booking for ${displayDate} at ${booking.slotLabel}`);

            cancelBtn.dataset.signup_row_id = booking.signupRowId;
            cancelBtn.dataset.slot_row_id   = booking.slotRowId;
            cancelBtn.dataset.date          = booking.date;
            cancelBtn.dataset.slot_label    = booking.slotLabel;

            cancelBtn.style.visibility = 'hidden';

            const handleCancel = (ev) => {
                ev.stopPropagation();

                cancelBtn.disabled    = true;
                cancelBtn.textContent = '⏳';

                chip.classList.add('removing');

                const removeAfterAnimation = () => {
                    const sId   = Number(chip.dataset.signup_row_id);
                    const slId  = Number(chip.dataset.slot_row_id);
                    const date  = chip.dataset.date;
                    const label = chip.dataset.slot_label;

                    cancelBooking(sId, slId, date, label, cancelBtn);
                    chip.remove();
                };

                chip.addEventListener('animationend', removeAfterAnimation, { once: true });
                setTimeout(removeAfterAnimation, 300);
            };

            cancelBtn.addEventListener('click', handleCancel);

            chip.addEventListener('click', () => {
                document.querySelectorAll('.lookup-chip.selected').forEach((other) => {
                    if (other !== chip) {
                        other.classList.remove('selected');
                        const otherBtn = other.querySelector('.cancel-btn');
                        if (otherBtn) otherBtn.style.visibility = 'hidden';
                    }
                });

                if (!chip.classList.contains('selected')) {
                    chip.classList.add('selected');
                    cancelBtn.style.visibility = 'visible';
                } else {
                    chip.classList.remove('selected');
                    cancelBtn.style.visibility = 'hidden';
                }
            });

            chip.appendChild(text);
            chip.appendChild(cancelBtn);
            chipList.appendChild(chip);
        });

        displayEl.appendChild(chipList);

    } catch (err) {
        console.error("Lookup error:", err);
        showError(displayEl, err.message === 'Failed to fetch'
            ? 'Unable to connect to the server. Please check your internet connection.'
            : 'An unexpected error occurred. Please try again.'
        );
    } finally {
        isSearching = false;
        if (searchBtn && originalSearchBtnText) {
            searchBtn.disabled    = false;
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
            credentials: 'include',
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
