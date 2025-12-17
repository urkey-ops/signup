// ============================================================================================
// SIGNUP FRONTEND - MAIN ORCHESTRATOR (WITH MINOR IMPROVEMENTS)
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
// CONFIGURATION & STATE
// ================================================================================================

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 2; // Retry network failures up to 2 times
const RETRY_DELAY_MS = 1000; // Wait 1 second between retries

// Global abort controller for request cancellation
let abortController = null;

// Debounce timer for submission
let submitDebounceTimer = null;

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

/**
 * Fetch with timeout support
 * @param {string} url - API URL
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeout = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') {
            throw new Error('Request timeout - server took too long to respond');
        }
        throw err;
    }
}

/**
 * Fetch with automatic retry on network failures
 * @param {string} url - API URL
 * @param {Object} options - Fetch options
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    try {
        return await fetchWithTimeout(url, options);
    } catch (err) {
        // Only retry on network failures, not timeouts or other errors
        const isNetworkError = err.message === 'Failed to fetch' || 
                               err.message.includes('network') ||
                               err.message.includes('NetworkError');
        
        if (retries > 0 && isNetworkError) {
            const attemptNumber = MAX_RETRIES - retries + 1;
            console.log(`🔄 Network error detected. Retrying... (Attempt ${attemptNumber}/${MAX_RETRIES})`);
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            
            return fetchWithRetry(url, options, retries - 1);
        }
        
        // No more retries or non-retryable error
        throw err;
    }
}

/**
 * Cancel any pending request
 */
function cancelPendingRequest() {
    if (abortController) {
        abortController.abort();
        abortController = null;
        console.log('🚫 Pending request cancelled');
    }
}

// ================================================================================================
// MAIN SIGNUP SUBMISSION
// ================================================================================================

/**
 * Main signup submission handler (with debouncing)
 * Validates form, sends API request, handles responses (200, 409, errors)
 */
export async function submitSignup() {
    console.log('🚀 submitSignup() called');
    
    // Clear any existing debounce timer
    if (submitDebounceTimer) {
        clearTimeout(submitDebounceTimer);
    }
    
    // Debounce: wait 100ms before processing
    // This prevents accidental double-clicks
    return new Promise((resolve) => {
        submitDebounceTimer = setTimeout(async () => {
            await processSignupSubmission();
            resolve();
        }, 100);
    });
}

/**
 * Core submission logic (called after debounce)
 */
async function processSignupSubmission() {
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
    
    // Cancel any pending request before starting new one
    cancelPendingRequest();
    
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
        cancelPendingRequest();
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
        
        // Create new abort controller for this request
        abortController = new AbortController();
        
        // Send request with retry and timeout
        const response = await fetchWithRetry(API_URL, {
            method: 'POST',
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: abortController.signal
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
            
            const msgEl = document.getElementById("signupMessage");
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
        
        // Handle aborted requests (user cancelled or navigated away)
        if (err.name === 'AbortError') {
            console.log('🚫 Request was cancelled');
            resetSubmitState();
            return;
        }
        
        // Determine error message based on error type
        let errorMsg;
        if (err.message.includes('timeout')) {
            errorMsg = 'Request timed out. The server is taking too long to respond. Please try again.';
        } else if (err.message === 'Failed to fetch' || err.message.includes('network')) {
            errorMsg = 'Unable to connect to the server. Please check your internet connection and try again.';
        } else {
            errorMsg = 'An unexpected error occurred. Please try again.';
        }
        
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
    
    // Cancel any pending requests when navigating away
    cancelPendingRequest();
    
    // Reset submission state
    updateIsSubmitting(false);
    
    hideSignupForm();
}

// Make functions available globally for onclick handlers
window.goToSignupForm = goToSignupForm;
window.backToSlotSelection = backToSlotSelection;

// ================================================================================================
// CLEANUP
// ================================================================================================

/**
 * Cleanup function - call when unmounting or leaving page
 */
export function cleanup() {
    console.log('🧹 Cleaning up signup module...');
    
    // Cancel pending requests
    cancelPendingRequest();
    
    // Clear debounce timer
    if (submitDebounceTimer) {
        clearTimeout(submitDebounceTimer);
        submitDebounceTimer = null;
    }
    
    // Reset state
    updateIsSubmitting(false);
    
    console.log('✅ Signup module cleaned up');
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

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
        console.warn('⚠️ Back button not found - will be added to HTML');
    }
    
    // Setup "Book Another Slot" button in success page
    const resetPageBtn = document.getElementById('resetPageBtn');
    if (resetPageBtn) {
        resetPageBtn.addEventListener('click', () => {
            console.log('🔄 Book Another Slot clicked');
            updateIsSubmitting(false);
            cancelPendingRequest();
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
