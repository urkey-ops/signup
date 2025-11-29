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

// Environment variables
const SIGNUPS_GID = parseInt(process.env.SIGNUPS_GID);
const SHEET_ID = process.env.SHEET_ID;

// ================================================================================================
// IN-MEMORY RATE LIMITING
// ================================================================================================

const rateLimitMap = new Map();

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
    
    // Filter to requests within the time window
    const recentRequests = userRequests.filter(time => now - time < CONFIG.RATE_LIMIT_WINDOW);
    
    if (recentRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }
    
    recentRequests.push(now);
    rateLimitMap.set(identifier, recentRequests);
    return true;
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimitMap, 300000);

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
    
    // Validate slot IDs are numbers
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
// MAIN HANDLER
// ================================================================================================

module.exports = async function handler(req, res) {
    const startTime = Date.now();
    
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
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

        // Validate environment variables
        if (!SHEET_ID) {
            log('error', 'Missing SHEET_ID environment variable');
            return res.status(500).json({ 
                ok: false, 
                error: "Service configuration error" 
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
                            booking.status === 'ACTIVE' // Filter out cancelled bookings
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

            // --- Fetch All Available Slots ---
            try {
                log('info', 'Fetching available slots');
                
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

                log('info', 'Slots fetched successfully', { 
                    totalSlots: slots.length,
                    dates: Object.keys(grouped).length 
                });

                return res.status(200).json({ ok: true, dates: grouped });
            } catch (err) {
                log('error', 'Error reading slots', { error: err.message });
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to fetch slots" 
                });
            }
        }

        // ========================================================================================
        // POST: Create new booking (Multi-Slot with Duplicate Prevention)
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

            try {
                // 1. Fetch all slots
                const slotsResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`,
                });
                const allRows = slotsResponse.data.values || [];

                // 2. Fetch existing signups for duplicate check
                const signupsResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                });
                const existingSignups = signupsResponse.data.values || [];

                // Build slot data map
                const slotDataMap = new Map();
                allRows.forEach((row, idx) => {
                    const id = idx + 2;
                    slotDataMap.set(id.toString(), {
                        date: row[SHEETS.SLOTS.COLS.DATE],
                        label: row[SHEETS.SLOTS.COLS.LABEL],
                        capacity: parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0,
                        taken: parseInt(row[SHEETS.SLOTS.COLS.TAKEN]) || 0
                    });
                });

                const updates = [];
                const signupRows = [];
                const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

                // 3. Validate all slots before booking
                for (const slotId of slotIds) {
                    const slot = slotDataMap.get(slotId.toString());

                    if (!slot) {
                        log('warn', 'Slot not found', { slotId, email });
                        return res.status(400).json({ 
                            ok: false, 
                            error: `Slot not found. Please refresh and try again.` 
                        });
                    }

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

                    // Prepare updates
                    const newTaken = slot.taken + 1;
                    updates.push({
                        range: `${SHEETS.SLOTS.NAME}!D${slotId}`,
                        values: [[newTaken]]
                    });

                    // Prepare signup row
                    signupRows.push([
                        now,                    // Timestamp
                        slot.date,              // Date
                        slot.label,             // Slot Label
                        name,                   // Name
                        req.body.email.trim(),  // Email (original case for display)
                        phone,                  // Phone
                        notes,                  // Notes
                        slotId,                 // Slot Row ID
                        'ACTIVE'                // Status
                    ]);
                }

                // 4. Execute batch updates
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        valueInputOption: "RAW",
                        data: updates
                    }
                });

                // 5. Append all signup rows
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!A1`,
                    valueInputOption: "RAW",
                    requestBody: { values: signupRows },
                });

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
                
                // Check if it's a Google API error
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
        // PATCH: Cancel booking (Soft Delete)
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

                // 3. Mark booking as cancelled (soft delete)
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
