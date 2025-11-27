import { google } from "googleapis";

// In-memory slots for demo
const slots = [
{ slotId: "1", slotLabel: "10AM-12PM", capacity: 2, taken: 0 },
{ slotId: "2", slotLabel: "2PM-4PM", capacity: 2, taken: 1 },
{ slotId: "3", slotLabel: "4PM-6PM", capacity: 2, taken: 0 },
];

export default async function handler(req, res) {
try {
if (req.method === "GET") {
const formatted = slots.map((slot) => ({
...slot,
available: slot.capacity - slot.taken,
}));
return res.status(200).json(formatted);
}

```
if (req.method === "POST") {
  const { name, email, phone, notes, slotId } = req.body;

  // Validate required fields
  if (!name || !email || !slotId) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing required fields" });
  }

  const selectedSlot = slots.find((s) => s.slotId === slotId);
  if (!selectedSlot)
    return res.status(400).json({ ok: false, error: "Invalid slot" });

  if (selectedSlot.taken >= selectedSlot.capacity)
    return res.status(400).json({ ok: false, error: "Slot is full" });

  selectedSlot.taken += 1; // update locally for demo

  // Parse Google Service Account safely
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (err) {
    console.error("Invalid GOOGLE_SERVICE_ACCOUNT JSON:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Invalid Google service account" });
  }

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

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error("Error writing to Google Sheet:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to save signup", details: err.message });
  }

  return res.status(200).json({ ok: true, message: "Signup saved!" });
}

// Method not allowed
res.setHeader("Allow", ["GET", "POST"]);
return res
  .status(405)
  .json({ ok: false, error: `Method ${req.method} Not Allowed` });
```

} catch (err) {
console.error("API Error:", err);
return res.status(500).json({ ok: false, error: "Server error", details: err.message });
}
}
