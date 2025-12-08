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

// Environment validation
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

const SIGNUPS_GID = parseInt(process.env.SIGNUPS_GID);
const SLOTS_GID = parseInt(process.env.SLOTS_GID);
const SHEET_ID = process.env.SHEET_ID;
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

console.log('✅ Configuration loaded:', {
    SHEET_ID: SHEET_ID.substring(0, 10) + '...',
    SIGNUPS_GID,
    SLOTS_GID,
    TIMEZONE
});

// ================================================================================================
// CACHE & RATE LIMITING
// ================================================================================================

const cache = { slots: null, timestamp: 0, TTL: CONFIG.CACHE_TTL };
const rateLimitMap = new Map();
const activeBookingsMap = new Map();

// ✅ NEW: Phone normalization (aligned with frontend)
function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    return phone.replace(/\D/g, '');
}

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

// Cleanup intervals
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitMap.entries()) {
        const valid = timestamps.filter(t => now - t < CONFIG.RATE_LIMIT_WINDOW);
        valid.length ? rateLimitMap.set(key, valid) : rateLimitMap.delete(key);
    }
}, 300000);

// ================================================================================================
// VALIDATION (PHONE NORMALIZATION)
// ================================================================================================

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
    const normalizedPhone = normalizePhone(body.phone);
    
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
// GOOGLE SHEETS
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
    
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('❌ Missing Google credentials');
        throw new Error("Missing Google service account env variables");
    }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        sheetsInstance = google.sheets({ version: "v4", auth });
        console.log('✅ Google Sheets client initialized');
        return sheetsInstance;
    } catch (error) {
        console.error('❌ FATAL: Failed to initialize Google Sheets');
        console.error('Error:', error.message);
        throw error;
    }
}

// ================================================================================================
// MAIN HANDLER
// ================================================================================================

