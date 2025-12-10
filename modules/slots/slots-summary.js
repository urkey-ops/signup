// ================================================================================================
// SLOTS SUMMARY - SELECTED SLOTS DISPLAY & MANAGEMENT
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots } from '../../config.js';
import { showMessage } from '../../utils.js';
import { updateSlotUI } from './slots-ui.js';
import { sortSlotsByTime } from './slots-api.js';

// Track pending removals to prevent race conditions
let pendingRemovals = new Set();
let removalTimeout = null;

// ================================================================================================
// SUMMARY DISPLAY
// ================================================================================================

/**
 * Update the selected slots summary display
 */
export function updateSummaryDisplay() {
    const summaryEl = document.getElementById('selectedSlotSummary');
    if (!summaryEl) return;
    
    const selectedSlots = getSelectedSlots();
    
    // Clear previous content
    summaryEl.innerHTML = '';
    
    // Heading
    const heading = document.createElement('div');
    heading.style.marginBottom = '12px';
    const headingStrong = document.createElement('strong');
    headingStrong.textContent = `📋 Selected ${selectedSlots.length} Slot${selectedSlots.length !== 1 ? 's' : ''}:`;
    heading.appendChild(headingStrong);
    summaryEl.appendChild(heading);
    
    // Chips container
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'chips-container';
    
    // Sort slots by date and time
    const sortedSlots = sortSlotsByDate(selectedSlots);
    
    sortedSlots.forEach(slot => {
        const chip = createSlotChip(slot);
        chipsContainer.appendChild(chip);
    });
    
    summaryEl.appendChild(chipsContainer);
    
    console.log(`✅ Summary updated: ${selectedSlots.length} slots`);
}

/**
 * Sort slots by date, then by time
 * @param {Array} slots - Array of slot objects
 * @returns {Array} Sorted slots
 */
function sortSlotsByDate(slots) {
    return [...slots].sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        return parseTimeForSorting(a.label) - parseTimeForSorting(b.label);
    });
}

/**
 * Parse time for sorting (simplified version)
 * @param {string} timeStr - Time string
 * @returns {number} Sortable time value
 */
function parseTimeForSorting(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    
    const normalized = timeStr.replace(/\s*-\s*/g, '-').trim();
    const firstPart = normalized.split('-')[0].trim().toLowerCase();
    const match = firstPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    
    if (!match) return 0;
    
    let hour = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const period = match[3] ? match[3].toLowerCase() : null;
    
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    
    return hour * 60 + minutes;
}

/**
 * Create a slot chip element
 * @param {Object} slot - Slot object {id, date, label}
 * @returns {HTMLElement} Chip element
 */
