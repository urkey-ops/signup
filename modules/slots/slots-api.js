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

export function isLoading() {
    return isLoadingSlots;
}

// ================================================================================================
// FETCH SLOTS FROM API
// ================================================================================================

export async function fetchSlots(signal) {
    // 0️⃣ Use preloaded data once if available
    if (typeof window !== 'undefined' && window.__PRELOADED_SLOTS__) {
        const pre = window.__PRELOADED_SLOTS__;
        window.__PRELOADED_SLOTS__ = null;
        updateCache(pre);
        console.log('✅ Using preloaded slots data (from auth phase)');
        return pre;
    }

    if (isLoadingSlots) {
        console.log('⚠️ Already loading slots, skipping duplicate request');
        return null;
    }

    isLoadingSlots = true;

    try {
        const cachedData = getCachedData();
        if (cachedData && !signal) {
            console.log('✅ Using cached slots data');
            return cachedData;
        }

        console.log('📡 Fetching slots from API...');
        const startTime = performance.now();

        const response = await fetch(API_URL, {
            credentials: 'include',
            signal
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

        updateCache(data);
        console.log(`✅ Loaded ${Object.keys(data.dates || {}).length} dates`);
        return data;

    } catch (err) {
        console.error('❌ Fetch error:', err.message);
        return {
            error: err.message === 'Failed to fetch'
                ? 'Unable to connect to server. Check your internet connection.'
                : 'An unexpected error occurred.'
        };
    } finally {
        isLoadingSlots = false;
    }
}

export async function reloadSlots() {
    console.log('🔄 Force reloading slots (cache invalidated)');
    invalidateCache();
    return await fetchSlots();
}

// ================================================================================================
// DATA PROCESSING
// ================================================================================================

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

export function sortDates(groupedSlots) {
    if (!groupedSlots || typeof groupedSlots !== 'object') {
        return [];
    }
    return Object.keys(groupedSlots).sort((a, b) => new Date(a) - new Date(b));
}

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
 * NOTE: Consider replacing with the exported parseTimeForSorting from utils.js
 * to eliminate this third independent copy of the same logic.
 */
function parseTimeForSorting(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;

    const normalized = timeStr.replace(/\s*-\s*/g, '-').trim();           // FIX: was /\\s*-\\s*/g
    const firstPart  = normalized.split('-')[0].trim().toLowerCase();
    const match      = firstPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);  // FIX: was \\d, \\s
    if (!match) return 0;

    let hour       = Number(match[1]);
    const minutes  = match[2] ? Number(match[2]) : 0;
    const period   = match[3] ? match[3].toLowerCase() : null;

    if (Number.isNaN(hour) || Number.isNaN(minutes)) return 0;
    if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return 0;

    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour  = 0;

    return hour * 60 + minutes;
}

export function isValidSlotsData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.ok) return false;
    if (!data.dates || typeof data.dates !== 'object') return false;
    return true;
}

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
