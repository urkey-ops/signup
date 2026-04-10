// ================================================================================================
// CONFIGURATION AND IMPORTS
// ================================================================================================

const { getSheets } = require('./sheets'); // FIX #8: use shared getSheets with hourly token refresh

// Environment Variables - Validate on startup
const REQUIRED_ENV = ['SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'ADMIN_PASSWORD', 'SLOTS_GID'];
REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ CRITICAL: Missing environment variable: ${key}`);
        throw new Error(`Missing required environment variable: ${key}`);
    }
});

const SPREADSHEET_ID  = process.env.SHEET_ID;
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD;
const SLOTS_GID       = parseInt(process.env.SLOTS_GID);
const ALLOWED_ORIGIN  = process.env.FRONTEND_URL || '*';

const SESSION_EXPIRY_SECONDS = 3600;
const SIMPLE_TOKEN_VALUE     = 'valid_admin_session';

// Column indices — kept in sync with api/config.js SHEETS.SIGNUPS.COLS
// FIX #4: was signup[7]/signup[8] — off by one vs actual sheet layout
const SIGNUP_COL_SLOT_ROW_ID = 8;  // column I (0-indexed)
const SIGNUP_COL_STATUS      = 9;  // column J (0-indexed)

console.log('🔧 Admin API initialized:', {
    SHEET_ID: SPREADSHEET_ID.substring(0, 10) + '...',
    SLOTS_GID,
    hasEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    hasKey:   !!process.env.GOOGLE_PRIVATE_KEY
});

// ================================================================================================
// LOGGING
// ================================================================================================

function log(level, message, data = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level:     level.toUpperCase(),
        message,
        ...data
    };
    if (level === 'error') console.error(JSON.stringify(logEntry));
    else                   console.log(JSON.stringify(logEntry));
}

// ================================================================================================
// SECURITY HANDLERS
// ================================================================================================

function setAuthCookie(res) {
    const expiry = new Date(Date.now() + SESSION_EXPIRY_SECONDS * 1000);
    res.setHeader('Set-Cookie',
        `admin_token=${SIMPLE_TOKEN_VALUE}; HttpOnly; SameSite=Strict; Path=/; Expires=${expiry.toUTCString()}; Secure`
    );
}

function clearAuthCookie(res) {
    res.setHeader('Set-Cookie',
        `admin_token=; HttpOnly; SameSite=Strict; Path=/; Expires=${new Date(0).toUTCString()}; Secure`
    );
}

function isAuthenticated(req) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return false;
    const cookies       = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('admin_token='));
    if (!sessionCookie) return false;
    const token = sessionCookie.substring('admin_token='.length);
    return token === SIMPLE_TOKEN_VALUE;
}

function checkPassword(password) {
    if (!password || password.length !== ADMIN_PASSWORD.length) return false;
    let match = true;
    for (let i = 0; i < ADMIN_PASSWORD.length; i++) {
        if (password[i] !== ADMIN_PASSWORD[i]) match = false;
    }
    return match;
}

// ================================================================================================
// VALIDATION HELPERS
// ================================================================================================

function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

function isFutureDate(dateString) {
    const date  = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
}

// ================================================================================================
// SLOT TIME SORT HELPER
// FIX #3: sort slots within a date chronologically, not just by date
// ================================================================================================

function parseSlotHour(label) {
    if (!label || typeof label !== 'string') return 0;
    const first  = label.replace(/\s*-\s*/g, '-').split('-')[0].trim();
    const m      = first.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return 0;
    let hour     = Number(m[1]);
    const mins   = m[2] ? Number(m[2]) : 0;
    const period = m[3] ? m[3].toLowerCase() : null;
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour  = 0;
    return hour * 60 + mins;
}

// ================================================================================================
// BODY PARSER HELPER
// ================================================================================================

async function parseBody(req) {
    if (req.body) return req.body;
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const data = Buffer.concat(buffers).toString();
    try { return JSON.parse(data); }
    catch (err) { throw new Error('Invalid JSON body'); }
}

// ================================================================================================
// API HANDLERS
// ================================================================================================

async function handleLogin(req, res) {
    console.log('🔑 Login attempt');
    const { password } = req.body;
    if (!password) return res.status(400).json({ ok: false, error: 'Password required' });

    if (checkPassword(password)) {
        setAuthCookie(res);
        log('info', 'Admin login successful');
        return res.status(200).json({ ok: true, message: 'Login successful' });
    }
    clearAuthCookie(res);
    log('warn', 'Failed login attempt');
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
}

async function handleLoadSlots(req, res) {
    console.log('📊 Loading slots');
    const sheets = await getSheets(); // FIX #8: uses shared instance with token refresh

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range:         'Slots!A2:E',
        });

        const rows  = response.data.values || [];
        console.log(`📊 Retrieved ${rows.length} slot rows`);

        const slots = rows.map((row, idx) => ({
            id:        idx + 2,
            date:      row[0] || '',
            slotLabel: row[1] || '',
            capacity:  parseInt(row[2], 10) || 0,
            taken:     parseInt(row[3], 10) || 0,
            available: row[4]
                ? parseInt(row[4], 10)
                : Math.max(0, (parseInt(row[2], 10) || 0) - (parseInt(row[3], 10) || 0)),
        }));

        // FIX #3: sort by date first, then by slot time within each date
        slots.sort((a, b) => {
            const dateDiff = new Date(a.date) - new Date(b.date);
            if (dateDiff !== 0) return dateDiff;
            return parseSlotHour(a.slotLabel) - parseSlotHour(b.slotLabel);
        });

        log('info', 'Slots loaded', { count: slots.length });
        return res.status(200).json({ ok: true, slots });

    } catch (err) {
        console.error('❌ Error loading slots:', err.message);
        log('error', 'Error loading slots', { error: err.message });
        return res.status(500).json({ ok: false, error: 'Failed to load slots' });
    }
}

async function handleAddSlots(req, res) {
    console.log('➕ Adding slots');
    const { newSlotsData } = req.body;

    if (!newSlotsData || !Array.isArray(newSlotsData) || newSlotsData.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid or empty slot data provided.' });
    }

    const invalidDates = [];
    const pastDates    = [];

    for (const dateData of newSlotsData) {
        if (!isValidDate(dateData.date))       invalidDates.push(dateData.date);
        else if (!isFutureDate(dateData.date)) pastDates.push(dateData.date);
    }

    if (invalidDates.length > 0) {
        return res.status(400).json({
            ok: false, error: 'Invalid dates found',
            details: [`Invalid dates: ${invalidDates.join(', ')}`]
        });
    }
    if (pastDates.length > 0) {
        return res.status(400).json({
            ok: false, error: 'Cannot add slots for past dates',
            details: [`Past dates: ${pastDates.join(', ')}`]
        });
    }

    const sheets = await getSheets(); // FIX #8

    try {
        const existingResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range:         'Slots!A2:E',
        });

        const existingRows = existingResponse.data.values || [];
        const existingKeys = new Set(existingRows.map(row => `${row[0]}-${row[1]}`));

        const rowsToAdd    = [];
        const datesAdded   = new Set();
        const datesSkipped = [];

        for (const dateData of newSlotsData) {
            for (const slot of dateData.slots) {
                const rowKey = `${dateData.date}-${slot.label}`;
                if (slot.capacity > 0 && !existingKeys.has(rowKey)) {
                    rowsToAdd.push([dateData.date, slot.label, slot.capacity, 0, slot.capacity]);
                    datesAdded.add(dateData.date);
                } else if (existingKeys.has(rowKey)) {
                    datesSkipped.push(rowKey);
                }
            }
        }

        if (rowsToAdd.length === 0) {
            return res.status(400).json({
                ok: false, error: 'No new slots were added.',
                details: datesSkipped.length > 0
                    ? [`${datesSkipped.length} slot(s) already exist.`]
                    : ['No valid slots to insert.']
            });
        }

        await sheets.spreadsheets.values.append({
            spreadsheetId:   SPREADSHEET_ID,
            range:           'Slots!A2',
            valueInputOption: 'RAW',
            requestBody:     { values: rowsToAdd }
        });

        log('info', 'Slots added', { count: rowsToAdd.length, dates: Array.from(datesAdded) });

        return res.status(201).json({
            ok:      true,
            message: `Successfully added ${rowsToAdd.length} slot(s) across ${datesAdded.size} date(s).`,
            details: datesSkipped.length > 0 ? [`Skipped ${datesSkipped.length} existing slot(s).`] : []
        });

    } catch (err) {
        console.error('❌ Error adding slots:', err.message);
        log('error', 'Error adding slots', { error: err.message });
        return res.status(500).json({ ok: false, error: 'Failed to add slots' });
    }
}

async function handleDeleteSlots(req, res) {
    console.log('🗑️ Deleting slots');
    const { rowIds } = req.body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
        return res.status(400).json({ ok: false, error: 'No slot IDs provided for deletion.' });
    }

    const sheets = await getSheets(); // FIX #8

    try {
        const [slotsResponse, signupsResponse] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Slots!A2:E' }),
            sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Signups!A2:J' }) // FIX #4: was A2:I, need col J for STATUS
        ]);

        const allSlots   = slotsResponse.data.values  || [];
        const allSignups = signupsResponse.data.values || [];

        const slotsWithBookings = [];

        rowIds.forEach(rowId => {
            const hasActiveBookings = allSignups.some(signup => {
                // FIX #4: was signup[7]/signup[8] — off by one vs SHEETS.SIGNUPS.COLS
                const signupSlotId = parseInt(signup[SIGNUP_COL_SLOT_ROW_ID]);
                const status       = signup[SIGNUP_COL_STATUS] || 'ACTIVE';
                return signupSlotId === rowId && status === 'ACTIVE';
            });

            if (hasActiveBookings) {
                const slotIndex = rowId - 2;
                if (slotIndex >= 0 && slotIndex < allSlots.length) {
                    const slot = allSlots[slotIndex];
                    slotsWithBookings.push(`${slot[0]} - ${slot[1]}`);
                }
            }
        });

        if (slotsWithBookings.length > 0) {
            return res.status(400).json({
                ok:      false,
                error:   'Cannot delete slots with active bookings',
                details: [`Slots with bookings: ${slotsWithBookings.join(', ')}`]
            });
        }

        const rowsToDelete = rowIds.filter(rowId => {
            const arrayIndex = rowId - 2;
            return arrayIndex >= 0 && arrayIndex < allSlots.length;
        });

        if (rowsToDelete.length === 0) {
            return res.status(200).json({ ok: true, message: 'No matching slots found (0 slots removed).' });
        }

        rowsToDelete.sort((a, b) => b - a); // bottom-up deletion

        const requests = rowsToDelete.map(rowId => ({
            deleteDimension: {
                range: { sheetId: SLOTS_GID, dimension: 'ROWS', startIndex: rowId - 1, endIndex: rowId }
            }
        }));

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody:   { requests }
        });

        log('info', 'Slots deleted', { count: rowsToDelete.length });
        return res.status(200).json({ ok: true, message: `Successfully deleted ${rowsToDelete.length} slot(s).` });

    } catch (err) {
        console.error('❌ Error deleting slots:', err.message);
        log('error', 'Error deleting slots', { error: err.message, stack: err.stack });
        return res.status(500).json({ ok: false, error: 'Failed to delete slots' });
    }
}

// ================================================================================================
// MAIN HANDLER
// ================================================================================================

module.exports = async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🚀 ADMIN REQUEST [${requestId}] ${req.method} ${req.url}`);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { method } = req;
        let body = {};

        if (method === 'POST' || method === 'DELETE') {
            const contentType = req.headers['content-type'];
            if (!contentType || !contentType.includes('application/json')) {
                return res.status(400).json({ ok: false, error: 'Content-Type must be application/json' });
            }
            try { body = await parseBody(req); req.body = body; }
            catch (err) { return res.status(400).json({ ok: false, error: 'Invalid JSON in request body' }); }
        }

        const { action } = body;

        if (method === 'POST' && action === 'login') return await handleLogin(req, res);

        if (!isAuthenticated(req)) {
            clearAuthCookie(res);
            return res.status(401).json({
                ok: false, error: 'Unauthenticated: Invalid or expired session.',
                details: ['Please log in again.']
            });
        }

        switch (method) {
            case 'GET':    return await handleLoadSlots(req, res);
            case 'POST':
                if (action === 'addSlots') return await handleAddSlots(req, res);
                return res.status(400).json({ ok: false, error: 'Unknown action for POST method.' });
            case 'DELETE':
                if (action === 'deleteSlots') return await handleDeleteSlots(req, res);
                return res.status(400).json({ ok: false, error: 'Unknown action for DELETE method.' });
            default:
                return res.status(405).json({ ok: false, error: `Method ${method} not allowed.` });
        }

    } catch (error) {
        console.error('❌ Unhandled error:', error.message);
        log('error', 'Unhandled error', { error: error.message, stack: error.stack });
        return res.status(500).json({ ok: false, error: 'Internal Server Error', details: [error.message] });
    }
};
