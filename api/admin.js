// ================================================================================================
// CONFIGURATION AND IMPORTS
// ================================================================================================

const { google } = require("googleapis");

// Environment Variables
const SPREADSHEET_ID = process.env.SHEET_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const SESSION_EXPIRY_SECONDS = 3600;
const SIMPLE_TOKEN_VALUE = "valid_admin_session";
let sheets;

// Helper to initialize Google Sheets
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
        console.error('Failed to initialize Google Sheets:', err.message);
        throw new Error("Service configuration error");
    }
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
    const sheets = await getSheets();
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Slots!A2:E',
        });

        const rows = response.data.values || [];
        const slots = rows.map((row, idx) => ({
            id: idx + 2, // Row number in sheet
            date: row[0] || '',
            slotLabel: row[1] || '',
            capacity: parseInt(row[2], 10) || 0,
            taken: parseInt(row[3], 10) || 0,
            available: Math.max(0, (parseInt(row[2], 10) || 0) - (parseInt(row[3], 10) || 0)),
        }));

        slots.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return res.status(200).json({ ok: true, slots });
    } catch (err) {
        console.error('Error loading slots:', err.message);
        return res.status(500).json({ ok: false, error: 'Failed to load slots' });
    }
}

async function handleAddSlots(req, res) {
    const { newSlotsData } = req.body; 
    
    if (!newSlotsData || !Array.isArray(newSlotsData) || newSlotsData.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid or empty slot data provided.' });
    }

    const sheets = await getSheets();

    try {
        // Get existing slots to check for duplicates
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
                        0, // taken
                        slot.capacity, // available
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
                details: datesSkipped.length > 0 ? [`${datesSkipped.length} slot(s) already exist or were invalid.`] : ['No valid rows to insert.']
            });
        }

        // Append new rows
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Slots!A2',
            valueInputOption: 'RAW',
            requestBody: {
                values: rowsToAdd
            }
        });
        
        return res.status(201).json({ 
            ok: true, 
            message: `Successfully added ${rowsToAdd.length} slot(s) across ${datesAdded.size} date(s).`,
            details: datesSkipped.length > 0 ? [`Skipped ${datesSkipped.length} existing slot(s).`] : []
        });
    } catch (err) {
        console.error('Error adding slots:', err.message);
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
        // Get all rows to find which ones to delete
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Slots!A2:E',
        });

        const allRows = response.data.values || [];
        const rowsToDelete = [];

        // Find matching rows (rowIds are 2-indexed, array is 0-indexed)
        rowIds.forEach(rowId => {
            const arrayIndex = rowId - 2;
            if (arrayIndex >= 0 && arrayIndex < allRows.length) {
                rowsToDelete.push(rowId);
            }
        });

        if (rowsToDelete.length === 0) {
            return res.status(200).json({ ok: true, message: 'No matching slots found, deletion complete (0 slots removed).' });
        }

        // Sort in descending order to delete from bottom up (prevents index shifting issues)
        rowsToDelete.sort((a, b) => b - a);

        // Delete rows using batchUpdate
        const requests = rowsToDelete.map(rowId => ({
            deleteDimension: {
                range: {
                    sheetId: 0, // Assuming "Slots" is the first sheet
                    dimension: 'ROWS',
                    startIndex: rowId - 1, // 0-indexed
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

        return res.status(200).json({ 
            ok: true, 
            message: `Successfully deleted ${rowsToDelete.length} slot(s).`
        });
    } catch (err) {
        console.error('Error deleting slots:', err.message);
        return res.status(500).json({ ok: false, error: 'Failed to delete slots' });
    }
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
