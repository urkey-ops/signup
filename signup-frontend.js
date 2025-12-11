// ============================================================================================
// SIGNUP FRONTEND - MAIN ORCHESTRATOR (INITIALIZATION FIXED)
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
// MAIN SIGNUP SUBMISSION
// ================================================================================================

/**
 * Main signup submission handler
 * Validates form, sends API request, handles responses (200, 409, errors)
 */
export async function submitSignup() {
    console.log('🚀 submitSignup() called');
    
    const submitBtn = document.getElementById("signupSubmitBtn");
    if (!submitBtn) {
        console.error('❌ Submit button not found');
        return;
    }
    
    // Immediate DOM-level lock
    if (submitBtn.disabled) {
        console.warn('⚠️ Button already disabled - submission in progress');
        return;
    }
    submitBtn.disabled = true;
    
    // Check module-level state
    if (getIsSubmitting()) {
        console.warn('⚠️ Submission already in progress (module state)');
        submitBtn.disabled = false;
        return;
    }
    
    // Set submitting state IMMEDIATELY
    updateIsSubmitting(true);
    console.log('🔒 Submission started - beforeunload disabled');
    
    // Set loading state
    const originalBtnText = setButtonLoading(submitBtn);
    
    // Get and validate form data
    const formData = getFormData();
    console.log('📋 Form data retrieved:', {
        name: formData.name,
        phone: formData.phone,
        category: formData.category,
        slotsCount: formData.selectedSlots.length
    });
    
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
        console.error('❌ Validation failed:', validation.error);
        showFormError(validation.error);
        resetSubmitState();
        return;
    }
    
    console.log('✅ Validation passed');
    
    // Check cooldown
    const submitCheck = canSubmit();
    if (!submitCheck.canSubmit) {
        console.warn('⚠️ Cooldown active:', submitCheck.waitTime, 'seconds remaining');
        showFormError(`Please wait ${submitCheck.waitTime} seconds before submitting again.`);
        resetSubmitState();
        return;
    }
    
    console.log('✅ Cooldown check passed');
    
    // Show loading message
    showFormInfo('⏳ Processing your booking...', 0);
    
    try {
        const slotIds = sanitizedData.selectedSlots.map(s => s.id);
        
        const payload = {
            name: sanitizedData.name,
            phone: sanitizedData.phone,
            email: sanitizedData.email,
            notes: sanitizedData.notes,
            category: sanitizedData.category,
            slotIds
        };
        
        console.log('📤 Sending POST request to:', API_URL);
        console.log('📦 Payload:', payload);
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        updateLastApiCall(Date.now());
        
        console.log('📥 Response received - Status:', response.status);
        console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
        
        const data = await response.json();
        console.log('📋 Response data:', data);
        
        // Handle success (200)
        if (response.ok && data.ok) {
            console.log('✅ Booking successful!');
            
            // Invalidate cache
            if (API_CACHE) {
                API_CACHE.data = null;
                API_CACHE.timestamp = 0;
                console.log('🗑️ Cache invalidated');
            }
            
            // Store booked slots before clearing
            const bookedSlots = [...sanitizedData.selectedSlots];
            
            // Clear state
            updateSelectedSlots([]);
            console.log('🧹 Selected slots cleared');
            
            // Display success
            console.log('🎉 Displaying success page');
            displayBookingSuccess(
                bookedSlots,
                sanitizedData.category,
                sanitizedData.email
            );
            
            // Reset submission state
            resetSubmitState();
            return;
        }
        
        // Handle conflicts (409)
        if (response.status === 409) {
            console.log('⚠️ Booking conflicts detected');
            
            const msgEl = document.getElementById("signupMsg");
            if (!msgEl) {
                console.error('❌ Message element not found');
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
        console.error('❌ Booking failed - Status:', response.status);
        console.error('❌ Error data:', data);
        
        let errorMsg = data.error || getErrorMessage(response.status, 'Booking failed');
        if (response.status === 429) {
            errorMsg += ' Too many requests. Please wait a minute and try again.';
        }
        showFormError(errorMsg);
        resetSubmitState();
        
    } catch (err) {
        console.error('❌ Signup error (catch block):', err);
        console.error('❌ Error stack:', err.stack);
        
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
    console.log('📝 Navigating to signup form');
    showSignupForm();
}

/**
 * Return to slot selection (called from "back" buttons)
 */
export function backToSlotSelection() {
    console.log('🔙 Returning to slot selection');
    hideSignupForm();
}

// Make functions available globally for onclick handlers
window.goToSignupForm = goToSignupForm;
window.backToSlotSelection = backToSlotSelection;

// ================================================================================================
// INITIALIZATION (FIXED - RUNS IMMEDIATELY)
// ================================================================================================

function initializeSignup() {
    console.log('📝 Signup module initializing...');
    
    // Setup form submission
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            console.log('📝 Form submit event fired');
            e.preventDefault();
            submitSignup();
        });
        console.log('✅ Form submission handler attached');
    } else {
        console.error('❌ Signup form not found');
    }
    
    // Setup back button in signup form
    const backBtn = document.getElementById('backToSlotsBtn');
    if (backBtn) {
        backBtn.addEventListener('click', backToSlotSelection);
        console.log('✅ Back button handler attached');
    } else {
        console.warn('⚠️ Back button not found');
    }
    
    // Setup "Book Another Slot" button in success page
    const resetPageBtn = document.getElementById('resetPageBtn');
    if (resetPageBtn) {
        resetPageBtn.addEventListener('click', () => {
            console.log('🔄 Book Another Slot clicked');
            updateIsSubmitting(false);
            backToSlotSelection();
        });
        console.log('✅ Book Another Slot button initialized');
    } else {
        console.warn('⚠️ Reset page button not found');
    }
    
    // Setup real-time validation
    setupRealtimeValidation();
    console.log('✅ Real-time validation initialized');
    
    console.log('✅ Signup module initialized');
}

// ✅ FIX: Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    console.log('⏳ Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initializeSignup);
} else {
    console.log('✅ DOM already ready, initializing immediately');
    initializeSignup();
}
