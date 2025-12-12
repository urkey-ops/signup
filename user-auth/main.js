import { login, logout, checkSession } from './api.js';

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const SESSION_CHECK_INTERVAL = 60 * 1000; // 1 minute

let timeoutId = null;
let sessionCheckInterval = null;
let isLoggingOut = false;
let lastActivity = Date.now();

function dispatchAuthReady() {
    const event = new CustomEvent('user-auth-ready');
    window.dispatchEvent(event);
    console.log('✅ user-auth-ready');
}

function handleSessionExpired() {
    if (isLoggingOut) return;
    isLoggingOut = true;

    clearTimeout(timeoutId);
    clearInterval(sessionCheckInterval);

    logout()
        .catch(() => {})
        .finally(() => {
            alert('Your session has expired. Please log in again.');
            location.reload();
        });
}

function resetTimer() {
    if (isLoggingOut) return;
    const now = Date.now();
    if (now - lastActivity < 1000) return;
    lastActivity = now;

    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleSessionExpired, IDLE_TIMEOUT);
}

function startSessionValidation() {
    sessionCheckInterval = setInterval(async () => {
        if (isLoggingOut) return;
        try {
            const result = await checkSession();
            if (!result.ok) handleSessionExpired();
        } catch (error) {
            console.error('Session check failed:', error);
        }
    }, SESSION_CHECK_INTERVAL);
}

async function initializeSession() {
    console.log('🔍 Checking session...');
    const loginSection = document.getElementById('loginSection');
    const mainApp = document.getElementById('mainApp');
    const logoutBtn = document.getElementById('logoutBtn');

    try {
        const data = await checkSession();
        if (data.ok) {
            // ✅ Show app instantly
            loginSection.style.display = 'none';
            mainApp.style.display = 'block';
            logoutBtn.style.display = 'block';

            resetTimer();
            startSessionValidation();
            dispatchAuthReady();
        } else {
            loginSection.style.display = 'flex';
            mainApp.style.display = 'none';
            logoutBtn.style.display = 'none';
        }
    } catch (err) {
        console.error('Session check failed:', err);
        loginSection.style.display = 'flex';
        mainApp.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

// Track user activity
['mousemove','mousedown','keypress','scroll','touchstart','click'].forEach(evt => {
    document.addEventListener(evt, resetTimer, { passive: true, capture: true });
});

// Visibility change: recheck session
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isLoggingOut) {
        checkSession().then(result => { if (!result.ok) handleSessionExpired(); });
    }
}, { passive: true });

// Global exposure
window.login = login;
window.logout = logout;
window.checkSession = checkSession;
window.resetUserTimer = resetTimer;

// DOM ready init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSession);
} else {
    initializeSession();
}
