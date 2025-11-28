const { google } = require("googleapis");

module.exports = async function handler(req, res) {
  try {
    // GET: return available slots grouped by date
    if (req.method === "GET") {
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

    // POST: save signup to Google Sheet
    if (req.method === "POST") {
      const { name, email, phone, notes, slotId } = req.body;

      if (!name || !email || !slotId) {
        return res.status(400).json({ ok: false, error: "Missing required fields" });
      }

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

      // Read the specific slot
      try {
        const slotRange = `Slots!A${slotId}:E${slotId}`;
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.SHEET_ID,
          range: slotRange,
        });

        const row = response.data.values?.[0];
        if (!row) {
          return res.status(400).json({ ok: false, error: "Slot not found" });
        }

        const capacity = parseInt(row[2]) || 0;
        const taken = parseInt(row[3]) || 0;

        if (taken >= capacity) {
          return res.status(400).json({ ok: false, error: "Slot is full" });
        }

        // Update taken count
        const newTaken = taken + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range: `Slots!D${slotId}`,
          valueInputOption: "RAW",
          requestBody: { values: [[newTaken]] },
        });

        // Save signup to Signups sheet
        const signupRow = [
          new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
          row[0], // date
          row[1], // slot label
          name,
          email,
          phone || "",
          notes || "",
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SHEET_ID,
          range: "Signups!A1",
          valueInputOption: "RAW",
          requestBody: { values: [signupRow] },
        });

        return res.status(200).json({ ok: true, message: "Signup saved!" });
      } catch (err) {
        console.error("Error writing to Google Sheet:", err);
        return res.status(500).json({ ok: false, error: "Failed to save signup", details: err.message });
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
