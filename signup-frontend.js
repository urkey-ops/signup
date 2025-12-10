// ============================================================================================
// SIGNUP FRONTEND - MAIN ORCHESTRATOR (SUBMISSION BUG FIXED)
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
    getErrorMessage
} from './utils.js';
import { injectSignupStyles } from './modules/signup/signup-styles.js';
import { 
    validateSignupForm,
    setupRealtimeValidation 
} from './modules/signup/signup-validation.js';
import {
    showSignupForm,
    hideSignupForm,
    getFormData,
    clearSignupForm,
    displayBookingSuccess,
    setButtonLoading,
    resetButtonState,
    showFormError,
    showFormInfo,
    clearFormMessages
} from './modules/signup/signup-form.js';
import {
    displayConflictUI,
    handleBookValidSlots,
    handleRemoveConflicts,
    handleBackToSlots,
    cleanupConflictButtons
} from './modules/signup/signup-conflict.js';

// ================================================================================================
// MODULE INITIALIZATION
// ================================================================================================

// Inject styles on module load
injectSignupStyles();

// ================================================================================================
// MAIN SIGNUP SUBMISSION (FIXED)
// ================================================================================================

/**
 * Main signup submission handler
 * Validates form, sends API request, handles responses (200, 409, errors)
 * ✅ FIX: Properly maintains submission state to prevent beforeunload interference
 */
