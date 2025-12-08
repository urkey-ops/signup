// ================================================================================================
// BACKEND CONFIGURATION & UTILITIES
// ================================================================================================

const CONFIG = {
    MAX_SLOTS_PER_BOOKING: 10,
    MAX_NAME_LENGTH: 100,
    MAX_EMAIL_LENGTH: 254,
    MAX_PHONE_LENGTH: 20,
    MAX_NOTES_LENGTH: 500,
    MAX_CATEGORY_LENGTH: 50,
    RATE_LIMIT_WINDOW: 60000,
    RATE_LIMIT_MAX_REQUESTS: 50,
    CACHE_TTL: 30000,
    MAX_CONCURRENT_BOOKINGS: 3,
};

const SHEETS = {
    SLOTS: {
        NAME: 'Slots',
        RANGE: 'A2:E',
        COLS: { DATE: 0, LABEL: 1, CAPACITY: 2, TAKEN: 3, AVAILABLE: 4 }
    },
    SIGNUPS: {
        NAME: 'Signups',
        RANGE: 'A2:J',
        COLS: { TIMESTAMP: 0, DATE: 1, SLOT_LABEL: 2, NAME: 3, EMAIL: 4, PHONE: 5, CATEGORY: 6, NOTES: 7, SLOT_ROW_ID: 8, STATUS: 9 }
    }
};

// ================================================================================================
// ENVIRONMENT VALIDATION
// ================================================================================================

console.log('🔍 STARTUP: Checking environment variables...');
const REQUIRED_ENV = ['SHEET_ID', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'SIGNUPS_GID', 'SLOTS_GID'];
const envStatus = {};

REQUIRED_ENV.forEach(key => {
    const exists = !!process.env[key];
    envStatus[key] = exists ? '✅' : '❌ MISSING';
    if (!exists) console.error(`❌ CRITICAL: Missing environment variable: ${key}`);
});

console.log('Environment variables status:', envStatus);

const missingVars = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

const ENV = {
    SIGNUPS_GID: parseInt(process.env.SIGNUPS_GID),
    SLOTS_GID: parseInt(process.env.SLOTS_GID),
    SHEET_ID: process.env.SHEET_ID,
    TIMEZONE: process.env.TIMEZONE || 'America/New_York',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY
};

console.log('✅ Configuration loaded:', {
    SHEET_ID: ENV.SHEET_ID.substring(0, 10) + '...',
    SIGNUPS_GID: ENV.SIGNUPS_GID,
    SLOTS_GID: ENV.SLOTS_GID,
    TIMEZONE: ENV.TIMEZONE
});

// ================================================================================================
// CACHE & RATE LIMITING
// ================================================================================================

const cache = { slots: null, timestamp: 0, TTL: CONFIG.CACHE_TTL };
const rateLimitMap = new Map();
const activeBookingsMap = new Map();

function getCachedSlots() {
    const now = Date.now();
    if (cache.slots && (now - cache.timestamp) < cache.TTL) {
        console.log('📦 Cache HIT');
        return cache.slots;
    }
    console.log('📦 Cache MISS');
    return null;
}

function setCachedSlots(data) { 
    cache.slots = data; 
    cache.timestamp = Date.now();
    console.log('📦 Cache UPDATED');
}

function invalidateCache() { 
    cache.slots = null; 
    cache.timestamp = 0;
    console.log('📦 Cache INVALIDATED');
}

function checkRateLimit(identifier) {
    const now = Date.now();
    const reqs = rateLimitMap.get(identifier) || [];
    const recent = reqs.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW);
    if (recent.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
        console.log('⚠️ Rate limit exceeded:', identifier);
        return false;
    }
    recent.push(now);
    rateLimitMap.set(identifier, recent);
    return true;
}

function checkConcurrentBookings(phone) {
    return (activeBookingsMap.get(phone) || 0) < CONFIG.MAX_CONCURRENT_BOOKINGS;
}

function incrementActiveBookings(phone) {
    const count = activeBookingsMap.get(phone) || 0;
    activeBookingsMap.set(phone, count + 1);
    console.log(`📊 Active bookings for ${phone}: ${count + 1}`);
}

function decrementActiveBookings(phone) {
    const count = activeBookingsMap.get(phone) || 0;
    if (count > 0) activeBookingsMap.set(phone, count - 1);
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitMap.entries()) {
        const valid = timestamps.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW);
        valid.length ? rateLimitMap.set(key, valid) : rateLimitMap.delete(key);
    }
}, 300000);

// ================================================================================================
// VALIDATION UTILITIES
// ================================================================================================

function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    return phone.replace(/\D/g, '');
}

function sanitizeInput(str, maxLength) {
    if (!str) return '';
    return str.toString().trim().replace(/[<>]/g, '').substring(0, maxLength);
}

function isValidEmail(email) {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= CONFIG.MAX_EMAIL_LENGTH;
}

function isValidPhone(phone) {
    const normalized = normalizePhone(phone);
    return normalized.length === 10;
}

function validateBookingRequest(body) {
    const errors = [];
    
    const name = sanitizeInput(body.name, CONFIG.MAX_NAME_LENGTH);
    
    if (!name || name.length < 2) {
        errors.push(`Name is required (min 2, max ${CONFIG.MAX_NAME_LENGTH} characters).`);
    }
    if (!body.phone || !isValidPhone(body.phone)) {
        errors.push(`Valid 10-digit phone number is required.`);
    }
    if (body.email && !isValidEmail(body.email)) {
        errors.push(`Invalid email address.`);
    }
    if (!body.category?.trim() || body.category.length > CONFIG.MAX_CATEGORY_LENGTH) {
        errors.push(`Valid category selection is required.`);
    }
    if (body.notes && body.notes.length > CONFIG.MAX_NOTES_LENGTH) {
        errors.push(`Notes must be less than ${CONFIG.MAX_NOTES_LENGTH} characters.`);
    }
    if (!Array.isArray(body.slotIds) || body.slotIds.length === 0) {
        errors.push(`At least one slot must be selected.`);
    }
    if (body.slotIds?.length > CONFIG.MAX_SLOTS_PER_BOOKING) {
        errors.push(`Only up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots allowed.`);
    }
    if (!body.slotIds.every(id => Number.isInteger(id) && id > 0)) {
        errors.push("Invalid slot IDs provided.");
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
    getCachedSlots,
    setCachedSlots,
    invalidateCache,
    checkRateLimit,
    checkConcurrentBookings,
    incrementActiveBookings,
    decrementActiveBookings,
    normalizePhone,
    sanitizeInput,
    isValidEmail,
    isValidPhone,
    validateBookingRequest
};
