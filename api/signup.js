const { google } = require("googleapis");

// Example slots data (in-memory)
const slots = [
  { slotId: "1", slotLabel: "10AM-12PM", capacity: 2, taken: 0 },
  { slotId: "2", slotLabel: "2PM-4PM", capacity: 2, taken: 1 },
  { slotId: "3", slotLabel: "4PM-6PM", capacity: 2, taken: 0 },
];

module.exports = async (req, res) => {
  try {
    // GET request: return available slots
    if (req.method === "GET") {
      const formatted = slots.map(slot => ({
        ...slot,
        available: slot.capacity - slot.taken,
      }));
      return res.status(200).json(formatted);
    }

    // POST request: save signup to Google Sheet
    if (req.method === "POST") {
      const { name, email, phone, notes, slotId } = req.body;

      // Validate required fields
      if (!name || !email || !slotId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const selectedSlot = slots.find(s => s.slotId === slotId);
      if (!selectedSlot) return res.status(400).json({ error: "Invalid slot" });
      if (selectedSlot.taken >= selectedSlot.capacity) {
        return res.status(400).json({ error: "Slot is full" });
      }

      // Update slot locally (optional, for demo)
      selectedSlot.taken += 1;

      // Connect to Google Sheets
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      // Prepare row to append
      const row = [
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
        selectedSlot.slotLabel,
        name,
        email,
        phone || "",
        notes || "",
      ];

      // Append to sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });

      return res.status(200).json({ ok: true, message: "Signup saved!" });
    }

    // Method not allowed
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
