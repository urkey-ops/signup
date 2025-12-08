// ================================================================================================
// SIGNUP FRONT-END SCRIPT (FIXED SYNTAX ERROR)
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    selectedSlots, 
    lastApiCall,
    isSubmitting,
    API_CACHE,  // ✅ ADD THIS
    updateSelectedSlots,
    updateLastApiCall,
    updateIsSubmitting,
    normalizePhone
} from './config.js';
import { 
    sanitizeInput,
    sanitizeHTML, 
    showMessage, 
    getErrorMessage,
    isValidEmail,
    isValidPhone 
} from './utils.js';
import { updateSummaryDisplay, resetSlotSelectionUI } from './slots.js';

// ================================================================================================
// SHOW SIGNUP FORM
// ================================================================================================
export function goToSignupForm() { 
    if (selectedSlots.length === 0) {
        showMessage('Please select at least one slot before continuing.', 'warning');
        return;
    }
    
    const slotsDisplay = document.getElementById("slotsDisplay");
    const floatingBtn = document.getElementById("floatingSignupBtnContainer");
    const signupSection = document.getElementById("signupSection");
    
    if (slotsDisplay) slotsDisplay.style.display = "none";
    if (floatingBtn) floatingBtn.style.display = "none";
    if (signupSection) {
        signupSection.style.display = "block";
        updateSummaryDisplay();
        signupSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        setTimeout(function() {  // ← Use function() instead of arrow
    const nameInput = document.getElementById("nameInput");
    if (nameInput) nameInput.focus();
}, 300);
    }
}

