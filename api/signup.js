const { google } = require("googleapis");

module.exports = async function handler(req, res) {
  try {
    // --- Authorization and Setup (Same as before) ---
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

    // GET: return available slots grouped by date (No Change Needed)
    if (req.method === "GET") {
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

    // POST: save signup to Google Sheet (Refactored for Multiple Slots)
    if (req.method === "POST") {
        // CHANGED: Expect slotIds (array) instead of slotId (single number)
      const { name, email, phone, notes, slotIds } = req.body;

        if (!name || !email || !slotIds || !Array.isArray(slotIds) || slotIds.length === 0) {
            return res.status(400).json({ ok: false, error: "Missing required fields or selected slots" });
        }
        
        // --- 1. Fetch All Slots for Validation and Data Collection ---
        // We fetch all slots to validate capacity for every selected slot in one call.
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
            // NOTE: If the batch update fails, the sheet might be in an inconsistent state.
            // For production, you might implement rollbacks here.
            return res.status(500).json({ ok: false, error: "Failed to save signups due to sheet error", details: err.message });
        }
    }

    // Method not allowed
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ ok: false, error: `Method ${req.method} Not Allowed` });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ ok: false, error: "Server error", details: err.message });
  }
};
