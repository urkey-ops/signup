let loginPending = false;

export async function login(password) {
    if (loginPending) return { ok: false, error: 'Login in progress' };
    
    loginPending = true;
    try {
        const res = await fetch('/api/user-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'login', password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            return { 
                ok: false, 
                error: data.error || 'Login failed',
                attemptsRemaining: data.attemptsRemaining,
                retryAfter: data.retryAfter
            };
        }
        
        return data;
    } catch (error) {
        console.error('Login error:', error);
        return { ok: false, error: 'Network error. Please check your connection.' };
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
        return { ok: true };
    } catch (error) {
        console.error('Logout error:', error);
        return { ok: false, error: 'Logout failed' };
    }
}

export async function checkSession() {
    try {
        const res = await fetch('/api/user-auth', {
            method: 'GET',
            credentials: 'include'
        });
        
        const data = await res.json();
        return data;
    } catch (error) {
        console.error('Session check error:', error);
        return { ok: false, error: 'Session check failed' };
    }
}
