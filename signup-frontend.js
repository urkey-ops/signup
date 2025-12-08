// ============================================================================================
// SIGNUP FRONT-END SCRIPT (GRACEFUL CONFLICT UX) - BUG-FREE VERSION
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    getSelectedSlots,
    getLastApiCall,
    getIsSubmitting,
    API_CACHE,
    updateSelectedSlots,
    updateLastApiCall,
    updateIsSubmitting,
    normalizePhone,
    canSubmit
} from './config.js';
import { 
    sanitizeInput,
    escapeHTML,
    showMessage, 
    getErrorMessage,
    isValidEmail,
    isValidPhone 
} from './utils.js';
import { updateSummaryDisplay, resetSlotSelectionUI } from './slots.js';

// ================================================================================================
// MODULE-LEVEL STATE
// ================================================================================================
let conflictActionButtons = null; // Track conflict UI buttons for cleanup

// ================================================================================================
// INJECT STYLES ONCE ON MODULE LOAD
// ================================================================================================
(function injectStyles() {
    if (document.getElementById('signup-spinner-style')) return;
    
    const style = document.createElement('style');
    style.id = 'signup-spinner-style';
    style.textContent = `
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
.loading-spinner {
    display: inline-block;
    width: 20px; height: 20px;
    border: 3px solid #e5e7eb; border-top-color: #3b82f6;
    border-radius: 50%; animation: spin 0.8s linear infinite;
    vertical-align: middle; margin-right: 8px;
}
.conflict-actions {
    display: flex; gap: 10px; flex-wrap: wrap; 
    justify-content: center; margin-top: 15px; padding: 12px;
}
.conflict-actions button {
    padding: 12px 24px; border: none; border-radius: 8px;
    cursor: pointer; font-weight: 500; font-size: 14px;
    min-height: 44px;
    color: white !important;
}
.btn-primary { 
    background: #3b82f6 !important; 
    color: white !important;
    box-shadow: 0 2px 8px rgba(59,130,246,0.3);
}
.btn-primary:hover { background: #2563eb !important; }
.btn-secondary { 
    background: #6b7280 !important; 
    color: white !important;
    box-shadow: 0 2px 8px rgba(107,114,128,0.3);
}
.btn-secondary:hover { background: #4b5563 !important; }
.btn-outline { 
    background: white !important; 
    color: #3b82f6 !important; 
    border: 2px solid #3b82f6 !important;
    font-weight: 600;
}
.btn-outline:hover { 
    background: #3b82f6 !important; 
    color: white !important;
}
.conflict-details {
    background: #f8fafc !important; 
    padding: 16px; 
    border-radius: 12px; 
    margin-top: 12px;
    border: 1px solid #e2e8f0;
    color: #1e293b !important;
}
.conflict-details summary {
    font-weight: 600; color: #334155; cursor: pointer;
    padding: 8px 0;
}
.conflict-details div {
    margin: 8px 0; padding: 6px 12px;
    background: white; border-radius: 6px;
    border-left: 4px solid #3b82f6;
    color: #1f2937 !important;
}
    `;
    document.head.appendChild(style);
})();

