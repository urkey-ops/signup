// ================================================================================================
// CONFIGURATION MODULE - IMPROVED WITH STATE MANAGEMENT
// ================================================================================================

export const API_URL = '/api/admin';

export const DEFAULT_SLOTS = [
    { label: "10AM - 12PM", capacity: 6 },
    { label: "12PM - 2PM", capacity: 6 },
    { label: "2PM - 4PM", capacity: 6 },
    { label: "4PM - 6PM", capacity: 6 },
];

// Internal state object (not exported directly)
const STATE = {
    loadedSlots: [],
    selectedDates: []
};

// ================================================================================================
// STATE MANAGEMENT FUNCTIONS - Controlled access to state
// ================================================================================================

/**
 * Get current loaded slots
 * @returns {Array}
 */
export function getLoadedSlots() {
    return STATE.loadedSlots;
}

/**
 * Set loaded slots from API
 * @param {Array} slots 
 */
export function setLoadedSlots(slots) {
    STATE.loadedSlots = Array.isArray(slots) ? [...slots] : [];
}

/**
 * Get currently selected dates
 * @returns {Array}
 */
export function getSelectedDates() {
    return [...STATE.selectedDates]; // Return copy to prevent external mutation
}

/**
 * Get count of selected dates
 * @returns {number}
 */
export function getSelectedDatesCount() {
    return STATE.selectedDates.length;
}

/**
 * Add a date to selection
 * @param {string} date - Format: MM/DD/YYYY
 * @returns {boolean} - True if added, false if already exists
 */
export function addSelectedDate(date) {
    if (!STATE.selectedDates.includes(date)) {
        STATE.selectedDates.push(date);
        return true;
    }
    return false;
}

/**
 * Remove a date from selection
 * @param {string} date - Format: MM/DD/YYYY
 * @returns {boolean} - True if removed, false if didn't exist
 */
export function removeSelectedDate(date) {
    const index = STATE.selectedDates.indexOf(date);
    if (index > -1) {
        STATE.selectedDates.splice(index, 1);
        return true;
    }
    return false;
}

/**
 * Check if date is selected
 * @param {string} date - Format: MM/DD/YYYY
 * @returns {boolean}
 */
export function isDateSelected(date) {
    return STATE.selectedDates.includes(date);
}

/**
 * Clear all selected dates
 */
export function clearSelectedDates() {
    STATE.selectedDates = [];
}

/**
 * Clear all state (for logout)
 */
export function clearAllState() {
    STATE.loadedSlots = [];
    STATE.selectedDates = [];
}

// ================================================================================================
// BACKWARDS COMPATIBILITY - Export STATE for existing code
// ================================================================================================
// NOTE: This allows existing code to work, but new code should use the functions above
export { STATE };
