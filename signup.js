// ================================================================================================
// SIGNUP FRONT-END SCRIPT - HYBRID VERSION
// ================================================================================================

import { selectedSlots, updateSelectedSlots } from './config.js';
import { sanitizeHTML, showMessage, getErrorMessage } from './utils.js';
import { toggleSlot, updateSummaryDisplay, backToSlotSelection, removeSlotFromSummary } from './slots.js';

// DOM ELEMENTS
const form = document.getElementById('signup-form');
const messageBox = document.getElementById('message-box');
const emailInput = document.getElementById('email');
const lookupBtn = document.getElementById('lookup-btn');

// UTILS
function sanitizeInput(str) {
    if (!str) return '';
    return str.toString().trim();
}

function displayMessage(message, type = 'info') {
    messageBox.textContent = message;
    messageBox.className = type; // info, success, error
}

function clearMessage() {
    messageBox.textContent = '';
    messageBox.className = '';
}

// ================================================================================================
// HANDLE FORM SUBMISSION
// ================================================================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const formData = new FormData(form);
    const name = sanitizeInput(formData.get('name'));
    const email = sanitizeInput(formData.get('email'));
    const phone = sanitizeInput(formData.get('phone'));
    const notes = sanitizeInput(formData.get('notes'));
    const slotIds = selectedSlots.map(s => s.id);

    if (!name || !email || slotIds.length === 0) {
        displayMessage('Name, email, and at least one slot are required.', 'error');
        return;
    }

    try {
        displayMessage('Submitting booking...', 'info');

        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, notes, slotIds })
        });

        const data = await res.json();

        if (data.ok) {
            displayMessage(data.message, 'success');
            form.reset();
            updateSelectedSlots([]); // Clear selected slots
            updateSummaryDisplay();   // Update the summary display
            window.loadSlots();       // Refresh slots
        } else {
            displayMessage(data.error || 'Booking failed.', 'error');
        }
    } catch (err) {
        displayMessage('Error submitting booking: ' + err.message, 'error');
        console.error(err);
    }
});

// ================================================================================================
// LOOKUP EXISTING BOOKINGS
// ================================================================================================
async function lookupBookingsByEmail(email) {
    try {
        clearMessage();
        const response = await fetch(`/api/signup?email=${encodeURIComponent(email)}`);
        const data = await response.json();

        if (!data.ok) {
            displayMessage(data.error || 'Failed to lookup bookings.', 'error');
            return;
        }

        if (data.bookings.length === 0) {
            displayMessage('No active bookings found for this email.', 'info');
        } else {
            const bookingsList = data.bookings.map(b => `${b.date} - ${b.slotLabel}`).join('\n');
            displayMessage('Your active bookings:\n' + bookingsList, 'success');
        }

    } catch (err) {
        displayMessage('Error looking up bookings: ' + err.message, 'error');
        console.error(err);
    }
}

// ================================================================================================
// EVENT LISTENERS
// ================================================================================================
lookupBtn?.addEventListener('click', () => {
    const email = sanitizeInput(emailInput.value);
    if (!email) {
        displayMessage('Please enter your email to lookup bookings.', 'error');
        return;
    }
    lookupBookingsByEmail(email);
});

// Expose functions globally for slot summary remove buttons
window.removeSlotFromSummary = removeSlotFromSummary;

// ================================================================================================
// INITIALIZE
// ================================================================================================
document.addEventListener('DOMContentLoaded', () => {
    window.loadSlots = window.loadSlots || (() => {}); // fallback if slots.js not loaded
    updateSummaryDisplay(); // Show summary if any pre-selected slots
});
