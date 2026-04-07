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
        
       // AFTER
if (data.ok) {
  // Reveal UI and signal ready IMMEDIATELY
  loginSection.style.display = 'none';
  mainApp.style.display = 'block';
  logoutBtn.style.display = 'block';
  resetTimer();
  startSessionValidation();
  dispatchAuthReady();  // ← fires right away, no waiting

  // Slots preload continues in background (best-effort)
  // slots-api.js will use window.PRELOADED_SLOTS if it arrives
  // before loadSlots() runs — otherwise loadSlots() fetches normally
  import('../modules/slots/slots-api.js')
    .then(({ fetchSlots }) => fetchSlots())
    .then(slotsData => {
      if (slotsData?.ok) window.PRELOADED_SLOTS = slotsData;
      console.log('Slots preloaded in background');
    })
    .catch(e => console.warn('Slots preload failed, will fall back later', e));
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
window.initializeSession = initializeSession;

// DOM ready init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSession);
} else {
    initializeSession();
}
