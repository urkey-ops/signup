// START OF CODE
// ------------------------------------------------------------------------------------------------
// ES MODULE CHANGE: Use 'import' instead of 'require'
// ------------------------------------------------------------------------------------------------
import { google } from "googleapis";

// ================================================================================================
// CONFIGURATION & CONSTANTS
// ================================================================================================

const CONFIG = {
    MAX_SLOTS_PER_BOOKING: 10,
    MAX_NAME_LENGTH: 100,
    MAX_EMAIL_LENGTH: 254,
    MAX_PHONE_LENGTH: 20,
    MAX_NOTES_LENGTH: 500,
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 20,
    CACHE_TTL: 30000, // 30 seconds
    MAX_CONCURRENT_BOOKINGS: 3, // Prevent booking spam
};

// Sheet column mappings
const SHEETS = {
    SLOTS: {
        NAME: 'Slots',
        RANGE: 'A2:E',
        COLS: {
            DATE: 0,
            LABEL: 1,
            CAPACITY: 2,
            TAKEN: 3,
            AVAILABLE: 4
        }
    },
    SIGNUPS: {
        NAME: 'Signups',
        RANGE: 'A2:I',
        COLS: {
            TIMESTAMP: 0,
            DATE: 1,
            SLOT_LABEL: 2,
            NAME: 3,
            EMAIL: 4,
            PHONE: 5,
            NOTES: 6,
            SLOT_ROW_ID: 7,
            STATUS: 8
        }
    }
};

