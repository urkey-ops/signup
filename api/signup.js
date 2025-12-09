// ================================================================================================
// MAIN API HANDLER (Entry Point)
// ================================================================================================

const { checkRateLimit } = require('./config');
const { handleGet, handlePost, handlePatch } = require('./handlers');

/**
 * Main request handler for the signup API
 * Handles GET (fetch slots/lookup), POST (create booking), PATCH (cancel booking)
 */
module.exports = async function handler(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🚀 REQUEST [${requestId}] ${req.method} ${req.url}`);

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        console.log('✅ OPTIONS handled');
        return res.status(200).end();
    }

    try {
        // Get client IP for rate limiting
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
            || req.socket.remoteAddress 
            || 'unknown';
        console.log(`👤 Client: ${clientIP}`);
        
        // Rate limiting check
        if (!checkRateLimit(clientIP)) {
            return res.status(429).json({ 
                ok: false, 
                error: "Too many requests. Please wait." 
            });
        }

        // Route to appropriate handler
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res);
            
            case 'POST':
                return await handlePost(req, res);
            
            case 'PATCH':
                return await handlePatch(req, res);
            
            default:
                return res.status(405).json({ 
                    ok: false, 
                    error: "Method not allowed." 
                });
        }
        
    } catch (err) {
        console.error('❌ Unhandled error:', err.message);
        console.error('Stack:', err.stack);
        return res.status(500).json({ 
            ok: false, 
            error: "Internal server error." 
        });
    }
};