function createSlotChip(slot) {
    const dateObj = new Date(slot.date);
    const shortDate = dateObj.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    
    // Shorten time format: "10:00am-12:00pm" -> "10am-12pm"
    const shortTime = slot.label
        .replace(/:\d{2}/g, '')
        .replace(/\s*-\s*/g, '-')
        .replace(/\s/g, '');
    
    const chip = document.createElement('div');
    chip.className = 'slot-chip';
    chip.dataset.slotId = slot.id;
    
    const chipContent = document.createElement('span');
    chipContent.className = 'chip-content';
    
    const chipDate = document.createElement('span');
    chipDate.className = 'chip-date';
    chipDate.textContent = shortDate;
    chipContent.appendChild(chipDate);
    
    const chipTime = document.createElement('span');
    chipTime.className = 'chip-time';
    chipTime.textContent = shortTime;
    chipContent.appendChild(chipTime);
    
    chip.appendChild(chipContent);
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Remove ${slot.date} ${slot.label}`);
    removeBtn.setAttribute('title', 'Remove this booking');
    removeBtn.addEventListener('click', () => removeSlotFromSummary(slot.id));
    chip.appendChild(removeBtn);
    
    return chip;
}

// ================================================================================================
// SLOT REMOVAL
// ================================================================================================

/**
 * Remove a slot from the summary (with debouncing to prevent race conditions)
 * @param {number} slotId - Slot ID to remove
 */
function removeSlotFromSummary(slotId) {
    // Prevent duplicate removals
    if (pendingRemovals.has(slotId)) {
        console.log('Removal already pending for slot:', slotId);
        return;
    }
    
    pendingRemovals.add(slotId);
    
    const chipElement = document.querySelector(`.slot-chip[data-slot-id="${slotId}"]`);
    
    if (chipElement) {
        // Add animation class
        chipElement.classList.add('removing');
        
        // Clear any existing timeout
        if (removalTimeout) {
            clearTimeout(removalTimeout);
        }
        
        // Process all pending removals after animation
        removalTimeout = setTimeout(() => {
            const selectedSlots = getSelectedSlots();
            const newSlots = selectedSlots.filter(slot => !pendingRemovals.has(slot.id));
            updateSelectedSlots(newSlots);
            
            // Update UI for all removed slots
            pendingRemovals.forEach(id => {
                updateSlotUI(id, false);
            });
            
            // Clear pending set
            const removalCount = pendingRemovals.size;
            pendingRemovals.clear();
            removalTimeout = null;
            
            // Refresh summary
            updateSummaryDisplay();
            updateFloatingButton();
            
            showMessage(
                `Removed ${removalCount} slot${removalCount !== 1 ? 's' : ''} from selection`, 
                'info', 
                2000
            );
        }, 350); // Slightly longer than animation duration
        
    } else {
        // Immediate removal if chip not found
        const selectedSlots = getSelectedSlots();
        const newSlots = selectedSlots.filter(slot => slot.id !== slotId);
        updateSelectedSlots(newSlots);
        pendingRemovals.delete(slotId);
        
        updateSlotUI(slotId, false);
        updateSummaryDisplay();
        updateFloatingButton();
    }
}

// ================================================================================================
// FLOATING BUTTON
// ================================================================================================

let floatingButtonListener = null;

/**
 * Update the floating "Continue to Sign Up" button
 */
export function updateFloatingButton() {
    const btnContainer = document.getElementById("floatingSignupBtnContainer");
    const btn = document.getElementById("floatingSignupBtn");
    
    if (!btnContainer || !btn) {
        console.warn('Floating button elements not found');
        return;
    }
    
    const selectedSlots = getSelectedSlots();
    const count = selectedSlots.length;
    
    if (count > 0) {
        btnContainer.style.display = "block";
        btn.textContent = `Continue to Sign Up (${count} Slot${count !== 1 ? 's' : ''} Selected)`;
        
        // Clean up previous listener
        if (floatingButtonListener) {
            btn.removeEventListener('click', floatingButtonListener);
        }
        
        // Create new listener
        floatingButtonListener = (e) => {
            e.preventDefault();
            
            // Use global function if available (from signup module)
            if (typeof window.goToSignupForm === 'function') {
                window.goToSignupForm();
            }
            
            window.dispatchEvent(new CustomEvent('showSignupForm'));
        };
        
        btn.addEventListener('click', floatingButtonListener);
    } else {
        btnContainer.style.display = "none";
        if (floatingButtonListener) {
            btn.removeEventListener('click', floatingButtonListener);
            floatingButtonListener = null;
        }
    }
}

/**
 * Clear all pending removal timeouts (cleanup)
 */
export function clearPendingRemovals() {
    if (removalTimeout) {
        clearTimeout(removalTimeout);
        removalTimeout = null;
    }
    pendingRemovals.clear();
    console.log('🧹 Pending removals cleared');
}

/**
 * Cleanup floating button listener
 */
export function cleanupFloatingButton() {
    const btn = document.getElementById("floatingSignupBtn");
    if (btn && floatingButtonListener) {
        btn.removeEventListener('click', floatingButtonListener);
        floatingButtonListener = null;
        console.log('🧹 Floating button listener cleaned up');
    }
}
