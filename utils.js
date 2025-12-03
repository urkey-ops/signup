// ================================================================================================
// UTILS.JS - HELPER FUNCTIONS
// ================================================================================================

// Sanitize HTML to prevent XSS
export function sanitizeHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Sanitize user input
export function sanitizeInput(str, maxLength = 1000) {
    if (!str) return '';
    return str.toString().trim().replace(/[<>]/g, '').substring(0, maxLength);
}

// Validate email format
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

// Show a temporary message in a container
export function showMessage(container, message, type = 'info', duration = 4000) {
    if (!container) return;
    container.textContent = message;
    container.className = `msg-box ${type}`; // info, success, error
    if (duration > 0) {
        setTimeout(() => {
            container.textContent = '';
            container.className = 'msg-box';
        }, duration);
    }
}

// Convert "HH:MM" to minutes for sorting
export function parseTimeForSorting(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
}

// Map HTTP status codes to friendly error messages
export function getErrorMessage(status, defaultMsg = 'An error occurred') {
    switch (status) {
        case 400: return 'Bad request. Please try again.';
        case 401: return 'Unauthorized access.';
        case 403: return 'Forbidden. You do not have permission.';
        case 404: return 'Resource not found.';
        case 409: return 'Booking conflict. Please try again.';
        case 429: return 'Too many requests. Please wait a moment.';
        case 500: return 'Internal server error. Please try later.';
        case 502: return 'Bad gateway. Server unreachable.';
        case 503: return 'Service unavailable. Try again later.';
        default: return defaultMsg;
    }
}

// Debounce function to limit rapid function calls
export function debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Deep clone an object
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Check if an element is visible in viewport
export function isElementInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Simple delay / sleep
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Format number with commas
export function formatNumber(num) {
    if (isNaN(num)) return num;
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Check if a date string is valid
export function isValidDate(dateStr) {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

// Generate a random ID (for slots or temporary elements)
export function generateRandomId(prefix = 'id') {
    return `${prefix}-${Math.floor(Math.random() * 1e8)}`;
}
