// ================================================================================================
// SIGNUP FRONT-END SCRIPT
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
// VALIDATE AND SUBMIT SIGNUP
// ================================================================================================
export async function submitSignup() {
    if (isSubmitting) {
        console.warn('Submission already in progress');
        return;
    }

    const msgEl = document.getElementById("signupMsg");
    const submitBtn = document.getElementById("submitSignupBtn");
    
    // Get and sanitize inputs
    const name = sanitizeInput(document.getElementById("nameInput").value, CONFIG.MAX_NAME_LENGTH);
    const email = sanitizeInput(document.getElementById("emailInput").value, CONFIG.MAX_EMAIL_LENGTH).toLowerCase();
    const phone = sanitizeInput(document.getElementById("phoneInput").value, CONFIG.MAX_PHONE_LENGTH);
    const notes = sanitizeInput(document.getElementById("notesInput").value, CONFIG.MAX_NOTES_LENGTH);

    // --- Validation ---
    if (!name || name.length < 2) {
        showMessage(msgEl, '⚠️ Please enter your full name (at least 2 characters).', 'error');
        msgEl.style.display = 'block';
        return;
    }

    if (!isValidEmail(email)) {
        showMessage(msgEl, '⚠️ Please enter a valid email address.', 'error');
        msgEl.style.display = 'block';
        return;
    }

    if (selectedSlots.length === 0) {
        showMessage(msgEl, '⚠️ Please select at least one slot.', 'error');
        msgEl.style.display = 'block';
        return;
    }

    // --- API Cooldown ---
    const now = Date.now();
    if (now - lastApiCall < CONFIG.API_COOLDOWN) {
        showMessage(msgEl, '⚠️ Please wait a moment before submitting again.', 'error');
        msgEl.style.display = 'block';
        return;
    }

    // --- Disable submit button ---
    updateIsSubmitting(true);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
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
            
            let slotsListHTML = '<div style="margin: 20px 0;"><strong>Your bookings:</strong><ul style="text-align: left; display: inline-block; margin: 10px auto;">';
            selectedSlots.forEach(slot => {
                slotsListHTML += `<li>📅 ${sanitizeHTML(slot.date)} at 🕰️ ${sanitizeHTML(slot.label)}</li>`;
            });
            slotsListHTML += '</ul></div>';
            slotsListHTML += `<p>A confirmation email will be sent to <strong>${sanitizeHTML(email)}</strong></p>`;
            
            confirmationDetails.innerHTML = slotsListHTML;
            
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
    // Expose functions globally for non-inline HTML onclick handlers
    window.showSignupForm = showSignupForm;
    window.submitSignup = submitSignup;
    window.backToSlotSelection = backToSlotSelection;
});
