// ================================================================================================
// BACKEND CONFIGURATION & UTILITIES - State-of-the-Art Version
// ================================================================================================

// ================================================================================================
// CONFIGURATION CONSTANTS
// ================================================================================================

const CONFIG = Object.freeze({
    // Booking limits
    MAX_SLOTS_PER_BOOKING: 10,
    MIN_SLOTS_PER_BOOKING: 1,
    
    // Input validation
    MAX_NAME_LENGTH: 100,
    MIN_NAME_LENGTH: 2,
    MAX_EMAIL_LENGTH: 254,
    MAX_PHONE_LENGTH: 20,
    MAX_NOTES_LENGTH: 500,
    MAX_CATEGORY_LENGTH: 50,
    
    // Rate limiting
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 50,
    RATE_LIMIT_CLEANUP_INTERVAL: 300000, // 5 minutes
    
    // Caching
    CACHE_TTL: 30000, // 30 seconds
    
    // Concurrency control
    MAX_CONCURRENT_BOOKINGS: 3,
    BOOKING_TIMEOUT: 30000, // 30 seconds
    
    // Phone validation
    PHONE_REGEX: /^\d{10}$/,
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
});

const SHEETS = Object.freeze({
    SLOTS: {
        NAME: 'Slots',
        RANGE: 'A2:E',
        COLS: Object.freeze({ 
            DATE: 0, 
            LABEL: 1, 
            CAPACITY: 2, 
            TAKEN: 3, 
            AVAILABLE: 4 
        })
    },
    SIGNUPS: {
        NAME: 'Signups',
        RANGE: 'A2:J',
        COLS: Object.freeze({ 
            TIMESTAMP: 0, 
            DATE: 1, 
            SLOT_LABEL: 2, 
            NAME: 3, 
            EMAIL: 4, 
            PHONE: 5, 
            CATEGORY: 6, 
            NOTES: 7, 
            SLOT_ROW_ID: 8, 
            STATUS: 9 
        })
    }
});

// ================================================================================================
// ENVIRONMENT VALIDATION
// ================================================================================================

const REQUIRED_ENV = [
    'SHEET_ID', 
    'GOOGLE_PRIVATE_KEY', 
    'GOOGLE_SERVICE_ACCOUNT_EMAIL', 
    'SIGNUPS_GID', 
    'SLOTS_GID'
];

console.log('🔍 STARTUP: Validating environment variables...');

const envStatus = {};
const missingVars = [];

REQUIRED_ENV.forEach(key => {
    const exists = !!process.env[key];
    envStatus[key] = exists ? '✅' : '❌ MISSING';
    
    if (!exists) {
        console.error(`❌ CRITICAL: Missing environment variable: ${key}`);
        missingVars.push(key);
    }
});

console.table(envStatus);

if (missingVars.length > 0) {
    const errorMsg = `Missing required environment variables: ${missingVars.join(', ')}`;
    console.error('❌ FATAL:', errorMsg);
    throw new Error(errorMsg);
}

// Parse and validate GID values
const signupsGid = parseInt(process.env.SIGNUPS_GID, 10);
const slotsGid = parseInt(process.env.SLOTS_GID, 10);

if (isNaN(signupsGid) || signupsGid < 0) {
    throw new Error('Invalid SIGNUPS_GID: must be a non-negative integer');
}
if (isNaN(slotsGid) || slotsGid < 0) {
    throw new Error('Invalid SLOTS_GID: must be a non-negative integer');
}

const ENV = Object.freeze({
    SIGNUPS_GID: signupsGid,
    SLOTS_GID: slotsGid,
    SHEET_ID: process.env.SHEET_ID,
    TIMEZONE: process.env.TIMEZONE || 'America/New_York',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID || null,
    NODE_ENV: process.env.NODE_ENV || 'production'
});

console.log('✅ Configuration validated:', {
    SHEET_ID: `${ENV.SHEET_ID.substring(0, 10)}...`,
    SIGNUPS_GID: ENV.SIGNUPS_GID,
    SLOTS_GID: ENV.SLOTS_GID,
    TIMEZONE: ENV.TIMEZONE,
    NODE_ENV: ENV.NODE_ENV
});

// ================================================================================================
// IN-MEMORY STORAGE
// ================================================================================================

class Cache {
    constructor(ttl) {
        this.data = null;
        this.timestamp = 0;
        this.ttl = ttl;
        this.hits = 0;
        this.misses = 0;
    }
    
    get() {
        const now = Date.now();
        if (this.data && (now - this.timestamp) < this.ttl) {
            this.hits++;
            console.log(`📦 Cache HIT (${this.hits} hits, ${this.misses} misses)`);
            return this.data;
        }
        this.misses++;
        console.log(`📦 Cache MISS (${this.hits} hits, ${this.misses} misses)`);
        return null;
    }
    
