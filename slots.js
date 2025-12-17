// ================================================================================================
// SLOTS - MAIN ORCHESTRATOR (WITH MINOR IMPROVEMENTS)
// ================================================================================================

import { getSelectedSlots, invalidateCache, getIsSubmitting } from './config.js';
import { injectSlotsStyles } from './modules/slots/slots-styles.js';
import { 
    fetchSlots, 
    reloadSlots,
    filterFutureSlots,
    sortDates,
    isValidSlotsData,
    countAvailableSlots
} from './modules/slots/slots-api.js';
import {
    showSkeletonUI,
    renderSlots,
    toggleDisplay,
    showNoSlotsMessage,
    showErrorMessage,
    resetSlotSelectionUI,
    cleanupSlotListeners
} from './modules/slots/slots-ui.js';
import {
    updateSummaryDisplay,
    updateFloatingButton,
    clearPendingRemovals,
    cleanupFloatingButton
} from './modules/slots/slots-summary.js';
import {
    toggleSlot,
    selectMultipleSlots,
    deselectMultipleSlots,
    clearAllSelections,
    isSlotSelected,
    getSelectionCount,
    isSelectionFull
} from './modules/slots/slots-selection.js';

// ================================================================================================
// MODULE INITIALIZATION
// ================================================================================================

// Inject styles on module load
injectSlotsStyles();

// ================================================================================================
// CONFIGURATION & STATE
// ================================================================================================

const MAX_LOAD_RETRIES = 2; // Retry failed loads up to 2 times
const RETRY_DELAY_MS = 1000; // Wait 1 second between retries
const RELOAD_DEBOUNCE_MS = 300; // Debounce force reloads

// Loading state management
let isLoading = false;
let loadAbortController = null;

// Debounce timer for reload
let reloadDebounceTimer = null;

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

/**
 * Cancel any pending slot load
 */
function cancelPendingLoad() {
    if (loadAbortController) {
        loadAbortController.abort();
        loadAbortController = null;
        console.log('🚫 Pending slot load cancelled');
    }
}

/**
 * Reset loading state
 */
function resetLoadingState() {
    isLoading = false;
    cancelPendingLoad();
}

// ================================================================================================
// MAIN LOAD FUNCTION
// ================================================================================================

/**
 * Load and display available slots (with retry and abort support)
 * Main entry point for slot loading
 * @param {number} retryCount - Current retry attempt (internal use)
 */
export async function loadSlots(retryCount = 0) {
    // Prevent duplicate simultaneous loads
    if (isLoading) {
        console.warn('⚠️ Slots already loading, skipping duplicate request');
        return;
    }
    
    isLoading = true;
    console.log(`📅 Loading slots... ${retryCount > 0 ? `(Retry ${retryCount}/${MAX_LOAD_RETRIES})` : ''}`);
    
    // Cancel previous load if still pending
    if (loadAbortController) {
        loadAbortController.abort();
    }
    loadAbortController = new AbortController();
    
    try {
        // Show skeleton UI
        showSkeletonUI();
        
        // Hide signup section if visible
        const signupSection = document.getElementById("signupSection");
        if (signupSection) signupSection.style.display = "none";
        
        // Fetch slots data with abort signal
        const data = await fetchSlots(loadAbortController.signal);
        
        // Handle errors with retry logic
        if (!data) {
            if (retryCount < MAX_LOAD_RETRIES) {
                console.log(`🔄 Retrying slot load... (${retryCount + 1}/${MAX_LOAD_RETRIES})`);
                resetLoadingState();
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                return loadSlots(retryCount + 1);
            }
            showErrorMessage('Failed to load slots. Please try again.');
            resetLoadingState();
            return;
        }
        
        if (data.error) {
            if (retryCount < MAX_LOAD_RETRIES) {
                console.log(`🔄 Retrying after error... (${retryCount + 1}/${MAX_LOAD_RETRIES})`);
                resetLoadingState();
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                return loadSlots(retryCount + 1);
            }
            showErrorMessage(data.error);
            resetLoadingState();
            return;
        }
        
        // Validate data structure
        if (!isValidSlotsData(data)) {
            console.error('❌ Invalid data structure received:', data);
            showErrorMessage('Invalid data received from server.');
            resetLoadingState();
            return;
        }
        
        // Filter and process slots
        const futureSlots = filterFutureSlots(data);
        const dateCount = Object.keys(futureSlots).length;
        const availableCount = countAvailableSlots(futureSlots);
        
        console.log(`📊 Total dates: ${dateCount}, Available slots: ${availableCount}`);
        
        if (availableCount === 0) {
            showNoSlotsMessage();
            resetLoadingState();
            return;
        }
        
        // Render slots with error boundary
        try {
            renderSlots(futureSlots, handleSlotClick);
            toggleDisplay(true);
        } catch (renderErr) {
            console.error('❌ Error rendering slots:', renderErr);
            showErrorMessage('Failed to display slots. Please refresh the page.');
            resetLoadingState();
            return;
        }
        
        // Update summary and button
        updateSummaryDisplay();
        updateFloatingButton();
        
        console.log(`✅ Successfully loaded ${availableCount} available slots`);
        
    } catch (err) {
        // Handle aborted loads (user navigated away)
        if (err.name === 'AbortError') {
            console.log('🚫 Slot loading was cancelled');
            resetLoadingState();
            return;
        }
        
        console.error('❌ Error loading slots:', err);
        
        // Retry on unexpected errors
        if (retryCount < MAX_LOAD_RETRIES) {
            console.log(`🔄 Retrying after error... (${retryCount + 1}/${MAX_LOAD_RETRIES})`);
            resetLoadingState();
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            return loadSlots(retryCount + 1);
        }
        
        showErrorMessage('An unexpected error occurred. Please refresh the page.');
        resetLoadingState();
        
    } finally {
        // Always reset loading state
        isLoading = false;
        loadAbortController = null;
    }
}