export async function submitSignup() {
    const submitBtn = document.getElementById("submitSignupBtn");
    if (!submitBtn) {
        console.error('Submit button not found');
        return;
    }
    
    // Immediate DOM-level lock
    if (submitBtn.disabled) {
        console.warn('Button already disabled - submission in progress');
        return;
    }
    submitBtn.disabled = true;
    
    // Check module-level state
    if (getIsSubmitting()) {
        console.warn('Submission already in progress');
        submitBtn.disabled = false;
        return;
    }
    
    // ✅ FIX: Set submitting state IMMEDIATELY to prevent beforeunload
    updateIsSubmitting(true);
    console.log('🔒 Submission started - beforeunload disabled');
    
    // Set loading state
    const originalBtnText = setButtonLoading(submitBtn);
    
    // Get and validate form data
    const formData = getFormData();
    const sanitizedData = {
        name: sanitizeInput(formData.name, CONFIG.MAX_NAME_LENGTH),
        phone: normalizePhone(formData.phone),
        email: sanitizeInput(formData.email, CONFIG.MAX_EMAIL_LENGTH)?.toLowerCase(),
        category: sanitizeInput(formData.category, CONFIG.MAX_CATEGORY_LENGTH),
        notes: sanitizeInput(formData.notes, CONFIG.MAX_NOTES_LENGTH),
        selectedSlots: formData.selectedSlots
    };
    
    // Helper to reset button state
    const resetSubmitState = () => {
        updateIsSubmitting(false);
        console.log('🔓 Submission ended - beforeunload re-enabled');
        resetButtonState(submitBtn, originalBtnText);
    };
    
    // Validate form
    const validation = validateSignupForm({
        name: sanitizedData.name,
        phone: formData.phone,
        email: sanitizedData.email,
        category: sanitizedData.category,
        notes: sanitizedData.notes,
        selectedSlots: sanitizedData.selectedSlots
    });
    
    if (!validation.valid) {
        showFormError(validation.error);
        resetSubmitState();
        return;
    }
    
    // Check cooldown
    const submitCheck = canSubmit();
    if (!submitCheck.canSubmit) {
        showFormError(`Please wait ${submitCheck.waitTime} seconds before submitting again.`);
        resetSubmitState();
        return;
    }
    
    // Show loading message
    showFormInfo('⏳ Processing your booking...', 0);
    
    try {
        const slotIds = sanitizedData.selectedSlots.map(s => s.id);
        
        console.log('📤 Sending signup request...', {
            name: sanitizedData.name,
            phone: sanitizedData.phone,
            category: sanitizedData.category,
            slotCount: slotIds.length
        });
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: sanitizedData.name,
                phone: sanitizedData.phone,
                email: sanitizedData.email,
                notes: sanitizedData.notes,
                category: sanitizedData.category,
                slotIds
            })
        });
        
        updateLastApiCall(Date.now());
        
        console.log('📥 Response received:', response.status);
        
        const data = await response.json();
        console.log('📋 Response data:', data);
        
        // Handle success (200)
        if (response.ok && data.ok) {
            console.log('✅ Booking successful!');
            
            // Invalidate cache
            if (API_CACHE) {
                API_CACHE.data = null;
                API_CACHE.timestamp = 0;
            }
            
            // Store booked slots before clearing
            const bookedSlots = [...sanitizedData.selectedSlots];
            
            // Clear state
            updateSelectedSlots([]);
            
            // ✅ KEEP submission state true during success display
            // It will be reset when user clicks "Book Another Slot"
            
            // Display success
            displayBookingSuccess(
                bookedSlots,
                sanitizedData.category,
                sanitizedData.email
            );
            
            // ✅ Reset submission state AFTER success display
            resetSubmitState();
            return;
        }
        
        // Handle conflicts (409)
        if (response.status === 409) {
            console.log('⚠️ Booking conflicts detected');
            
            const msgEl = document.getElementById("signupMsg");
            if (!msgEl) {
                console.error('Message element not found');
                resetSubmitState();
                return;
            }
            
            // Display conflict UI with callbacks
            displayConflictUI(
                msgEl,
                data,
                // Book valid slots callback
                async () => {
                    await handleBookValidSlots(data.slotStatus, submitSignup);
                },
                // Remove conflicts callback
                () => {
                    handleRemoveConflicts(data.slotStatus, msgEl);
                },
                // Back to slots callback
                () => {
                    handleBackToSlots(() => {
                        window.dispatchEvent(new CustomEvent('reloadSlots'));
                        hideSignupForm();
                    });
                }
            );
            
            resetSubmitState();
            return;
        }
        
        // Handle other errors (400, 429, 500)
        console.error('❌ Booking failed:', response.status, data);
        let errorMsg = data.error || getErrorMessage(response.status, 'Booking failed');
        if (response.status === 429) {
            errorMsg += ' Too many requests. Please wait a minute and try again.';
        }
        showFormError(errorMsg);
        resetSubmitState();
        
    } catch (err) {
        console.error('❌ Signup error:', err);
        const errorMsg = err.message === 'Failed to fetch' 
            ? 'Unable to connect to the server. Please check your internet connection.' 
            : 'An unexpected error occurred. Please try again.';
        showFormError(errorMsg);
        resetSubmitState();
    }
}

// ================================================================================================
// PUBLIC API (exported to window for global access)
// ================================================================================================

/**
 * Navigate to signup form (called from floating button)
 */
export function goToSignupForm() {
    showSignupForm();
}

/**
 * Return to slot selection (called from "back" buttons)
 */
export function backToSlotSelection() {
    hideSignupForm();
}

// Make functions available globally for onclick handlers
window.goToSignupForm = goToSignupForm;
window.backToSlotSelection = backToSlotSelection;

// ================================================================================================
// INITIALIZATION
// ================================================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('📝 Signup module initializing...');
    
    // Setup form submission
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitSignup();
        });
    }
    
    // Setup back button in signup form
    const backBtn = document.getElementById('backToSlotsBtn');
    if (backBtn) {
        backBtn.addEventListener('click', backToSlotSelection);
    }
    
    // Setup "Book Another Slot" button in success page
    const resetPageBtn = document.getElementById('resetPageBtn');
    if (resetPageBtn) {
        resetPageBtn.addEventListener('click', () => {
            // ✅ Ensure submission state is cleared when booking another slot
            updateIsSubmitting(false);
            backToSlotSelection();
        });
        console.log('✅ Book Another Slot button initialized');
    }
    
    // Setup real-time validation
    setupRealtimeValidation();
    
    console.log('✅ Signup module initialized');
});