    set(data) {
        this.data = data;
        this.timestamp = Date.now();
        console.log('📦 Cache UPDATED');
    }
    
    invalidate() {
        this.data = null;
        this.timestamp = 0;
        console.log('📦 Cache INVALIDATED');
    }
    
    getStats() {
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: this.hits + this.misses > 0 
                ? (this.hits / (this.hits + this.misses) * 100).toFixed(2) + '%'
                : 'N/A',
            age: this.data ? Date.now() - this.timestamp : 0
        };
    }
}

const slotsCache = new Cache(CONFIG.CACHE_TTL);
const rateLimitMap = new Map();
const activeBookingsMap = new Map();

// ================================================================================================
// CACHE FUNCTIONS
// ================================================================================================

function getCachedSlots() {
    return slotsCache.get();
}

function setCachedSlots(data) {
    slotsCache.set(data);
}

function invalidateCache() {
    slotsCache.invalidate();
}

function getCacheStats() {
    return slotsCache.getStats();
}

// ================================================================================================
// RATE LIMITING
// ================================================================================================

/**
 * Check if a client has exceeded rate limit
 * @param {string} identifier - Client identifier (IP address)
 * @returns {boolean} True if within rate limit
 */
function checkRateLimit(identifier) {
    const now = Date.now();
    const requests = rateLimitMap.get(identifier) || [];
    
    // Filter recent requests within window
    const recentRequests = requests.filter(
        timestamp => now - timestamp < CONFIG.RATE_LIMIT_WINDOW
    );
    
    if (recentRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
        console.warn(`⚠️ Rate limit exceeded for ${identifier}: ${recentRequests.length} requests`);
        return false;
    }
    
    // Add current request and update map
    recentRequests.push(now);
    rateLimitMap.set(identifier, recentRequests);
    
    return true;
}

/**
 * Get rate limit status for a client
 * @param {string} identifier - Client identifier
 * @returns {Object} Rate limit status
 */
function getRateLimitStatus(identifier) {
    const now = Date.now();
    const requests = rateLimitMap.get(identifier) || [];
    const recentRequests = requests.filter(
        timestamp => now - timestamp < CONFIG.RATE_LIMIT_WINDOW
    );
    
    return {
        requests: recentRequests.length,
        limit: CONFIG.RATE_LIMIT_MAX_REQUESTS,
        remaining: Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - recentRequests.length),
        resetIn: CONFIG.RATE_LIMIT_WINDOW
    };
}

