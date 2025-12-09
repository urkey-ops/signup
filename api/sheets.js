// ================================================================================================
// GOOGLE SHEETS CLIENT
// ================================================================================================

const { google } = require("googleapis");
const { ENV } = require('./config');

let sheetsInstance;

/**
 * Get or create Google Sheets client instance
 * @returns {Promise<Object>} Google Sheets API client
 */
async function getSheets() {
    console.log('🔐 getSheets() called');
    
    if (sheetsInstance) {
        console.log('✅ Returning cached sheets instance');
        return sheetsInstance;
    }

    console.log('🔐 Initializing new Google Sheets client...');
    
    if (!ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL || !ENV.GOOGLE_PRIVATE_KEY) {
        console.error('❌ Missing Google credentials');
        throw new Error("Missing Google service account env variables");
    }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: ENV.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        
        sheetsInstance = google.sheets({ version: "v4", auth });
        console.log('✅ Google Sheets client initialized');
        return sheetsInstance;
        
    } catch (error) {
        console.error('❌ FATAL: Failed to initialize Google Sheets');
        console.error('Error:', error.message);
        throw error;
    }
}

module.exports = { getSheets };
