let loginPending = false;
let requestController = null;

// Fast fetch with timeout
async function fetchWithTimeout(url, options, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

export async function login(password) {
    if (loginPending) return { ok: false, error: 'Login in progress' };
    
    loginPending = true;
    
    try {
        const res = await fetchWithTimeout('/api/user-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'login', password })
        }, 15000);
        
        if (!res.ok) {
            const data = await res.json();
            return { 
                ok: false, 
                error: data.error || 'Login failed',
                attemptsRemaining: data.attemptsRemaining,
                retryAfter: data.retryAfter
            };
        }
        
        const data = await res.json();
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            return { ok: false, error: 'Request timeout. Please try again.' };
        }
        console.error('Login error:', error);
        return { ok: false, error: 'Network error. Please check your connection.' };
    } finally {
        loginPending = false;
    }
}

export async function logout() {
    try {
        await fetchWithTimeout('/api/user-auth', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout' })
        }, 5000);
        return { ok: true };
    } catch (error) {
        console.error('Logout error:', error);
        return { ok: false, error: 'Logout failed' };
    }
}

export async function checkSession() {
    try {
        const res = await fetchWithTimeout('/api/user-auth', {
            method: 'GET',
            credentials: 'include'
        }, 5000);
        
        if (!res.ok) {
            return { ok: false };
        }
        
        const data = await res.json();
        return data;
    } catch (error) {
        console.error('Session check error:', error);
        return { ok: false, error: 'Session check failed' };
    }
}
