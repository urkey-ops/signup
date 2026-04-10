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

export const STATE = {
  loadedSlots:   [],
  selectedDates: [],
};
