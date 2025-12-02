// ================================================================================================
// CONFIGURATION AND IMPORTS
// ================================================================================================

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Environment Variables
const SPREADSHEET_ID = process.env.SHEET_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_PRIVATE_KEY = process.env.GOOGLE_ADMIN_PRIVATE_KEY;
const ADMIN_CLIENT_EMAIL = process.env.GOOGLE_ADMIN_CLIENT_EMAIL;

const SESSION_EXPIRY_SECONDS = 3600;
const SIMPLE_TOKEN_VALUE = "valid_admin_session";
let doc;

// Helper to initialize Google Sheets
async function connectToSheet() {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    
    if (!SPREADSHEET_ID || !serviceAccount) {
        throw new Error("Missing Google Sheets env vars");
    }

    doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth(serviceAccount);
    await doc.loadInfo();
}


// ================================================================================================
// SECURITY HANDLERS (SIMPLE COOKIE)
// ================================================================================================

function setAuthCookie(res) {
    const expiry = new Date(Date.now() + SESSION_EXPIRY_SECONDS * 1000);
    res.setHeader('Set-Cookie', 
        `admin_token=${SIMPLE_TOKEN_VALUE}; SameSite=Lax; Path=/; Expires=${expiry.toUTCString()}`
    );
}

function clearAuthCookie(res) {
    res.setHeader('Set-Cookie', 
        `admin_token=; SameSite=Lax; Path=/; Expires=${new Date(0).toUTCString()}`
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
// API HANDLERS
// ================================================================================================

async function handleLogin(req, res) {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ ok: false, error: 'Password required' });
    }

    if (checkPassword(password)) {
        setAuthCookie(res);
        return res.status(200).json({ ok: true, message: 'Login successful' });
    } else {
        clearAuthCookie(res);
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
}

async function handleLoadSlots(req, res) {
    const sheet = doc.sheetsByTitle['Slots'];

    if (!sheet) {
        return res.status(500).json({ ok: false, error: 'Google Sheet "Slots" not found.' });
    }

    await sheet.loadCells(); 
    const rows = await sheet.getRows();

    const slots = rows.map(row => ({
        id: row.rowNumber,
        date: row.date,
        slotLabel: row.slotLabel,
        capacity: parseInt(row.capacity, 10) || 0,
        taken: parseInt(row.taken, 10) || 0,
        available: parseInt(row.available, 10) || 0,
    })).filter(slot => slot.id); 

    slots.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return res.status(200).json({ ok: true, slots });
}

async function handleAddSlots(req, res) {
    const { newSlotsData } = req.body; 
    
    if (!newSlotsData || !Array.isArray(newSlotsData) || newSlotsData.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid or empty slot data provided.' });
    }

    const sheet = doc.sheetsByTitle['Slots'];

    if (!sheet) {
        return res.status(500).json({ ok: false, error: 'Google Sheet "Slots" not found.' });
    }

    const existingRows = await sheet.getRows();
    const existingKeys = new Set(existingRows.map(row => `${row.date}-${row.slotLabel}`));
    const rowsToAdd = [];
    const datesAdded = new Set();
    const datesSkipped = [];

    for (const dateData of newSlotsData) {
        for (const slot of dateData.slots) {
            const rowKey = `${dateData.date}-${slot.label}`;
            
            if (slot.capacity > 0 && !existingKeys.has(rowKey)) {
                rowsToAdd.push({
                    date: dateData.date,
                    slotLabel: slot.label,
                    capacity: slot.capacity,
                    taken: 0, 
                    available: slot.capacity, 
                });
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
            details: datesSkipped.length > 0 ? [`${datesSkipped.length} slot(s) already exist or were invalid.`] : ['No valid rows to insert.']
        });
    }

    const addedRows = await sheet.addRows(rowsToAdd);
    
    return res.status(201).json({ 
        ok: true, 
        message: `Successfully added ${addedRows.length} slot(s) across ${datesAdded.size} date(s).`,
        details: datesSkipped.length > 0 ? [`Skipped ${datesSkipped.length} existing slot(s).`] : []
    });
}

async function handleDeleteSlots(req, res) {
    const { rowIds } = req.body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
        return res.status(400).json({ ok: false, error: 'No slot IDs provided for deletion.' });
    }
    
    const sheet = doc.sheetsByTitle['Slots'];

    if (!sheet) {
        return res.status(500).json({ ok: false, error: 'Google Sheet "Slots" not found.' });
    }

    const allRows = await sheet.getRows();
    const rowsToDelete = allRows.filter(row => row.rowNumber && rowIds.includes(row.rowNumber));

    if (rowsToDelete.length === 0) {
        return res.status(200).json({ ok: true, message: 'No matching slots found, deletion complete (0 slots removed).' });
    }

    const deletePromises = rowsToDelete.map(row => row.delete());
    
    await Promise.all(deletePromises);

    return res.status(200).json({ 
        ok: true, 
        message: `Successfully deleted ${rowsToDelete.length} slot(s).`
    });
}

/**
 * Main handler function for the Vercel Serverless Function.
 */
module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true'); 

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { method } = req;
        const { action } = req.body || {};

        // --- PUBLIC ROUTE: LOGIN (NO SHEET CONNECTION NEEDED) ---
        if (method === 'POST' && action === 'login') {
            return await handleLogin(req, res);
        }

        // --- CONNECT TO SHEET FOR ALL PROTECTED ROUTES ---
        await connectToSheet();

        // --- AUTHENTICATION GATE ---
        if (!isAuthenticated(req)) {
            clearAuthCookie(res); 
            return res.status(401).json({ 
                ok: false, 
                error: 'Unauthenticated: Invalid or expired session.', 
                details: ['Please log in again.']
            });
        }
        
        // --- PROTECTED ROUTES ---
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
        console.error("Backend Error:", error);
        return res.status(500).json({ 
            ok: false, 
            error: 'Internal Server Error', 
            details: [error.message] 
        });
    }
};
