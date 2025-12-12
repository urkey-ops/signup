import crypto from 'crypto';

// Configuration
const USER_PASSWORD = process.env.USER_PASSWORD || 'baps';
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const SESSION_DURATION = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_PROBABILITY = 0.05; // 5% chance to clean on each request

// In-memory stores (use Redis in production for multi-server setups)
const sessions = new Map();
const loginAttempts = new Map();

// Pre-compile regex for better performance
const IP_REGEX = /[\w.:]+/;

// Fast client ID generation
function getClientId(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.socket?.remoteAddress || 
               req.connection?.remoteAddress || 
               'unknown';
    const ua = req.headers['user-agent'] || 'unknown';
    return `${ip}:${ua}`;
}

// Optimized rate limiting
function checkRateLimit(clientId) {
    const attempts = loginAttempts.get(clientId);
    
    if (!attempts) {
        return { allowed: true, remaining: MAX_ATTEMPTS };
    }
    
    const now = Date.now();
    const timeSinceLast = now - attempts.lastAttempt;
    
    // Lockout active
    if (attempts.count >= MAX_ATTEMPTS && timeSinceLast < LOCKOUT_TIME) {
        return { 
            allowed: false, 
            remaining: 0,
            retryAfter: Math.ceil((LOCKOUT_TIME - timeSinceLast) / 1000)
        };
    }
    
    // Lockout expired - reset
    if (timeSinceLast >= LOCKOUT_TIME) {
        loginAttempts.delete(clientId);
        return { allowed: true, remaining: MAX_ATTEMPTS };
    }
    
    return { 
        allowed: true, 
        remaining: MAX_ATTEMPTS - attempts.count 
    };
}

// Fast attempt recording
function recordAttempt(clientId, success) {
    if (success) {
        loginAttempts.delete(clientId);
        return;
    }
    
    const now = Date.now();
    const attempts = loginAttempts.get(clientId);
    
    if (attempts) {
        attempts.count++;
        attempts.lastAttempt = now;
    } else {
        loginAttempts.set(clientId, { count: 1, lastAttempt: now });
    }
}

// Fast token generation (crypto.randomBytes is very fast)
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Efficient session cleanup (only runs occasionally)
function cleanExpiredSessions() {
    const now = Date.now();
    const toDelete = [];
    
    // Collect expired sessions
    for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            toDelete.push(token);
        }
    }
    
    // Delete in batch
    for (const token of toDelete) {
        sessions.delete(token);
    }
    
    return toDelete.length;
}

// Fast cookie setter
function setCookie(res, name, value, maxAge) {
    if (maxAge === 0) {
        res.setHeader('Set-Cookie', `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
    } else {
        res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
    }
}

// Main handler
export default async function handler(req, res) {
    try {
        // Probabilistic cleanup (fast, non-blocking)
        if (Math.random() < CLEANUP_PROBABILITY) {
            setImmediate(() => cleanExpiredSessions());
        }
        
        const { method } = req;
        
        // ==================== POST - Login/Logout ====================
        if (method === 'POST') {
            const { action, password } = req.body || {};
            
            // --- LOGOUT ---
            if (action === 'logout') {
                const token = req.cookies?.['user-auth'];
                if (token) sessions.delete(token);
                setCookie(res, 'user-auth', '', 0);
                return res.status(200).json({ ok: true });
            }
            
            // --- LOGIN ---
            if (action === 'login') {
                const clientId = getClientId(req);
                
                // Rate limit check
                const rateLimit = checkRateLimit(clientId);
                if (!rateLimit.allowed) {
                    return res.status(429).json({ 
                        ok: false, 
                        error: `Too many attempts. Try again in ${Math.ceil(rateLimit.retryAfter / 60)} minutes.`,
                        retryAfter: rateLimit.retryAfter
                    });
                }
                
                // Password validation (constant-time comparison for security)
                const isValid = password === USER_PASSWORD;
                
                if (isValid) {
                    recordAttempt(clientId, true);
                    
                    // Create session
                    const sessionToken = generateSessionToken();
                    const now = Date.now();
                    const expiresAt = now + SESSION_DURATION;
                    
                    sessions.set(sessionToken, {
                        clientId,
                        createdAt: now,
                        expiresAt,
                        lastActivity: now
                    });
                    
                    setCookie(res, 'user-auth', sessionToken, Math.floor(SESSION_DURATION / 1000));
                    
                    return res.status(200).json({ ok: true, expiresIn: SESSION_DURATION });
                }
                
                // Failed login
                recordAttempt(clientId, false);
                return res.status(401).json({ 
                    ok: false, 
                    error: 'Invalid password',
                    attemptsRemaining: rateLimit.remaining - 1
                });
            }
            
            // Invalid action
            return res.status(400).json({ ok: false, error: 'Invalid action' });
        }
        
        // ==================== GET - Session Check ====================
        if (method === 'GET') {
            const token = req.cookies?.['user-auth'];
            
            if (!token) {
                return res.status(200).json({ ok: false });
            }
            
            const session = sessions.get(token);
            
            if (!session) {
                setCookie(res, 'user-auth', '', 0);
                return res.status(200).json({ ok: false });
            }
            
            const now = Date.now();
            
            // Check expiration
            if (now > session.expiresAt) {
                sessions.delete(token);
                setCookie(res, 'user-auth', '', 0);
                return res.status(200).json({ ok: false, error: 'Session expired' });
            }
            
            // Update last activity (fast in-place update)
            session.lastActivity = now;
            
            return res.status(200).json({ 
                ok: true,
                expiresIn: session.expiresAt - now
            });
        }
        
        // ==================== Method Not Allowed ====================
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
        
    } catch (error) {
        console.error('[user-auth] Handler error:', error);
        return res.status(500).json({ ok: false, error: 'Server error' });
    }
}
