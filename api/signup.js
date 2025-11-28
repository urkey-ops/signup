const { google } = require("googleapis");

module.exports = async function handler(req, res) {
    try {
        // --- Authorization and Setup ---
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

        // --- GET: return available slots or user bookings ---
        if (req.method === "GET") {

            // --- Handle User Booking Lookup (if email is provided) ---
            if (req.query.email) {
                const lookupEmail = req.query.email.toLowerCase();

                try {
                    // Read Signups sheet
                    const signupsResponse = await sheets.spreadsheets.values.get({
                        spreadsheetId: process.env.SHEET_ID,
                        range: "Signups!A2:G", // Assuming signups go to column G (Notes)
                    });
                    const signupRows = signupsResponse.data.values || [];

                    // Read Slots sheet (to find the slot's row ID for later cancellation)
                    const slotsResponse = await sheets.spreadsheets.values.get({
                        spreadsheetId: process.env.SHEET_ID,
                        range: "Slots!A2:E",
                    });
                    const slotsMap = new Map();
                    slotsResponse.data.values.forEach((row, idx) => {
                        // Create a unique key using Date and Slot Label
                        const key = `${row[0]}_${row[1]}`;
                        slotsMap.set(key, idx + 2); // Store the actual sheet row ID
                    });

                    const userBookings = signupRows.map((row, idx) => ({
                        id: idx + 2, // Signup sheet row ID (for deletion)
                        timestamp: row[0],
                        date: row[1],
                        slotLabel: row[2],
                        name: row[3],
                        email: row[4],
                        phone: row[5],
                        notes: row[6],

                        // Correlate with the Slot Row ID for cancellation
                        slotRowId: slotsMap.get(`${row[1]}_${row[2]}`) || null
                    }))
                    .filter(booking => booking.email.toLowerCase() === lookupEmail);

                    return res.status(200).json({ ok: true, bookings: userBookings });

                } catch (err) {
                    console.error("Error fetching user bookings:", err);
                    return res.status(500).json({ ok: false, error: "Failed to fetch user bookings" });
                }
            }

            // --- Existing Logic: Fetch All Available Slots ---
            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: process.env.SHEET_ID,
                    range: "Slots!A2:E",
                });

                const rows = response.data.values || [];
                const slots = rows.map((row, idx) => ({
                    id: idx + 2, // Row number
                    date: row[0] || "",
                    slotLabel: row[1] || "",
                    capacity: parseInt(row[2]) || 0,
                    taken: parseInt(row[3]) || 0,
                    available: parseInt(row[2] || 0) - parseInt(row[3] || 0),
                }));

                // Group by date
                const grouped = {};
                slots.forEach(slot => {
                    if (!grouped[slot.date]) {
                        grouped[slot.date] = [];
                    }
                    grouped[slot.date].push(slot);
                });

                return res.status(200).json({ ok: true, dates: grouped });
            } catch (err) {
                console.error("Error reading slots:", err);
                return res.status(500).json({ ok: false, error: "Failed to fetch slots" });
            }
        }

        // --- POST: save signup to Google Sheet (Multi-Slot Logic) ---
        if (req.method === "POST") {
            const { name, email, phone, notes, slotIds } = req.body;

            if (!name || !email || !slotIds || !Array.isArray(slotIds) || slotIds.length === 0) {
                return res.status(400).json({ ok: false, error: "Missing required fields or selected slots" });
            }

            // --- 1. Fetch All Slots for Validation and Data Collection ---
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: process.env.SHEET_ID,
                range: "Slots!A2:E",
            });
            const allRows = response.data.values || [];

            // Map slotId (row number) to slot data for easy lookup
            const slotDataMap = new Map();
            allRows.forEach((row, idx) => {
                const id = idx + 2;
                slotDataMap.set(id.toString(), {
                    date: row[0],
                    label: row[1],
                    capacity: parseInt(row[2]) || 0,
                    taken: parseInt(row[3]) || 0
                });
            });

            const updates = [];
            const signupRows = [];
            const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

            // --- 2. Validation and Prepare Updates/Signups ---
            for (const slotId of slotIds) {
                const slot = slotDataMap.get(slotId.toString());

                if (!slot) {
                    return res.status(400).json({ ok: false, error: `Slot ID ${slotId} not found.` });
                }

                if (slot.taken >= slot.capacity) {
                    // If ANY slot is full, reject the entire request
                    return res.status(400).json({ ok: false, error: `Slot ${slot.label} on ${slot.date} is full.` });
                }

                // Prepare update for the Slots sheet (increment 'Taken' count)
                const newTaken = slot.taken + 1;
                updates.push({
                    range: `Slots!D${slotId}`,
                    values: [[newTaken]]
                });

                // Prepare row for the Signups sheet
                signupRows.push([
                    now,
                    slot.date,
                    slot.label,
                    name,
                    email,
                    phone || "",
                    notes || "",
                ]);
            }

            // --- 3. Execute Batch Updates (Atomicity) ---
            try {
                // A. Update ALL 'Taken' counts in a single batch request
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: process.env.SHEET_ID,
                    requestBody: {
                        valueInputOption: "RAW",
                        data: updates
                    }
                });

                // B. Append ALL signup rows in a single batch append request
                await sheets.spreadsheets.values.append({
                    spreadsheetId: process.env.SHEET_ID,
                    range: "Signups!A1",
                    valueInputOption: "RAW",
                    requestBody: { values: signupRows },
                });

                const message = `Signed up for ${slotIds.length} slot${slotIds.length === 1 ? '' : 's'}!`;
                return res.status(200).json({ ok: true, message: message });
            } catch (err) {
                console.error("Error writing batch updates/signups:", err);
                return res.status(500).json({ ok: false, error: "Failed to save signups due to sheet error", details: err.message });
            }
        }

        // ----------------------------------------------------
        // --- NEW: PATCH handler for Cancellation ---
        // ----------------------------------------------------
        if (req.method === "PATCH") {
            const { signupRowId, slotRowId } = req.body;

            if (!signupRowId || !slotRowId) {
                return res.status(400).json({ ok: false, error: "Missing signupRowId or slotRowId" });
            }

            try {
                // --- 1. Decrement 'Taken' count in Slots sheet (Column D) ---
                const slotRange = `Slots!D${slotRowId}`;
                
                // Fetch the current value
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: process.env.SHEET_ID,
                    range: slotRange,
                });
                
                // Calculate new taken count (ensure it doesn't go below zero)
                const currentTaken = parseInt(response.data.values?.[0]?.[0] || 0);
                const newTaken = Math.max(0, currentTaken - 1);

                // Prepare API call to update the 'Taken' count
                const updateTaken = sheets.spreadsheets.values.update({
                    spreadsheetId: process.env.SHEET_ID,
                    range: slotRange,
                    valueInputOption: "RAW",
                    requestBody: { values: [[newTaken]] },
                });

                // --- 2. Delete the signup row from Signups sheet ---
                const deleteSignupRow = sheets.spreadsheets.batchUpdate({
                    spreadsheetId: process.env.SHEET_ID,
                    requestBody: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    // You MUST replace 1915116914 with the actual GID of your Signups sheet!
                                    sheetId: 1915116914,
                                    dimension: "ROWS",
                                    startIndex: signupRowId - 1,
                                    endIndex: signupRowId,
                                }
                            }
                        }]
                    }
                });

                // Run both updates concurrently to act as a single unit
                await Promise.all([updateTaken, deleteSignupRow]);

                return res.status(200).json({ ok: true, message: "Slot successfully cancelled! Your slots list will now refresh." });
            } catch (err) {
                console.error("Error cancelling slot:", err);
                return res.status(500).json({ ok: false, error: "Failed to cancel slot", details: err.message });
            }
        }


        // Method not allowed
        res.setHeader("Allow", ["GET", "POST", "PATCH"]);
        return res.status(405).json({ ok: false, error: `Method ${req.method} Not Allowed` });

    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ ok: false, error: "Server error", details: err.message });
    }
};