// Environment variables - VALIDATE ON STARTUP
const REQUIRED_ENV = ['SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT', 'SIGNUPS_GID', 'SLOTS_GID'];
REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ CRITICAL: Missing environment variable: ${key}`);
        throw new Error(`Missing required environment variable: ${key}`);
    }
});

const SIGNUPS_GID = parseInt(process.env.SIGNUPS_GID);
const SLOTS_GID = parseInt(process.env.SLOTS_GID);
const SHEET_ID = process.env.SHEET_ID;
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

// ================================================================================================
// SERVER-SIDE CACHING
// ================================================================================================

const cache = {
    slots: null,
    timestamp: 0,
    TTL: CONFIG.CACHE_TTL
};

function getCachedSlots() {
    const now = Date.now();
    if (cache.slots && (now - cache.timestamp) < cache.TTL) {
        return cache.slots;
    }
    return null;
}

function setCachedSlots(data) {
    cache.slots = data;
    cache.timestamp = Date.now();
}

function invalidateCache() {
    cache.slots = null;
    cache.timestamp = 0;
}

// ================================================================================================
// IN-MEMORY RATE LIMITING
// ================================================================================================

const rateLimitMap = new Map();
const activeBookingsMap = new Map(); // Track concurrent bookings per email

function cleanupRateLimitMap() {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitMap.entries()) {
        const validTimestamps = timestamps.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW);
        if (validTimestamps.length === 0) {
            rateLimitMap.delete(key);
        } else {
            rateLimitMap.set(key, validTimestamps);
        }
    }
}

function checkRateLimit(identifier) {
    const now = Date.now();
    const userRequests = rateLimitMap.get(identifier) || [];
    
    const recentRequests = userRequests.filter(time => now - time < CONFIG.RATE_LIMIT_WINDOW);
    
    if (recentRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }
    
    recentRequests.push(now);
    rateLimitMap.set(identifier, recentRequests);
    return true;
}

function checkConcurrentBookings(email) {
    const count = activeBookingsMap.get(email) || 0;
    return count < CONFIG.MAX_CONCURRENT_BOOKINGS;
}

function incrementActiveBookings(email) {
    const count = activeBookingsMap.get(email) || 0;
    activeBookingsMap.set(email, count + 1);
}

function decrementActiveBookings(email) {
    const count = activeBookingsMap.get(email) || 0;
    if (count > 0) {
        activeBookingsMap.set(email, count - 1);
    }
}

// Cleanup every 5 minutes
setInterval(() => {
    cleanupRateLimitMap();
    activeBookingsMap.clear(); // Reset concurrent bookings
}, 300000);

// ================================================================================================
// VALIDATION & SANITIZATION
// ================================================================================================

function sanitizeInput(str, maxLength) {
    if (!str) return '';
    return str
        .toString()
        .trim()
        .replace(/[<>]/g, '')
        .substring(0, maxLength);
}

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= CONFIG.MAX_EMAIL_LENGTH;
}

function isValidPhone(phone) {
    if (!phone) return true; // Optional field
    return /^[\d\s\-\+\(\)]{7,20}$/.test(phone);
}

function validateBookingRequest(body) {
    const errors = [];
    
    if (!body.name?.trim() || body.name.length > CONFIG.MAX_NAME_LENGTH) {
        errors.push(`Name is required (max ${CONFIG.MAX_NAME_LENGTH} characters)`);
    }
    
    if (!isValidEmail(body.email)) {
        errors.push("Valid email is required");
    }
    
    if (body.phone && !isValidPhone(body.phone)) {
        errors.push("Invalid phone number format");
    }
    
    if (body.notes && body.notes.length > CONFIG.MAX_NOTES_LENGTH) {
        errors.push(`Notes must be less than ${CONFIG.MAX_NOTES_LENGTH} characters`);
    }
    
    if (!Array.isArray(body.slotIds) || body.slotIds.length === 0) {
        errors.push("At least one slot must be selected");
    }
    
    if (body.slotIds?.length > CONFIG.MAX_SLOTS_PER_BOOKING) {
        errors.push(`Maximum ${CONFIG.MAX_SLOTS_PER_BOOKING} slots per booking`);
    }
    
    if (body.slotIds && !body.slotIds.every(id => Number.isInteger(id) && id > 0)) {
        errors.push("Invalid slot IDs");
    }
    
    return errors;
}

// ================================================================================================
// LOGGING
// ================================================================================================

function log(level, message, data = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        message,
        ...data
    };
    
    if (level === 'error') {
        console.error(JSON.stringify(logEntry));
    } else {
        console.log(JSON.stringify(logEntry));
    }
}

// ================================================================================================
// GOOGLE SHEETS HELPER
// ================================================================================================

let sheetsInstance;

async function getSheets() {
    if (sheetsInstance) return sheetsInstance;
    
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        sheetsInstance = google.sheets({ version: "v4", auth });
        return sheetsInstance;
    } catch (err) {
        log('error', 'Failed to initialize Google Sheets', { error: err.message });
        throw new Error("Service configuration error");
    }
}

// ================================================================================================
// MAIN HANDLER
// ------------------------------------------------------------------------------------------------
// ES MODULE CHANGE: Use 'export default' instead of 'module.exports'
// ------------------------------------------------------------------------------------------------
export default async function handler(req, res) {
    const startTime = Date.now();
    
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // Rate limiting
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || 
                             req.headers['x-real-ip'] || 
                             'unknown';
        
        if (!checkRateLimit(clientIP)) {
            log('warn', 'Rate limit exceeded', { ip: clientIP, method: req.method });
            return res.status(429).json({ 
                ok: false, 
                error: "Too many requests. Please wait a moment and try again." 
            });
        }

        const sheets = await getSheets();

        // ========================================================================================
        // GET: Return available slots or user bookings
        // ========================================================================================
        if (req.method === "GET") {
            
            // --- User Booking Lookup ---
            if (req.query.email) {
                const lookupEmail = sanitizeInput(req.query.email, CONFIG.MAX_EMAIL_LENGTH).toLowerCase();

                if (!isValidEmail(lookupEmail)) {
                    return res.status(400).json({ 
                        ok: false, 
                        error: "Invalid email format" 
                    });
                }

                try {
                    log('info', 'Looking up bookings', { email: lookupEmail });
                    
                    const signupsResponse = await sheets.spreadsheets.values.get({
                        spreadsheetId: SHEET_ID,
                        range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                    });
                    
                    const signupRows = signupsResponse.data.values || [];

                    const userBookings = signupRows
                        .map((row, idx) => ({
                            signupRowId: idx + 2,
                            timestamp: row[SHEETS.SIGNUPS.COLS.TIMESTAMP],
                            date: row[SHEETS.SIGNUPS.COLS.DATE],
                            slotLabel: row[SHEETS.SIGNUPS.COLS.SLOT_LABEL],
                            name: row[SHEETS.SIGNUPS.COLS.NAME],
                            email: row[SHEETS.SIGNUPS.COLS.EMAIL],
                            phone: row[SHEETS.SIGNUPS.COLS.PHONE],
                            notes: row[SHEETS.SIGNUPS.COLS.NOTES],
                            slotRowId: parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]) || null,
                            status: row[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE'
                        }))
                        .filter(booking => 
                            booking.email?.trim().toLowerCase() === lookupEmail && 
                            booking.slotRowId !== null &&
                            booking.status === 'ACTIVE'
                        );

                    log('info', 'Bookings found', { email: lookupEmail, count: userBookings.length });
                    return res.status(200).json({ ok: true, bookings: userBookings });

                } catch (err) {
                    log('error', 'Error fetching user bookings', { 
                        email: lookupEmail, 
                        error: err.message 
                    });
                    return res.status(500).json({ 
                        ok: false, 
                        error: "Failed to fetch bookings" 
                    });
                }
            }

            // --- Fetch All Available Slots (WITH CACHING) ---
            try {
                const cachedData = getCachedSlots();
                if (cachedData) {
                    log('info', 'Cache hit - returning cached slots', { 
                        cacheAge: Date.now() - cache.timestamp 
                    });
                    return res.status(200).json(cachedData);
                }

                log('info', 'Cache miss - fetching from Google Sheets');
                
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`,
                });

                const rows = response.data.values || [];
                const slots = rows.map((row, idx) => ({
                    id: idx + 2,
                    date: row[SHEETS.SLOTS.COLS.DATE] || "",
                    slotLabel: row[SHEETS.SLOTS.COLS.LABEL] || "",
                    capacity: parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0,
                    taken: parseInt(row[SHEETS.SLOTS.COLS.TAKEN]) || 0,
                    available: Math.max(0, (parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0) - (parseInt(row[SHEETS.SLOTS.COLS.TAKEN]) || 0)),
                }));

                // Group by date and filter out past dates
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const grouped = {};
                slots.forEach(slot => {
                    const slotDate = new Date(slot.date);
                    if (slotDate >= today && slot.capacity > 0) {
                        if (!grouped[slot.date]) {
                            grouped[slot.date] = [];
                        }
                        grouped[slot.date].push(slot);
                    }
                });

                const result = { ok: true, dates: grouped };
                setCachedSlots(result);

                log('info', 'Slots fetched and cached', { 
                    totalSlots: slots.length,
                    dates: Object.keys(grouped).length,
                    duration: Date.now() - startTime 
                });

                return res.status(200).json(result);
            } catch (err) {
                log('error', 'Error reading slots', { error: err.message });
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to fetch slots" 
                });
            }
        }

        // ========================================================================================
        // POST: Create new booking (WITH ATOMIC TRANSACTION SAFETY)
        // ========================================================================================
        if (req.method === "POST") {
            const validationErrors = validateBookingRequest(req.body);
            if (validationErrors.length > 0) {
                log('warn', 'Validation failed', { errors: validationErrors });
                return res.status(400).json({ 
                    ok: false, 
                    error: validationErrors.join('; ') 
                });
            }

            const { slotIds } = req.body;
            
            const name = sanitizeInput(req.body.name, CONFIG.MAX_NAME_LENGTH);
            const email = sanitizeInput(req.body.email, CONFIG.MAX_EMAIL_LENGTH).toLowerCase();
            const phone = sanitizeInput(req.body.phone, CONFIG.MAX_PHONE_LENGTH);
            const notes = sanitizeInput(req.body.notes, CONFIG.MAX_NOTES_LENGTH);

            // Check concurrent bookings
            if (!checkConcurrentBookings(email)) {
                log('warn', 'Too many concurrent bookings', { email });
                return res.status(429).json({
                    ok: false,
                    error: "You have too many booking requests in progress. Please wait a moment."
                });
            }

            incrementActiveBookings(email);

            try {
                log('info', 'Processing booking request', { 
                    email, 
                    name,
                    slotCount: slotIds.length 
                });

                // ATOMIC READ: Fetch slots and signups together
                const [slotsResponse, signupsResponse] = await Promise.all([
                    sheets.spreadsheets.values.batchGet({
                        spreadsheetId: SHEET_ID,
                        ranges: slotIds.map(id => `${SHEETS.SLOTS.NAME}!A${id}:D${id}`)
                    }),
                    sheets.spreadsheets.values.get({
                        spreadsheetId: SHEET_ID,
                        range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                    })
                ]);

                const slotRanges = slotsResponse.data.valueRanges;
                const existingSignups = signupsResponse.data.values || [];

                const signupRows = [];
                const updates = [];
                const now = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });

                // Validate ALL slots atomically before making ANY changes
                for (let i = 0; i < slotIds.length; i++) {
                    const slotId = slotIds[i];
                    const slotData = slotRanges[i].values?.[0];

                    if (!slotData || slotData.length < 4) {
                        log('warn', 'Slot not found', { slotId, email });
                        decrementActiveBookings(email);
                        return res.status(400).json({ 
                            ok: false, 
                            error: `Slot not found. Please refresh and try again.` 
                        });
                    }

                    const slot = {
                        date: slotData[SHEETS.SLOTS.COLS.DATE],
                        label: slotData[SHEETS.SLOTS.COLS.LABEL],
                        capacity: parseInt(slotData[SHEETS.SLOTS.COLS.CAPACITY]) || 0,
                        taken: parseInt(slotData[SHEETS.SLOTS.COLS.TAKEN]) || 0
                    };

                    // Check for past date
                    const slotDate = new Date(slot.date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    if (slotDate < today) {
                        log('warn', 'Attempted booking of past slot', { slotId, date: slot.date, email });
                        decrementActiveBookings(email);
                        return res.status(400).json({
                            ok: false,
                            error: `Cannot book slot for ${slot.label} on ${slot.date} - this date has passed.`
                        });
                    }

                    // Check for duplicate booking
                    const duplicateBooking = existingSignups.find(row => {
                        const rowEmail = row[SHEETS.SIGNUPS.COLS.EMAIL]?.trim().toLowerCase();
                        const rowSlotId = parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]);
                        const rowStatus = row[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';
                        
                        return rowEmail === email && 
                               rowSlotId === slotId &&
                               rowStatus === 'ACTIVE';
                    });

                    if (duplicateBooking) {
                        log('warn', 'Duplicate booking attempt', { 
                            email, 
                            slotId, 
                            date: slot.date, 
                            label: slot.label 
                        });
                        decrementActiveBookings(email);
                        return res.status(409).json({ 
                            ok: false, 
                            error: `You already have an active booking for ${slot.label} on ${slot.date}.` 
                        });
                    }

                    // Check capacity
                    if (slot.taken >= slot.capacity) {
                        log('warn', 'Slot full', { 
                            slotId, 
                            date: slot.date, 
                            label: slot.label,
                            capacity: slot.capacity,
                            taken: slot.taken
                        });
                        decrementActiveBookings(email);
                        return res.status(409).json({ 
                            ok: false, 
                            error: `The slot "${slot.label}" on ${slot.date} is now full. Please select another slot.` 
                        });
                    }

                    signupRows.push([
                        now,
                        slot.date,
                        slot.label,
                        name,
                        req.body.email.trim(),
                        phone,
                        notes,
                        slotId,
                        'ACTIVE'
                    ]);

                    const newTaken = slot.taken + 1;
                    updates.push({
                        range: `${SHEETS.SLOTS.NAME}!D${slotId}`,
                        values: [[newTaken]]
                    });
                }

                // ATOMIC WRITE: Use batchUpdate for transactional consistency
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        requests: [
                            // First: append signups
                            {
                                appendCells: {
                                    sheetId: SIGNUPS_GID,
                                    rows: signupRows.map(row => ({
                                        values: row.map(cell => ({ userEnteredValue: { stringValue: String(cell) } }))
                                    })),
                                    fields: 'userEnteredValue'
                                }
                            },
                            // Then: update slot counts atomically
                            ...updates.map((update, idx) => ({
                                updateCells: {
                                    range: {
                                        sheetId: SLOTS_GID,
                                        startRowIndex: slotIds[idx] - 1,
                                        endRowIndex: slotIds[idx],
                                        startColumnIndex: 3,
                                        endColumnIndex: 4
                                    },
                                    rows: [{
                                        values: [{
                                            userEnteredValue: { numberValue: update.values[0][0] }
                                        }]
                                    }],
                                    fields: 'userEnteredValue'
                                }
                            }))
                        ]
                    }
                });

                invalidateCache();
                decrementActiveBookings(email);

                log('info', 'Booking successful', { 
                    email, 
                    name,
                    slotCount: slotIds.length,
                    duration: Date.now() - startTime 
                });

                return res.status(200).json({ 
                    ok: true, 
                    message: `Successfully booked ${slotIds.length} slot${slotIds.length === 1 ? '' : 's'}!` 
                });

            } catch (err) {
                decrementActiveBookings(email);
                log('error', 'Error creating booking', { 
                    email, 
                    error: err.message,
                    stack: err.stack 
                });
                
                if (err.code === 429) {
                    return res.status(429).json({ 
                        ok: false, 
                        error: "Service is busy. Please try again in a moment." 
                    });
                }
                
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to complete booking. Please try again." 
                });
            }
        }

        // ========================================================================================
        // PATCH: Cancel booking
        // ========================================================================================
        if (req.method === "PATCH") {
            const { signupRowId, slotRowId } = req.body;

            if (!signupRowId || !slotRowId || 
                !Number.isInteger(signupRowId) || !Number.isInteger(slotRowId)) {
                return res.status(400).json({ 
                    ok: false, 
                    error: "Invalid request parameters" 
                });
            }

            try {
                log('info', 'Processing cancellation', { signupRowId, slotRowId });

                const signupResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!A${signupRowId}:I${signupRowId}`,
                });

                const signupRow = signupResponse.data.values?.[0];
                if (!signupRow) {
                    log('warn', 'Booking not found', { signupRowId });
                    return res.status(404).json({ 
                        ok: false, 
                        error: "Booking not found" 
                    });
                }

                const bookingStatus = signupRow[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';
                if (bookingStatus !== 'ACTIVE') {
                    log('warn', 'Booking already cancelled', { signupRowId });
                    return res.status(400).json({ 
                        ok: false, 
                        error: "This booking has already been cancelled" 
                    });
                }

                const slotRange = `${SHEETS.SLOTS.NAME}!D${slotRowId}`;
                const slotResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: slotRange,
                });
                
                const currentTaken = parseInt(slotResponse.data.values?.[0]?.[0] || 0);
                const newTaken = Math.max(0, currentTaken - 1);

                const cancelledTimestamp = new Date().toISOString();
                
                // Atomic cancellation
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        requests: [
                            {
                                updateCells: {
                                    range: {
                                        sheetId: SIGNUPS_GID,
                                        startRowIndex: signupRowId - 1,
                                        endRowIndex: signupRowId,
                                        startColumnIndex: 8,
                                        endColumnIndex: 9
                                    },
                                    rows: [{
                                        values: [{
                                            userEnteredValue: { stringValue: `CANCELLED:${cancelledTimestamp}` }
                                        }]
                                    }],
                                    fields: 'userEnteredValue'
                                }
                            },
                            {
                                updateCells: {
                                    range: {
                                        sheetId: SLOTS_GID,
                                        startRowIndex: slotRowId - 1,
                                        endRowIndex: slotRowId,
                                        startColumnIndex: 3,
                                        endColumnIndex: 4
                                    },
                                    rows: [{
                                        values: [{
                                            userEnteredValue: { numberValue: newTaken }
                                        }]
                                    }],
                                    fields: 'userEnteredValue'
                                }
                            }
                        ]
                    }
                });

                invalidateCache();

                log('info', 'Cancellation successful', { 
                    signupRowId, 
                    slotRowId,
                    duration: Date.now() - startTime 
                });

                return res.status(200).json({ 
                    ok: true, 
                    message: "Booking cancelled successfully!" 
                });

            } catch (err) {
                log('error', 'Error cancelling booking', { 
                    signupRowId, 
                    slotRowId,
                    error: err.message,
                    stack: err.stack 
                });
                
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to cancel booking. Please try again." 
                });
            }
        }

        res.setHeader("Allow", ["GET", "POST", "PATCH"]);
        log('warn', 'Method not allowed', { method: req.method, ip: clientIP });
        return res.status(405).json({ 
            ok: false, 
            error: `Method ${req.method} not allowed` 
        });

    } catch (err) {
        log('error', 'Unhandled error in API handler', { 
            error: err.message,
            stack: err.stack 
        });
        
        return res.status(500).json({ 
            ok: false, 
            error: "An unexpected error occurred. Please try again." 
        });
    }
};
// END OF CODE