/**
 * Handle slot click event
 * @param {string} date - Slot date
 * @param {string} label - Slot label
 * @param {number} slotId - Slot ID
 * @param {HTMLElement} element - Clicked element
 */
function handleSlotClick(date, label, slotId, element) {
    const wasSelected = isSlotSelected(slotId);
    toggleSlot(date, label, slotId, element);
    
    // Optional: Log selection change
    if (!wasSelected) {
        console.log(`✓ Slot selected: ${label} on ${date} (ID: ${slotId})`);
    } else {
        console.log(`✗ Slot deselected: ${label} on ${date} (ID: ${slotId})`);
    }
}

// ================================================================================================
// EXPORTED FUNCTIONS (PUBLIC API)
// ================================================================================================

/**
 * Force reload slots from API (bypass cache) with debouncing
 */
export async function forceReloadSlots() {
    // Debounce rapid reload attempts
    if (reloadDebounceTimer) {
        console.log('⏳ Reload already scheduled, skipping duplicate');
        clearTimeout(reloadDebounceTimer);
    }
    
    reloadDebounceTimer = setTimeout(async () => {
        console.log('🔄 Force reloading slots...');
        
        // Cancel any pending load
        cancelPendingLoad();
        
        // Invalidate cache
        invalidateCache();
        
        // Reset loading state to allow new load
        isLoading = false;
        
        // Load slots
        await loadSlots();
        
        reloadDebounceTimer = null;
    }, RELOAD_DEBOUNCE_MS);
}

/**
 * Reset slot selection UI (exported for signup module)
 */
export { resetSlotSelectionUI };

/**
 * Update summary display (exported for signup module)
 */
export { updateSummaryDisplay };

/**
 * Toggle slot selection (exported for programmatic use)
 */
export { toggleSlot };

/**
 * Selection utilities (exported for advanced use)
 */
export {
    selectMultipleSlots,
    deselectMultipleSlots,
    clearAllSelections,
    isSlotSelected,
    getSelectionCount,
    isSelectionFull
};

// ================================================================================================
// BEFOREUNLOAD WARNING (FIXED TO NOT INTERFERE WITH SUBMISSION)
// ================================================================================================

/**
 * Warn user before leaving if they have unsaved selections
 * ✅ FIX: Does NOT trigger during form submission
 */
function setupBeforeUnloadWarning() {
    window.addEventListener('beforeunload', (e) => {
        // ✅ FIX: Don't show warning if actively submitting
        if (getIsSubmitting()) {
            console.log('⏳ Submission in progress - allowing navigation');
            return; // Allow navigation during submission
        }
        
        const successSection = document.getElementById("successMessage");
        const signupSection = document.getElementById("signupSection");
        
        if (!successSection || !signupSection) return;
        
        const isOnSuccessPage = successSection.style.display === "block";
        const isOnSignupPage = signupSection.style.display === "block";
        
        // ✅ FIX: Don't warn if on success page OR signup page (form is being filled)
        if (isOnSuccessPage || isOnSignupPage) {
            return;
        }
        
        const selectedSlots = getSelectedSlots();
        
        // Only warn if user has selected slots and is on the slot selection page
        if (selectedSlots.length > 0) {
            e.preventDefault();
            e.returnValue = 'You have selected slots but have not completed your booking. Are you sure you want to leave?';
            return e.returnValue;
        }
    });
}

// ================================================================================================
// CLEANUP
// ================================================================================================

/**
 * Cleanup all event listeners and pending operations
 * Call this before unloading or navigating away
 */
export function cleanup() {
    console.log('🧹 Cleaning up slots module...');
    
    // Cancel pending operations
    cancelPendingLoad();
    
    // Clear debounce timer
    if (reloadDebounceTimer) {
        clearTimeout(reloadDebounceTimer);
        reloadDebounceTimer = null;
    }
    
    // Cleanup UI listeners
    cleanupSlotListeners();
    cleanupFloatingButton();
    clearPendingRemovals();
    
    // Reset state
    isLoading = false;
    
    console.log('✅ Slots module cleaned up');
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================

function initialize() {
    console.log('📅 Slots module initializing...');
    
    // Setup beforeunload warning
    setupBeforeUnloadWarning();
    
    // Handle reload slots event (with CustomEvent type checking)
    window.addEventListener('reloadSlots', (e) => {
        console.log('🔄 Reload slots event triggered');
        
        // Verify it's a proper custom event
        if (e instanceof Event) {
            forceReloadSlots();
        } else {
            console.warn('⚠️ Invalid reload event received');
        }
    });
    
    // Cleanup on page unload
    window.addEventListener('unload', cleanup);
    
    // Cleanup on beforeunload (in case unload doesn't fire)
    window.addEventListener('beforeunload', cleanup);
    
    console.log('✅ Slots module initialized');
}

// Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
