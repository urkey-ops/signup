import crypto from 'crypto';

// Your actual password - set in environment variable
const USER_PASSWORD = process.env.USER_PASSWORD || 'baps';

// Simple in-memory session store (use Redis/database in production)
const sessions = new Map();
const loginAttempts = new Map();

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const SESSION_DURATION = 2 * 60 * 60 * 1000; // 2 hours

function getClientId(req) {
    return `${req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'}:${req.headers['user-agent'] || 'unknown'}`;
}

function checkRateLimit(clientId) {
    const attempts = loginAttempts.get(clientId);
    if (!attempts) return { allowed: true, remaining: MAX_ATTEMPTS };
    
    if (attempts.count >= MAX_ATTEMPTS) {
        const timeSinceLast = Date.now() - attempts.lastAttempt;
        if (timeSinceLast < LOCKOUT_TIME) {
            return { 
                allowed: false, 
                remaining: 0,
                retryAfter: Math.ceil((LOCKOUT_TIME - timeSinceLast) / 1000)
            };
        }
        loginAttempts.delete(clientId);
        return { allowed: true, remaining: MAX_ATTEMPTS };
    }
    
    return { allowed: true, remaining: MAX_ATTEMPTS - attempts.count };
}

function recordAttempt(clientId, success) {
    if (success) {
        loginAttempts.delete(clientId);
        return;
    }
    
    const attempts = loginAttempts.get(clientId) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(clientId, attempts);
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(token);
        }
    }
}

export default async function handler(req, res) {
    try {
        const clientId = getClientId(req);
        
        // Clean expired sessions periodically
        if (Math.random() < 0.1) cleanExpiredSessions();
        
        if (req.method === 'POST') {
            const { action, password } = req.body || {};
            
            if (action === 'login') {
                // Check rate limit
                const rateLimit = checkRateLimit(clientId);
                if (!rateLimit.allowed) {
                    res.status(429).json({ 
                        ok: false, 
                        error: `Too many attempts. Try again in ${Math.ceil(rateLimit.retryAfter / 60)} minutes.`,
                        retryAfter: rateLimit.retryAfter
                    });
                    return;
                }
                
                // Simple password comparison
                const isValid = password === USER_PASSWORD;
                
                if (isValid) {
                    recordAttempt(clientId, true);
                    
                    // Generate secure session token
                    const sessionToken = generateSessionToken();
                    const expiresAt = Date.now() + SESSION_DURATION;
                    
                    sessions.set(sessionToken, {
                        clientId,
                        createdAt: Date.now(),
                        expiresAt,
                        lastActivity: Date.now()
                    });
                    
                    // Set secure HTTP-only cookie
                    res.setHeader('Set-Cookie', 
                        `user-auth=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_DURATION / 1000)}`
                    );
                    
                    res.status(200).json({ ok: true, expiresIn: SESSION_DURATION });
                    return;
                }
                
                recordAttempt(clientId, false);
                res.status(401).json({ 
                    ok: false, 
                    error: 'Invalid password',
                    attemptsRemaining: rateLimit.remaining - 1
                });
                return;
            }
            
            if (action === 'logout') {
                const token = req.cookies?.['user-auth'];
                if (token) {
                    sessions.delete(token);
                }
                res.setHeader('Set-Cookie', 'user-auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
                res.status(200).json({ ok: true });
                return;
            }
            
            res.status(400).json({ ok: false, error: 'Invalid action' });
            return;
        }
        
        // GET - Session validation
        if (req.method === 'GET') {
            const token = req.cookies?.['user-auth'];
            
            if (!token) {
                res.status(200).json({ ok: false });
                return;
            }
            
            const session = sessions.get(token);
            
            if (!session) {
                res.setHeader('Set-Cookie', 'user-auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
                res.status(200).json({ ok: false });
                return;
            }
            
            // Check expiration
            if (Date.now() > session.expiresAt) {
                sessions.delete(token);
                res.setHeader('Set-Cookie', 'user-auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
                res.status(200).json({ ok: false, error: 'Session expired' });
                return;
            }
            
            // Update last activity
            session.lastActivity = Date.now();
            
            res.status(200).json({ 
                ok: true,
                expiresIn: session.expiresAt - Date.now()
            });
            return;
        }
        
        res.status(405).json({ ok: false, error: 'Method not allowed' });
        
    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
}
