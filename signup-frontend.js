// ================================================================================================
// SIGNUP FRONT-END SCRIPT (FIXED - Book Another Slot button working)
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
import { updateSummaryDisplay } from './slots.js';

// ================================================================================================
// SHOW SIGNUP FORM
// ================================================================================================
export function goToSignupForm() { 
    if (selectedSlots.length === 0) {
        alert('Please select at least one slot before continuing.');
        return;
    }
    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    document.getElementById("signupSection").style.display = "block";

    updateSummaryDisplay();
    document.getElementById("signupSection").scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.getElementById("nameInput")?.focus(), 300);
}

// ================================================================================================
// NAVIGATION HELPER - RESET TO SLOT SELECTION
// ================================================================================================
function backToSlotSelection() {
    console.log('📍 Returning to slot selection...');
    
    // Hide all sections
    const successSection = document.getElementById("successMessage");
    const signupSection = document.getElementById("signupSection");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const floatingBtn = document.getElementById("floatingSignupBtnContainer");
    
    if (successSection) successSection.style.display = "none";
    if (signupSection) signupSection.style.display = "none";
    if (slotsDisplay) slotsDisplay.style.display = "block";
    if (floatingBtn) floatingBtn.style.display = "none";
    
    // Clear selections and messages
    updateSelectedSlots([]);
    const msgEl = document.getElementById("signupMsg");
    if (msgEl) msgEl.textContent = '';
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Trigger slots reload
    window.dispatchEvent(new CustomEvent('reloadSlots'));
    
    console.log('✅ Returned to slot selection');
}

// ✅ CRITICAL: Expose globally so HTML onclick can call it
window.backToSlotSelection = backToSlotSelection;

// ================================================================================================
// REAL-TIME VALIDATION HELPERS
// ================================================================================================
function validateName(name) {
    if (!name || name.length < 2) {
        return { valid: false, message: 'Name must be at least 2 characters' };
    }
    if (name.length > CONFIG.MAX_NAME_LENGTH) {
        return { valid: false, message: `Name too long (max ${CONFIG.MAX_NAME_LENGTH} characters)` };
    }
    return { valid: true };
}

function validatePhone(phone) {
    if (!phone || phone.length < 8) {
        return { valid: false, message: 'Please enter a valid phone number' };
    }
    if (phone.length > CONFIG.MAX_PHONE_LENGTH) {
        return { valid: false, message: 'Phone number too long' };
    }
    return { valid: true };
}

function validateEmailField(email) {
    if (!email) return { valid: true };
    if (!isValidEmail(email)) {
        return { valid: false, message: 'Please enter a valid email address' };
    }
    return { valid: true };
}

// ================================================================================================
// VALIDATE AND SUBMIT SIGNUP
// ================================================================================================
export async function submitSignup() {
    if (isSubmitting) {
        console.warn('Submission already in progress');
        return;
    }

    updateIsSubmitting(true);

    const msgEl = document.getElementById("signupMsg");
    const submitBtn = document.getElementById("submitSignupBtn");
    
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.textContent;
    submitBtn.innerHTML = `<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Submitting...`;
    
    if (!document.getElementById('spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    const name = sanitizeInput(document.getElementById("nameInput").value, CONFIG.MAX_NAME_LENGTH);
    const phone = sanitizeInput(document.getElementById("phoneInput").value, CONFIG.MAX_PHONE_LENGTH);
    const email = sanitizeInput(document.getElementById("emailInput").value, CONFIG.MAX_EMAIL_LENGTH).toLowerCase();
    const category = sanitizeInput(document.getElementById("categorySelect").value, 50);
    const notes = sanitizeInput(document.getElementById("notesInput").value, CONFIG.MAX_NOTES_LENGTH);

    function resetSubmitState() {
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }

    // Validation
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
        showMessage(msgEl, `⚠️ ${nameValidation.message}`, 'error');
        resetSubmitState();
        return;
    }

    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
        showMessage(msgEl, `⚠️ ${phoneValidation.message}`, 'error');
        resetSubmitState();
        return;
    }

    const emailValidation = validateEmailField(email);
    if (!emailValidation.valid) {
        showMessage(msgEl, `⚠️ ${emailValidation.message}`, 'error');
        resetSubmitState();
        return;
    }

    if (!category) {
        showMessage(msgEl, '⚠️ Please select your category.', 'error');
        resetSubmitState();
        return;
    }

    if (selectedSlots.length === 0) {
        showMessage(msgEl, '⚠️ Please select at least one slot.', 'error');
        resetSubmitState();
        return;
    }

    const now = Date.now();
    if (now - lastApiCall < CONFIG.API_COOLDOWN) {
        const waitTime = Math.ceil((CONFIG.API_COOLDOWN - (now - lastApiCall)) / 1000);
        showMessage(msgEl, `⚠️ Please wait ${waitTime} seconds before submitting again.`, 'error');
        resetSubmitState();
        return;
    }

    showMessage(msgEl, '⏳ Processing your booking...', 'info', 0);

    try {
        const slotIds = selectedSlots.map(s => s.id);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, email, notes, category, slotIds })
        });

        updateLastApiCall(Date.now());
        const data = await response.json();

        if (response.ok && data.ok) {
            API_CACHE.data = null;
            
            const successSection = document.getElementById("successMessage");
            const confirmationDetails = document.getElementById("confirmationDetails");
            
            confirmationDetails.innerHTML = '';
            
            const container = document.createElement('div');
            container.style.margin = '20px 0';
            
            const heading = document.createElement('strong');
            heading.textContent = 'Your bookings:';
            container.appendChild(heading);
            
            const list = document.createElement('ul');
            list.style.textAlign = 'left';
            list.style.display = 'inline-block';
            list.style.margin = '10px auto';
            list.style.paddingLeft = '20px';
            
            const sortedSlots = [...selectedSlots].sort((a, b) => {
                const dateCompare = new Date(a.date) - new Date(b.date);
                if (dateCompare !== 0) return dateCompare;
                return a.label.localeCompare(b.label);
            });
            
            sortedSlots.forEach(slot => {
                const li = document.createElement('li');
                li.style.marginBottom = '8px';
                li.textContent = `📅 ${slot.date} at 🕰️ ${slot.label}`;
                list.appendChild(li);
            });
            
            container.appendChild(list);
            confirmationDetails.appendChild(container);

            const categoryInfo = document.createElement('p');
            categoryInfo.style.marginTop = '15px';
            const categoryLabel = document.createElement('span');
            categoryLabel.textContent = 'Selected category: ';
            const categoryValue = document.createElement('strong');
            categoryValue.textContent = category;
            categoryInfo.appendChild(categoryLabel);
            categoryInfo.appendChild(categoryValue);
            confirmationDetails.appendChild(categoryInfo);
            
            if (email) {
                const emailConfirmation = document.createElement('p');
                emailConfirmation.style.marginTop = '10px';
                const emailLabel = document.createElement('span');
                emailLabel.textContent = 'A confirmation email will be sent to ';
                const emailValue = document.createElement('strong');
                emailValue.textContent = email;
                emailConfirmation.appendChild(emailLabel);
                emailConfirmation.appendChild(emailValue);
                confirmationDetails.appendChild(emailConfirmation);
            }

            document.getElementById("signupSection").style.display = "none";
            successSection.style.display = "block";
            successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Clear form
            document.getElementById("nameInput").value = '';
            document.getElementById("phoneInput").value = '';
            document.getElementById("emailInput").value = '';
            document.getElementById("categorySelect").value = '';
            document.getElementById("notesInput").value = '';
            msgEl.textContent = '';
            
            updateSelectedSlots([]);
            
        } else {
            let errorMsg = data.error || getErrorMessage(response.status, 'Booking failed');
            
            if (response.status === 409) {
                errorMsg += ' Some slots may have been booked by others. Please select different slots.';
            } else if (response.status === 429) {
                errorMsg += ' Too many requests. Please wait a minute and try again.';
            }
            
            showMessage(msgEl, `❌ ${errorMsg}`, 'error');
            
            if (response.status === 409) {
                setTimeout(() => {
                    backToSlotSelection();
                }, 3000);
            }
        }

    } catch (err) {
        console.error('Signup error:', err);
        const errorMsg = err.message === 'Failed to fetch' 
            ? 'Unable to connect to the server. Please check your internet connection.' 
            : 'An unexpected error occurred. Please try again.';
        showMessage(msgEl, `❌ ${errorMsg}`, 'error');
    } finally {
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
}

