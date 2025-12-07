const { google } = require("googleapis");

// ================================================================================================
// CONFIGURATION & CONSTANTS (UPDATED FOR PHONE-BASED BOOKING)
// ================================================================================================

const CONFIG = {
    MAX_SLOTS_PER_BOOKING: 10,
    MAX_NAME_LENGTH: 100,
    MAX_EMAIL_LENGTH: 254,
    MAX_PHONE_LENGTH: 20,
    MAX_NOTES_LENGTH: 500,
    MAX_CATEGORY_LENGTH: 20,
    RATE_LIMIT_WINDOW: 60000,   // 1 minute
    RATE_LIMIT_MAX_REQUESTS: 50,
    CACHE_TTL: 30000,           // 30 seconds
    MAX_CONCURRENT_BOOKINGS: 3, // Prevent booking spam
};

// Sheet column mappings (added CATEGORY column)
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
        RANGE: 'A2:J',
        COLS: {
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
        }
    }
};

// Environment validation
console.log('🔍 STARTUP: Checking environment variables...');
const REQUIRED_ENV = ['SHEET_ID', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'SIGNUPS_GID', 'SLOTS_GID'];
const envStatus = {};
REQUIRED_ENV.forEach(key => {
    const exists = !!process.env[key];
    envStatus[key] = exists ? '✅' : '❌ MISSING';
    if (!exists) {
        console.error(`❌ CRITICAL: Missing environment variable: ${key}`);
    }
});
console.log('Environment variables status:', envStatus);

// Only throw after logging all missing vars
const missingVars = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

const SIGNUPS_GID = parseInt(process.env.SIGNUPS_GID);
const SLOTS_GID = parseInt(process.env.SLOTS_GID);
const SHEET_ID = process.env.SHEET_ID;
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

console.log('✅ Configuration loaded:', {
    SHEET_ID: SHEET_ID.substring(0, 10) + '...',
    SIGNUPS_GID,
    SLOTS_GID,
    TIMEZONE,
    HAS_SERVICE_EMAIL: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    HAS_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY
});

// ================================================================================================
// SERVER CACHE
// ================================================================================================

const cache = { slots: null, timestamp: 0, TTL: CONFIG.CACHE_TTL };

function getCachedSlots() {
    const now = Date.now();
    if (cache.slots && (now - cache.timestamp) < cache.TTL) {
        console.log('📦 Cache HIT - returning cached slots');
        return cache.slots;
    }
    console.log('📦 Cache MISS - will fetch fresh data');
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

// ================================================================================================
// RATE LIMITING
// ================================================================================================

const rateLimitMap = new Map();
const activeBookingsMap = new Map();

function cleanupRateLimitMap() {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitMap.entries()) {
        const valid = timestamps.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW);
        valid.length ? rateLimitMap.set(key, valid) : rateLimitMap.delete(key);
    }
}

function checkRateLimit(identifier) {
    const now = Date.now();
    const reqs = rateLimitMap.get(identifier) || [];
    const recent = reqs.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW);
    if (recent.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
        console.log('⚠️ Rate limit exceeded for:', identifier);
        return false;
    }
    recent.push(now);
    rateLimitMap.set(identifier, recent);
    return true;
}

function checkConcurrentBookings(phone) {
    const count = activeBookingsMap.get(phone) || 0;
    return count < CONFIG.MAX_CONCURRENT_BOOKINGS;
}
function incrementActiveBookings(phone) {
    const count = activeBookingsMap.get(phone) || 0;
    activeBookingsMap.set(phone, count + 1);
    console.log(`📊 Active bookings for ${phone}: ${count + 1}`);
}
function decrementActiveBookings(phone) {
    const count = activeBookingsMap.get(phone) || 0;
    if (count > 0) activeBookingsMap.set(phone, count - 1);
    console.log(`📊 Active bookings for ${phone}: ${Math.max(0, count - 1)}`);
}

// Clean up maps periodically
setInterval(() => {
    cleanupRateLimitMap();
    activeBookingsMap.clear();
}, 300000);

