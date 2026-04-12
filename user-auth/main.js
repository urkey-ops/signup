import { login, logout, checkSession } from './api.js';

// ================================================================================================
// CONFIGURATION
// ================================================================================================

const IDLE_TIMEOUT = 15 * 60 * 1000;
const SESSION_CHECK_INTERVAL = 60 * 1000;
const IDLE_THROTTLE_MS = 1000;

// ================================================================================================
// STATE
// ================================================================================================

let timeoutId = null;
let sessionCheckInterval = null;
let isLoggingOut = false;
let lastActivity = Date.now();
let isSignupFormOpen = false;

// ================================================================================================
// AUTH READY
// ================================================================================================

function dispatchAuthReady() {
    window.dispatchEvent(new CustomEvent('user-auth-ready'));
    console.log('✅ user-auth-ready');
}

// ================================================================================================
// SESSION EXPIRY
// ================================================================================================

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

// ================================================================================================
// IDLE TIMER
// ================================================================================================

function resetTimer() {
    if (isLoggingOut) return;
    const now = Date.now();
    if (now - lastActivity < IDLE_THROTTLE_MS) return;

    lastActivity = now;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleSessionExpired, IDLE_TIMEOUT);
}

function pauseIdleTimer() {
    clearTimeout(timeoutId);
    timeoutId = null;
    isSignupFormOpen = true;
    console.log('⏸️ Idle timer paused (signup form open)');
}

function resumeIdleTimer() {
    isSignupFormOpen = false;
    lastActivity = Date.now();
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleSessionExpired, IDLE_TIMEOUT);
    console.log('▶️ Idle timer resumed');
}

// ================================================================================================
// SESSION VALIDATION (periodic)
// ================================================================================================

function startSessionValidation() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }

    sessionCheckInterval = setInterval(async () => {
        if (isLoggingOut) return;

        if (isSignupFormOpen) {
            console.log('⏭️ Session check skipped — signup form is open');
            return;
        }

        try {
            const result = await checkSession();
            if (!result.ok) handleSessionExpired();
        } catch (error) {
            console.error('Session check failed:', error);
        }
    }, SESSION_CHECK_INTERVAL);
}

// ================================================================================================
// SESSION INIT
// ================================================================================================

async function initializeSession() {
    console.log('🔍 Checking session...');

    const loginSection = document.getElementById('loginSection');
    const mainApp = document.getElementById('mainApp');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!loginSection || !mainApp || !logoutBtn) {
        console.error('Required auth DOM elements not found');
        return;
    }

    try {
        const data = await checkSession();

        if (data.ok) {
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

// ================================================================================================
// ACTIVITY TRACKING
// ================================================================================================

['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
    document.addEventListener(evt, resetTimer, { passive: true, capture: true });
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isLoggingOut) {
        if (isSignupFormOpen) return;
        checkSession().then(result => {
            if (!result.ok) handleSessionExpired();
        });
    }
}, { passive: true });

// ================================================================================================
// GLOBAL EXPOSURE
// ================================================================================================

window.login = login;
window.logout = logout;
window.checkSession = checkSession;
window.resetUserTimer = resetTimer;
window.pauseIdleTimer = pauseIdleTimer;
window.resumeIdleTimer = resumeIdleTimer;

window.addEventListener('user-login-success', () => {
    initializeSession();
});

// ================================================================================================
// DOM READY INIT
// ================================================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSession);
} else {
    initializeSession();
}
