// ================================================================================================
// SIGNUP CONFLICT HANDLER - 409 RESPONSE UI & LOGIC
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots } from '../../config.js';
import { escapeHTML } from '../../utils.js';
import { updateSummaryDisplay } from '../../slots.js';

// Track active conflict buttons for cleanup
let activeConflictButtons = null;

// ================================================================================================
// CONFLICT UI RENDERING
// ================================================================================================

/**
 * Display 409 conflict response with interactive options
 * @param {HTMLElement} msgEl - Message container element
 * @param {Object} data - API response data with slotStatus array
 * @param {Function} onBookValid - Callback to book valid slots only
 * @param {Function} onRemoveConflicts - Callback to remove conflicted slots
 * @param {Function} onBackToSlots - Callback to return to slot selection
 */
export function displayConflictUI(msgEl, data, onBookValid, onRemoveConflicts, onBackToSlots) {
    if (!msgEl || !data) {
        console.error('displayConflictUI: Missing required parameters');
        return;
    }
    
    // Cleanup previous conflict buttons
    cleanupConflictButtons();
    
    // Clear container
    msgEl.innerHTML = '';
    
    const validSlots = data.validSlots || 0;
    const slotStatus = data.slotStatus || [];
    const conflictedCount = slotStatus.filter(s => s.status === 'conflict').length;
    
    // Main error message
    const messageDiv = document.createElement('div');
    messageDiv.style.marginBottom = '10px';
    messageDiv.textContent = '⚠️ ' + (data.error || 'Some slots are no longer available');
    msgEl.appendChild(messageDiv);
    
    // Conflict details accordion
    const details = createConflictDetailsAccordion(validSlots, conflictedCount, slotStatus);
    msgEl.appendChild(details);
    
    // Action buttons
    const actionsDiv = createConflictActionButtons(
        validSlots,
        conflictedCount,
        onBookValid,
        onRemoveConflicts,
        onBackToSlots
    );
    msgEl.appendChild(actionsDiv);
    
    console.log(`✅ Conflict UI displayed: ${validSlots} valid, ${conflictedCount} conflicts`);
}

/**
 * Create conflict details accordion
 * @param {number} validSlots - Number of valid slots
 * @param {number} conflictedCount - Number of conflicted slots
 * @param {Array} slotStatus - Array of slot status objects
 * @returns {HTMLElement} Details element
 */
function createConflictDetailsAccordion(validSlots, conflictedCount, slotStatus) {
    const details = document.createElement('details');
    details.className = 'conflict-details';
    
    const summary = document.createElement('summary');
    summary.textContent = `Show details (${validSlots}✅ ${conflictedCount}❌)`;
    details.appendChild(summary);
    
    if (slotStatus && Array.isArray(slotStatus) && slotStatus.length > 0) {
        slotStatus.forEach(slot => {
            const slotDiv = document.createElement('div');
            const icon = slot.status === 'valid' ? '✅' : '❌';
            const date = escapeHTML(slot.date || 'Unknown');
            const label = escapeHTML(slot.label || 'Unknown');
            const reason = escapeHTML(slot.reason || 'OK');
            
            slotDiv.textContent = `${icon} ${date} ${label}: ${reason}`;
            details.appendChild(slotDiv);
        });
    } else {
        const noDetails = document.createElement('div');
        noDetails.textContent = 'No slot details available';
        details.appendChild(noDetails);
    }
    
    return details;
}

/**
 * Create conflict action buttons
 * @param {number} validSlots - Number of valid slots
 * @param {number} conflictedCount - Number of conflicted slots
 * @param {Function} onBookValid - Book valid slots callback
 * @param {Function} onRemoveConflicts - Remove conflicts callback
 * @param {Function} onBackToSlots - Back to slots callback
 * @returns {HTMLElement} Actions container
 */
function createConflictActionButtons(validSlots, conflictedCount, onBookValid, onRemoveConflicts, onBackToSlots) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'conflict-actions';
    
    // Book valid slots button
    const bookBtn = document.createElement('button');
    bookBtn.className = 'btn btn-primary';
    bookBtn.textContent = `✅ Book ${validSlots} Valid Slot${validSlots !== 1 ? 's' : ''}`;
    bookBtn.disabled = validSlots === 0;
    
    // Remove conflicts button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-secondary';
    removeBtn.textContent = `🗑️ Remove ${conflictedCount} Conflict${conflictedCount !== 1 ? 's' : ''}`;
    
    // Back to slots button
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-outline';
    backBtn.textContent = '🔄 Back to Slots';
    
    actionsDiv.appendChild(bookBtn);
    actionsDiv.appendChild(removeBtn);
    actionsDiv.appendChild(backBtn);
    
    // Store references for cleanup
    activeConflictButtons = [bookBtn, removeBtn, backBtn];
    
    // Attach event handlers (one-time use)
    bookBtn.addEventListener('click', async () => {
        if (validSlots > 0) {
            await onBookValid();
        }
    }, { once: true });
    
    removeBtn.addEventListener('click', () => {
        onRemoveConflicts();
    }, { once: true });
    
    backBtn.addEventListener('click', () => {
        onBackToSlots();
    }, { once: true });
    
    return actionsDiv;
}

