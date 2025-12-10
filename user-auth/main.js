import { login, logout, checkSession } from './api.js';

let timeoutId;
let sessionCheckInterval;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const SESSION_CHECK_INTERVAL = 60 * 1000; // Check every minute
let isLoggingOut = false;

function dispatchAuthReady() {
    window.dispatchEvent(new CustomEvent('user-auth-ready'));
    console.log('✅ user-auth-ready dispatched');
}

function handleSessionExpired() {
    if (isLoggingOut) return;
    isLoggingOut = true;
    
    clearTimeout(timeoutId);
    clearInterval(sessionCheckInterval);
    
    logout().then(() => {
        alert('Your session has expired. Please log in again.');
        location.reload();
    }).catch(() => {
        location.reload();
    });
}

function resetTimer() {
    if (isLoggingOut) return;
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        handleSessionExpired();
    }, IDLE_TIMEOUT);
}

function startSessionValidation() {
    // Periodic session check
    sessionCheckInterval = setInterval(async () => {
        if (isLoggingOut) return;
        
        const result = await checkSession();
        if (!result.ok) {
            handleSessionExpired();
        }
    }, SESSION_CHECK_INTERVAL);
}

async function initializeSession() {
    console.log('🔍 Checking session...');
    
    try {
        const data = await checkSession();
        
        if (data.ok) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'block';
            
            resetTimer();
            startSessionValidation();
            dispatchAuthReady();
        } else {
            document.getElementById('loginSection').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
        }
    } catch (err) {
        console.error('Session check failed:', err);
        document.getElementById('loginSection').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
    }
}

// Activity listeners
['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
    document.addEventListener(event, resetTimer, { passive: true, capture: true });
});

// Expose globally
window.login = login;
window.logout = logout;
window.checkSession = checkSession;
window.resetUserTimer = resetTimer;

// Initialize on page load
window.addEventListener('load', initializeSession);

// Handle visibility change (tab switching)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isLoggingOut) {
        checkSession().then(result => {
            if (!result.ok) {
                handleSessionExpired();
            }
        });
    }
});
