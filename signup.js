// ================================================================================================
// SIGNUP FRONT-END SCRIPT (FIXED)
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    selectedSlots, 
    lastApiCall,
    isSubmitting,
    API_CACHE,
    updateSelectedSlots,
    updateLastApiCall,
    updateIsSubmitting
} from './config.js';
import { 
    sanitizeInput,
    sanitizeHTML, 
    showMessage, 
    getErrorMessage,
    isValidEmail 
} from './utils.js';
import { updateSummaryDisplay, backToSlotSelection } from './slots.js';

// ================================================================================================
// SHOW SIGNUP FORM
// ================================================================================================
export function showSignupForm() {
    if (selectedSlots.length === 0) {
        alert('Please select at least one slot before continuing.');
        return;
    }
    
    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    document.getElementById("signupSection").style.display = "block";
    
    updateSummaryDisplay();
    
    // Scroll to form
    document.getElementById("signupSection").scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Focus first input
    setTimeout(() => {
        document.getElementById("nameInput")?.focus();
    }, 300);
}

// ================================================================================================
// VALIDATE AND SUBMIT SIGNUP (FIXED)
// ================================================================================================
export async function submitSignup() {
    // ✅ FIXED: Check and set flag BEFORE any async operations
    if (isSubmitting) {
        console.warn('Submission already in progress');
        return;
    }

    // ✅ FIXED: Set flag immediately to prevent race condition
    updateIsSubmitting(true);

    const msgEl = document.getElementById("signupMsg");
    const submitBtn = document.getElementById("submitSignupBtn");
    
    // Disable button immediately
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    // Get and sanitize inputs
    const name = sanitizeInput(document.getElementById("nameInput").value, CONFIG.MAX_NAME_LENGTH);
    const email = sanitizeInput(document.getElementById("emailInput").value, CONFIG.MAX_EMAIL_LENGTH).toLowerCase();
    const phone = sanitizeInput(document.getElementById("phoneInput").value, CONFIG.MAX_PHONE_LENGTH);
    const notes = sanitizeInput(document.getElementById("notesInput").value, CONFIG.MAX_NOTES_LENGTH);

    // --- Validation ---
    if (!name || name.length < 2) {
        showMessage(msgEl, '⚠️ Please enter your full name (at least 2 characters).', 'error');
        msgEl.style.display = 'block';
        // ✅ FIXED: Reset state on validation failure
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Signup';
        return;
    }

    if (!isValidEmail(email)) {
        showMessage(msgEl, '⚠️ Please enter a valid email address.', 'error');
        msgEl.style.display = 'block';
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Signup';
        return;
    }

    if (selectedSlots.length === 0) {
        showMessage(msgEl, '⚠️ Please select at least one slot.', 'error');
        msgEl.style.display = 'block';
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Signup';
        return;
    }

    // --- API Cooldown ---
    const now = Date.now();
    if (now - lastApiCall < CONFIG.API_COOLDOWN) {
        showMessage(msgEl, '⚠️ Please wait a moment before submitting again.', 'error');
        msgEl.style.display = 'block';
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Signup';
        return;
    }

    showMessage(msgEl, '⏳ Processing your booking...', 'info', 0);
    msgEl.style.display = 'block';

    try {
        const slotIds = selectedSlots.map(s => s.id);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                email, 
                phone, 
                notes, 
                slotIds 
            })
        });

        updateLastApiCall(Date.now());
        const data = await response.json();

        if (response.ok && data.ok) {
            // --- SUCCESS ---
            API_CACHE.data = null; // Invalidate cache
            
            const successSection = document.getElementById("successMessage");
            const confirmationDetails = document.getElementById("confirmationDetails");
            
            // ✅ FIXED: Build DOM elements instead of innerHTML
            confirmationDetails.innerHTML = ''; // Clear first
            
            const container = document.createElement('div');
            container.style.margin = '20px 0';
            
            const heading = document.createElement('strong');
            heading.textContent = 'Your bookings:';
            container.appendChild(heading);
            
            const list = document.createElement('ul');
            list.style.textAlign = 'left';
            list.style.display = 'inline-block';
            list.style.margin = '10px auto';
            
            selectedSlots.forEach(slot => {
                const li = document.createElement('li');
                li.textContent = `📅 ${slot.date} at 🕰️ ${slot.label}`;
                list.appendChild(li);
            });
            
            container.appendChild(list);
            confirmationDetails.appendChild(container);
            
            const emailConfirmation = document.createElement('p');
            emailConfirmation.innerHTML = `A confirmation email will be sent to <strong>${sanitizeHTML(email)}</strong>`;
            confirmationDetails.appendChild(emailConfirmation);
            
            // Hide form, show success
            document.getElementById("signupSection").style.display = "none";
            successSection.style.display = "block";
            successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Clear form
            document.getElementById("nameInput").value = '';
            document.getElementById("emailInput").value = '';
            document.getElementById("phoneInput").value = '';
            document.getElementById("notesInput").value = '';
            
            updateSelectedSlots([]);
            
        } else {
            // --- SERVER ERROR ---
            const errorMsg = data.error || getErrorMessage(response.status, 'Booking failed');
            showMessage(msgEl, `❌ ${errorMsg}`, 'error');
            msgEl.style.display = 'block';
            
            // If slot conflict, reload slots
            if (response.status === 409) {
                setTimeout(() => {
                    backToSlotSelection();
                }, 3000);
            }
        }

    } catch (err) {
        console.error('Signup error:', err);
        showMessage(msgEl, '❌ Unable to connect to the server. Please check your internet connection and try again.', 'error');
        msgEl.style.display = 'block';
    } finally {
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Signup';
    }
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners properly
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitSignup();
        });
    }
    
    const backBtn = document.getElementById('backToSlotsBtn');
    if (backBtn) {
        backBtn.addEventListener('click', backToSlotSelection);
    }
});

