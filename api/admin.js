const { google } = require("googleapis");

// Simple authentication - replace with your secret
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "your-secret-password";
// IMPORTANT: Confirm the GID of your Slots sheet. 0 is the default first sheet.
const SLOTS_GID = 0; 

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
                    spreadsheetId: process.env.SHEET_ID,
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

        // --- POST: Add new date with time slots ---
        if (req.method === "POST") {
            const { date, slots } = req.body;

            if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
                return res.status(400).json({ ok: false, error: "Missing date or slots" });
            }

            // Validate date format (MM/DD/YYYY)
            if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
                return res.status(400).json({ ok: false, error: "Invalid date format. Use MM/DD/YYYY" });
            }

            const rows = slots.map(slot => [
                date,
                slot.label || "",
                slot.capacity || 6, // Default to 6 if somehow missing
                0, // taken starts at 0
                "" // notes column
            ]);

            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: process.env.SHEET_ID,
                    range: "Slots!A2",
                    valueInputOption: "RAW",
                    requestBody: { values: rows },
                });

                return res.status(200).json({ ok: true, message: `Added ${slots.length} slots for ${date}` });
            } catch (err) {
                console.error("Error adding slots:", err);
                return res.status(500).json({ ok: false, error: "Failed to add slots" });
            }
        }

        // --- DELETE: Remove multiple slots (Q1) ---
        if (req.method === "DELETE") {
            const { rowIds } = req.body;

            if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
                return res.status(400).json({ ok: false, error: "Missing or invalid rowIds array" });
            }

            try {
                // CRITICAL: Sort row IDs in descending order to avoid re-indexing errors 
                // when deleting rows from top to bottom.
                const sortedRowIds = rowIds.sort((a, b) => b - a);

                const requests = sortedRowIds.map(rowId => ({
                    deleteDimension: {
                        range: {
                            sheetId: SLOTS_GID, 
                            dimension: "ROWS",
                            // API is zero-indexed, so row 2 is startIndex 1 to endIndex 2
                            startIndex: rowId - 1,
                            endIndex: rowId,
                        }
                    }
                }));

                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: process.env.SHEET_ID,
                    requestBody: { requests: requests },
                });

                return res.status(200).json({ ok: true, message: `Successfully deleted ${rowIds.length} slot(s).` });
            } catch (err) {
                console.error("Error deleting slot batch:", err);
                return res.status(500).json({ ok: false, error: "Failed to delete slots" });
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