// ================================================================================================
// CONFLICT RESOLUTION LOGIC
// ================================================================================================

/**
 * Filter selected slots to keep only valid ones
 * @param {Array} slotStatus - Slot status array from API
 * @returns {Array} Filtered slots array
 */
export function filterValidSlots(slotStatus) {
    if (!slotStatus || !Array.isArray(slotStatus)) {
        console.warn('filterValidSlots: Invalid slotStatus');
        return [];
    }
    
    const validSlotIds = slotStatus
        .filter(s => s.status === 'valid')
        .map(s => s.slotId);
    
    const selectedSlots = getSelectedSlots();
    const validSlots = selectedSlots.filter(s => validSlotIds.includes(s.id));
    
    console.log(`✅ Filtered to ${validSlots.length} valid slots`);
    return validSlots;
}

/**
 * Remove conflicted slots from selection
 * @param {Array} slotStatus - Slot status array from API
 * @returns {Array} Filtered slots array
 */
export function removeConflictedSlots(slotStatus) {
    if (!slotStatus || !Array.isArray(slotStatus)) {
        console.warn('removeConflictedSlots: Invalid slotStatus');
        return getSelectedSlots();
    }
    
    const conflictedIds = slotStatus
        .filter(s => s.status === 'conflict')
        .map(s => s.slotId);
    
    const selectedSlots = getSelectedSlots();
    const remainingSlots = selectedSlots.filter(s => !conflictedIds.includes(s.id));
    
    console.log(`🗑️ Removed ${conflictedIds.length} conflicted slots`);
    return remainingSlots;
}

/**
 * Show success message after removing conflicts
 * @param {HTMLElement} msgEl - Message container
 * @param {number} count - Number of conflicts removed
 */
export function showConflictRemovalSuccess(msgEl, count) {
    if (!msgEl) return;
    
    msgEl.innerHTML = '';
    const successDiv = document.createElement('div');
    successDiv.style.color = '#10b981';
    successDiv.style.padding = '12px';
    successDiv.style.textAlign = 'center';
    successDiv.textContent = `🗑️ Removed ${count} conflicted slot${count !== 1 ? 's' : ''}`;
    msgEl.appendChild(successDiv);
}

// ================================================================================================
// CONFLICT BUTTON CLEANUP
// ================================================================================================

/**
 * Cleanup active conflict buttons to prevent memory leaks
 */
export function cleanupConflictButtons() {
    if (activeConflictButtons) {
        activeConflictButtons.forEach(btn => {
            if (btn && btn.parentNode) {
                // Replace with clone to remove all event listeners
                btn.replaceWith(btn.cloneNode(true));
            }
        });
        activeConflictButtons = null;
        console.log('🧹 Conflict buttons cleaned up');
    }
}

// ================================================================================================
// CONFLICT HANDLERS (to be used by main signup module)
// ================================================================================================

/**
 * Handle "Book Valid Slots" action
 * @param {Array} slotStatus - Slot status from API
 * @param {Function} submitCallback - Function to re-submit with valid slots
 */
export async function handleBookValidSlots(slotStatus, submitCallback) {
    const validSlots = filterValidSlots(slotStatus);
    
    if (validSlots.length === 0) {
        console.warn('No valid slots remaining');
        return false;
    }
    
    updateSelectedSlots(validSlots);
    updateSummaryDisplay();
    cleanupConflictButtons();
    
    if (typeof submitCallback === 'function') {
        await submitCallback();
    }
    
    return true;
}

/**
 * Handle "Remove Conflicts" action
 * @param {Array} slotStatus - Slot status from API
 * @param {HTMLElement} msgEl - Message container for success display
 */
export function handleRemoveConflicts(slotStatus, msgEl) {
    const conflictedCount = slotStatus.filter(s => s.status === 'conflict').length;
    const remainingSlots = removeConflictedSlots(slotStatus);
    
    updateSelectedSlots(remainingSlots);
    updateSummaryDisplay();
    cleanupConflictButtons();
    
    if (msgEl) {
        showConflictRemovalSuccess(msgEl, conflictedCount);
    }
}

/**
 * Handle "Back to Slots" action
 * @param {Function} backCallback - Navigation callback
 */
export function handleBackToSlots(backCallback) {
    cleanupConflictButtons();
    
    if (typeof backCallback === 'function') {
        backCallback();
    }
}
