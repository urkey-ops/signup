// ================================================================================================
// CONFIGURATION AND IMPORTS
// ================================================================================================

// Imports

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');


// Removed: const jwt = require('jsonwebtoken');

// Environment Variables (Updated to match your existing names)
const SPREADSHEET_ID = process.env.SHEET_ID; // Renamed from GOOGLE_SHEET_ID
const PRIVATE_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT; // Renamed from GOOGLE_PRIVATE_KEY_BASE64
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL; // This variable is still needed
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // Renamed from ADMIN_PASSWORD_HASH

// Simple 1-hour session duration for the basic cookie
const SESSION_EXPIRY_SECONDS = 3600; 
const SIMPLE_TOKEN_VALUE = "valid_admin_session"; // A fixed, simple token

// Initialize the Google Spreadsheet
let doc;

// Helper to initialize and authenticate Google Sheets connection
async function connectToSheet() {
    if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY_BASE64) {
        throw new Error("Missing required Google Sheets environment variables");
    }

    const serviceAccountAuth = {
        client_email: CLIENT_EMAIL,
        private_key: Buffer.from(PRIVATE_KEY_BASE64, 'base64')
            .toString('utf8')
            .replace(/\\n/g, '\n'), // Single unescape is enough
    };

    doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth(serviceAccountAuth); // ← BUILT-IN METHOD
    await doc.loadInfo();
}

}



// ================================================================================================
// SECURITY HANDLERS (SIMPLE COOKIE)
// ================================================================================================

/**
 * Sets a simple, non-HttpOnly token cookie for session management.
 * @param {object} res The Vercel response object
 */
function setAuthCookie(res) {
    const expiry = new Date(Date.now() + SESSION_EXPIRY_SECONDS * 1000);

    // Set a simple cookie (non-HttpOnly, non-Secure for easier testing/internal use)
    res.setHeader('Set-Cookie', 
        `admin_token=${SIMPLE_TOKEN_VALUE}; SameSite=Lax; Path=/; Expires=${expiry.toUTCString()}`
    );
}

/**
 * Removes the auth cookie by setting expiry to the past.
 * @param {object} res The Vercel response object
 */
function clearAuthCookie(res) {
    res.setHeader('Set-Cookie', 
        `admin_token=; SameSite=Lax; Path=/; Expires=${new Date(0).toUTCString()}`
    );
}

/**
 * Extracts and verifies the simple token from the cookie.
 * @param {object} req The Vercel request object
 * @returns {boolean} True if authenticated, false otherwise.
 */
function isAuthenticated(req) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return false;

    // Simple cookie parser for admin_token
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('admin_token='));
    
    if (!sessionCookie) return false;

    const token = sessionCookie.substring('admin_token='.length);

    // Check if the token matches the expected simple value
    return token === SIMPLE_TOKEN_VALUE;
}

// Simple password check (UPDATED: uses ADMIN_PASSWORD env var)
function checkPassword(password) {
    // NOTE: This uses the plaintext ADMIN_PASSWORD env variable directly.
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
        setAuthCookie(res); // Set the simple token cookie
        return res.status(200).json({ ok: true, message: 'Login successful' });
    } else {
        clearAuthCookie(res); 
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
}

// The following functions (handleLoadSlots, handleAddSlots, handleDeleteSlots) 
// remain largely the same, relying on the isAuthenticated check above.

async function handleLoadSlots(req, res) {
    await connectToSheet();
    const sheet = doc.sheetsByTitle['Slots']; // Ensure you have a sheet named 'Slots'

    if (!sheet) {
        return res.status(500).json({ ok: false, error: 'Google Sheet "Slots" not found.' });
    }

    await sheet.loadCells(); 
    const rows = await sheet.getRows();

    const slots = rows.map(row => ({
        id: row.rowNumber, // Unique identifier for CRUD ops
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

    await connectToSheet();
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
    
    await connectToSheet();
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie'); // Cookie header is relevant here
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
        return await handleLogin(req, res);  // ← Login works instantly!
    }

    // --- NOW connectToSheet ONLY for authenticated/protected routes ---
    if (req.method !== 'OPTIONS') {
        await connectToSheet();
    }

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
    // ... rest stays the same

        
        // --- PROTECTED ROUTES ---
        
        switch (method) {
            case 'GET':
                return await handleLoadSlots(req, res);

            case 'POST':
                if (action === 'addSlots') {
                    return await handleAddSlots(req, res);
                }

            case 'DELETE':
                if (action === 'deleteSlots') {
                    return await handleDeleteSlots(req, res);
                }

            default:
                return res.status(405).json({ ok: false, error: `Method ${method} not allowed or action missing.` });
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
