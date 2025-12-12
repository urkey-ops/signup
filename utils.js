// ================================================================================================
// UTILS.JS - HELPER FUNCTIONS (CSS CONSISTENT + COMPLETE)
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
            "'": '&#x27;',
            '/': '&#x2F;'
        })[s];
    });
}

// Sanitize HTML (alias to escapeHTML) - returns a string safe for innerHTML
export function sanitizeHTML(str) {
    return escapeHTML(str);
}

// Sanitize user input for free-text fields (strip obvious dangerous pieces)
export function sanitizeInput(str, maxLength = 1000) {
    if (str === null || str === undefined) return '';
    let s = String(str).trim().substring(0, maxLength);
    s = s.replace(/[<>]/g, '');
    s = s.replace(/javascript:/gi, '');
    s = s.replace(/on\w+\s*=\s*(['"]).*?\1/gi, '');
    s = s.replace(/[\x00-\x1F\x7F]/g, '');
    return s;
}

// Validate email format
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

// Normalize phone to digits-only
export function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    const digits = phone.replace(/\D/g, '');
    return digits;
}

// Validate phone numbers (EXACTLY 10 digits)
export function isValidPhone(phone) {
    const digits = normalizePhone(phone);
    return digits.length === 10;
}

// ================================================================================================
// SHOW MESSAGE - CSS CONSISTENT VERSION
// ================================================================================================
export function showMessage(arg1, arg2, arg3, arg4) {
    let container, message, type, duration;

    if (typeof arg1 === 'string') {
        container = document.getElementById('globalMessageContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'globalMessageContainer';
            container.className = 'msg-box';
            container.style.cssText = `
                position: fixed;
                top: var(--space-xl);
                right: var(--space-xl);
                max-width: 400px;
                z-index: var(--z-toast);
                font-size: var(--font-size-sm);
            `;
            document.body.appendChild(container);
        }
        message = arg1;
        type = arg2 || 'info';
        duration = typeof arg3 === 'number' ? arg3 : 4000;
    } else if (arg1 instanceof Element) {
        container = arg1;
        message = arg2;
        type = arg3 || 'info';
        duration = typeof arg4 === 'number' ? arg4 : 4000;
    } else {
        console.error('showMessage: Invalid first argument');
        return;
    }

    if (!container || !(container instanceof Element)) {
        console.error('showMessage: Invalid container');
        return;
    }
    if (!message || typeof message !== 'string') {
        console.error('showMessage: Invalid message');
        return;
    }

    container.textContent = message;
    container.style.display = 'block';
    container.style.opacity = '1';
    container.className = `msg-box ${type}`;

    if (container._messageTimeout) {
        clearTimeout(container._messageTimeout);
    }

    if (duration > 0) {
        const currentMessage = message;
        container._messageTimeout = setTimeout(() => {
            if (container.textContent === currentMessage) {
                container.style.opacity = '0';
                setTimeout(() => {
                    if (container.textContent === currentMessage) {
                        container.textContent = '';
                        container.style.display = 'none';
                        container.classList.remove(type);
                    }
                }, 300);
            }
        }, duration);
    }
}

// Improved parseTimeForSorting
export function parseTimeForSorting(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const normalized = timeStr.replace(/\s*-\s*/g, '-').trim();
    const firstPart = normalized.split('-')[0].trim().toLowerCase();
    const m = firstPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return 0;
    let hour = Number(m[1]);
    const minutes = m[2] ? Number(m[2]) : 0;
    const period = m[3] ? m[3].toLowerCase() : null;
    if (Number.isNaN(hour) || Number.isNaN(minutes)) return 0;
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return hour * 60 + minutes;
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

// Debounce function
export function debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
        const ctx = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(ctx, args), wait);
    };
}

// Deep clone an object
export function deepClone(obj) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (e) {}
    }
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
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

// Format number with commas
export function formatNumber(num) {
    const n = Number(num);
    if (Number.isNaN(n)) return String(num);
    return n.toLocaleString();
}

// Improved date validation
export function isValidDate(dateStr) {
    if (!dateStr) return false;
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            const y = Number(isoMatch[1]);
            const m = Number(isoMatch[2]);
            const day = Number(isoMatch[3]);
            if (m < 1 || m > 12 || day < 1 || day > 31) return false;
            return d.getUTCFullYear() === y &&
                   (d.getUTCMonth() + 1) === m &&
                   d.getUTCDate() === day;
        }
        return true;
    } catch (e) {
        return false;
    }
}

// Generate a random ID
export function generateRandomId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Helper to safely get element by ID
export function getElementByIdSafe(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with ID "${id}" not found in DOM`);
    }
    return el;
}