/* ========================================
   MOBILE-FIRST REFINEMENTS 
   ======================================== */

/* 1. MOBILE BASE LAYOUT (0-576px default) */
.container {
    padding: var(--space-md);     /* 16px sides */
    padding-top: var(--space-lg); /* 24px top for header */
    max-width: 100%;
}

.card {
    padding: var(--space-md);           /* 16px (reduced from xl) */
    margin-bottom: var(--space-md);     /* 16px between cards */
    border-radius: var(--radius-lg);    /* Slightly smaller radius */
}

.date-card {
    padding: var(--space-md);
    margin-bottom: var(--space-sm);     /* 8px tighter spacing */
}

/* 2. MOBILE TYPOGRAPHY SCALE */
@media (max-width: 576px) {
    h1 { font-size: 1.75rem; }
    h2 { font-size: 1.25rem; }
    .description { 
        font-size: 0.85rem; 
        line-height: 1.5; 
    }
}

/* 3. SLOTS GRID: MOBILE 2-COLUMN DEFAULT */
.slots-grid {
    grid-template-columns: repeat(2, 1fr); /* Mobile default */
    gap: var(--space-xs);                  /* 4px tight grid */
}

.slot {
    min-height: 64px;           /* Thumb-friendly */
    padding: var(--space-sm) var(--space-xs);
    font-size: 0.8125rem;
}

/* 4. FORM SPACING & MOBILE BUTTONS */
#signupForm > * + * {
    margin-top: var(--space-sm); /* 8px between inputs */
}

.btn {
    width: 100%;                /* Full width on mobile */
    margin-bottom: var(--space-sm);
    min-height: 48px;
}

/* 5. FORM ACTIONS: STACKED ON MOBILE */
.form-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-top: var(--space-md);
}

@media (min-width: 768px) {
    .form-actions {
        flex-direction: row;
    }
    .form-actions .btn {
        flex: 1;
    }
}

/* 6. ULTRA-TIGHT FLOATING BUTTON */
#floatingSignupBtnContainer {
    padding-top: var(--space-xs);           /* 4px top */
    padding-bottom: max(var(--space-xs), env(safe-area-inset-bottom));
    padding-left: max(var(--space-md), env(safe-area-inset-left));
    padding-right: max(var(--space-md), env(safe-area-inset-right));
}

#floatingSignupBtn {
    font-size: 0.95rem;
    padding: 0.75rem 1rem;
}

/* 7. SPACING UTILITIES */
.stack-md > * + * {
    margin-top: var(--space-md);
}

.stack-sm > * + * {
    margin-top: var(--space-sm);
}

.divider {
    height: 1px;
    background: var(--border);
    margin: var(--space-lg) 0;
}

/* 8. MOBILE CHIP COMPACTION */
@media (max-width: 576px) {
    .chips-container {
        gap: var(--space-xs);
    }
    
    .slot-chip {
        padding: 6px 6px 6px 10px;
        font-size: 0.8rem;
    }
    
    .chip-remove-btn {
        width: 28px;
        height: 28px;
        font-size: 1.1rem;
    }
}

/* 9. SUCCESS SCREEN CENTERING */
#successMessage {
    margin: var(--space-lg) auto;
    max-width: 90vw;
}

/* 10. MOBILE-SPECIFIC LOOKUP */
@media (max-width: 576px) {
    .lookup-controls {
        flex-direction: column;
    }
    
    .lookup-controls .secondary-btn {
        width: 100%;
        margin-top: var(--space-sm);
    }
}

/* 11. MOBILE SPACER (replaces inline height:100px) */
.mobile-spacer {
    height: 100px;
    pointer-events: none;
}

/* 12. ENHANCED MOBILE FOCUS (thumb precision) */
@media (max-width: 576px) {
    *:focus-visible {
        outline: 3px solid var(--primary-color);
        outline-offset: 2px;
    }
}
