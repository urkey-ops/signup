import { login, logout, checkSession } from './api.js';

// Configuration
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const SESSION_CHECK_INTERVAL = 60 * 1000; // 1 minute

// State
let timeoutId = null;
let sessionCheckInterval = null;
let isLoggingOut = false;
let lastActivity = Date.now();

// Optimized auth ready dispatch
function dispatchAuthReady() {
    const event = new CustomEvent('user-auth-ready');
    window.dispatchEvent(event);
    console.log('✅ user-auth-ready');
}

// Fast session expiration handler
function handleSessionExpired() {
    if (isLoggingOut) return;
    isLoggingOut = true;
    
    clearTimeout(timeoutId);
    clearInterval(sessionCheckInterval);
    
    logout()
        .catch(() => {}) // Ignore logout errors
        .finally(() => {
            alert('Your session has expired. Please log in again.');
            location.reload();
        });
}

// Optimized idle timer with debouncing
function resetTimer() {
    if (isLoggingOut) return;
    
    const now = Date.now();
    
    // Debounce: only reset if more than 1 second since last activity
    if (now - lastActivity < 1000) return;
    lastActivity = now;
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleSessionExpired, IDLE_TIMEOUT);
}

// Fast periodic session validation
function startSessionValidation() {
    sessionCheckInterval = setInterval(async () => {
        if (isLoggingOut) return;
        
        try {
            const result = await checkSession();
            if (!result.ok) {
                handleSessionExpired();
            }
        } catch (error) {
            console.error('Session check failed:', error);
        }
    }, SESSION_CHECK_INTERVAL);
}

// Fast session initialization
async function initializeSession() {
    console.log('🔍 Checking session...');
    
    const loginSection = document.getElementById('loginSection');
    const mainApp = document.getElementById('mainApp');
    const logoutBtn = document.getElementById('logoutBtn');
    
    try {
        const data = await checkSession();
        
        if (data.ok) {
            // Logged in - show app
            loginSection.style.display = 'none';
            mainApp.style.display = 'block';
            logoutBtn.style.display = 'block';
            
            resetTimer();
            startSessionValidation();
            dispatchAuthReady();
        } else {
            // Not logged in - show login
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

// Optimized activity tracking with passive listeners
const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
const listenerOptions = { passive: true, capture: true };

for (const event of activityEvents) {
    document.addEventListener(event, resetTimer, listenerOptions);
}

// Visibility change handler (tab switching)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isLoggingOut) {
        checkSession().then(result => {
            if (!result.ok) handleSessionExpired();
        });
    }
}, { passive: true });

// Global API exposure
window.login = login;
window.logout = logout;
window.checkSession = checkSession;
window.resetUserTimer = resetTimer;

// Fast initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSession);
} else {
    initializeSession();
}
