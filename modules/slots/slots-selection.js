// ================================================================================================
// SLOTS SELECTION - SLOT SELECTION LOGIC & STATE MANAGEMENT
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots, CONFIG } from '../../config.js';
import { showMessage } from '../../utils.js';
import { updateSlotUI } from './slots-ui.js';
import { updateSummaryDisplay, updateFloatingButton } from './slots-summary.js';

// ================================================================================================
// SLOT SELECTION
// ================================================================================================

/**
 * Toggle slot selection (select/deselect)
 * @param {string} date - Slot date
 * @param {string} slotLabel - Slot time label
 * @param {number} rowId - Slot row ID
 * @param {HTMLElement} element - Slot DOM element (optional)
 */
export function toggleSlot(date, slotLabel, rowId, element) {
    const selectedSlots = getSelectedSlots();
    const existingIndex = selectedSlots.findIndex(slot => slot.id === rowId);
    
    if (existingIndex > -1) {
        // Deselect slot
        deselectSlot(rowId, element);
    } else {
        // Select slot (with validation)
        selectSlot(date, slotLabel, rowId, element);
    }
    
    // Update UI
    updateSummaryDisplay();
    updateFloatingButton();
}

/**
 * Select a slot (with max limit validation)
 * @param {string} date - Slot date
 * @param {string} slotLabel - Slot time label
 * @param {number} rowId - Slot row ID
 * @param {HTMLElement} element - Slot DOM element (optional)
 * @returns {boolean} True if selected successfully
 */
function selectSlot(date, slotLabel, rowId, element) {
    const selectedSlots = getSelectedSlots();
    
    // Check maximum limit
    if (selectedSlots.length >= CONFIG.MAX_SLOTS_PER_BOOKING) {
        showMessage(
            `You can only select up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots at a time. Please complete your current booking first.`, 
            'warning',
            4000
        );
        return false;
    }
    
    // Add to selection
    const newSlots = [...selectedSlots, { id: rowId, date, label: slotLabel }];
    updateSelectedSlots(newSlots);
    
    // Update UI
    if (element) {
        updateSlotUI(rowId, true);
    }
    
    console.log(`✅ Slot selected: ${date} ${slotLabel}`);
    return true;
}

/**
 * Deselect a slot
 * @param {number} rowId - Slot row ID
 * @param {HTMLElement} element - Slot DOM element (optional)
 * @returns {boolean} True if deselected successfully
 */
function deselectSlot(rowId, element) {
    const selectedSlots = getSelectedSlots();
    const newSlots = selectedSlots.filter(slot => slot.id !== rowId);
    updateSelectedSlots(newSlots);
    
    // Update UI
    if (element) {
        updateSlotUI(rowId, false);
    }
    
    console.log(`➖ Slot deselected: ${rowId}`);
    return true;
}

/**
 * Select multiple slots at once
 * @param {Array} slots - Array of slot objects [{id, date, label}]
 * @returns {Object} {success: boolean, added: number, skipped: number}
 */
export function selectMultipleSlots(slots) {
    if (!Array.isArray(slots) || slots.length === 0) {
        return { success: false, added: 0, skipped: 0 };
    }
    
    const selectedSlots = getSelectedSlots();
    let added = 0;
    let skipped = 0;
    
    const newSlots = [...selectedSlots];
    
    for (const slot of slots) {
        // Skip if already selected
        if (newSlots.some(s => s.id === slot.id)) {
            skipped++;
            continue;
        }
        
        // Skip if max limit reached
        if (newSlots.length >= CONFIG.MAX_SLOTS_PER_BOOKING) {
            skipped++;
            continue;
        }
        
        newSlots.push(slot);
        updateSlotUI(slot.id, true);
        added++;
    }
    
    if (added > 0) {
        updateSelectedSlots(newSlots);
        updateSummaryDisplay();
        updateFloatingButton();
    }
    
    console.log(`✅ Bulk selection: ${added} added, ${skipped} skipped`);
    return { success: added > 0, added, skipped };
}

/**
 * Deselect multiple slots at once
 * @param {Array<number>} slotIds - Array of slot IDs to deselect
 * @returns {number} Number of slots deselected
 */
export function deselectMultipleSlots(slotIds) {
    if (!Array.isArray(slotIds) || slotIds.length === 0) {
        return 0;
    }
    
    const selectedSlots = getSelectedSlots();
    const newSlots = selectedSlots.filter(slot => !slotIds.includes(slot.id));
    const removed = selectedSlots.length - newSlots.length;
    
    if (removed > 0) {
        updateSelectedSlots(newSlots);
        
        // Update UI for each deselected slot
        slotIds.forEach(id => {
            updateSlotUI(id, false);
        });
        
        updateSummaryDisplay();
        updateFloatingButton();
    }
    
    console.log(`➖ Bulk deselection: ${removed} slots removed`);
    return removed;
}

/**
 * Clear all selected slots
 */
export function clearAllSelections() {
    const selectedSlots = getSelectedSlots();
    
    if (selectedSlots.length === 0) {
        console.log('No slots to clear');
        return;
    }
    
    // Update UI for all slots
    selectedSlots.forEach(slot => {
        updateSlotUI(slot.id, false);
    });
    
    updateSelectedSlots([]);
    updateSummaryDisplay();
    updateFloatingButton();
    
    console.log('🧹 All selections cleared');
}

/**
 * Check if a slot is currently selected
 * @param {number} slotId - Slot ID
 * @returns {boolean} True if selected
 */
export function isSlotSelected(slotId) {
    const selectedSlots = getSelectedSlots();
    return selectedSlots.some(slot => slot.id === slotId);
}

/**
 * Get count of selected slots
 * @returns {number} Number of selected slots
 */
export function getSelectionCount() {
    return getSelectedSlots().length;
}

/**
 * Check if selection limit is reached
 * @returns {boolean} True if at max capacity
 */
export function isSelectionFull() {
    return getSelectedSlots().length >= CONFIG.MAX_SLOTS_PER_BOOKING;
}
