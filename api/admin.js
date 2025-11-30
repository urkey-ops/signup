const { google } = require("googleapis");
const crypto = require("crypto");

// ================================================================================================
// FIX #6: IMPROVED ADMIN AUTHENTICATION
// ================================================================================================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "your-secret-password";
const SLOTS_GID = parseInt(process.env.SLOTS_GID) || 0;
const SHEET_ID = process.env.SHEET_ID;

// Session management
const adminSessions = new Map(); // sessionId -> { timestamp, ip }
const SESSION_TIMEOUT = 28800000; // 8 hours

// Login rate limiting
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW = 900000; // 15 minutes

// Validate environment on startup
if (!SHEET_ID) {
    console.error('❌ CRITICAL: Missing SHEET_ID environment variable');
    throw new Error('Missing required environment variable: SHEET_ID');
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.error('❌ CRITICAL: Missing GOOGLE_SERVICE_ACCOUNT environment variable');
    throw new Error('Missing required environment variable: GOOGLE_SERVICE_ACCOUNT');
}

// ================================================================================================
// AUTHENTICATION HELPERS
// ================================================================================================

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function checkLoginRateLimit(ip) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || [];
    
    // Clean old attempts
    const recentAttempts = attempts.filter(time => now - time < LOGIN_ATTEMPT_WINDOW);
    
    if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
        return false;
    }
    
    recentAttempts.push(now);
    loginAttempts.set(ip, recentAttempts);
    
    // Cleanup old IPs
    for (const [key, times] of loginAttempts.entries()) {
        const valid = times.filter(t => now - t < LOGIN_ATTEMPT_WINDOW);
        if (valid.length === 0) {
            loginAttempts.delete(key);
        } else {
            loginAttempts.set(key, valid);
        }
    }
    
    return true;
}

function verifySession(token) {
    const session = adminSessions.get(token);
    if (!session) return false;
    
    // Check age (8 hours)
    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        adminSessions.delete(token);
        return false;
    }
    
    return true;
}

function auditLog(action, details = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        ip: details.ip,
        user: 'admin',
        details: details.data
    };
    
    console.log('[AUDIT]', JSON.stringify(logEntry));
}

// Sleep helper for rate limiting
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================================================================================
// VALIDATION HELPERS
// ================================================================================================

function isValidDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    return /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr);
}

