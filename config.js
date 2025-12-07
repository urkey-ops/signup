// ================================================================================================
// CONFIG.JS - APPLICATION CONFIGURATION (UPDATED FOR PHONE-BASED SIGNUP)
// ================================================================================================

export const API_URL = "/api/signup";

export const CONFIG = {
    MAX_SLOTS_PER_BOOKING: 10,
    MAX_NAME_LENGTH: 100,
    MAX_EMAIL_LENGTH: 254,
    MAX_PHONE_LENGTH: 20,
    MAX_NOTES_LENGTH: 500,
    MAX_CATEGORY_LENGTH: 20,   // ✅ Added for 'Select Category' field
    API_COOLDOWN: 5000,        // ✅ Prevents rapid repeat submissions
    RETRY_DELAY: 3000,
    CLIENT_CACHE_TTL: 30000    // ✅ 30s cache for slot data
};

// ================================================================================================
// STATE MANAGEMENT
// ================================================================================================

export let selectedSlots = [];
export let lastApiCall = 0;
export let isSubmitting = false;

export const API_CACHE = {
    data: null,
    timestamp: 0,
    TTL: CONFIG.CLIENT_CACHE_TTL
};

// ✅ Use reference-safe mutation for reactivity
export function updateSelectedSlots(newSlots) { 
    selectedSlots.length = 0;  
    selectedSlots.push(...newSlots);  
}

export function updateLastApiCall(timestamp) { 
    lastApiCall = timestamp; 
}

export function updateIsSubmitting(status) { 
    isSubmitting = status; 
}
