// ================================================================================================
// CONFIGURATION MODULE - admin-js/config.js
// ================================================================================================

export const API_URL = '/api/admin';

export const DEFAULT_SLOTS = [
  { label: '9AM - 12PM', capacity: 6 },
  { label: '12PM - 3PM', capacity: 6 },
  { label: '3PM - 6PM',  capacity: 6 },
];

// ================================================================================================
// STATE
// Exported directly — api.js and ui.js mutate STATE.loadedSlots and STATE.selectedDates directly.
// Accessor functions (getLoadedSlots, addSelectedDate, etc.) were removed — exported but never
// imported or called anywhere in the codebase.
// ================================================================================================

// ================================================================================================
// ENCAPSULATED STATE (FIXED - No direct mutation)
let _loadedSlots = [];
let _selectedDates = [];

export function getLoadedSlots() { return [..._loadedSlots]; }
export function getSelectedDates() { return [..._selectedDates]; }

export function updateLoadedSlots(newSlots) {
  // Validate + immutable update
  const validSlots = Array.isArray(newSlots) ? newSlots.filter(slot => 
    slot?.id && typeof slot.date === 'string' && slot.capacity >= 0
  ) : [];
  _loadedSlots = validSlots;
  
  // Notify UI
  window.dispatchEvent(new CustomEvent('slotsLoaded', { 
    detail: { slots: validSlots } 
  }));
  console.log(`✅ Loaded slots updated: ${validSlots.length}`);
}

export function setSelectedDates(dates) {
  _selectedDates = Array.isArray(dates) ? [...new Set(dates)] : []; // Dedupe
  window.dispatchEvent(new CustomEvent('datesUpdated'));
}
