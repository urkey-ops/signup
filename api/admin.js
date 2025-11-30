const { google } = require("googleapis");

// Simple authentication - replace with your secret
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "your-secret-password";
const SLOTS_GID = parseInt(process.env.SLOTS_GID) || 0;
const SHEET_ID = process.env.SHEET_ID;

// Validate environment on startup
if (!SHEET_ID) {
    console.error('❌ CRITICAL: Missing SHEET_ID environment variable');
    throw new Error('Missing required environment variable: SHEET_ID');
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.error('❌ CRITICAL: Missing GOOGLE_SERVICE_ACCOUNT environment variable');
    throw new Error('Missing required environment variable: GOOGLE_SERVICE_ACCOUNT');
}

module.exports = async function handler(req, res) {
    try {
        // Check admin password
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
            return res.status(401).json({ ok: false, error: "Unauthorized" });
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

        // --- GET: Fetch all dates and slots ---
        if (req.method === "GET") {
            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: SHEET_ID,
                    range: "Slots!A2:E",
                });

                const rows = response.data.values || [];
                const slots = rows.map((row, idx) => ({
                    id: idx + 2, // Row number in sheet
                    date: row[0] || "",
                    slotLabel: row[1] || "",
                    capacity: parseInt(row[2]) || 0,
                    taken: parseInt(row[3]) || 0,
                    available: parseInt(row[2] || 0) - parseInt(row[3] || 0),
                }));

                return res.status(200).json({ ok: true, slots });
            } catch (err) {
                console.error("Error reading slots:", err);
                return res.status(500).json({ ok: false, error: "Failed to fetch slots" });
            }
        }

        // --- POST: Add new date with time slots (BATCH IMPLEMENTATION) ---
        if (req.method === "POST") {
            // New structure: expecting an array of { date, slots } objects
            const { newSlotsData } = req.body;

            if (!newSlotsData || !Array.isArray(newSlotsData) || newSlotsData.length === 0) {
                return res.status(400).json({ ok: false, error: "Missing or invalid newSlotsData array" });
            }

            // --- Consolidated Batch Validation and Data Preparation ---
            let allNewRows = [];
            let totalSlotsAdded = 0;

            for (const item of newSlotsData) {
                const date = item.date;
                const slots = item.slots;

                // Basic structure validation for each item
                if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
                    console.error("Batch item failed validation:", item);
                    // Return a generic error to prevent partial writes, better to fail the batch
                    return res.status(400).json({ ok: false, error: "Invalid item found in batch payload (missing date or slots)" });
                }

                // NOTE: Date format/past date validation and duplicate checks are omitted here
                // to allow batch processing, and are expected to be enforced by the front-end logic.
                
                // Prepare rows for this specific date/slot combination
                const dateRows = slots.map(slot => [
                    date,                                                         // A: Date
                    slot.label || "",                                             // B: Slot label
                    Math.max(1, Math.min(99, parseInt(slot.capacity) || 6)),      // C: Capacity (1-99)
                    0,                                                            // D: Taken = 0 (NEW SLOTS START EMPTY)
                    ""                                                            // E: Notes
                ]);

                allNewRows.push(...dateRows);
                totalSlotsAdded += dateRows.length;
            }

            if (allNewRows.length === 0) {
                 return res.status(400).json({ ok: false, error: "Prepared zero rows for submission" });
            }

            try {
                // Execute a single append request for the entire batch
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SHEET_ID,
                    range: "Slots!A2",
                    valueInputOption: "RAW",
                    requestBody: { values: allNewRows },
                });

                return res.status(200).json({ 
                    ok: true, 
                    message: `Successfully added ${totalSlotsAdded} slots across ${newSlotsData.length} date(s).` 
                });
            } catch (err) {
                console.error("Error adding slot batch:", err);
                return res.status(500).json({ ok: false, error: "Failed to add slot batch" });
            }
        }

        // --- DELETE: Remove multiple slots (WITH BOOKING CHECK) ---
        if (req.method === "DELETE") {
            const { rowIds } = req.body;

            if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
                return res.status(400).json({ ok: false, error: "Missing or invalid rowIds array" });
            }

            const validRowIds = rowIds.filter(id => typeof id === 'number' && id >= 2);

            if (validRowIds.length === 0) {
                return res.status(400).json({ ok: false, error: "No valid row IDs provided" });
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
                    console.warn(`Cannot delete slots: ${affectedBookings.length} active bookings exist`);
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

                return res.status(200).json({ 
                    ok: true, 
                    message: `Successfully deleted ${sortedRowIds.length} slot(s).` 
                });
            } catch (err) {
                console.error("Error deleting slot batch:", err);
                return res.status(500).json({ 
                    ok: false, 
                    error: "Failed to delete slots", 
                    details: err.message 
                });
            }
        }

        // Method not allowed
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        return res.status(405).json({ ok: false, error: `Method ${req.method} Not Allowed` });

    } catch (err) {
        console.error("Admin API Error:", err);
        return res.status(500).json({ ok: false, error: "Server error", details: err.message });
    }
};