module.exports = async function handler(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🚀 REQUEST [${requestId}] ${req.method} ${req.url}`);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        console.log('✅ OPTIONS handled');
        return res.status(200).end();
    }

    try {
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
        console.log(`👤 Client: ${clientIP}`);
        
        if (!checkRateLimit(clientIP)) {
            return res.status(429).json({ ok: false, error: "Too many requests. Please wait." });
        }

        console.log('🔧 Initializing Sheets...');
        const sheets = await getSheets();
        console.log('✅ Sheets ready');

        // GET: Phone lookup or fetch slots
        if (req.method === "GET") {
            console.log('📥 GET request');
            
            if (req.query.phone) {
                console.log('📞 Phone lookup');
                const rawPhone = req.query.phone;
                const normalizedPhone = normalizePhone(rawPhone);
                
                if (!isValidPhone(rawPhone)) {
                    return res.status(400).json({ ok: false, error: "Invalid 10-digit phone number." });
                }

                try {
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId: SHEET_ID,
                        range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                    });
                    const rows = response.data.values || [];
                    console.log(`📞 Found ${rows.length} total signups`);
                    
                    // ✅ USE NORMALIZED PHONE FOR COMPARISON
                    const userBookings = rows
                        .map((row, idx) => ({
                            signupRowId: idx + 2,
                            timestamp: row[0], 
                            date: row[1], 
                            slotLabel: row[2],
                            name: row[3], 
                            email: row[4], 
                            phone: row[5],
                            category: row[6], 
                            notes: row[7],
                            slotRowId: parseInt(row[8]) || null,
                            status: row[9] || 'ACTIVE'
                        }))
                        .filter(b => normalizePhone(b.phone) === normalizedPhone && b.status === 'ACTIVE');

                    console.log(`✅ Found ${userBookings.length} active bookings for ${normalizedPhone}`);
                    return res.status(200).json({ ok: true, bookings: userBookings });
                } catch (err) {
                    console.error('❌ Phone lookup failed:', err.message);
                    return res.status(500).json({ ok: false, error: "Failed to fetch bookings." });
                }
            }

            // Fetch available slots
            console.log('📅 Fetching slots');
            try {
                const cached = getCachedSlots();
                if (cached) return res.status(200).json(cached);

                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`,
                });

                const rows = response.data.values || [];
                console.log(`📊 Got ${rows.length} slot rows`);
                
                const slots = rows.map((row, idx) => ({
                    id: idx + 2,
                    date: row[0] || "",
                    slotLabel: row[1] || "",
                    capacity: parseInt(row[2]) || 0,
                    taken: parseInt(row[3]) || 0,
                    available: Math.max(0, (parseInt(row[2]) || 0) - (parseInt(row[3]) || 0))
                }));

                const today = new Date(); 
                today.setHours(0, 0, 0, 0);
                const grouped = {};
                
                slots.forEach(slot => {
                    const slotDate = new Date(slot.date);
                    if (slotDate >= today && slot.capacity > 0 && slot.available > 0) {
                        if (!grouped[slot.date]) grouped[slot.date] = [];
                        grouped[slot.date].push(slot);
                    }
                });

                console.log(`✅ Grouped into ${Object.keys(grouped).length} dates`);
                const result = { ok: true, dates: grouped };
                setCachedSlots(result);
                return res.status(200).json(result);
            } catch (err) {
                console.error('❌ Slots fetch failed:', err.message);
                return res.status(500).json({ ok: false, error: "Slots not available." });
            }
        }

        // POST: Create booking
        if (req.method === "POST") {
            console.log('📝 POST booking');
            const errors = validateBookingRequest(req.body);
            if (errors.length) {
                console.log('❌ Validation failed:', errors);
                return res.status(400).json({ ok: false, error: errors.join('; ') });
            }

            const name = sanitizeInput(req.body.name, CONFIG.MAX_NAME_LENGTH);
            const normalizedPhone = normalizePhone(req.body.phone);  // ✅ NORMALIZED
            const email = sanitizeInput(req.body.email, CONFIG.MAX_EMAIL_LENGTH)?.toLowerCase();
            const category = sanitizeInput(req.body.category, CONFIG.MAX_CATEGORY_LENGTH);
            const notes = sanitizeInput(req.body.notes, CONFIG.MAX_NOTES_LENGTH);
            const slotIds = req.body.slotIds;

            if (!checkConcurrentBookings(normalizedPhone)) {
                return res.status(429).json({ ok: false, error: "Too many concurrent requests." });
            }

            incrementActiveBookings(normalizedPhone);
            try {
                const sheetsData = await sheets.spreadsheets.values.batchGet({
                    spreadsheetId: SHEET_ID,
                    ranges: slotIds.map(id => `${SHEETS.SLOTS.NAME}!A${id}:D${id}`)
                });

                const signupFetch = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                });

                const slotRanges = sheetsData.data.valueRanges;
                const existing = signupFetch.data.values || [];
                const nowStr = new Date().toLocaleString("en-US", { timeZone: TIMEZONE });

                const signupRows = [];
                const updateRequests = [];

                for (let i = 0; i < slotIds.length; i++) {
                    const slotId = slotIds[i];
                    const row = slotRanges[i].values?.[0];
                    if (!row) {
                        decrementActiveBookings(normalizedPhone);
                        return res.status(400).json({ ok: false, error: "Slot data missing." });
                    }

                    const date = row[0];
                    const label = row[1];
                    const capacity = parseInt(row[2]) || 0;
                    const taken = parseInt(row[3]) || 0;

                    // ✅ CHECK DUPLICATES WITH NORMALIZED PHONE
                    const duplicate = existing.find(r =>
                        normalizePhone(r[5]) === normalizedPhone &&
                        parseInt(r[8]) === slotId &&
                        (r[9] || 'ACTIVE').startsWith('ACTIVE')
                    );
                    
                    if (duplicate) {
                        decrementActiveBookings(normalizedPhone);
                        return res.status(409).json({ ok: false, error: `Already booked ${label} on ${date}.` });
                    }

                    if (taken >= capacity) {
                        decrementActiveBookings(normalizedPhone);
                        return res.status(409).json({ ok: false, error: `Slot ${label} on ${date} is full.` });
                    }

                    // ✅ STORE NORMALIZED PHONE
                    signupRows.push([nowStr, date, label, name, email, normalizedPhone, category, notes, slotId, 'ACTIVE']);
                    updateRequests.push({
                        range: `${SHEETS.SLOTS.NAME}!D${slotId}`,
                        values: [[taken + 1]]
                    });
                }

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
                                    rows: [{ values: u.values.map(val => ({ userEnteredValue: { numberValue: parseInt(val[0]) } })) }],
                                    fields: 'userEnteredValue'
                                }
                            }))
                        ]
                    }
                });

                console.log(`✅ Booking successful for ${normalizedPhone}: ${slotIds.length} slots`);
                invalidateCache();
                decrementActiveBookings(normalizedPhone);
                return res.status(200).json({ ok: true, message: "Booking successful!" });
                
            } catch (err) {
                console.error('❌ Booking failed:', err.message);
                decrementActiveBookings(normalizedPhone);
                return res.status(500).json({ ok: false, error: "Booking failed. Please try again." });
            }
        }

        // PATCH: Cancel booking
        if (req.method === "PATCH") {
            console.log('🗑️ PATCH cancel');
            const { signupRowId, slotRowId, phone } = req.body;
            
            if (!signupRowId || !slotRowId || !phone) {
                return res.status(400).json({ ok: false, error: "Missing signupRowId, slotRowId, or phone." });
            }

            const normalizedPhone = normalizePhone(phone);
            if (!isValidPhone(phone)) {
                return res.status(400).json({ ok: false, error: "Invalid 10-digit phone number." });
            }

            try {
                const signupResp = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SIGNUPS.NAME}!A${signupRowId}:J${signupRowId}`,
                });
                const row = signupResp.data.values?.[0];
                if (!row) {
                    return res.status(404).json({ ok: false, error: "Booking not found." });
                }
                
                // ✅ NORMALIZED PHONE COMPARISON
                if (normalizePhone(row[5]) !== normalizedPhone) {
                    return res.status(403).json({ ok: false, error: "Phone mismatch. Cannot cancel." });
                }

                const slotResp = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: `${SHEETS.SLOTS.NAME}!D${slotRowId}`
                });
                const currentTaken = parseInt(slotResp.data.values?.[0]?.[0] || 0);
                const newTaken = Math.max(0, currentTaken - 1);
                const ts = new Date().toISOString();

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
                                    rows: [{ values: [{ userEnteredValue: { stringValue: `CANCELLED:${ts}` } }] }],
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
                                    rows: [{ values: [{ userEnteredValue: { numberValue: newTaken } }] }],
                                    fields: 'userEnteredValue'
                                }
                            }
                        ]
                    }
                });

                console.log(`✅ Cancellation successful: signupRow ${signupRowId}, slotRow ${slotRowId}`);
                invalidateCache();
                return res.status(200).json({ ok: true, message: "Cancelled successfully." });
                
            } catch (err) {
                console.error('❌ Cancel failed:', err.message);
                return res.status(500).json({ ok: false, error: "Cancellation failed. Please try again." });
            }
        }

        return res.status(405).json({ ok: false, error: "Method not allowed." });
        
    } catch (err) {
        console.error('❌ Unhandled error:', err.message);
        console.error('Stack:', err.stack);
        return res.status(500).json({ ok: false, error: "Internal server error." });
    }
};
