// ================================================================================================
// GOOGLE SHEETS CLIENT - State-of-the-Art Version
// ================================================================================================
const { google } = require("googleapis");
const { ENV } = require('./config');

let sheetsInstance = null;
let authClient = null;
let lastInitTime = 0;
const REINIT_INTERVAL = 3600000; // Reinitialize every hour for token refresh

/**
 * Get or create Google Sheets client instance with improved caching and error handling
 * @returns {Promise<Object>} Google Sheets API client
 * @throws {Error} If credentials are missing or initialization fails
 */
async function getSheets() {
    console.log('🔐 getSheets() called');
    
    const now = Date.now();
    const shouldReinit = now - lastInitTime > REINIT_INTERVAL;
    
    // Return cached instance if valid and not expired
    if (sheetsInstance && !shouldReinit) {
        console.log('✅ Returning cached sheets instance');
        return sheetsInstance;
    }
    
    if (shouldReinit && sheetsInstance) {
        console.log('🔄 Token refresh - reinitializing Google Sheets client');
    } else {
        console.log('🔐 Initializing new Google Sheets client...');
    }
    
    // Validate required environment variables
    if (!ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL || !ENV.GOOGLE_PRIVATE_KEY) {
        const missingVars = [];
        if (!ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL) missingVars.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
        if (!ENV.GOOGLE_PRIVATE_KEY) missingVars.push('GOOGLE_PRIVATE_KEY');
        
        console.error('❌ Missing Google credentials:', missingVars.join(', '));
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    try {
        // Properly format the private key (handle both escaped and unescaped newlines)
        const privateKey = ENV.GOOGLE_PRIVATE_KEY
            .replace(/\\n/g, '\n')
            .trim();
        
        // Validate private key format
        if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
            throw new Error('Invalid private key format - missing BEGIN/END markers');
        }
        
        // Create auth client with proper configuration
        authClient = new google.auth.GoogleAuth({
            credentials: {
                client_email: ENV.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: privateKey,
            },
            scopes: [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive.readonly" // For metadata access
            ],
            projectId: ENV.GOOGLE_PROJECT_ID || undefined
        });
        
        // Test authentication
        const client = await authClient.getClient();
        console.log('✅ Auth client created successfully');
        
        // Create sheets instance
        sheetsInstance = google.sheets({ 
            version: "v4", 
            auth: authClient,
            // Add retry configuration
            retry: true,
            retryConfig: {
                retry: 3,
                retryDelay: 1000,
                statusCodesToRetry: [[500, 599], [429]],
                onRetryAttempt: (err) => {
                    console.warn('⚠️ Retrying Google Sheets API call:', err.message);
                }
            }
        });
        
        lastInitTime = now;
        console.log('✅ Google Sheets client initialized successfully');
        
        return sheetsInstance;
        
    } catch (error) {
        console.error('❌ FATAL: Failed to initialize Google Sheets client');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        
        // Provide more helpful error messages
        if (error.message.includes('private_key')) {
            console.error('💡 Hint: Check that GOOGLE_PRIVATE_KEY is properly formatted with newlines');
        } else if (error.message.includes('client_email')) {
            console.error('💡 Hint: Verify GOOGLE_SERVICE_ACCOUNT_EMAIL is correct');
        }
        
        // Clear cached instance on error
        sheetsInstance = null;
        authClient = null;
        lastInitTime = 0;
        
        throw error;
    }
}

/**
 * Validate spreadsheet access
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @returns {Promise<boolean>} True if accessible
 */
async function validateSpreadsheetAccess(spreadsheetId) {
    try {
        const sheets = await getSheets();
        await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'spreadsheetId,properties.title'
        });
        return true;
    } catch (error) {
        console.error('❌ Spreadsheet access validation failed:', error.message);
        return false;
    }
}

/**
 * Batch read multiple ranges efficiently
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {string[]} ranges - Array of A1 notation ranges
 * @returns {Promise<Array>} Array of range data
 */
async function batchGetValues(spreadsheetId, ranges) {
    const sheets = await getSheets();
    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
    });
    return response.data.valueRanges;
}

/**
 * Clear cached instance (useful for testing or forced refresh)
 */
function clearCache() {
    console.log('🗑️ Clearing sheets client cache');
    sheetsInstance = null;
    authClient = null;
    lastInitTime = 0;
}

module.exports = { 
    getSheets, 
    validateSpreadsheetAccess,
    batchGetValues,
    clearCache 
};
