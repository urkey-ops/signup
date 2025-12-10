import { USER_PASSWORD } from '../config.js';

export default async function handler(req, res) {
    // CORS for fetch
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method === 'POST') {
        const { action, password } = req.body || {};
        
        if (action === 'login' && password === USER_PASSWORD) {
            res.setHeader('Set-Cookie', [
                `user-auth=valid; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`, // 2 hours
                `user-login-time=${Date.now()}; Secure; SameSite=Strict; Path=/; Max-Age=7200`
            ]);
            res.json({ ok: true });
            return;
        }
        
        if (action === 'logout') {
            res.setHeader('Set-Cookie', 'user-auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
            res.json({ ok: true });
            return;
        }
        
        res.status(401).json({ ok: false, error: 'Invalid password' });
        return;
    }
    
    // GET - Session check
    const cookie = req.cookies['user-auth'];
    if (cookie === 'valid') {
        res.json({ ok: true });
    } else {
        res.status(401).json({ ok: false });
    }
}
