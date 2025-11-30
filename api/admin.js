const { google } = require("googleapis");

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
            NOTES: 4
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
const REQUIRED_ENV = ['SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT', 'SIGNUPS_GID'];
REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ CRITICAL: Missing environment variable: ${key}`);
        throw new Error(`Missing required environment variable: ${key}`);
    }
});

const SIGNUPS_GID = parseInt(process.env.SIGNUPS_GID);
const SHEET_ID = process.env.SHEET_ID;
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

// ================================================================================================
// SERVER-SIDE CACHING (Memory-based, suitable for serverless)
// ================================================================================================

const cache = {
    slots: null,
    timestamp: 0,
    TTL: CONFIG.CACHE_TTL
};

let cacheRefreshPromise = null; // FIX #7: Cache stampede protection

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
// FIX #2: IN-MEMORY RATE LIMITING (Fixed memory leak)
// ================================================================================================

const rateLimitMap = new Map();

// ❌ REMOVED: setInterval(cleanupRateLimitMap, 300000); - This caused memory leak

function checkRateLimit(identifier) {
    // FIX: Clean on-demand instead of using setInterval
    const now = Date.now();
    const cutoff = now - CONFIG.RATE_LIMIT_WINDOW;
    
    // Clean old entries for ALL keys (lightweight cleanup)
    for (const [key, timestamps] of rateLimitMap.entries()) {
        const validTimestamps = timestamps.filter(t => t >= cutoff);
        if (validTimestamps.length === 0) {
            rateLimitMap.delete(key);
        } else {
            rateLimitMap.set(key, validTimestamps);
        }
    }
    
    // Now check rate limit for this specific identifier
    const userRequests = rateLimitMap.get(identifier) || [];
    const recentRequests = userRequests.filter(time => time >= cutoff);
    
    if (recentRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }
    
    recentRequests.push(now);
    rateLimitMap.set(identifier, recentRequests);
    return true;
}

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

async function getSheets() {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        return google.sheets({ version: "v4", auth });
    } catch (err) {
        log('error', 'Failed to initialize Google Sheets', { error: err.message });
        throw new Error("Service configuration error");
    }
}

// ================================================================================================
// FIX #7: CACHE STAMPEDE PROTECTION
// ================================================================================================

async function getCachedSlotsWithLock(sheets) {
    const now = Date.now();
    
    // Check cache first
    if (cache.slots && (now - cache.timestamp) < cache.TTL) {
        log('info', 'Cache hit', { age: now - cache.timestamp });
        return cache.slots;
    }
    
    // If another request is already refreshing, wait for it
    if (cacheRefreshPromise) {
        log('info', 'Waiting for existing cache refresh...');
        return await cacheRefreshPromise;
    }
    
    // This request will refresh the cache
    cacheRefreshPromise = (async () => {
        try {
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

            // Group by date
            const grouped = {};
            slots.forEach(slot => {
                if (!grouped[slot.date]) {
                    grouped[slot.date] = [];
                }
                grouped[slot.date].push(slot);
            });

            const result = { ok: true, dates: grouped };
            
            // Update cache
            cache.slots = result;
            cache.timestamp = Date.now();
            
            return result;
        } finally {
            cacheRefreshPromise = null;
        }
    })();
    
    return await cacheRefreshPromise;
}

// ================================================================================================
// FIX #4: ROLLBACK HELPER FOR FAILED TRANSACTIONS
// ================================================================================================

async function markSignupsAsFailed(sheets, email, slotIds) {
    try {
        log('warn', 'Attempting to mark signups as FAILED', { email, slotIds });
        
        const signupsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEETS.SIGNUPS.NAME}!A:I`
        });
        
        const allRows = signupsResponse.data.values || [];
        const failedTimestamp = new Date().toISOString();
        
        // Find the rows we just added (last N rows matching email and slot IDs)
        const updates = [];
        const matchingRows = [];
        
        for (let i = allRows.length - 1; i >= 0 && matchingRows.length < slotIds.length; i--) {
            const row = allRows[i];
            const rowEmail = row[SHEETS.SIGNUPS.COLS.EMAIL]?.trim().toLowerCase();
            const rowSlotId = parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]);
            
            if (rowEmail === email.toLowerCase() && slotIds.includes(rowSlotId)) {
                matchingRows.push(i + 1); // +1 because sheets are 1-indexed
            }
        }
        
        // Mark all matching rows as FAILED
        for (const rowIndex of matchingRows) {
            updates.push({
                range: `${SHEETS.SIGNUPS.NAME}!I${rowIndex}`,
                values: [[`FAILED:${failedTimestamp}`]]
            });
        }
        
        if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    valueInputOption: "RAW",
                    data: updates
                }
            });
            
            log('info', 'Rollback successful - signups marked as FAILED', { 
                count: updates.length 
            });
        }
        
    } catch (rollbackErr) {
        log('error', 'Rollback failed', { 
            email,
            error: rollbackErr.message 
        });
    }
}

