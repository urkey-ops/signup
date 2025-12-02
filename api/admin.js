// ================================================================================================
// CONFIGURATION AND IMPORTS
// ================================================================================================

const { google } = require("googleapis");

// Environment Variables - Validate on startup
const REQUIRED_ENV = ['SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT', 'ADMIN_PASSWORD', 'SLOTS_GID'];
REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ CRITICAL: Missing environment variable: ${key}`);
        throw new Error(`Missing required environment variable: ${key}`);
    }
});

const SPREADSHEET_ID = process.env.SHEET_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SLOTS_GID = parseInt(process.env.SLOTS_GID); // Add this to your Vercel env vars!

const SESSION_EXPIRY_SECONDS = 3600;
const SIMPLE_TOKEN_VALUE = "valid_admin_session";
let sheets;

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
    if (sheets) return sheets;
    
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        sheets = google.sheets({ version: "v4", auth });
        return sheets;
    } catch (err) {
        log('error', 'Failed to initialize Google Sheets', { error: err.message });
        throw new Error("Service configuration error");
    }
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

    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('admin_token='));
    
    if (!sessionCookie) return false;
    const token = sessionCookie.substring('admin_token='.length);
    return token === SIMPLE_TOKEN_VALUE;
}

function checkPassword(password) {
    return password === ADMIN_PASSWORD;
}

// ================================================================================================
// VALIDATION HELPERS
// ================================================================================================

function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

function isFutureDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
}

// ================================================================================================
// API HANDLERS
// ================================================================================================

async function handleLogin(req, res) {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ ok: false, error: 'Password required' });
    }

    if (checkPassword(password)) {
        setAuthCookie(res);
        log('info', 'Admin login successful');
        return res.status(200).json({ ok: true, message: 'Login successful' });
    } else {
        clearAuthCookie(res);
        log('warn', 'Failed login attempt');
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
}

async function handleLoadSlots(req, res) {
    const sheets = await getSheets();
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Slots!A2:E',
        });

        const rows = response.data.values || [];
        const slots = rows.map((row, idx) => ({
            id: idx + 2,
            date: row[0] || '',
            slotLabel: row[1] || '',
            capacity: parseInt(row[2], 10) || 0,
            taken: parseInt(row[3], 10) || 0,
            available: Math.max(0, (parseInt(row[2], 10) || 0) - (parseInt(row[3], 10) || 0)),
        }));

        slots.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        log('info', 'Slots loaded', { count: slots.length });
        return res.status(200).json({ ok: true, slots });
    } catch (err) {
        log('error', 'Error loading slots', { error: err.message });
        return res.status(500).json({ ok: false, error: 'Failed to load slots' });
    }
}

async function handleAddSlots(req, res) {
    const { newSlotsData } = req.body; 
    
    if (!newSlotsData || !Array.isArray(newSlotsData) || newSlotsData.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid or empty slot data provided.' });
    }

    // Validate all dates are valid and in the future
    const invalidDates = [];
    const pastDates = [];
    
    for (const dateData of newSlotsData) {
        if (!isValidDate(dateData.date)) {
            invalidDates.push(dateData.date);
        } else if (!isFutureDate(dateData.date)) {
            pastDates.push(dateData.date);
        }
    }

    if (invalidDates.length > 0) {
        return res.status(400).json({ 
            ok: false, 
            error: 'Invalid dates found',
            details: [`Invalid dates: ${invalidDates.join(', ')}`]
        });
    }

    if (pastDates.length > 0) {
        return res.status(400).json({ 
            ok: false, 
            error: 'Cannot add slots for past dates',
            details: [`Past dates: ${pastDates.join(', ')}`]
        });
    }

    const sheets = await getSheets();

    try {
        const existingResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Slots!A2:E',
        });

        const existingRows = existingResponse.data.values || [];
        const existingKeys = new Set(existingRows.map(row => `${row[0]}-${row[1]}`));
        
        const rowsToAdd = [];
        const datesAdded = new Set();
        const datesSkipped = [];

        for (const dateData of newSlotsData) {
            for (const slot of dateData.slots) {
                const rowKey = `${dateData.date}-${slot.label}`;
                
                if (slot.capacity > 0 && !existingKeys.has(rowKey)) {
                    rowsToAdd.push([
                        dateData.date,
                        slot.label,
                        slot.capacity,
                        0,
                        slot.capacity,
                    ]);
                    datesAdded.add(dateData.date);
                } else if (existingKeys.has(rowKey)) {
                    datesSkipped.push(rowKey);
                }
            }
        }

        if (rowsToAdd.length === 0) {
            return res.status(400).json({ 
                ok: false, 
                error: 'No new slots were added.', 
                details: datesSkipped.length > 0 ? [`${datesSkipped.length} slot(s) already exist.`] : ['No valid slots to insert.']
            });
        }

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Slots!A2',
            valueInputOption: 'RAW',
            requestBody: {
                values: rowsToAdd
            }
        });
        
        log('info', 'Slots added', { 
            count: rowsToAdd.length, 
            dates: Array.from(datesAdded) 
        });

        return res.status(201).json({ 
            ok: true, 
            message: `Successfully added ${rowsToAdd.length} slot(s) across ${datesAdded.size} date(s).`,
            details: datesSkipped.length > 0 ? [`Skipped ${datesSkipped.length} existing slot(s).`] : []
        });
    } catch (err) {
        log('error', 'Error adding slots', { error: err.message });
        return res.status(500).json({ ok: false, error: 'Failed to add slots' });
    }
}

async function handleDeleteSlots(req, res) {
    const { rowIds } = req.body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
        return res.status(400).json({ ok: false, error: 'No slot IDs provided for deletion.' });
    }
    
    const sheets = await getSheets();

    try {
        // Get all slots and signups
        const [slotsResponse, signupsResponse] = await Promise.all([
            sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Slots!A2:E',
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Signups!A2:I',
            })
        ]);

        const allSlots = slotsResponse.data.values || [];
        const allSignups = signupsResponse.data.values || [];
        
        // Check if any slots to delete have active bookings
        const slotsWithBookings = [];
        
        rowIds.forEach(rowId => {
            const hasActiveBookings = allSignups.some(signup => {
                const signupSlotId = parseInt(signup[7]); // SLOT_ROW_ID column
                const status = signup[8] || 'ACTIVE';
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
                ok: false, 
                error: 'Cannot delete slots with active bookings',
                details: [`Slots with bookings: ${slotsWithBookings.join(', ')}`]
            });
        }

        // Find valid rows to delete
        const rowsToDelete = rowIds.filter(rowId => {
            const arrayIndex = rowId - 2;
            return arrayIndex >= 0 && arrayIndex < allSlots.length;
        });

        if (rowsToDelete.length === 0) {
            return res.status(200).json({ 
                ok: true, 
                message: 'No matching slots found (0 slots removed).' 
            });
        }

        // Sort descending to delete from bottom up
        rowsToDelete.sort((a, b) => b - a);

        const requests = rowsToDelete.map(rowId => ({
            deleteDimension: {
                range: {
                    sheetId: SLOTS_GID, // Use actual GID from env
                    dimension: 'ROWS',
                    startIndex: rowId - 1,
                    endIndex: rowId
                }
            }
        }));

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: requests
            }
        });

        log('info', 'Slots deleted', { count: rowsToDelete.length });

        return res.status(200).json({ 
            ok: true, 
            message: `Successfully deleted ${rowsToDelete.length} slot(s).`
        });
    } catch (err) {
        log('error', 'Error deleting slots', { error: err.message, stack: err.stack });
        return res.status(500).json({ ok: false, error: 'Failed to delete slots' });
    }
}

/**
 * Main handler function for the Vercel Serverless Function.
 */
module.exports = async (req, res) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true'); 

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { method } = req;
        const { action } = req.body || {};

        // PUBLIC ROUTE: LOGIN
        if (method === 'POST' && action === 'login') {
            return await handleLogin(req, res);
        }

        // AUTHENTICATION GATE
        if (!isAuthenticated(req)) {
            clearAuthCookie(res); 
            return res.status(401).json({ 
                ok: false, 
                error: 'Unauthenticated: Invalid or expired session.', 
                details: ['Please log in again.']
            });
        }
        
        // PROTECTED ROUTES
        switch (method) {
            case 'GET':
                return await handleLoadSlots(req, res);

            case 'POST':
                if (action === 'addSlots') {
                    return await handleAddSlots(req, res);
                }
                return res.status(400).json({ ok: false, error: 'Unknown action for POST method.' });

            case 'DELETE':
                if (action === 'deleteSlots') {
                    return await handleDeleteSlots(req, res);
                }
                return res.status(400).json({ ok: false, error: 'Unknown action for DELETE method.' });

            default:
                return res.status(405).json({ ok: false, error: `Method ${method} not allowed.` });
        }

    } catch (error) {
        log('error', 'Unhandled error', { error: error.message, stack: error.stack });
        return res.status(500).json({ 
            ok: false, 
            error: 'Internal Server Error', 
            details: [error.message] 
        });
    }
};
