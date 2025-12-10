const USER_PASSWORD = process.env.USER_PASSWORD || 'test123';

export default async function handler(req, res) {
    console.log('=== USER-AUTH DEBUG ===');
    console.log('Method:', req.method);
    console.log('USER_PASSWORD exists?', !!process.env.USER_PASSWORD);
    
    if (req.method === 'POST') {
        const { action, password } = req.body || {};
        console.log('Action:', action, 'Password match?', password === process.env.USER_PASSWORD);
        
        if (action === 'login' && password === process.env.USER_PASSWORD) {
            console.log('LOGIN SUCCESS');
            res.setHeader('Set-Cookie', `user-auth=valid; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`);
            res.json({ ok: true });
            return;
        }
        
        if (action === 'logout') {
            console.log('LOGOUT');
            res.setHeader('Set-Cookie', 'user-auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
            res.json({ ok: true });
            return;
        }
        
        console.log('LOGIN FAILED');
        res.status(401).json({ ok: false, error: 'Invalid password' });
        return;
    }
    
    // GET - Session check
    const cookie = req.cookies?.['user-auth'];
    console.log('SESSION CHECK:', cookie === 'valid');
    res.json({ ok: cookie === 'valid' });
}
