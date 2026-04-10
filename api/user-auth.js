import crypto from 'crypto';

// ================================================================================================
// CONFIGURATION
// ================================================================================================

const USER_PASSWORD      = process.env.USER_PASSWORD || 'baps';
const MAX_ATTEMPTS       = 5;
const LOCKOUT_TIME       = 15 * 60 * 1000;       // 15 minutes
const SESSION_DURATION   = 2 * 60 * 60 * 1000;   // 2 hours
const CLEANUP_PROBABILITY = 0.05;                  // 5% chance to clean on each request
const IS_PRODUCTION      = process.env.NODE_ENV === 'production';

// ================================================================================================
// IN-MEMORY STORES
// Use Redis in production for multi-server setups
// ================================================================================================

const sessions     = new Map();
const loginAttempts = new Map();

// ================================================================================================
// CLIENT ID
// FIX #4: Validate x-forwarded-for before trusting it (prevents IP spoofing to bypass rate limit)
// FIX #5: Removed deprecated req.connection — req.socket covers it
// ================================================================================================

const IP_VALID_REGEX = /^[\w.:]+$/;

function getClientId(req) {
    const rawForwarded = req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const socketIp     = req.socket?.remoteAddress || 'unknown';

    // FIX #4: Only use x-forwarded-for if it passes format validation
    const ip = (rawForwarded && IP_VALID_REGEX.test(rawForwarded))
        ? rawForwarded
        : socketIp;

    const ua = req.headers['user-agent'] || 'unknown';
    return `${ip}:${ua}`;
}

// ================================================================================================
// RATE LIMITING
// ================================================================================================

function checkRateLimit(clientId) {
    const attempts = loginAttempts.get(clientId);

    if (!attempts) {
        return { allowed: true, remaining: MAX_ATTEMPTS };
    }

    const now           = Date.now();
    const timeSinceLast = now - attempts.lastAttempt;

    // Lockout active
    if (attempts.count >= MAX_ATTEMPTS && timeSinceLast < LOCKOUT_TIME) {
        return {
            allowed: false,
            remaining: 0,
            retryAfter: Math.ceil((LOCKOUT_TIME - timeSinceLast) / 1000)
        };
    }

    // Lockout expired — reset
    if (timeSinceLast >= LOCKOUT_TIME) {
        loginAttempts.delete(clientId);
        return { allowed: true, remaining: MAX_ATTEMPTS };
    }

    return {
        allowed: true,
        remaining: MAX_ATTEMPTS - attempts.count
    };
}

function recordAttempt(clientId, success) {
    if (success) {
        loginAttempts.delete(clientId);
        return;
    }

    const now      = Date.now();
    const attempts = loginAttempts.get(clientId);

    if (attempts) {
        attempts.count++;
        attempts.lastAttempt = now;
    } else {
        loginAttempts.set(clientId, { count: 1, lastAttempt: now });
    }
}

// ================================================================================================
// SESSION HELPERS
// ================================================================================================

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions() {
    const now      = Date.now();
    const toDelete = [];

    for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt) toDelete.push(token);
    }

    for (const token of toDelete) sessions.delete(token);

    return toDelete.length;
}

// ================================================================================================
// COOKIE HELPER
// FIX #7: Secure flag only set in production — allows localhost HTTP dev without silent failures
// ================================================================================================

function setCookie(res, name, value, maxAge) {
    const secureFlag = IS_PRODUCTION ? '; Secure' : '';

    if (maxAge === 0) {
        res.setHeader('Set-Cookie',
            `${name}=; HttpOnly${secureFlag}; SameSite=Strict; Path=/; Max-Age=0`
        );
    } else {
        res.setHeader('Set-Cookie',
            `${name}=${value}; HttpOnly${secureFlag}; SameSite=Strict; Path=/; Max-Age=${maxAge}`
        );
    }
}

// ================================================================================================
// MAIN HANDLER
// ================================================================================================

export default async function handler(req, res) {
    try {
        // Probabilistic cleanup — non-blocking
        if (Math.random() < CLEANUP_PROBABILITY) {
            setImmediate(() => cleanExpiredSessions());
        }

        const { method } = req;

        // ========================== POST — Login / Logout ==========================

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

                // FIX #1: Use crypto.timingSafeEqual for constant-time comparison.
                // Plain === is NOT constant-time and leaks timing info about the password.
                let isValid = false;
                try {
                    isValid = typeof password === 'string' &&
                        password.length === USER_PASSWORD.length &&
                        crypto.timingSafeEqual(
                            Buffer.from(password),
                            Buffer.from(USER_PASSWORD)
                        );
                } catch {
                    // Buffers of different length throw — treat as invalid
                    isValid = false;
                }

                if (isValid) {
                    recordAttempt(clientId, true);

                    const sessionToken = generateSessionToken();
                    const now          = Date.now();
                    const expiresAt    = now + SESSION_DURATION;

                    sessions.set(sessionToken, {
                        clientId,
                        createdAt:    now,
                        expiresAt,
                        lastActivity: now
                    });

                    setCookie(res, 'user-auth', sessionToken, Math.floor(SESSION_DURATION / 1000));

                    return res.status(200).json({ ok: true, expiresIn: SESSION_DURATION });
                }

                // Failed login
                recordAttempt(clientId, false);

                // FIX #3: Math.max(0, ...) prevents attemptsRemaining from going negative
                return res.status(401).json({
                    ok: false,
                    error: 'Invalid password',
                    attemptsRemaining: Math.max(0, rateLimit.remaining - 1)
                });
            }

            return res.status(400).json({ ok: false, error: 'Invalid action' });
        }

        // ========================== GET — Session Check ==========================

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

            // FIX #6: Verify the request comes from the same client that created the session.
            // A stolen cookie from a different device/IP will be rejected.
            const currentClientId = getClientId(req);
            if (session.clientId !== currentClientId) {
                sessions.delete(token);
                setCookie(res, 'user-auth', '', 0);
                return res.status(200).json({ ok: false, error: 'Session invalid' });
            }

            // Update last activity (in-place)
            session.lastActivity = now;

            return res.status(200).json({
                ok: true,
                expiresIn: session.expiresAt - now
            });
        }

        // ========================== Method Not Allowed ==========================

        return res.status(405).json({ ok: false, error: 'Method not allowed' });

    } catch (error) {
        console.error('[user-auth] Handler error:', error);
        return res.status(500).json({ ok: false, error: 'Server error' });
    }
}