// ================================================================================================
// REAL-TIME VALIDATION ON BLUR
// ================================================================================================
function setupRealtimeValidation() {
    const nameInput = document.getElementById("nameInput");
    const phoneInput = document.getElementById("phoneInput");
    const emailInput = document.getElementById("emailInput");
    
    if (nameInput) {
        nameInput.addEventListener('blur', () => {
            const value = sanitizeInput(nameInput.value, CONFIG.MAX_NAME_LENGTH);
            const validation = validateName(value);
            if (value && !validation.valid) {
                nameInput.style.borderColor = '#ef4444';
                nameInput.setAttribute('aria-invalid', 'true');
            } else {
                nameInput.style.borderColor = '';
                nameInput.removeAttribute('aria-invalid');
            }
        });
        
        nameInput.addEventListener('input', () => {
            nameInput.style.borderColor = '';
            nameInput.removeAttribute('aria-invalid');
        });
    }
    
    if (phoneInput) {
        phoneInput.addEventListener('blur', () => {
            const value = sanitizeInput(phoneInput.value, CONFIG.MAX_PHONE_LENGTH);
            const validation = validatePhone(value);
            if (value && !validation.valid) {
                phoneInput.style.borderColor = '#ef4444';
                phoneInput.setAttribute('aria-invalid', 'true');
            } else {
                phoneInput.style.borderColor = '';
                phoneInput.removeAttribute('aria-invalid');
            }
        });
        
        phoneInput.addEventListener('input', () => {
            phoneInput.style.borderColor = '';
            phoneInput.removeAttribute('aria-invalid');
        });
    }
    
    if (emailInput) {
        emailInput.addEventListener('blur', () => {
            const value = sanitizeInput(emailInput.value, CONFIG.MAX_EMAIL_LENGTH);
            const validation = validateEmailField(value);
            if (value && !validation.valid) {
                emailInput.style.borderColor = '#ef4444';
                emailInput.setAttribute('aria-invalid', 'true');
            } else {
                emailInput.style.borderColor = '';
                emailInput.removeAttribute('aria-invalid');
            }
        });
        
        emailInput.addEventListener('input', () => {
            emailInput.style.borderColor = '';
            emailInput.removeAttribute('aria-invalid');
        });
    }
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📝 Signup module initializing...');
    
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
    
    // ✅ NEW: Add event listener for "Book Another Slot" button
    const resetPageBtn = document.getElementById('resetPageBtn');
    if (resetPageBtn) {
        resetPageBtn.addEventListener('click', backToSlotSelection);
        console.log('✅ Book Another Slot button initialized');
    }
    
    setupRealtimeValidation();
    
    console.log('✅ Signup module initialized');
});
