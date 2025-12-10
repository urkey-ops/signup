import { API_URL } from './config.js';
import { displayMessage } from './utils.js';

export async function login() {
    const passwordInput = document.getElementById('userPassword');
    const loginBtn = document.getElementById('userLoginBtn');
    const password = passwordInput.value.trim();
    
    if (!password) {
        displayMessage('loginMsg', 'Please enter password.', 'error');
        return;
    }
    
    loginBtn.disabled = true;
    displayMessage('loginMsg', 'Authenticating...', 'info');
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'login', password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.ok) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            passwordInput.value = '';
            displayMessage('loginMsg', 'Access granted!', 'success');
            window.resetUserTimer(); // Start idle timer
        } else {
            passwordInput.value = '';
            displayMessage('loginMsg', data.error || 'Invalid password.', 'error');
        }
    } catch (error) {
        displayMessage('loginMsg', 'Network error.', 'error');
    } finally {
        loginBtn.disabled = false;
    }
}

export async function logout() {
    try {
        await fetch(API_URL, {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({ action: 'logout' })
        });
    } catch (e) {}
    
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
    displayMessage('loginMsg', 'Logged out.', 'info');
}

let loginPending = false;

export async function login(password) {
    if (loginPending) return;  // STOP SPAM
    
    loginPending = true;
    try {
        const res = await fetch('/api/user-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'login', password })
        });
        
        const data = await res.json();
        loginPending = false;
        return data;
    } catch {
        loginPending = false;
        throw new Error('Login failed');
    }
}

export async function logout() {
    await fetch('/api/user-auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
    });
}

