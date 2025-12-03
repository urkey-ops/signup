// ================================================================================================
// SIGNUP FRONT-END SCRIPT
// ================================================================================================

// DOM ELEMENTS
const form = document.getElementById('signup-form');
const slotsContainer = document.getElementById('slots-container');
const messageBox = document.getElementById('message-box');
const emailInput = document.getElementById('email');

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

function createSlotCheckbox(slot) {
    const div = document.createElement('div');
    div.className = 'slot-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'slotIds';
    checkbox.value = slot.id;
    checkbox.id = `slot-${slot.id}`;
    checkbox.disabled = slot.available <= 0;

    const label = document.createElement('label');
    label.htmlFor = `slot-${slot.id}`;
    label.textContent = `${slot.date} - ${slot.slotLabel} (${slot.available} spots left)`;

    div.appendChild(checkbox);
    div.appendChild(label);

    return div;
}

// ================================================================================================
// FETCH AVAILABLE SLOTS
// ================================================================================================
async function fetchSlots() {
    try {
        clearMessage();
        slotsContainer.innerHTML = '<p>Loading slots...</p>';

        const response = await fetch('/api/signup');
        const data = await response.json();

        if (!data.ok) {
            displayMessage('Failed to fetch slots: ' + data.error, 'error');
            slotsContainer.innerHTML = '';
            return;
        }

        slotsContainer.innerHTML = '';
        const dates = Object.keys(data.dates).sort();

        if (dates.length === 0) {
            slotsContainer.innerHTML = '<p>No available slots at the moment.</p>';
            return;
        }

        dates.forEach(date => {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'slot-date-group';

            const dateHeader = document.createElement('h3');
            dateHeader.textContent = date;
            dayDiv.appendChild(dateHeader);

            data.dates[date].forEach(slot => {
                dayDiv.appendChild(createSlotCheckbox(slot));
            });

            slotsContainer.appendChild(dayDiv);
        });

    } catch (err) {
        displayMessage('Error fetching slots: ' + err.message, 'error');
        slotsContainer.innerHTML = '';
        console.error(err);
    }
}

// ================================================================================================
// HANDLE FORM SUBMISSION
// ================================================================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    const formData = new FormData(form);
    const slotIds = formData.getAll('slotIds').map(id => parseInt(id));
    const name = sanitizeInput(formData.get('name'));
    const email = sanitizeInput(formData.get('email'));
    const phone = sanitizeInput(formData.get('phone'));
    const notes = sanitizeInput(formData.get('notes'));

    if (!name || !email || slotIds.length === 0) {
        displayMessage('Name, email, and at least one slot are required.', 'error');
        return;
    }

    try {
        displayMessage('Submitting booking...', 'info');

        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, notes, slotIds })
        });

        const data = await response.json();

        if (data.ok) {
            displayMessage(data.message, 'success');
            form.reset();
            fetchSlots(); // Refresh slots
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
document.getElementById('lookup-btn')?.addEventListener('click', () => {
    const email = sanitizeInput(emailInput.value);
    if (!email) {
        displayMessage('Please enter your email to lookup bookings.', 'error');
        return;
    }
    lookupBookingsByEmail(email);
});

// INITIALIZE
fetchSlots();
