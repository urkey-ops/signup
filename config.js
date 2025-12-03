// START OF CODE: config.js
/**
 * Configuration, State Management, and Global Constants
 * Exported for use in other modules.
 */
// API Endpoint
export const API_URL = "/api/signup";
// Configuration - MUST MATCH BACKEND
export const CONFIG = {
    MAX_SLOTS_PER_BOOKING: 10,
    MAX_NAME_LENGTH: 100,
    MAX_EMAIL_LENGTH: 254,
    MAX_PHONE_LENGTH: 20,
    MAX_NOTES_LENGTH: 500,
    API_COOLDOWN: 1000,
    RETRY_DELAY: 3000,
    CLIENT_CACHE_TTL: 30000,
};
// State management (exported as mutable variables)
export let selectedSlots = [];
export let lastApiCall = 0;
export let isSubmitting = false;
// Client-side cache
export const API_CACHE = {
    data: null,
    timestamp: 0,
    TTL: CONFIG.CLIENT_CACHE_TTL
};
// Functions to safely update state from other modules
export function updateSelectedSlots(newSlots) {
    selectedSlots = newSlots;
}
export function updateLastApiCall(timestamp) {
    lastApiCall = timestamp;
}
export function updateIsSubmitting(status) {
    isSubmitting = status;
}
// END OF CODE: config.js