// ================================================================================================
// NAVIGATION HELPER - RESET TO SLOT SELECTION
// ================================================================================================
function backToSlotSelection() {
    console.log('📍 Returning to slot selection...');
    
    const successSection = document.getElementById("successMessage");
    const signupSection = document.getElementById("signupSection");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const floatingBtn = document.getElementById("floatingSignupBtnContainer");
    
    if (successSection) successSection.style.display = "none";
    if (signupSection) signupSection.style.display = "none";
    if (slotsDisplay) slotsDisplay.style.display = "block";
    if (floatingBtn) floatingBtn.style.display = "none";
    
    updateSelectedSlots([]);
    resetSlotSelectionUI();
    
    const msgEl = document.getElementById("signupMsg");
    if (msgEl) msgEl.textContent = '';
    
    const formInputs = ['nameInput', 'phoneInput', 'emailInput', 'categorySelect', 'notesInput'];
    formInputs.forEach(function(id) {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.dispatchEvent(new CustomEvent('reloadSlots'));
    
    console.log('✅ Returned to slot selection (state + UI reset)');
}

window.backToSlotSelection = backToSlotSelection;

// ================================================================================================
// REAL-TIME VALIDATION HELPERS
// ================================================================================================
function validateName(name) {
    if (!name || name.length < 2) {
        return { valid: false, message: 'Name must be at least 2 characters' };
    }
    if (name.length > CONFIG.MAX_NAME_LENGTH) {
        return { valid: false, message: 'Name too long (max ' + CONFIG.MAX_NAME_LENGTH + ' characters)' };
    }
    return { valid: true };
}

function validatePhone(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 8) {
        return { valid: false, message: 'Please enter a valid phone number (10 digits)' };
    }
    if (!isValidPhone(phone)) {
        return { valid: false, message: 'Phone must be exactly 10 digits' };
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
// VALIDATE AND SUBMIT SIGNUP (FIXED SYNTAX)
// ================================================================================================
export async function submitSignup() {
    if (isSubmitting) {
        console.warn('Submission already in progress');
        return;
    }

    updateIsSubmitting(true);

    const msgEl = document.getElementById("signupMsg");
    const submitBtn = document.getElementById("submitSignupBtn");
    
    if (!msgEl || !submitBtn) {
        console.error('Signup form elements not found');
        updateIsSubmitting(false);
        return;
    }
    
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Submitting...';
    
    if (!document.getElementById('spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .loading-spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid var(--border);
                border-top-color: var(--primary-color);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                vertical-align: middle;
                margin-right: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    const rawPhone = document.getElementById("phoneInput") ? document.getElementById("phoneInput").value : '';
    const name = sanitizeInput(document.getElementById("nameInput") ? document.getElementById("nameInput").value : '', CONFIG.MAX_NAME_LENGTH);
    const phone = normalizePhone(rawPhone);

    let email = sanitizeInput(document.getElementById("emailInput") ? document.getElementById("emailInput").value : '', CONFIG.MAX_EMAIL_LENGTH);
if (email) {
    email = email.toLowerCase();
}
    
   
    const category = sanitizeInput(document.getElementById("categorySelect") ? document.getElementById("categorySelect").value : '', 50);
    const notes = sanitizeInput(document.getElementById("notesInput") ? document.getElementById("notesInput").value : '', CONFIG.MAX_NOTES_LENGTH);

    function resetSubmitState() {
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }

    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
        showMessage(msgEl, '⚠️ ' + nameValidation.message, 'error');
        resetSubmitState();
        return;
    }

    const phoneValidation = validatePhone(rawPhone);
    if (!phoneValidation.valid) {
        showMessage(msgEl, '⚠️ ' + phoneValidation.message, 'error');
        resetSubmitState();
        return;
    }

    const emailValidation = validateEmailField(email);
    if (!emailValidation.valid) {
        showMessage(msgEl, '⚠️ ' + emailValidation.message, 'error');
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
        showMessage(msgEl, '⚠️ Please wait ' + waitTime + ' seconds before submitting again.', 'error');
        resetSubmitState();
        return;
    }

    showMessage(msgEl, '⏳ Processing your booking...', 'info', 0);

    try {
        const slotIds = selectedSlots.map(function(s) { return s.id; });

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, phone: phone, email: email, notes: notes, category: category, slotIds: slotIds })
        });

        updateLastApiCall(Date.now());
        const data = await response.json();

        if (response.ok && data.ok) {
            // Invalidate cache and reset UI
           
            // ✅ BETTER CACHE INVALIDATION
if (API_CACHE) {
    API_CACHE.data = null;
    API_CACHE.timestamp = 0;
}

            updateSelectedSlots([]);
            resetSlotSelectionUI();
            
            const successSection = document.getElementById("successMessage");
            const confirmationDetails = document.getElementById("confirmationDetails");
            
            if (!successSection || !confirmationDetails) {
                console.error('Success section elements not found');
                resetSubmitState();
                return;
            }
            
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
            
            const sortedSlots = selectedSlots.slice().sort(function(a, b) {
                const dateCompare = new Date(a.date) - new Date(b.date);
                if (dateCompare !== 0) return dateCompare;
                return a.label.localeCompare(b.label);
            });
            
            sortedSlots.forEach(function(slot) {
                const li = document.createElement('li');
                li.style.marginBottom = '8px';
                li.textContent = '📅 ' + slot.date + ' at 🕰️ ' + slot.label;
                list.appendChild(li);
            });
            
            container.appendChild(list);
            confirmationDetails.appendChild(container);

            const categoryInfo = document.createElement('p');
            categoryInfo.style.marginTop = '15px';
            categoryInfo.innerHTML = 'Selected category: <strong>' + category + '</strong>';
            confirmationDetails.appendChild(categoryInfo);
            
            if (email) {
                const emailConfirmation = document.createElement('p');
                emailConfirmation.style.marginTop = '10px';
                emailConfirmation.innerHTML = 'A confirmation email will be sent to <strong>' + email + '</strong>';
                confirmationDetails.appendChild(emailConfirmation);
            }

            const signupSectionEl = document.getElementById("signupSection");
            if (signupSectionEl) signupSectionEl.style.display = "none";
            successSection.style.display = "block";
            successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            resetSubmitState();
            
       } else {
    let errorMsg = data.error || getErrorMessage(response.status, 'Booking failed');
    
    if (response.status === 409) {
        // ✅ SHOW DETAILED SERVER INFO
        const totalSlots = slotIds.length;
        const validSlots = data.validSlots || 0;
        const conflictedCount = totalSlots - validSlots;
        
        errorMsg = data.error || `Conflicts (${conflictedCount}/${totalSlots} slots unavailable)`;
        showMessage(msgEl, `⚠️ ${errorMsg}`, 'warning');
        
        // Auto-refresh slots + return
        updateSelectedSlots([]);
        resetSlotSelectionUI();
        setTimeout(function() {
            window.dispatchEvent(new CustomEvent('reloadSlots'));
            backToSlotSelection();
        }, 2500);
        resetSubmitState();
        return;
    } else if (response.status === 429) {
        errorMsg += ' Too many requests. Please wait a minute and try again.';
        showMessage(msgEl, `❌ ${errorMsg}`, 'error');
    } else {
        showMessage(msgEl, `❌ ${errorMsg}`, 'error');
    }
    
    resetSubmitState();
}

    } catch (err) {
        console.error('Signup error:', err);
        const errorMsg = err.message === 'Failed to fetch' 
            ? 'Unable to connect to the server. Please check your internet connection.' 
            : 'An unexpected error occurred. Please try again.';
        showMessage(msgEl, '❌ ' + errorMsg, 'error');
    }
}

