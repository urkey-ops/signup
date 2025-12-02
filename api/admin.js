// ================================================================================================
// CONFIGURATION AND IMPORTS
// ================================================================================================

// Imports
const { GoogleSpreadsheet } = require('google-spreadsheet');
const jwt = require('jsonwebtoken');

// Environment Variables (Set these in Vercel/local environment)
// NOTE: Make sure to set these securely in Vercel's environment variables.
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const PRIVATE_KEY_BASE64 = process.env.GOOGLE_PRIVATE_KEY_BASE64; // The private key JSON, base64 encoded
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // Use a strong, salted hash!
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY_SECONDS = 3600; // 1 hour session

// Initialize the Google Spreadsheet
let doc;

// Helper to initialize and authenticate Google Sheets connection
async function connectToSheet() {
    if (doc) return; // Already connected
    if (!SPREADSHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY_BASE4) {
        throw new Error("Missing required Google Sheets environment variables.");
    }
    
    // Decode the private key
    const privateKey = Buffer.from(PRIVATE_KEY_BASE4, 'base64').toString('utf8');
    
    doc = new GoogleSpreadsheet(SPREADSHEET_ID);

    await doc.useServiceAccountAuth({
        client_email: CLIENT_EMAIL,
        private_key: privateKey.replace(/\\n/g, '\n'), // Important: fix escaped newlines
    });

    await doc.loadInfo(); // Load sheet info
}

// ================================================================================================
// SECURITY HANDLERS (JWT & Cookie)
// ================================================================================================

/**
 * Generates a session JWT and sets it in an HttpOnly Cookie.
 * @param {object} res The Vercel response object
 */
function setAuthCookie(res) {
    const payload = { isAdmin: true };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY_SECONDS });
    const expiry = new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000);

    // Set a secure, HttpOnly cookie.
    res.setHeader('Set-Cookie', 
        `adminSessionId=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${expiry.toUTCString()}`
    );
}

/**
 * Removes the auth cookie by setting expiry to the past.
 * @param {object} res The Vercel response object
 */
function clearAuthCookie(res) {
    res.setHeader('Set-Cookie', 
        `adminSessionId=; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${new Date(0).toUTCString()}`
    );
}

/**
 * Extracts and verifies the JWT from the cookie.
 * @param {object} req The Vercel request object
 * @returns {boolean} True if authenticated, false otherwise.
 */
function isAuthenticated(req) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return false;

    // Simple cookie parser for adminSessionId
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('adminSessionId='));
    
    if (!sessionCookie) return false;

    const token = sessionCookie.substring('adminSessionId='.length);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.isAdmin === true;
    } catch (err) {
        // Token expired, invalid signature, or other error
        return false;
    }
}

// Dummy function for password checking (replace with proper hashing check!)
function checkPassword(password) {
    // ⚠️ CRITICAL: In a real app, use a library like bcrypt to securely compare the hash.
    // Since the frontend provided a fixed hash variable, we'll use a placeholder check:
    // return bcrypt.compareSync(password, ADMIN_PASSWORD_HASH);
    
    // For this demonstration, we'll assume the client-side password matches the hash exactly:
    return password === ADMIN_PASSWORD_HASH; 
}


// ================================================================================================
// API HANDLERS
// ================================================================================================

/**
 * Handles Admin Login
 * @param {object} req - request object
 * @param {object} res - response object
 */
async function handleLogin(req, res) {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ ok: false, error: 'Password required' });
    }

    if (checkPassword(password)) {
        setAuthCookie(res); // Set the secure HttpOnly cookie
        return res.status(200).json({ ok: true, message: 'Login successful' });
    } else {
        // Clear cookie on failed login attempt
        clearAuthCookie(res); 
        return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
}

/**
 * Loads all existing slots from the sheet.
 * @param {object} req - request object
 * @param {object} res - response object
 */
async function handleLoadSlots(req, res) {
    await connectToSheet();
    const sheet = doc.sheetsByTitle['Slots']; // Ensure you have a sheet named 'Slots'

    if (!sheet) {
        return res.status(500).json({ ok: false, error: 'Google Sheet "Slots" not found.' });
    }

    const rows = await sheet.getRows();

    // Map rows to a cleaner object structure
    const slots = rows.map(row => ({
        id: row.rowNumber, // Use rowNumber as a unique identifier for CRUD ops
        date: row.date,
        slotLabel: row.slotLabel,
        capacity: parseInt(row.capacity, 10),
        taken: parseInt(row.taken, 10),
        available: parseInt(row.available, 10),
    })).filter(slot => slot.id); // Filter out potential empty rows

    // Sort chronologically (best practice for list display)
    slots.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return res.status(200).json({ ok: true, slots });
}

