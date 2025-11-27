import { google } from "googleapis";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        // Load Google Service Account credentials
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

        // Authenticate
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const sheets = google.sheets({ version: "v4", auth });

        const { name, email, phone, selections } = req.body;

        if (!name || !email || !phone || !selections) {
            return res.status(400).json({ error: "Missing fields" });
        }

        // Prepare row data
        const row = [
            new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
            name,
            email,
            phone,
            selections.join(", ")
        ];

        // Append to the sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SHEET_ID,
            range: "Sheet1!A1",
            valueInputOption: "RAW",
            requestBody: {
                values: [row],
            },
        });

        return res.status(200).json({ message: "Signup saved!" });

    } catch (err) {
        console.error("API Error:", err);
        return res.status(500).json({ error: "Failed to save data" });
    }
}
