// ================================================================================================
// UTILITY FUNCTIONS MODULE
// ================================================================================================

/**
 * Format Date object to MM/DD/YYYY string
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day   = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2)   day   = '0' + day;

    return [month, day, year].join('/');
}

/**
 * Check if date is in the past.
 * Accepts MM/DD/YYYY (date chip format) or YYYY-MM-DD (API/backend format).
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isPastDate(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let targetDate;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // YYYY-MM-DD — from backend API (slots loaded from Google Sheets)
        targetDate = new Date(dateStr + 'T00:00:00');
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        // MM/DD/YYYY — from formatDate() used in date chip selector
        const [month, day, year] = dateStr.split('/').map(Number);
        targetDate = new Date(year, month - 1, day);
    } else {
        // Unrecognized format — fail safe: treat as not past
        console.warn(`isPastDate: unrecognized date format "${dateStr}"`);
        return false;
    }

    targetDate.setHours(0, 0, 0, 0);
    return targetDate < today;
}

/**
 * Display message with proper styling using CSS classes.
 * All types auto-hide except 'error' — errors stay visible until next message.
 * @param {string} msgId - Element ID
 * @param {string} message - Message text
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 */
export function displayMessage(msgId, message, type = 'success') {
    const msgBox = document.getElementById(msgId);
    if (!msgBox) return;

    // Clear any previous auto-hide timer on this element
    if (msgBox._hideTimer) {
        clearTimeout(msgBox._hideTimer);
        msgBox._hideTimer = null;
    }

    msgBox.classList.remove('success', 'error', 'warning', 'info');
    msgBox.classList.add(type);
    msgBox.textContent = message;
    msgBox.style.display = 'block';

    // error = 0 → stays visible until next message (admin must acknowledge)
    const DURATIONS = { success: 5000, info: 5000, warning: 8000, error: 0 };
    const duration  = DURATIONS[type] ?? 5000;

    if (duration > 0) {
        msgBox._hideTimer = setTimeout(() => {
            msgBox.style.display = 'none';
            msgBox._hideTimer   = null;
        }, duration);
    }
}

/**
 * Generate next 60 days for date selector
 * @returns {Array<Date>}
 */
export function getNextSixtyDays() {
    const days  = [];
    const today = new Date();

    for (let i = 0; i < 60; i++) {
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + i);
        days.push(nextDate);
    }
    return days;
}

/**
 * Check if date is weekend (Saturday or Sunday)
 * @param {Date} date
 * @returns {boolean}
 */
export function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}