function isPastDate(dateStr) {
    if (!isValidDateFormat(dateStr)) return true;
    
    const [month, day, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
}

// ================================================================================================
// MAIN HANDLER
// ================================================================================================

module.exports = async function handler(req, res) {
    const startTime = Date.now();
    
    try {
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || 
                         req.headers['x-real-ip'] || 
                         'unknown';

        // ========================================================================================
        // FIX #6: LOGIN ENDPOINT (Separate from auth check)
        // ========================================================================================
        
        if (req.method === "POST" && req.body.action === "login") {
            const { password } = req.body;
            
            // Rate limit check
            if (!checkLoginRateLimit(clientIP)) {
                auditLog('LOGIN_RATE_LIMITED', { ip: clientIP });
                return res.status(429).json({ 
                    ok: false, 
                    error: "Too many login attempts. Please try again in 15 minutes." 
                });
            }
            
            // Validate password
            if (password !== ADMIN_PASSWORD) {
                auditLog('LOGIN_FAILED', { ip: clientIP });
                
                // Add artificial delay to slow down brute force
                await sleep(1000);
                
                return res.status(401).json({ 
                    ok: false, 
                    error: "Invalid credentials" 
                });
            }
            
            // Generate session token
            const sessionToken = generateSessionToken();
            adminSessions.set(sessionToken, {
                timestamp: Date.now(),
                ip: clientIP
            });
            
            // Auto-expire after 8 hours
            setTimeout(() => {
                adminSessions.delete(sessionToken);
            }, SESSION_TIMEOUT);
            
            auditLog('LOGIN_SUCCESS', { ip: clientIP });
            
            return res.status(200).json({ 
                ok: true, 
                token: sessionToken,
                expiresIn: SESSION_TIMEOUT / 1000 // seconds
            });
        }

        // ========================================================================================
        // CHECK AUTHENTICATION FOR ALL OTHER REQUESTS
        // ========================================================================================
        
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? 
                      authHeader.substring(7) : null;
        
        if (!token || !verifySession(token)) {
            auditLog('UNAUTHORIZED_ACCESS', { ip: clientIP, method: req.method });
            return res.status(401).json({ 
                ok: false, 
                error: "Unauthorized - Session expired or invalid" 
            });
        }

        // Parse Google Service Account
        let credentials;
        try {
            credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        } catch (err) {
            console.error("Invalid GOOGLE_SERVICE_ACCOUNT JSON:", err);
            return res.status(500).json({ ok: false, error: "Invalid Google service account" });
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const sheets = google.sheets({ version: "v4", auth });

        // ========================================================================================
        // GET: Fetch all dates and slots
        // ========================================================================================
        
        if (req.method === "GET") {
            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: "Slots!A2:E",
                });

                const rows = response.data.values || [];
                const slots = rows.map((row, idx) => ({
                    id: idx + 2,
                    date: row[0] || "",
                    slotLabel: row[1] || "",
                    capacity: parseInt(row[2]) || 0,
                    taken: parseInt(row[3]) || 0,
                    available: parseInt(row[2] || 0) - parseInt(row[3] || 0),
                }));

                auditLog('SLOTS_FETCHED', { 
                    ip: clientIP, 
                    data: { count: slots.length } 
                });

                return res.status(200).json({ ok: true, slots });
            } catch (err) {
                console.error("Error reading slots:", err);
                return res.status(500).json({ ok: false, error: "Failed to fetch slots" });
            }
        }

        // ========================================================================================
        // FIX #3: POST with Comprehensive Batch Validation
        // ========================================================================================
        
        if (req.method === "POST") {
            const { newSlotsData } = req.body;

            if (!newSlotsData || !Array.isArray(newSlotsData) || newSlotsData.length === 0) {
                return res.status(400).json({ 
                    ok: false, 
                    error: "Missing or invalid newSlotsData array" 
                });
            }

            // FIX #3: COMPREHENSIVE VALIDATION BEFORE ANY WRITES
            const errors = [];
            const seenDates = new Set();
            let allNewRows = [];
            let totalSlotsAdded = 0;

            // First pass: Validate everything
            for (let idx = 0; idx < newSlotsData.length; idx++) {
                const item = newSlotsData[idx];
                const { date, slots } = item;
                
                // Check structure
                if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
                    errors.push(`Item ${idx}: Missing date or slots`);
                    continue;
                }
                
                // Check date format (MM/DD/YYYY)
                if (!isValidDateFormat(date)) {
                    errors.push(`Item ${idx}: Invalid date format "${date}" (expected MM/DD/YYYY)`);
                    continue;
                }
                
                // Check for past dates
                if (isPastDate(date)) {
                    errors.push(`Item ${idx}: Date ${date} is in the past`);
                    continue;
                }
                
                // Check for duplicates within batch
                if (seenDates.has(date)) {
                    errors.push(`Item ${idx}: Duplicate date ${date} in batch`);
                    continue;
                }
                seenDates.add(date);
                
                // Validate each time slot
                for (let sIdx = 0; sIdx < slots.length; sIdx++) {
                    const slot = slots[sIdx];
                    
                    if (!slot.label || typeof slot.label !== 'string') {
                        errors.push(`Item ${idx}, Slot ${sIdx}: Missing or invalid label`);
                        continue;
                    }
                    
                    const capacity = parseInt(slot.capacity);
                    if (isNaN(capacity) || capacity < 1 || capacity > 99) {
                        errors.push(`Item ${idx}, Slot ${sIdx}: Capacity must be between 1-99 (got ${slot.capacity})`);
                        continue;
                    }
                    
                    // Prepare row if validation passed
                    allNewRows.push([
                        date,                                           // A: Date
                        slot.label,                                     // B: Slot label
                        Math.max(1, Math.min(99, capacity)),            // C: Capacity (clamped)
                        0,                                              // D: Taken = 0
                        ""                                              // E: Notes
                    ]);
                    totalSlotsAdded++;
                }
            }

            // If ANY errors, reject entire batch
            if (errors.length > 0) {
                auditLog('BATCH_VALIDATION_FAILED', { 
                    ip: clientIP, 
                    data: { errorCount: errors.length, errors } 
                });
                
                return res.status(400).json({ 
                    ok: false, 
                    error: `Validation failed with ${errors.length} error(s)`,
                    details: errors
                });
            }

            // Additional check: Verify dates don't already exist in sheet
            try {
                const existingResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: "Slots!A2:A",
                });

                const existingDates = new Set(
                    (existingResponse.data.values || []).map(row => row[0])
                );

                const duplicateDates = [...seenDates].filter(d => existingDates.has(d));
                
                if (duplicateDates.length > 0) {
                    auditLog('DUPLICATE_DATES_DETECTED', { 
                        ip: clientIP, 
                        data: { duplicates: duplicateDates } 
                    });
                    
                    return res.status(409).json({
                        ok: false,
                        error: `The following dates already have slots: ${duplicateDates.join(', ')}`
                    });
                }

            } catch (err) {
                console.error("Error checking existing dates:", err);
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to validate dates against existing data" 
                });
            }

            if (allNewRows.length === 0) {
                return res.status(400).json({ 
                    ok: false, 
                    error: "No valid rows to insert after validation" 
                });
            }

            // All validations passed - write to sheet
            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SHEET_ID,
                    range: "Slots!A2",
                    valueInputOption: "RAW",
                    requestBody: { values: allNewRows },
                });

                auditLog('SLOTS_ADDED', { 
                    ip: clientIP, 
                    data: { 
                        dates: newSlotsData.length, 
                        totalSlots: totalSlotsAdded 
                    } 
                });

                return res.status(200).json({ 
                    ok: true, 
                    message: `Successfully added ${totalSlotsAdded} slots across ${newSlotsData.length} date(s).` 
                });
            } catch (err) {
                console.error("Error adding slot batch:", err);
                auditLog('SLOTS_ADD_FAILED', { 
                    ip: clientIP, 
                    data: { error: err.message } 
                });
                
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to add slot batch to spreadsheet" 
                });
            }
        }

        // ========================================================================================
        // DELETE: Remove multiple slots (WITH BOOKING CHECK)
        // ========================================================================================
        
        if (req.method === "DELETE") {
            const { rowIds } = req.body;

            if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
                return res.status(400).json({ 
                    ok: false, 
                    error: "Missing or invalid rowIds array" 
                });
            }

            const validRowIds = rowIds.filter(id => typeof id === 'number' && id >= 2);

            if (validRowIds.length === 0) {
                return res.status(400).json({ 
                    ok: false, 
                    error: "No valid row IDs provided (must be numbers >= 2)" 
                });
            }

            try {
                // SAFETY CHECK: Check for active bookings before deletion
                const signupsResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: 'Signups!A2:I'
                });

                const signupRows = signupsResponse.data.values || [];
                
                // Find active bookings for these slots
                const affectedBookings = signupRows.filter(row => {
                    const slotRowId = parseInt(row[7]); // Column H (Slot Row ID)
                    const status = row[8] || 'ACTIVE';  // Column I (Status)
                    return validRowIds.includes(slotRowId) && status === 'ACTIVE';
                });

                if (affectedBookings.length > 0) {
                    auditLog('DELETE_BLOCKED_BOOKINGS_EXIST', { 
                        ip: clientIP, 
                        data: { 
                            requestedDeletes: validRowIds.length,
                            affectedBookings: affectedBookings.length 
                        } 
                    });
                    
                    return res.status(400).json({
                        ok: false,
                        error: `Cannot delete: ${affectedBookings.length} active booking(s) exist. Cancel bookings first or contact users.`,
                        affectedCount: affectedBookings.length
                    });
                }

                // Sort row IDs in descending order to avoid re-indexing errors
                const sortedRowIds = [...new Set(validRowIds)].sort((a, b) => b - a);

                const requests = sortedRowIds.map(rowId => ({
                    deleteDimension: {
                        range: {
                            sheetId: SLOTS_GID, 
                            dimension: "ROWS",
                            startIndex: rowId - 1,
                            endIndex: rowId,
                        }
                    }
                }));

                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SHEET_ID,
                    requestBody: { requests: requests },
                });

                auditLog('SLOTS_DELETED', { 
                    ip: clientIP, 
                    data: { count: sortedRowIds.length } 
                });

                return res.status(200).json({ 
                    ok: true, 
                    message: `Successfully deleted ${sortedRowIds.length} slot(s).` 
                });
            } catch (err) {
                console.error("Error deleting slot batch:", err);
                auditLog('SLOTS_DELETE_FAILED', { 
                    ip: clientIP, 
                    data: { error: err.message } 
                });
                
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to delete slots", 
                    details: err.message 
                });
            }
        }

        // Method not allowed
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        return res.status(405).json({ 
            ok: false, 
            error: `Method ${req.method} Not Allowed` 
        });

    } catch (err) {
        console.error("Admin API Error:", err);
        auditLog('SERVER_ERROR', { 
            ip: req.headers['x-forwarded-for'] || 'unknown', 
            data: { error: err.message } 
        });
        
        return res.status(500).json({ 
            ok: false, 
            error: "Server error", 
            details: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    }
};
