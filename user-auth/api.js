// user-auth/api.js - CLEAN VERSION
let loginPending = false;

export async function login(password) {
    if (loginPending) return { ok: false };
    
    loginPending = true;
    try {
        const res = await fetch('/api/user-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'login', password })
        });
        
        const data = await res.json();
        return data;
    } catch (error) {
        console.error('Login error:', error);
        return { ok: false, error: 'Network error' };
    } finally {
        loginPending = false;
    }
}

export async function logout() {
    try {
        await fetch('/api/user-auth', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout' })
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
}
