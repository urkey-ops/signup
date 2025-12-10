import { login, logout } from './api.js';
import { displayMessage } from './utils.js';

let timeoutId;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_SESSION = 2 * 60 * 60 * 1000; // 2 hours absolute
let loginTime = 0;
let isLoggingOut = false;

function resetTimer() {
    if (isLoggingOut) return;  // Prevent infinite loop
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        isLoggingOut = true;
        logout();
        isLoggingOut = false;
    }, IDLE_TIMEOUT);
    
    // Check absolute timeout
    if (Date.now() - loginTime > MAX_SESSION) {
        isLoggingOut = true;
        logout();
        isLoggingOut = false;
    }
}

function checkSession() {
    fetch('/api/user-auth', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.ok) {
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                loginTime = Date.now();
                resetTimer();
            }
        }).catch(() => {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('mainApp').style.display = 'none';
        });
}

// Activity listeners
['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetTimer, true);
});

// Expose globally
window.login = login;
window.logout = logout;
window.resetUserTimer = resetTimer;

// Page load
window.onload = checkSession;

// Tab close cleanup
window.addEventListener('beforeunload', () => {
    fetch('/api/user-auth', { 
        method: 'POST', 
        credentials: 'include', 
        body: JSON.stringify({ action: 'logout' }) 
    });
});

// Add to end of main.js:
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('userLoginBtn');
    const passwordInput = document.getElementById('userPassword');
    const loginMsg = document.getElementById('loginMsg');
    
    loginBtn.onclick = async () => {
        const password = passwordInput.value;
        try {
            loginMsg.textContent = 'Logging in...';
            const result = await window.login(password);
            if (result.ok) {
                loginMsg.className = 'msg-box success';
                loginMsg.textContent = 'Login successful!';
            } else {
                loginMsg.className = 'msg-box error';
                loginMsg.textContent = 'Wrong password';
                passwordInput.value = '';
            }
        } catch {
            loginMsg.className = 'msg-box error';
            loginMsg.textContent = 'Login failed';
        }
    };
});

