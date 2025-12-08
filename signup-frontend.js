// ================================================================================================
// SIGNUP FRONT-END SCRIPT (GRACEFUL CONFLICT UX)
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
    if (msgEl) msgEl.innerHTML = ''; // Clear HTML content
    
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
// VALIDATE AND SUBMIT SIGNUP (GRACEFUL CONFLICT HANDLING)
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
        min-height: 44px; /* Mobile touch target */
        color: white !important; /* 🔥 DARK TEXT OVERRIDE */
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
        color: #1e293b !important; /* 🔥 DARK TEXT */
    }
    .conflict-details summary {
        font-weight: 600; color: #334155; cursor: pointer;
        padding: 8px 0;
    }
    .conflict-details div {
        margin: 8px 0; padding: 6px 12px;
        background: white; border-radius: 6px;
        border-left: 4px solid #3b82f6;
        color: #1f2937 !important; /* 🔥 DARK TEXT */
    }
`;


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
            // SUCCESS - Show confirmation
            if (API_CACHE) {
                API_CACHE.data = null;
                API_CACHE.timestamp = 0;
            }
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
                
                const sortedSlots = selectedSlots.slice().sort((a, b) => {
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
                categoryInfo.innerHTML = `Selected category: <strong>${category}</strong>`;
                confirmationDetails.appendChild(categoryInfo);
                
                if (email) {
                    const emailConfirmation = document.createElement('p');
                    emailConfirmation.style.marginTop = '10px';
                    emailConfirmation.innerHTML = `A confirmation email will be sent to <strong>${email}</strong>`;
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
            // ✅ GRACEFUL CONFLICT HANDLING
            const totalSlots = slotIds.length;
            const validSlots = data.validSlots || 0;
            const conflictedCount = totalSlots - validSlots;
            
            // Clear previous messages/actions
            msgEl.innerHTML = '';
            
            // Show detailed conflicts
            msgEl.innerHTML = `
                <div>⚠️ ${data.error}</div>
                <details class="conflict-details">
                    <summary>Show details (${validSlots}✅ ${conflictedCount}❌)</summary>
                    ${data.slotStatus?.map(slot => 
                        `<div style="margin:4px 0">${slot.status === 'valid' ? '✅' : '❌'} ${slot.date} ${slot.label}: ${slot.reason || 'OK'}</div>`
                    ).join('') || 'No slot details available'}
                </details>
                <div class="conflict-actions">
                    <button id="bookValidSlotsBtn" class="btn btn-primary">✅ Book ${validSlots} Valid Slots</button>
                    <button id="removeConflictsBtn" class="btn btn-secondary">🗑️ Remove ${conflictedCount} Conflicts</button>
                    <button id="backToSlotsBtn" class="btn btn-outline">🔄 Back to Slots</button>
                </div>
            `;
            
            // ✅ SAFE EVENT HANDLERS (unique IDs + once: true)
            const bookBtn = document.getElementById('bookValidSlotsBtn');
            const removeBtn = document.getElementById('removeConflictsBtn');
            const backBtn = document.getElementById('backToSlotsBtn');
            
            if (bookBtn) {
                bookBtn.addEventListener('click', () => {
                    const validSlotIds = data.slotStatus.filter(s => s.status === 'valid').map(s => s.slotId);
                    updateSelectedSlots(selectedSlots.filter(s => validSlotIds.includes(s.id)));
                    submitSignup(); // Re-submit valid only
                }, { once: true });
            }
            
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    const conflictedIds = data.slotStatus.filter(s => s.status === 'conflict').map(s => s.slotId);
                    updateSelectedSlots(selectedSlots.filter(s => !conflictedIds.includes(s.id)));
                    updateSummaryDisplay();
                    msgEl.innerHTML = `<div style="color:#10b981">🗑️ Removed ${conflictedCount} conflicted slots</div>`;
                }, { once: true });
            }
            
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    window.dispatchEvent(new CustomEvent('reloadSlots'));
                    backToSlotSelection();
                }, { once: true });
            }
            
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