// ================================================================================================
// VALIDATION & SANITIZATION
// ================================================================================================

function sanitizeInput(str, maxLength) {
    if (!str) return '';
    return str.toString().trim().replace(/[<>]/g, '').substring(0, maxLength);
}

function isValidEmail(email) {
    if (!email) return true; // Optional now
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= CONFIG.MAX_EMAIL_LENGTH;
}

function isValidPhone(phone) {
    if (!phone) return false;
    return /^[\d\s\-\+\(\)]{8,20}$/.test(phone);
}

function validateBookingRequest(body) {
    const errors = [];

    if (!body.name?.trim() || body.name.length > CONFIG.MAX_NAME_LENGTH) {
        errors.push(`Name is required (max ${CONFIG.MAX_NAME_LENGTH} characters).`);
    }

    if (!body.phone?.trim() || !isValidPhone(body.phone)) {
        errors.push(`Valid phone number is required.`);
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
// LOGGING
// ================================================================================================

function log(level, message, data = {}) {
    const entry = { timestamp: new Date().toISOString(), level, message, ...data };
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

// ================================================================================================
// GOOGLE SHEETS HELPER
// ================================================================================================

let sheetsInstance;

async function getSheets() {
    console.log('🔐 getSheets() called');
    
    if (sheetsInstance) {
        console.log('✅ Returning cached sheets instance');
        return sheetsInstance;
    }

    console.log('🔐 Initializing new Google Sheets client...');
    
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
    
    console.log('🔐 Auth credentials check:', {
        hasEmail: !!GOOGLE_SERVICE_ACCOUNT_EMAIL,
        hasKey: !!GOOGLE_PRIVATE_KEY,
        emailPrefix: GOOGLE_SERVICE_ACCOUNT_EMAIL ? GOOGLE_SERVICE_ACCOUNT_EMAIL.substring(0, 20) + '...' : 'MISSING',
        keyPrefix: GOOGLE_PRIVATE_KEY ? GOOGLE_PRIVATE_KEY.substring(0, 30) + '...' : 'MISSING',
        keyLength: GOOGLE_PRIVATE_KEY ? GOOGLE_PRIVATE_KEY.length : 0
    });
    
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('❌ Missing Google service account credentials');
        throw new Error("Missing Google service account env variables");
    }

    try {
        console.log('🔐 Creating GoogleAuth instance...');
        
        // Clean the private key
        const cleanedKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
        console.log('🔐 Private key cleaned, length:', cleanedKey.length);
        
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: cleanedKey,
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        console.log('🔐 GoogleAuth created, initializing sheets API...');
        sheetsInstance = google.sheets({ version: "v4", auth });
        console.log('✅ Google Sheets client initialized successfully');
        
        return sheetsInstance;
    } catch (error) {
        console.error('❌ FATAL: Failed to initialize Google Sheets client');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        throw error;
    }
}

// ================================================================================================
// MAIN HANDLER
// ================================================================================================

module.exports = async function handler(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 REQUEST START [${requestId}]`);
    console.log(`📍 Method: ${req.method}`);
    console.log(`📍 URL: ${req.url}`);
    console.log(`📍 Query:`, req.query);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Security + CORS
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        console.log('✅ OPTIONS request handled');
        return res.status(200).end();
    }

    try {
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown';
        console.log(`👤 Client IP: ${clientIP}`);
        
        if (!checkRateLimit(clientIP)) {
            log('warn', 'Rate limit exceeded', { ip: clientIP, requestId });
            return res.status(429).json({ ok: false, error: "Too many requests. Please try again later." });
        }

        console.log('🔧 Initializing Google Sheets...');
        const sheets = await getSheets();
        console.log('✅ Google Sheets client ready');

        // ========================================================================================
        // GET: Lookup by phone number or fetch available slots
        // ========================================================================================
        if (req.method === "GET") {
            console.log('📥 Processing GET request');
            
            if (req.query.phone) {
                console.log('📞 Phone lookup requested');
                const lookupPhone = sanitizeInput(req.query.phone, CONFIG.MAX_PHONE_LENGTH);
                console.log('📞 Looking up phone:', lookupPhone);
                
                if (!isValidPhone(lookupPhone)) {
                    console.log('❌ Invalid phone format');
                    return res.status(400).json({ ok: false, error: "Invalid phone number format." });
                }

                try {
                    console.log('📞 Fetching signups from sheet...');
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId: SHEET_ID,
                        range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                    });
                    
                    const rows = response.data.values || [];
                    console.log(`📞 Found ${rows.length} total signups`);
                    
                    const userBookings = rows
                        .map((row, idx) => ({
                            signupRowId: idx + 2,
                            timestamp: row[SHEETS.SIGNUPS.COLS.TIMESTAMP],
                            date: row[SHEETS.SIGNUPS.COLS.DATE],
                            slotLabel: row[SHEETS.SIGNUPS.COLS.SLOT_LABEL],
                            name: row[SHEETS.SIGNUPS.COLS.NAME],
                            email: row[SHEETS.SIGNUPS.COLS.EMAIL],
                            phone: row[SHEETS.SIGNUPS.COLS.PHONE],
                            category: row[SHEETS.SIGNUPS.COLS.CATEGORY],
                            notes: row[SHEETS.SIGNUPS.COLS.NOTES],
                            slotRowId: parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]) || null,
                            status: row[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE'
                        }))
                        .filter(b => b.phone?.trim() === lookupPhone && b.status === 'ACTIVE');

                    console.log(`📞 Found ${userBookings.length} bookings for phone ${lookupPhone}`);
                    log('info', 'Phone lookup complete', { phone: lookupPhone, count: userBookings.length, requestId });
                    return res.status(200).json({ ok: true, bookings: userBookings });
                } catch (err) {
                    console.error('❌ Phone lookup failed');
                    console.error('Error name:', err.name);
                    console.error('Error message:', err.message);
                    console.error('Error stack:', err.stack);
                    log('error', 'Phone lookup failed', { err: err.message, stack: err.stack, requestId });
                    return res.status(500).json({ ok: false, error: "Failed to fetch bookings." });
                }
            }

            // --- Load available slots (cached)
            console.log('📅 Fetching available slots');
            try {
                const cached = getCachedSlots();
                if (cached) {
                    console.log('✅ Returning cached slots');
                    return res.status(200).json(cached);
                }

                console.log('📊 Fetching slots from Google Sheets...');
                console.log('📊 Sheet ID:', SHEET_ID);
                console.log('📊 Range:', `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`);
                
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`,
                });

                console.log('📊 API Response received');
                console.log('📊 Response status:', response.status);
                console.log('📊 Response statusText:', response.statusText);
                
                const rows = response.data.values || [];
                console.log(`📊 Retrieved ${rows.length} slot rows`);
                
                if (rows.length > 0) {
                    console.log('📊 First row sample:', rows[0]);
                }
                
                const slots = rows.map((row, idx) => ({
                    id: idx + 2,
                    date: row[SHEETS.SLOTS.COLS.DATE] || "",
                    slotLabel: row[SHEETS.SLOTS.COLS.LABEL] || "",
                    capacity: parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0,
                    taken: parseInt(row[SHEETS.SLOTS.COLS.TAKEN]) || 0,
                    available: Math.max(0, (parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0) -
                        (parseInt(row[SHEETS.SLOTS.COLS.TAKEN]) || 0))
                }));

                console.log(`📊 Processed ${slots.length} slots`);

                const today = new Date(); today.setHours(0, 0, 0, 0);
                const grouped = {};
                slots.forEach(slot => {
                    const slotDate = new Date(slot.date);
                    if (slotDate >= today && slot.capacity > 0) {
                        if (!grouped[slot.date]) grouped[slot.date] = [];
                        grouped[slot.date].push(slot);
                    }
                });

                console.log(`📊 Grouped into ${Object.keys(grouped).length} dates`);
                console.log('📊 Dates:', Object.keys(grouped));

                const result = { ok: true, dates: grouped };
                setCachedSlots(result);
                
                console.log('✅ Slots fetched and cached successfully');
                return res.status(200).json(result);
            } catch (err) {
                console.error('❌ CRITICAL: Failed to fetch slots');
                console.error('Error name:', err.name);
                console.error('Error message:', err.message);
                console.error('Error code:', err.code);
                console.error('Error stack:', err.stack);
                
                if (err.response) {
                    console.error('API Response status:', err.response.status);
                    console.error('API Response data:', err.response.data);
                }
                
                log('error', 'Slots fetch failed', { 
                    err: err.message, 
                    code: err.code,
                    stack: err.stack, 
                    requestId 
                });
                return res.status(500).json({ ok: false, error: "Slots not available." });
            }
        }

        // ========================================================================================
        // POST: Create new booking
        // ========================================================================================
        if (req.method === "POST") {
            console.log('📝 Processing POST request (new booking)');
            console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
            
            const errors = validateBookingRequest(req.body);
            if (errors.length) {
                console.log('❌ Validation failed:', errors);
                return res.status(400).json({ ok: false, error: errors.join('; ') });
            }

            const name = sanitizeInput(req.body.name, CONFIG.MAX_NAME_LENGTH);
            const phone = sanitizeInput(req.body.phone, CONFIG.MAX_PHONE_LENGTH);
            const email = sanitizeInput(req.body.email, CONFIG.MAX_EMAIL_LENGTH).toLowerCase();
            const category = sanitizeInput(req.body.category, CONFIG.MAX_CATEGORY_LENGTH);
            const notes = sanitizeInput(req.body.notes, CONFIG.MAX_NOTES_LENGTH);
            const slotIds = req.body.slotIds;

            console.log('📝 Sanitized data:', { name, phone, email, category, slotIds });

            if (!checkConcurrentBookings(phone)) {
                console.log('⚠️ Too many concurrent bookings for phone:', phone);
                return res.status(429).json({ ok: false, error: "Too many concurrent requests. Try again." });
            }

            incrementActiveBookings(phone);
            try {
                console.log('📝 Fetching slot data for booking...');
                const sheetsData = await sheets.spreadsheets.values.batchGet({
                    spreadsheetId: SHEET_ID,
                    ranges: slotIds.map(id => `${SHEETS.SLOTS.NAME}!A${id}:D${id}`)
                });

                console.log('📝 Fetching existing signups...');
                const signupFetch = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                });

                const slotRanges = sheetsData.data.valueRanges;
                const existing = signupFetch.data.values || [];
                const nowStr = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });

                console.log('📝 Processing booking for', slotIds.length, 'slots');

                const signupRows = [];
                const updateRequests = [];

                for (let i = 0; i < slotIds.length; i++) {
                    const slotId = slotIds[i];
                    const row = slotRanges[i].values?.[0];
                    
                    console.log(`📝 Processing slot ${slotId}:`, row);
                    
                    if (!row) {
                        console.error('❌ Slot data missing for ID:', slotId);
                        decrementActiveBookings(phone);
                        return res.status(400).json({ ok: false, error: "Slot data missing." });
                    }

                    const date = row[SHEETS.SLOTS.COLS.DATE];
                    const label = row[SHEETS.SLOTS.COLS.LABEL];
                    const capacity = parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0;
                    const taken = parseInt(row[SHEETS.SLOTS.COLS.TAKEN]) || 0;

                    console.log(`📝 Slot ${slotId}: ${label} on ${date} - ${taken}/${capacity} taken`);

                    const duplicate = existing.find(r =>
                        r[SHEETS.SIGNUPS.COLS.PHONE]?.trim() === phone &&
                        parseInt(r[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]) === slotId &&
                        (r[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE').startsWith('ACTIVE')
                    );
                    
                    if (duplicate) {
                        console.log('❌ Duplicate booking detected');
                        decrementActiveBookings(phone);
                        return res.status(409).json({ ok: false, error: `Already booked ${label} on ${date}.` });
                    }

                    if (taken >= capacity) {
                        console.log('❌ Slot full');
                        decrementActiveBookings(phone);
                        return res.status(409).json({ ok: false, error: `Slot ${label} on ${date} is full.` });
                    }

                    signupRows.push([nowStr, date, label, name, email, phone, category, notes, slotId, 'ACTIVE']);
                    updateRequests.push({
                        range: `${SHEETS.SLOTS.NAME}!D${slotId}`,
                        values: [[taken + 1]]
                    });
                }

                console.log('📝 Writing booking to sheets...');
                console.log('📝 Signup rows:', signupRows.length);
                console.log('📝 Update requests:', updateRequests.length);
                
                // BatchWrite
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: {
                        requests: [
                            {
                                appendCells: {
                                    sheetId: SIGNUPS_GID,
                                    rows: signupRows.map(r => ({
                                        values: r.map(c => ({ userEnteredValue: { stringValue: String(c) } }))
                                    })),
                                    fields: 'userEnteredValue'
                                }
                            },
                            ...updateRequests.map(u => ({
                                updateCells: {
                                    range: {
                                        sheetId: SLOTS_GID,
                                        startRowIndex: parseInt(u.range.match(/\d+/)[0]) - 1,
                                        endRowIndex: parseInt(u.range.match(/\d+/)[0]),
                                        startColumnIndex: 3,
                                        endColumnIndex: 4
                                    },
                                    rows: [{
                                        values: u.values.map(val => ({
                                            userEnteredValue: { numberValue: parseInt(val[0]) }
                                        }))
                                    }],
                                    fields: 'userEnteredValue'
                                }
                            }))
                        ]
                    }
                });

                console.log('✅ Booking written successfully');
                invalidateCache();
                decrementActiveBookings(phone);
                log('info', 'Booking successful', { phone, slotCount: slotIds.length, requestId });
                return res.status(200).json({ ok: true, message: "Booking successful!" });
            } catch (err) {
                console.error('❌ Booking failed');
                console.error('Error name:', err.name);
                console.error('Error message:', err.message);
                console.error('Error stack:', err.stack);
                
                decrementActiveBookings(phone);
                log('error', 'Booking failed', { err: err.message, stack: err.stack, requestId });
                return res.status(500).json({ ok: false, error: "Booking could not be completed." });
            }
        }

        // ========================================================================================
        // PATCH: Cancel booking
        // ========================================================================================
        if (req.method === "PATCH") {
            console.log('🗑️ Processing PATCH request (cancel booking)');
            console.log('🗑️ Request body:', req.body);
            
            const { signupRowId, slotRowId, phone } = req.body;
            if (!signupRowId || !slotRowId || !phone) {
                console.log('❌ Missing cancellation parameters');
                return res.status(400).json({ ok: false, error: "Missing cancellation parameters." });
            }

            try {
                console.log('🗑️ Fetching signup to cancel...');
                const signupResp = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!A${signupRowId}:J${signupRowId}`,
                });
                const row = signupResp.data.values?.[0];
                
                if (!row) {
                    console.log('❌ Booking not found');
                    return res.status(404).json({ ok: false, error: "Booking not found." });
                }
                
                console.log('🗑️ Found booking:', row);
                
                if (row[SHEETS.SIGNUPS.COLS.PHONE]?.trim() !== phone) {
                    console.log('❌ Phone mismatch');
                    return res.status(403).json({ ok: false, error: "Phone number does not match booking." });
                }

                console.log('🗑️ Updating slot availability...');
                const slotResp = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SLOTS.NAME}!D${slotRowId}`
                });
                const currentTaken = parseInt(slotResp.data.values?.[0]?.[0] || 0);
                const newTaken = Math.max(0, currentTaken - 1);

                console.log(`🗑️ Slot availability: ${currentTaken} -> ${newTaken}`);

                const ts = new Date().toISOString();

                console.log('🗑️ Writing cancellation to sheets...');
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
                                        startColumnIndex: 9,
                                        endColumnIndex: 10
                                    },
                                    rows: [{
                                        values: [{
                                            userEnteredValue: { stringValue: `CANCELLED:${ts}` }
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

                console.log('✅ Cancellation successful');
                invalidateCache();
