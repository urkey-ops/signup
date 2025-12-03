// ================================================================================================
// UTILS.JS - HELPER FUNCTIONS (UPDATED FOR SAFE SANITIZATION + IMPROVEMENTS)
// ================================================================================================

// Escape HTML so it's safe to insert via innerHTML
export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"'\/]/g, function (s) {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;'
        })[s];
    });
}

// Sanitize HTML (alias to escapeHTML) - returns a string safe for innerHTML
export function sanitizeHTML(str) {
    return escapeHTML(str);
}

// Sanitize user input for free-text fields (strip obvious dangerous pieces)
// This client-side sanitization reduces attack surface; ALWAYS validate again on the server.
export function sanitizeInput(str, maxLength = 1000) {
    if (str === null || str === undefined) return '';
    let s = String(str).trim().substring(0, maxLength);

    // Remove angle brackets
    s = s.replace(/[<>]/g, '');

    // Remove javascript: pseudo-protocol
    s = s.replace(/javascript:/gi, '');

    // Remove inline handlers like onmouseover="..." or onload='...'
    s = s.replace(/on\w+\s*=\s*(['"]).*?\1/gi, '');

    // Remove unprintable/control characters
    s = s.replace(/[\x00-\x1F\x7F]/g, '');

    return s;
}

// Validate email format
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

// Show a temporary message in a container (doesn't clobber unrelated classes)
export function showMessage(container, message, type = 'info', duration = 4000) {
    if (!container) return;
    container.textContent = message;

    // Ensure the base class and the type class are present; remove other type classes
    container.classList.add('msg-box', type);
    ['info', 'success', 'error'].forEach(t => {
        if (t !== type) container.classList.remove(t);
    });

    if (duration > 0) {
        setTimeout(() => {
            // only clear message if still same
            if (container.textContent === message) {
                container.textContent = '';
                container.classList.remove(type);
            }
        }, duration);
    }
}

// Convert "HH:MM" (or "H:MM") to minutes for sorting
export function parseTimeForSorting(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const m = timeStr.match(/^(\d{1,2}):?(\d{2})?/);
    if (!m) return 0;
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    if (Number.isNaN(h) || Number.isNaN(min)) return 0;
    return h * 60 + min;
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
        const ctx = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(ctx, args), wait);
    };
}

// Deep clone an object (uses structuredClone if available)
export function deepClone(obj) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (e) {
            // fallback to JSON below
        }
    }
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        // fallback shallow copy
        if (obj && typeof obj === 'object') return Object.assign(Array.isArray(obj) ? [] : {}, obj);
        return obj;
    }
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

// Format number with commas using locale
export function formatNumber(num) {
    const n = Number(num);
    if (Number.isNaN(n)) return String(num);
    return n.toLocaleString();
}

// Check if a date string is valid (strict for YYYY-MM-DD)
export function isValidDate(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;

    // Strict check for ISO date (YYYY-MM-DD)
    const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const y = Number(isoMatch[1]);
        const m = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        return d.getUTCFullYear() === y && (d.getUTCMonth() + 1) === m && d.getUTCDate() === day;
    }

    return true;
}

// Generate a random ID (for slots or temporary elements)
export function generateRandomId(prefix = 'id') {
    return `${prefix}-${Math.floor(Math.random() * 1e8)}`;
}
