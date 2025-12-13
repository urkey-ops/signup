// ================================================================================================
// MAIN API HANDLER (Entry Point) - State-of-the-Art Version
// ================================================================================================
const { checkRateLimit } = require('./config');
const { handleGet, handlePost, handlePatch } = require('./handlers');

/**
 * Main request handler for the signup API
 * Handles GET (fetch slots/lookup), POST (create booking), PATCH (cancel booking)
 * 
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>}
 */
module.exports = async function handler(req, res) {
    const requestId = crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15);
    const startTime = performance.now();
    
    console.log(`🚀 REQUEST [${requestId}] ${req.method} ${req.url}`);
    
    // Security headers (OWASP best practices)
    const securityHeaders = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'none'",
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
    
    Object.entries(securityHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
    
    // Handle CORS preflight with proper response
    if (req.method === 'OPTIONS') {
        console.log(`✅ OPTIONS [${requestId}] handled`);
        res.status(204).end();
        return;
    }
    
    // Parse query parameters using modern URL API
    req.query = {};
    if (req.url?.includes('?')) {
        try {
            const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
            req.query = Object.fromEntries(url.searchParams);
        } catch (err) {
            console.warn(`⚠️ [${requestId}] URL parsing failed:`, err.message);
        }
    }
    
    try {
        // Extract client IP with better fallback chain
        const clientIP = (
            req.headers['cf-connecting-ip'] || // Cloudflare
            req.headers['x-real-ip'] || // Nginx
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // Standard proxy
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            'unknown'
        ).replace(/^::ffff:/, ''); // Remove IPv6 prefix
        
        console.log(`👤 [${requestId}] Client: ${clientIP}`);
        
        // Rate limiting check
        if (!checkRateLimit(clientIP)) {
            console.warn(`🚫 [${requestId}] Rate limit exceeded for ${clientIP}`);
            res.status(429).json({ 
                ok: false, 
                error: "Too many requests. Please try again later.",
                retryAfter: 60
            });
            return;
        }
        
        // Route to appropriate handler with method validation
        const allowedMethods = ['GET', 'POST', 'PATCH'];
        
        if (!allowedMethods.includes(req.method)) {
            console.warn(`🚫 [${requestId}] Method not allowed: ${req.method}`);
            res.status(405)
                .setHeader('Allow', allowedMethods.join(', '))
                .json({ 
                    ok: false, 
                    error: "Method not allowed.",
                    allowedMethods
                });
            return;
        }
        
        // Execute handler
        let result;
        switch (req.method) {
            case 'GET':
                result = await handleGet(req, res, requestId);
                break;
            case 'POST':
                result = await handlePost(req, res, requestId);
                break;
            case 'PATCH':
                result = await handlePatch(req, res, requestId);
                break;
        }
        
        // Log request completion
        const duration = (performance.now() - startTime).toFixed(2);
        console.log(`✅ [${requestId}] Completed in ${duration}ms`);
        
        return result;
        
    } catch (err) {
        const duration = (performance.now() - startTime).toFixed(2);
        console.error(`❌ [${requestId}] Unhandled error after ${duration}ms:`, err.message);
        console.error(`Stack:`, err.stack);
        
        // Avoid exposing internal error details in production
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        res.status(500).json({ 
            ok: false, 
            error: "Internal server error. Please try again later.",
            ...(isDevelopment && { 
                debug: {
                    message: err.message,
                    stack: err.stack
                }
            })
        });
    }
};
