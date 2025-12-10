// ================================================================================================
// SLOTS - MAIN ORCHESTRATOR (INITIALIZATION FIXED)
// ================================================================================================

import { getSelectedSlots, invalidateCache } from './config.js';
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
// MAIN LOAD FUNCTION
// ================================================================================================

/**
 * Load and display available slots
 * Main entry point for slot loading
 */
export async function loadSlots() {
    console.log('📅 Loading slots...');
    
    // Show skeleton UI
    showSkeletonUI();
    
    // Hide signup section if visible
    const signupSection = document.getElementById("signupSection");
    if (signupSection) signupSection.style.display = "none";
    
    // Fetch slots data
    const data = await fetchSlots();
    
    // Handle errors
    if (!data) {
        showErrorMessage('Failed to load slots. Please try again.');
        return;
    }
    
    if (data.error) {
        showErrorMessage(data.error);
        return;
    }
    
    // Validate data structure
    if (!isValidSlotsData(data)) {
        showErrorMessage('Invalid data received from server.');
        return;
    }
    
    // Filter and process slots
    const futureSlots = filterFutureSlots(data);
    const availableCount = countAvailableSlots(futureSlots);
    
    if (availableCount === 0) {
        showNoSlotsMessage();
        return;
    }
    
    // Render slots with click handler
    renderSlots(futureSlots, handleSlotClick);
    
    // Show the slots display
    toggleDisplay(true);
    
    // Update summary and button
    updateSummaryDisplay();
    updateFloatingButton();
    
    console.log(`✅ Loaded ${availableCount} available slots`);
}

/**
 * Handle slot click event
 * @param {string} date - Slot date
 * @param {string} label - Slot label
 * @param {number} slotId - Slot ID
 * @param {HTMLElement} element - Clicked element
 */
function handleSlotClick(date, label, slotId, element) {
    toggleSlot(date, label, slotId, element);
}

// ================================================================================================
// EXPORTED FUNCTIONS (PUBLIC API)
// ================================================================================================

/**
 * Force reload slots from API (bypass cache)
 */
export async function forceReloadSlots() {
    console.log('🔄 Force reloading slots...');
    invalidateCache();
    await loadSlots();
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
// BEFOREUNLOAD WARNING
// ================================================================================================

/**
 * Warn user before leaving if they have unsaved selections
 */
function setupBeforeUnloadWarning() {
    window.addEventListener('beforeunload', (e) => {
        const successSection = document.getElementById("successMessage");
        
        if (!successSection) return;
        
        const isOnSuccessPage = successSection.style.display === "block";
        const selectedSlots = getSelectedSlots();
        
        // Warn if user has selected slots and hasn't completed booking
        if (selectedSlots.length > 0 && !isOnSuccessPage) {
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
    
    cleanupSlotListeners();
    cleanupFloatingButton();
    clearPendingRemovals();
    
    console.log('✅ Slots module cleaned up');
}

// ================================================================================================
// INITIALIZATION (FIXED)
// ================================================================================================

// ✅ FIX: Run initialization immediately instead of waiting for DOMContentLoaded
// Since this module is loaded AFTER auth via dynamic import, DOM is already ready
function initialize() {
    console.log('📅 Slots module initializing...');
    
    // Setup beforeunload warning
    setupBeforeUnloadWarning();
    
    // Handle reload slots event
    window.addEventListener('reloadSlots', () => {
        console.log('🔄 Reload slots event triggered');
        forceReloadSlots();
    });
    
    // Cleanup on page unload
    window.addEventListener('unload', cleanup);
    
    console.log('✅ Slots module initialized');
}

// ✅ Run immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
