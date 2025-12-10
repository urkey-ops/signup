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
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [month, day, year].join('/');
}

/**
 * Check if date is in the past
 * @param {string} dateStr - Format: MM/DD/YYYY
 * @returns {boolean}
 */
export function isPastDate(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [month, day, year] = dateStr.split('/').map(Number);
    const targetDate = new Date(year, month - 1, day);
    targetDate.setHours(0, 0, 0, 0);
    
    return targetDate < today;
}

/**
 * Display message with proper styling using new CSS classes
 * @param {string} msgId - Element ID
 * @param {string} message - Message text
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 */
export function displayMessage(msgId, message, type = 'success') {
    const msgBox = document.getElementById(msgId);
    if (!msgBox) return;
    
    // Remove all type classes
    msgBox.classList.remove('success', 'error', 'warning', 'info');
    
    // Add the new type class
    msgBox.classList.add(type);
    msgBox.textContent = message;
    msgBox.style.display = 'block';

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            msgBox.style.display = 'none';
        }, 5000);
    }
}

/**
 * Generate next 60 days for date selector
 * @returns {Array<Date>}
 */
export function getNextSixtyDays() {
    const days = [];
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
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}