// ================================================================================================
// SHOW SIGNUP FORM
// ================================================================================================
export function goToSignupForm() {
    const selectedSlots = getSelectedSlots();
    
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

        setTimeout(function() {
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
    if (msgEl) msgEl.textContent = ''; // Clear text content
    
    const formInputs = ['nameInput', 'phoneInput', 'emailInput', 'categorySelect', 'notesInput'];
    formInputs.forEach(function(id) {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
            input.style.borderColor = '';
            input.removeAttribute('aria-invalid');
        }
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
// CLEANUP CONFLICT ACTION BUTTONS
// ================================================================================================
function cleanupConflictButtons() {
    if (conflictActionButtons) {
        conflictActionButtons.forEach(btn => {
            if (btn && btn.parentNode) {
                btn.replaceWith(btn.cloneNode(true)); // Remove all listeners
            }
        });
        conflictActionButtons = null;
    }
}

// ================================================================================================
// VALIDATE AND SUBMIT SIGNUP (GRACEFUL CONFLICT HANDLING)
// ================================================================================================
export async function submitSignup() {
    // Immediate DOM-level lock to prevent double-clicks
    const submitBtn = document.getElementById("submitSignupBtn");
    if (!submitBtn) {
        console.error('Submit button not found');
        return;
    }
    
    if (submitBtn.disabled) {
        console.warn('Button already disabled - submission in progress');
        return;
    }
    
    submitBtn.disabled = true;
    
    if (getIsSubmitting()) {
        console.warn('Submission already in progress');
        return;
    }

    updateIsSubmitting(true);

    const msgEl = document.getElementById("signupMsg");
    
    if (!msgEl) {
        console.error('Signup message element not found');
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        return;
    }
    
    const originalBtnText = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Submitting...';
    
    const rawPhone = document.getElementById("phoneInput")?.value || '';
    const name = sanitizeInput(document.getElementById("nameInput")?.value || '', CONFIG.MAX_NAME_LENGTH);
    const phone = normalizePhone(rawPhone);
    let email = sanitizeInput(document.getElementById("emailInput")?.value || '', CONFIG.MAX_EMAIL_LENGTH);
    if (email) email = email.toLowerCase();
    const category = sanitizeInput(document.getElementById("categorySelect")?.value || '', CONFIG.MAX_CATEGORY_LENGTH);
    const notes = sanitizeInput(document.getElementById("notesInput")?.value || '', CONFIG.MAX_NOTES_LENGTH);

    function resetSubmitState() {
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }

    // Validation
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

    if (!category.trim()) {
        showMessage(msgEl, '⚠️ Please select your category.', 'error');
        resetSubmitState();
        return;
    }

    const selectedSlots = getSelectedSlots();
    if (selectedSlots.length === 0) {
        showMessage(msgEl, '⚠️ Please select at least one slot.', 'error');
        resetSubmitState();
        return;
    }

    // Use canSubmit helper for cooldown check
    const submitCheck = canSubmit();
    if (!submitCheck.canSubmit) {
        showMessage(msgEl, `⚠️ Please wait ${submitCheck.waitTime} seconds before submitting again.`, 'error');
        resetSubmitState();
        return;
    }

    showMessage(msgEl, '⏳ Processing your booking...', 'info', 8000); // Longer duration for persistent message

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
            // SUCCESS - Show confirmation
            if (API_CACHE) {
                API_CACHE.data = null;
                API_CACHE.timestamp = 0;
            }
            
            // Store slots for confirmation before clearing
            const confirmedSlots = [...selectedSlots];
            
            updateSelectedSlots([]);
            resetSlotSelectionUI();
            
            const successSection = document.getElementById("successMessage");
            const confirmationDetails = document.getElementById("confirmationDetails");
            
            if (successSection && confirmationDetails) {
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
                
                const sortedSlots = confirmedSlots.slice().sort((a, b) => {
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
                categoryInfo.innerHTML = `Selected category: <strong>${escapeHTML(category)}</strong>`;
                confirmationDetails.appendChild(categoryInfo);
                
                if (email) {
                    const emailConfirmation = document.createElement('p');
                    emailConfirmation.style.marginTop = '10px';
                    emailConfirmation.innerHTML = `A confirmation email will be sent to <strong>${escapeHTML(email)}</strong>`;
                    confirmationDetails.appendChild(emailConfirmation);
                }

                const signupSectionEl = document.getElementById("signupSection");
                if (signupSectionEl) signupSectionEl.style.display = "none";
                successSection.style.display = "block";
                successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            
            resetSubmitState();
            return;
            
        } else if (response.status === 409) {
            // ✅ GRACEFUL CONFLICT HANDLING WITH XSS PROTECTION
            const totalSlots = slotIds.length;
            const validSlots = data.validSlots || 0;
            const conflictedCount = totalSlots - validSlots;
            
            // Cleanup previous conflict buttons
            cleanupConflictButtons();
            
            // Clear previous messages/actions
            msgEl.innerHTML = '';
            
            // Create container
            const messageDiv = document.createElement('div');
            messageDiv.textContent = '⚠️ ' + (data.error || 'Some slots are no longer available');
            msgEl.appendChild(messageDiv);
            
            // Show detailed conflicts (XSS-safe)
            const details = document.createElement('details');
            details.className = 'conflict-details';
            
            const summary = document.createElement('summary');
            summary.textContent = `Show details (${validSlots}✅ ${conflictedCount}❌)`;
            details.appendChild(summary);
            
            if (data.slotStatus && Array.isArray(data.slotStatus)) {
                data.slotStatus.forEach(slot => {
                    const slotDiv = document.createElement('div');
                    const icon = slot.status === 'valid' ? '✅' : '❌';
                    slotDiv.textContent = `${icon} ${escapeHTML(slot.date)} ${escapeHTML(slot.label)}: ${escapeHTML(slot.reason || 'OK')}`;
                    details.appendChild(slotDiv);
                });
            } else {
                const noDetails = document.createElement('div');
                noDetails.textContent = 'No slot details available';
                details.appendChild(noDetails);
            }
            
            msgEl.appendChild(details);
            
            // Create action buttons container
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'conflict-actions';
            
            const bookBtn = document.createElement('button');
            bookBtn.className = 'btn btn-primary';
            bookBtn.textContent = `✅ Book ${validSlots} Valid Slots`;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-secondary';
            removeBtn.textContent = `🗑️ Remove ${conflictedCount} Conflicts`;
            
            const backBtn = document.createElement('button');
            backBtn.className = 'btn btn-outline';
            backBtn.textContent = '🔄 Back to Slots';
            
            actionsDiv.appendChild(bookBtn);
            actionsDiv.appendChild(removeBtn);
            actionsDiv.appendChild(backBtn);
            msgEl.appendChild(actionsDiv);
            
            // Store button references for cleanup
            conflictActionButtons = [bookBtn, removeBtn, backBtn];
            
            // Event handlers (one-time use)
            bookBtn.addEventListener('click', async () => {
                if (!data.slotStatus) return;
                
                const validSlotIds = data.slotStatus
                    .filter(s => s.status === 'valid')
                    .map(s => s.slotId);
                
                const currentSlots = getSelectedSlots();
                const validSlotsOnly = currentSlots.filter(s => validSlotIds.includes(s.id));
                
                if (validSlotsOnly.length === 0) {
                    showMessage(msgEl, '❌ No valid slots remaining', 'error');
                    return;
                }
                
                updateSelectedSlots(validSlotsOnly);
                updateSummaryDisplay();
                cleanupConflictButtons();
                await submitSignup(); // Re-submit valid only
            }, { once: true });
            
            removeBtn.addEventListener('click', () => {
                if (!data.slotStatus) return;
                
                const conflictedIds = data.slotStatus
                    .filter(s => s.status === 'conflict')
                    .map(s => s.slotId);
                
                const currentSlots = getSelectedSlots();
                const remainingSlots = currentSlots.filter(s => !conflictedIds.includes(s.id));
                
                updateSelectedSlots(remainingSlots);
                updateSummaryDisplay();
                cleanupConflictButtons();
                
                msgEl.innerHTML = '';
                const successDiv = document.createElement('div');
                successDiv.style.color = '#10b981';
                successDiv.textContent = `🗑️ Removed ${conflictedCount} conflicted slots`;
                msgEl.appendChild(successDiv);
            }, { once: true });
            
            backBtn.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('reloadSlots'));
                cleanupConflictButtons();
                backToSlotSelection();
            }, { once: true });
            
            resetSubmitState();
            return;
            
        } else {
            // Other errors (400, 429, 500)
            let errorMsg = data.error || getErrorMessage(response.status, 'Booking failed');
            if (response.status === 429) {
                errorMsg += ' Too many requests. Please wait a minute and try again.';
            }
            showMessage(msgEl, `❌ ${errorMsg}`, 'error');
            resetSubmitState();
        }

    } catch (err) {
        console.error('Signup error:', err);
        const errorMsg = err.message === 'Failed to fetch' 
            ? 'Unable to connect to the server. Please check your internet connection.' 
            : 'An unexpected error occurred. Please try again.';
        showMessage(msgEl, `❌ ${errorMsg}`, 'error');
        resetSubmitState();
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
    
    Object.entries(inputs).forEach(([key, input]) => {
        if (!input) return;
        
        input.addEventListener('blur', function() {
            let value = input.value;
            let validation;
            
            if (key === 'nameInput') {
                value = sanitizeInput(value, CONFIG.MAX_NAME_LENGTH);
                validation = validateName(value);
            } else if (key === 'phoneInput') {
                validation = validatePhone(value);
            } else if (key === 'emailInput') {
                value = sanitizeInput(value, CONFIG.MAX_EMAIL_LENGTH);
                validation = validateEmailField(value);
            }
            
            if (value && !validation.valid) {
                input.style.borderColor = '#ef4444';
                input.setAttribute('aria-invalid', 'true');
            } else {
                input.style.borderColor = '';
                input.removeAttribute('aria-invalid');
            }
        });
        
        input.addEventListener('input', function() {
            input.style.borderColor = '';
            input.removeAttribute('aria-invalid');
        });
    });
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
