// ================================================================================================
// SLOTS API - DATA FETCHING & CACHE MANAGEMENT
// ================================================================================================

import { 
    API_URL,
    getCachedData,
    updateCache,
    invalidateCache
} from '../../config.js';
import { getErrorMessage } from '../../utils.js';

// ================================================================================================
// LOADING STATE
// ================================================================================================

let isLoadingSlots = false;

/**
 * Check if slots are currently being loaded
 * @returns {boolean} True if loading in progress
 */
export function isLoading() {
    return isLoadingSlots;
}

// ================================================================================================
// FETCH SLOTS FROM API
// ================================================================================================

/**
 * Fetch available slots from API with caching
 * @returns {Promise<Object|null>} Slots data or null on error
 */
export async function fetchSlots() {
    // Prevent duplicate requests
    if (isLoadingSlots) {
        console.log('⚠️ Already loading slots, skipping duplicate request');
        return null;
    }

    // Set loading flag immediately to prevent race condition
    isLoadingSlots = true;

    try {
        // Check cache first
        const cachedData = getCachedData();
        if (cachedData) {
            console.log('✅ Using cached slots data');
            return cachedData;
        }

        // Fetch from API
        console.log('📡 Fetching slots from API...');
        const startTime = performance.now();
        
        // 🔥 FIX: Added credentials: 'include' to send auth cookie
        const response = await fetch(API_URL, {
            credentials: 'include'
        });
        
        const fetchTime = performance.now() - startTime;
        console.log(`⏱️ API fetch took ${fetchTime.toFixed(0)}ms`);
        
        if (!response.ok) {
            const errorMsg = getErrorMessage(response.status, 'Failed to load slots');
            console.error(`❌ API error ${response.status}: ${errorMsg}`);
            return { error: errorMsg, status: response.status };
        }

        const data = await response.json();
        
        if (!data.ok) {
            console.error('❌ API returned error:', data.error);
            return { error: data.error || 'Failed to load slots' };
        }

        // Update cache
        updateCache(data);
        
        console.log(`✅ Loaded ${Object.keys(data.dates || {}).length} dates`);
        return data;

    } catch (err) {
        console.error('❌ Fetch error:', err.message);
        return { error: err.message === 'Failed to fetch' 
            ? 'Unable to connect to server. Check your internet connection.' 
            : 'An unexpected error occurred.' 
        };
    } finally {
        isLoadingSlots = false;
    }
}

/**
 * Force reload slots from API (bypass cache)
 * @returns {Promise<Object|null>} Fresh slots data or null on error
 */
export async function reloadSlots() {
    console.log('🔄 Force reloading slots (cache invalidated)');
    invalidateCache();
    return await fetchSlots();
}

// ================================================================================================
// DATA PROCESSING
// ================================================================================================

/**
 * Filter slots to only show future dates
 * @param {Object} slotsData - Raw slots data from API
 * @returns {Object} Filtered slots grouped by date
 */
export function filterFutureSlots(slotsData) {
    if (!slotsData || !slotsData.dates) {
        console.warn('filterFutureSlots: Invalid data');
        return {};
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const filtered = {};
    
    Object.entries(slotsData.dates).forEach(([date, slots]) => {
        const slotDate = new Date(date);
        if (slotDate >= today) {
            filtered[date] = slots;
        }
    });
    
    console.log(`📅 Filtered to ${Object.keys(filtered).length} future dates`);
    return filtered;
}

/**
 * Sort dates chronologically
 * @param {Object} groupedSlots - Slots grouped by date
 * @returns {Array<string>} Sorted array of date strings
 */
export function sortDates(groupedSlots) {
    if (!groupedSlots || typeof groupedSlots !== 'object') {
        return [];
    }
    
    return Object.keys(groupedSlots).sort((a, b) => {
        return new Date(a) - new Date(b);
    });
}

/**
 * Sort slots within a date by time
 * @param {Array} slots - Array of slot objects
 * @returns {Array} Sorted array of slots
 */
export function sortSlotsByTime(slots) {
    if (!Array.isArray(slots)) {
        return [];
    }
    
    return [...slots].sort((a, b) => {
        return parseTimeForSorting(a.slotLabel) - parseTimeForSorting(b.slotLabel);
    });
}

/**
 * Parse time string for sorting (e.g., "10am-12pm" -> 600)
 * @param {string} timeStr - Time string
 * @returns {number} Minutes from midnight
 */
function parseTimeForSorting(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;

    // Normalize spaces around dash
    const normalized = timeStr.replace(/\s*-\s*/g, '-').trim();

    // Take the first part before any dash
    const firstPart = normalized.split('-')[0].trim().toLowerCase();

    // Match patterns like "10am", "10:30am", etc.
    const match = firstPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match) return 0;

    let hour = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const period = match[3] ? match[3].toLowerCase() : null;

    if (Number.isNaN(hour) || Number.isNaN(minutes)) return 0;

    // Validate ranges
    if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return 0;

    // Handle 12-hour format conversion
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;

    return hour * 60 + minutes;
}

/**
 * Validate slots data structure
 * @param {Object} data - Data to validate
 * @returns {boolean} True if valid
 */
export function isValidSlotsData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.ok) return false;
    if (!data.dates || typeof data.dates !== 'object') return false;
    return true;
}

/**
 * Count total available slots
 * @param {Object} groupedSlots - Slots grouped by date
 * @returns {number} Total number of available slots
 */
export function countAvailableSlots(groupedSlots) {
    if (!groupedSlots || typeof groupedSlots !== 'object') return 0;
    
    let count = 0;
    Object.values(groupedSlots).forEach(slots => {
        if (Array.isArray(slots)) {
            count += slots.filter(s => s.available > 0).length;
        }
    });
    
    return count;
}
