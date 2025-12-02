// START OF CODE: utils.js

import { CONFIG } from './config.js';

// --- Security: Input Sanitization ---
export function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function sanitizeInput(str, maxLength = 255) {
    if (!str) return '';
    return str
        .trim()
        .replace(/[<>]/g, '')
        .substring(0, maxLength);
}

// --- Validation Functions (ALIGNED WITH BACKEND) ---
export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= CONFIG.MAX_EMAIL_LENGTH;
}

export function isValidPhone(phone) {
    if (!phone) return true;
    return /^[\d\s\-\+\(\)]{7,20}$/.test(phone);
}

// --- Helper for message display ---
export function showMessage(elementId, message, isError) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = isError ? "msg-box error" : "msg-box success";
    el.style.display = message ? "block" : "none";
}

// --- Improved Error Messages (MATCHES BACKEND STATUS CODES) ---
export function getErrorMessage(status, defaultMessage) {
    const errorMessages = {
        400: "Invalid request. Please check your information and try again.",
        401: "Authentication required. Please refresh the page.",
        403: "Access denied. Please contact support.",
        404: "Service not found. Please contact support.",
        409: "This slot was just booked by someone else. Please refresh and select another.",
        429: "Too many requests. Please wait a moment and try again.",
        500: "Server error. Please try again in a few moments.",
        503: "Service temporarily unavailable. Please try again later.",
    };
    
    return errorMessages[status] || defaultMessage || "An unexpected error occurred. Please try again.";
}

// Helper function to parse time from slot label and convert to comparable number
export function parseTimeForSorting(slotLabel) {
    const startTime = slotLabel.split('-')[0].trim();
    const match = startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return 0;
    
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    const period = match[3].toUpperCase();
    
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    return hour * 60 + minute;
}

// END OF CODE: utils.js