// ================================================================================================
// MAIN HANDLER
// ================================================================================================

module.exports = async function handler(req, res) {
    const startTime = Date.now();
    
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    
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

            // --- Fetch All Available Slots (WITH CACHE STAMPEDE PROTECTION) ---
            try {
                const cachedData = await getCachedSlotsWithLock(sheets);
                
                log('info', 'Slots fetched', { 
                    duration: Date.now() - startTime 
                });

                return res.status(200).json(cachedData);
            } catch (err) {
                log('error', 'Error reading slots', { error: err.message });
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to fetch slots" 
                });
            }
        }

        // ========================================================================================
        // FIX #1 & #4: POST with Race Condition Protection & Transaction Rollback
        // ========================================================================================
        if (req.method === "POST") {
            // Validate request body
            const validationErrors = validateBookingRequest(req.body);
            if (validationErrors.length > 0) {
                log('warn', 'Validation failed', { errors: validationErrors });
                return res.status(400).json({ 
                    ok: false, 
                    error: validationErrors.join('; ') 
                });
            }

            const { slotIds } = req.body;
            
            // Sanitize inputs
            const name = sanitizeInput(req.body.name, CONFIG.MAX_NAME_LENGTH);
            const email = sanitizeInput(req.body.email, CONFIG.MAX_EMAIL_LENGTH).toLowerCase();
            const phone = sanitizeInput(req.body.phone, CONFIG.MAX_PHONE_LENGTH);
            const notes = sanitizeInput(req.body.notes, CONFIG.MAX_NOTES_LENGTH);

            log('info', 'Processing booking request', { 
                email, 
                name,
                slotCount: slotIds.length 
            });

            let signupsWritten = false;

            try {
                // 1. Fetch current slot data (fresh read)
                const slotsResponse = await sheets.spreadsheets.values.batchGet({
                    spreadsheetId: SHEET_ID,
                    ranges: slotIds.map(id => `${SHEETS.SLOTS.NAME}!A${id}:D${id}`)
                });

                const slotRanges = slotsResponse.data.valueRanges;

                // 2. Fetch existing signups for duplicate check
                const signupsResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                });
                const existingSignups = signupsResponse.data.values || [];

                const signupRows = [];
                const updates = [];
                const slotDetails = [];
                const now = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });

                // 3. Validate all slots before booking (atomic check)
                for (let i = 0; i < slotIds.length; i++) {
                    const slotId = slotIds[i];
                    const slotData = slotRanges[i].values?.[0];

                    if (!slotData || slotData.length < 4) {
                        log('warn', 'Slot not found', { slotId, email });
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

                    // Check for duplicate booking (only active bookings)
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
                        return res.status(409).json({ 
                            ok: false, 
                            error: `You already have an active booking for ${slot.label} on ${slot.date}. Please check your existing bookings.` 
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
                        return res.status(409).json({ 
                            ok: false, 
                            error: `The slot "${slot.label}" on ${slot.date} just became full. Please select another slot.` 
                        });
                    }

                    // Store slot details for rollback if needed
                    slotDetails.push({
                        id: slotId,
                        slot: slot
                    });

                    // Prepare signup row
                    signupRows.push([
                        now,                    // Timestamp
                        slot.date,              // Date
                        slot.label,             // Slot Label
                        name,                   // Name
                        req.body.email.trim(),  // Email (original case)
                        phone,                  // Phone
                        notes,                  // Notes
                        slotId,                 // Slot Row ID
                        'ACTIVE'                // Status
                    ]);

                    // FIX #1: Use formula to prevent exceeding capacity
                    const newTaken = slot.taken + 1;
                    updates.push({
                        range: `${SHEETS.SLOTS.NAME}!D${slotId}`,
                        values: [[`=MIN(${newTaken}, C${slotId})`]]
                    });
                }

                // 4. TRANSACTION: Write signups FIRST
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!A1`,
                    valueInputOption: "RAW",
                    requestBody: { values: signupRows },
                });
                
                signupsWritten = true;
                log('info', 'Signups written successfully', { email, count: signupRows.length });

                // 5. Update slot counts with formulas
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        valueInputOption: "USER_ENTERED", // Important: allows formulas
                        data: updates
                    }
                });

                log('info', 'Slot counts updated', { email, count: updates.length });

                // 6. FIX #1: Verify the counts didn't exceed capacity
                const verifyResponse = await sheets.spreadsheets.values.batchGet({
                    spreadsheetId: SHEET_ID,
                    ranges: slotIds.map(id => `${SHEETS.SLOTS.NAME}!C${id}:D${id}`)
                });

                let capacityExceeded = false;
                for (let i = 0; i < verifyResponse.data.valueRanges.length; i++) {
                    const values = verifyResponse.data.valueRanges[i].values?.[0];
                    if (!values) continue;
                    
                    const capacity = parseInt(values[0]) || 0;
                    const taken = parseInt(values[1]) || 0;
                    
                    if (taken > capacity) {
                        capacityExceeded = true;
                        log('error', 'Capacity exceeded after write', {
                            slotId: slotIds[i],
                            capacity,
                            taken
                        });
                        break;
                    }
                }

                if (capacityExceeded) {
                    // FIX #4: Rollback by marking signups as FAILED
                    await markSignupsAsFailed(sheets, email, slotIds);
                    
                    return res.status(409).json({
                        ok: false,
                        error: 'One or more slots became full while processing your booking. Please try again.'
                    });
                }

                // 7. Success - invalidate cache
                invalidateCache();

                log('info', 'Booking successful', { 
                    email, 
                    name,
                    slotCount: slotIds.length,
                    duration: Date.now() - startTime 
                });

                const message = `Successfully booked ${slotIds.length} slot${slotIds.length === 1 ? '' : 's'}!`;
                return res.status(200).json({ ok: true, message });

            } catch (err) {
                log('error', 'Error creating booking', { 
                    email, 
                    error: err.message,
                    stack: err.stack 
                });
                
                // FIX #4: Rollback if signups were written but something else failed
                if (signupsWritten) {
                    await markSignupsAsFailed(sheets, email, slotIds);
                }
                
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
        // PATCH: Cancel booking (Soft Delete with Cache Invalidation)
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

            if (!SIGNUPS_GID) {
                log('error', 'SIGNUPS_GID not configured');
                return res.status(500).json({ 
                    ok: false, 
                    error: "Service configuration error" 
                });
            }

            try {
                log('info', 'Processing cancellation', { signupRowId, slotRowId });

                // 1. Verify booking exists and is active
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

                // 2. Get current taken count
                const slotRange = `${SHEETS.SLOTS.NAME}!D${slotRowId}`;
                const slotResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: slotRange,
                });
                
                const currentTaken = parseInt(slotResponse.data.values?.[0]?.[0] || 0);
                const newTaken = Math.max(0, currentTaken - 1);

                // 3. Mark booking as cancelled
                const cancelledTimestamp = new Date().toISOString();
                const markCancelled = sheets.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!I${signupRowId}`,
                    valueInputOption: "RAW",
                    requestBody: { 
                        values: [[`CANCELLED:${cancelledTimestamp}`]] 
                    }
                });

                // 4. Decrement taken count
                const updateTaken = sheets.spreadsheets.values.update({
                    spreadsheetId: SHEET_ID,
                    range: slotRange,
                    valueInputOption: "RAW",
                    requestBody: { values: [[newTaken]] },
                });

                // Execute both updates
                await Promise.all([markCancelled, updateTaken]);

                // 5. Invalidate cache after cancellation
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

        // Method not allowed
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