// Cleanup old rate limit entries periodically
const rateLimitCleanup = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [identifier, timestamps] of rateLimitMap.entries()) {
        const validTimestamps = timestamps.filter(
            t => now - t < CONFIG.RATE_LIMIT_WINDOW
        );
        
        if (validTimestamps.length === 0) {
            rateLimitMap.delete(identifier);
            cleaned++;
        } else if (validTimestamps.length < timestamps.length) {
            rateLimitMap.set(identifier, validTimestamps);
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Rate limit cleanup: removed ${cleaned} expired entries`);
    }
}, CONFIG.RATE_LIMIT_CLEANUP_INTERVAL);

// Graceful shutdown
process.on('SIGTERM', () => {
    clearInterval(rateLimitCleanup);
});

// ================================================================================================
// CONCURRENT BOOKING CONTROL
// ================================================================================================

/**
 * Check if a phone number has too many concurrent bookings
 * @param {string} phone - Normalized phone number
 * @returns {boolean} True if within limit
 */
function checkConcurrentBookings(phone) {
    const activeCount = activeBookingsMap.get(phone) || 0;
    const withinLimit = activeCount < CONFIG.MAX_CONCURRENT_BOOKINGS;
    
    if (!withinLimit) {
        console.warn(`⚠️ Concurrent booking limit reached for ${phone}: ${activeCount}`);
    }
    
    return withinLimit;
}

/**
 * Increment active booking count for a phone number
 * @param {string} phone - Normalized phone number
 */
function incrementActiveBookings(phone) {
    const currentCount = activeBookingsMap.get(phone) || 0;
    const newCount = currentCount + 1;
    activeBookingsMap.set(phone, newCount);
    console.log(`📊 Active bookings for ${phone}: ${newCount}/${CONFIG.MAX_CONCURRENT_BOOKINGS}`);
    
    // Auto-cleanup after timeout
    setTimeout(() => {
        decrementActiveBookings(phone);
    }, CONFIG.BOOKING_TIMEOUT);
}

/**
 * Decrement active booking count for a phone number
 * @param {string} phone - Normalized phone number
 */
function decrementActiveBookings(phone) {
    const currentCount = activeBookingsMap.get(phone) || 0;
    if (currentCount > 0) {
        const newCount = currentCount - 1;
        if (newCount === 0) {
            activeBookingsMap.delete(phone);
            console.log(`📊 Cleared active bookings for ${phone}`);
        } else {
            activeBookingsMap.set(phone, newCount);
            console.log(`📊 Active bookings for ${phone}: ${newCount}/${CONFIG.MAX_CONCURRENT_BOOKINGS}`);
        }
    }
}

// ================================================================================================
// VALIDATION UTILITIES
// ================================================================================================

/**
 * Normalize phone number to digits only
 * @param {string} phone - Raw phone number
 * @returns {string} Normalized phone (digits only)
 */
function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    return phone.replace(/\D/g, '');
}

/**
 * Sanitize user input
 * @param {string} str - Input string
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeInput(str, maxLength) {
    if (!str) return '';
    return str
        .toString()
        .trim()
        .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
        .substring(0, maxLength);
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} True if valid or empty
 */
function isValidEmail(email) {
    if (!email) return true; // Email is optional
    return CONFIG.EMAIL_REGEX.test(email) && email.length <= CONFIG.MAX_EMAIL_LENGTH;
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number
 * @returns {boolean} True if valid 10-digit US phone
 */
function isValidPhone(phone) {
    const normalized = normalizePhone(phone);
    return CONFIG.PHONE_REGEX.test(normalized);
}

/**
 * Validate booking request body
 * @param {Object} body - Request body
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateBookingRequest(body) {
    const errors = [];
    
    // Validate name
    const name = sanitizeInput(body.name, CONFIG.MAX_NAME_LENGTH);
    if (!name || name.length < CONFIG.MIN_NAME_LENGTH) {
        errors.push(
            `Name is required (min ${CONFIG.MIN_NAME_LENGTH}, max ${CONFIG.MAX_NAME_LENGTH} characters).`
        );
    }
    
    // Validate phone
    if (!body.phone || !isValidPhone(body.phone)) {
        errors.push('Valid 10-digit phone number is required.');
    }
    
    // Validate email (optional)
    if (body.email && !isValidEmail(body.email)) {
        errors.push('Invalid email address format.');
    }
    
    // Validate category
    const category = sanitizeInput(body.category, CONFIG.MAX_CATEGORY_LENGTH);
    if (!category || category.length === 0) {
        errors.push('Category selection is required.');
    }
    
    // Validate notes (optional)
    if (body.notes && body.notes.length > CONFIG.MAX_NOTES_LENGTH) {
        errors.push(`Notes must be less than ${CONFIG.MAX_NOTES_LENGTH} characters.`);
    }
    
    // Validate slot IDs
    if (!Array.isArray(body.slotIds)) {
        errors.push('slotIds must be an array.');
    } else {
        if (body.slotIds.length === 0) {
            errors.push('At least one slot must be selected.');
        }
        if (body.slotIds.length > CONFIG.MAX_SLOTS_PER_BOOKING) {
            errors.push(`Maximum ${CONFIG.MAX_SLOTS_PER_BOOKING} slots allowed per booking.`);
        }
        if (!body.slotIds.every(id => Number.isInteger(id) && id > 0)) {
            errors.push('Invalid slot IDs provided (must be positive integers).');
        }
        
        // Check for duplicate slot IDs
        const uniqueSlots = new Set(body.slotIds);
        if (uniqueSlots.size !== body.slotIds.length) {
            errors.push('Duplicate slot IDs detected.');
        }
    }
    
    return errors;
}

/**
 * Validate cancellation request
 * @param {Object} body - Request body
 * @returns {string[]} Array of error messages
 */
function validateCancellationRequest(body) {
    const errors = [];
    
    if (!body.signupRowId || !Number.isInteger(body.signupRowId) || body.signupRowId < 2) {
        errors.push('Valid signupRowId is required.');
    }
    
    if (!body.slotRowId || !Number.isInteger(body.slotRowId) || body.slotRowId < 2) {
        errors.push('Valid slotRowId is required.');
    }
    
    if (!body.phone || !isValidPhone(body.phone)) {
        errors.push('Valid 10-digit phone number is required.');
    }
    
    return errors;
}

// ================================================================================================
// EXPORTS
// ================================================================================================

module.exports = {
    CONFIG,
    SHEETS,
    ENV,
    
    // Cache functions
    getCachedSlots,
    setCachedSlots,
    invalidateCache,
    getCacheStats,
    
    // Rate limiting
    checkRateLimit,
    getRateLimitStatus,
    
    // Concurrent booking control
    checkConcurrentBookings,
    incrementActiveBookings,
    decrementActiveBookings,
    
    // Validation utilities
    normalizePhone,
    sanitizeInput,
    isValidEmail,
    isValidPhone,
    validateBookingRequest,
    validateCancellationRequest
};