/**
 * Handles batch creation of new slots.
 * @param {object} req - request object
 * @param {object} res - response object
 */
async function handleAddSlots(req, res) {
    const { newSlotsData } = req.body; // Array of { date, slots: [{ label, capacity }] }
    
    if (!newSlotsData || !Array.isArray(newSlotsData) || newSlotsData.length === 0) {
        return res.status(400).json({ ok: false, error: 'Invalid or empty slot data provided.' });
    }

    await connectToSheet();
    const sheet = doc.sheetsByTitle['Slots'];

    if (!sheet) {
        return res.status(500).json({ ok: false, error: 'Google Sheet "Slots" not found.' });
    }

    // 1. Fetch existing dates to prevent duplicates (client-side prevents past/selected)
    const existingRows = await sheet.getRows();
    const existingDates = new Set(existingRows.map(row => row.date));
    const rowsToAdd = [];
    const datesAdded = new Set();
    const datesSkipped = [];

    // 2. Prepare rows for batch update
    for (const dateData of newSlotsData) {
        if (!dateData.date || existingDates.has(dateData.date)) {
            // Re-validate server-side against sheet data
            datesSkipped.push(dateData.date || 'Unknown Date');
            continue;
        }

        for (const slot of dateData.slots) {
            if (slot.capacity > 0) {
                rowsToAdd.push({
                    date: dateData.date,
                    slotLabel: slot.label,
                    capacity: slot.capacity,
                    taken: 0, // Always starts at 0
                    available: slot.capacity, // Always starts equal to capacity
                });
                datesAdded.add(dateData.date);
            }
        }
    }

    if (rowsToAdd.length === 0) {
         return res.status(400).json({ 
            ok: false, 
            error: 'No slots were added.', 
            details: datesSkipped.length > 0 ? [`${datesSkipped.length} dates already exist or were invalid.`] : ['No valid rows to insert.']
        });
    }

    // 3. Perform the batch append
    const addedRows = await sheet.addRows(rowsToAdd);
    
    return res.status(201).json({ 
        ok: true, 
        message: `Successfully added ${addedRows.length} slots across ${datesAdded.size} dates.`,
        details: datesSkipped.length > 0 ? [`Skipped ${datesSkipped.length} dates as they already exist.`] : []
    });
}

/**
 * Handles batch deletion of slots by row ID.
 * @param {object} req - request object
 * @param {object} res - response object
 */
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

    // Fetch all existing rows to find the ones matching the IDs.
    // IMPORTANT: Row numbers start at 2 for data (header is 1), but row objects
    // use a 'rowNumber' property corresponding to the physical sheet row.
    const allRows = await sheet.getRows();
    const rowsToDelete = allRows.filter(row => row.rowNumber && rowIds.includes(row.rowNumber));

    if (rowsToDelete.length === 0) {
        return res.status(404).json({ ok: false, error: 'No matching slots found for deletion.' });
    }

    // Batch deletion process (using Promise.all for concurrency)
    // NOTE: This can be slow for very large numbers of rows. 
    // Google Sheets API works by deleting row by row.
    const deletePromises = rowsToDelete.map(row => row.delete());
    
    await Promise.all(deletePromises);

    return res.status(200).json({ 
        ok: true, 
        message: `Successfully deleted ${rowsToDelete.length} slot${rowsToDelete.length !== 1 ? 's' : ''}.`
    });
}

/**
 * Main handler function for the Vercel Serverless Function.
 * @param {object} req - request object
 * @param {object} res - response object
 */
module.exports = async (req, res) => {
    try {
        await connectToSheet(); // Always ensure connection is ready
        
        const { method } = req;
        const { action } = req.body || {};

        // --- PUBLIC ROUTE: LOGIN ---
        if (method === 'POST' && action === 'login') {
            return await handleLogin(req, res);
        }

        // --- AUTHENTICATION GATE ---
        if (!isAuthenticated(req)) {
            // If authentication fails, clear any potentially bad cookie and send 401
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
                // List/Load Slots (GET /api/admin)
                return await handleLoadSlots(req, res);

            case 'POST':
                // Add Slots (POST /api/admin with action: "addSlots")
                if (action === 'addSlots') {
                    return await handleAddSlots(req, res);
                }
                // Fallthrough for other POST actions

            case 'DELETE':
                // Delete Slots (DELETE /api/admin with action: "deleteSlots")
                if (action === 'deleteSlots') {
                    return await handleDeleteSlots(req, res);
                }
                // Fallthrough for other DELETE actions

            default:
                // Handle unsupported methods or actions
                return res.status(405).json({ ok: false, error: `Method ${method} not allowed or action missing.` });
        }

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ ok: false, error: 'Internal Server Error', details: [error.message] });
    }
};
