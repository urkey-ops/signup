import { google } from "googleapis";

const slots = [
  { slotId: "1", slotLabel: "10AM-12PM", capacity: 2, taken: 0 },
  { slotId: "2", slotLabel: "2PM-4PM", capacity: 2, taken: 1 },
  { slotId: "3", slotLabel: "4PM-6PM", capacity: 2, taken: 0 },
];

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      // Return available slots
      const formatted = slots.map(s => ({
        ...s,
        available: s.capacity - s.taken
      }));
      return res.status(200).json(formatted);
    }

    if (req.method === "POST") {
      const { name, email, phone, notes, slotId } = req.body;

      if (!name || !email || !slotId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const selectedSlot = slots.find(s => s.slotId === slotId);
      if (!selectedSlot) return res.status(400).json({ error: "Invalid slot" });
      if (selectedSlot.taken >= selectedSlot.capacity) {
        return res.status(400).json({ error: "Slot is full" });
      }

      // Update taken count locally (optional: fetch from sheet for live updates)
      selectedSlot.taken += 1;

      // Append to Google Sheet
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      const row = [
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
        selectedSlot.slotLabel,
        name,
        email,
        phone || "",
        notes || "",
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });

      return res.status(200).json({ ok: true, message: "Signup saved!" });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