// ================================================================================================
// REAL-TIME VALIDATION ON BLUR
// ================================================================================================
function setupRealtimeValidation() {
    const inputs = {
        nameInput: document.getElementById("nameInput"),
        phoneInput: document.getElementById("phoneInput"),
        emailInput: document.getElementById("emailInput")
    };
    
    if (inputs.nameInput) {
        inputs.nameInput.addEventListener('blur', function() {
            const value = sanitizeInput(inputs.nameInput.value, CONFIG.MAX_NAME_LENGTH);
            const validation = validateName(value);
            if (value && !validation.valid) {
                inputs.nameInput.style.borderColor = '#ef4444';
                inputs.nameInput.setAttribute('aria-invalid', 'true');
            } else {
                inputs.nameInput.style.borderColor = '';
                inputs.nameInput.removeAttribute('aria-invalid');
            }
        });
        
        inputs.nameInput.addEventListener('input', function() {
            inputs.nameInput.style.borderColor = '';
            inputs.nameInput.removeAttribute('aria-invalid');
        });
    }
    
    if (inputs.phoneInput) {
        inputs.phoneInput.addEventListener('blur', function() {
            const value = inputs.phoneInput.value;
            const validation = validatePhone(value);
            if (value && !validation.valid) {
                inputs.phoneInput.style.borderColor = '#ef4444';
                inputs.phoneInput.setAttribute('aria-invalid', 'true');
            } else {
                inputs.phoneInput.style.borderColor = '';
                inputs.phoneInput.removeAttribute('aria-invalid');
            }
        });
        
        inputs.phoneInput.addEventListener('input', function() {
            inputs.phoneInput.style.borderColor = '';
            inputs.phoneInput.removeAttribute('aria-invalid');
        });
    }
    
    if (inputs.emailInput) {
        inputs.emailInput.addEventListener('blur', function() {
            const value = sanitizeInput(inputs.emailInput.value, CONFIG.MAX_EMAIL_LENGTH);
            const validation = validateEmailField(value);
            if (value && !validation.valid) {
                inputs.emailInput.style.borderColor = '#ef4444';
                inputs.emailInput.setAttribute('aria-invalid', 'true');
            } else {
                inputs.emailInput.style.borderColor = '';
                inputs.emailInput.removeAttribute('aria-invalid');
            }
        });
        
        inputs.emailInput.addEventListener('input', function() {
            inputs.emailInput.style.borderColor = '';
            inputs.emailInput.removeAttribute('aria-invalid');
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
    
    const resetPageBtn = document.getElementById('resetPageBtn');
    if (resetPageBtn) {
        resetPageBtn.addEventListener('click', backToSlotSelection);
        console.log('✅ Book Another Slot button initialized');
    }
    
    setupRealtimeValidation();
    
    console.log('✅ Signup module initialized');
});
