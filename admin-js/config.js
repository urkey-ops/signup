// ================================================================================================
// CONFIGURATION MODULE
// ================================================================================================

export const API_URL = '/api/admin';

export const DEFAULT_SLOTS = [
    { label: "10AM - 12PM", capacity: 6 },
    { label: "12PM - 2PM", capacity: 6 },
    { label: "2PM - 4PM", capacity: 6 },
    { label: "4PM - 6PM", capacity: 6 },
];

export const STATE = {
    loadedSlots: [],
    selectedDates: []
};
