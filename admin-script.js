// ================================================================================================
// CONFIGURATION
// ================================================================================================

// API endpoint should match the Vercel function path
const API_URL = '/api/admin'; 

// NOTE: The secret ADMIN_PASSWORD_MATCH constant has been removed from the client-side 
// to prevent it from being exposed in the browser's source code. 
// All authentication now relies only on the secure backend check against the Vercel environment variable.

// Default slot times and capacities
const DEFAULT_SLOTS = [
    { label: "10AM - 12PM", capacity: 6 },
    { label: "12PM - 2PM", capacity: 6 },
    { label: "2PM - 4PM", capacity: 6 },
    { label: "4PM - 6PM", capacity: 6 },
];

// Cache to store the currently loaded slots
let loadedSlots = [];
// Array to hold the dates selected by the user for creation
let selectedDates = []; 

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

/**
 * Utility to format a Date object into 'MM/DD/YYYY' string.
 * @param {Date} date 
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [month, day, year].join('/');
}

/**
 * Checks if a given date string (MM/DD/YYYY) is in the past (before today).
 * @param {string} dateStr 
 * @returns {boolean}
 */
function isPastDate(dateStr) {
    const today = new Date();
    // Set time to start of day for accurate comparison
    today.setHours(0, 0, 0, 0); 
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0); 
    return targetDate < today;
}

/**
 * Displays a message in a specified message box.
 * @param {string} msgId The ID of the HTML element to display the message in.
 * @param {string} message The message content.
 * @param {boolean} isError If true, styles the message as an error.
 */
function displayMessage(msgId, message, isError = false) {
    const msgBox = document.getElementById(msgId);
    if (!msgBox) return;
    
    msgBox.textContent = message;
    msgBox.style.display = 'block';
    msgBox.style.backgroundColor = isError ? '#fee2e2' : '#d1fae5';
    msgBox.style.color = isError ? '#b91c1c' : '#065f46';

    // Clear message after 5 seconds unless it's a critical login/error message
    if (!isError) {
        setTimeout(() => {
            msgBox.style.display = 'none';
        }, 5000);
    }
}

/**
 * Generates an array of the next 60 consecutive days for the multi-date selector.
 * @returns {Array<Date>}
 */
function getNextSixtyDays() {
    const days = [];
    let date = new Date();
    
    for (let i = 0; i < 60; i++) {
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + i);
        days.push(nextDate);
    }
    return days;
}

/**
 * Renders the interactive date chips for slot creation.
 */
function createWeekendControls() {
    const selector = document.getElementById('multiDateSelector');
    if (!selector) return;

    selector.innerHTML = '';
    const days = getNextSixtyDays();
    
    days.forEach(dateObj => {
        const dateStr = formatDate(dateObj);
        const isPast = isPastDate(dateStr);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const monthName = dateObj.toLocaleDateString('en-US', { month: 'short' });
        const dayOfMonth = dateObj.getDate();
        
        const chip = document.createElement('div');
        chip.className = `date-chip ${isPast ? 'past' : ''}`;
        chip.dataset.date = dateStr;
        chip.innerHTML = `
            <span class="date-month">${monthName}</span>
            <span class="date-day">${dayOfMonth}</span>
            <span class="date-weekday">${dayName}</span>
        `;
        
        if (!isPast) {
            chip.onclick = () => toggleDateSelection(dateStr, chip);
        }
        
        selector.appendChild(chip);
    });
    
    // Initial render of time slot checkboxes
    renderSlotCheckboxes();
}

/**
 * Renders the static time slot and capacity inputs.
 */
function renderSlotCheckboxes() {
    const container = document.getElementById('slotCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    
    DEFAULT_SLOTS.forEach((slot, index) => {
        const div = document.createElement('div');
        div.className = 'form-group-inline'; // Assuming this style is defined in style.css or your <style> block
        div.innerHTML = `
            <label class="form-label">
                <input type="checkbox" id="slot-${index}" checked> 
                ${slot.label}
            </label>
            <input type="number" 
                   id="capacity-${index}" 
                   class="form-input-small" 
                   value="${slot.capacity}" 
                   min="1" 
                   placeholder="Capacity">
        `;
        container.appendChild(div);
    });
}

/**
 * Adds or removes a date from the selection array and updates the UI.
 * @param {string} dateStr The date to toggle (MM/DD/YYYY).
 * @param {HTMLElement} chip The date chip element.
 */
function toggleDateSelection(dateStr, chip) {
    const index = selectedDates.indexOf(dateStr);
    const existingDates = loadedSlots.map(s => s.date);
    
    // Check if any slot already exists for this date
    if (existingDates.includes(dateStr)) {
        displayMessage('addMsg', `Cannot select ${dateStr}. Slots already exist for this date.`, true);
        chip.classList.remove('selected');
        return;
    }

    if (index === -1) {
        selectedDates.push(dateStr);
        chip.classList.add('selected');
    } else {
        selectedDates.splice(index, 1);
        chip.classList.remove('selected');
    }
    
    document.getElementById('selectedDatesCount').textContent = selectedDates.length;
    // Clear the message box when selection changes
    document.getElementById('addMsg').style.display = 'none'; 
}


// ================================================================================================
// API CALLS AND MAIN LOGIC
// ================================================================================================

/**
 * Handles the admin login process using the password input.
 */
async function login() {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput.value;
    displayMessage('loginMsg', 'Logging in...', false);
    
    // REMOVED CLIENT-SIDE PASSWORD CHECK. 
    // All validation is now handled securely on the Vercel backend.

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                action: 'login',
                password: password 
            })
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            displayMessage('loginMsg', 'Login successful! Redirecting...', false);
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminSection').style.display = 'block';
            await loadSlots(); // Load data after successful login
            createWeekendControls(); // Initialize date selector
        } else {
            // The password failure response comes from the server
            displayMessage('loginMsg', data.error || 'Login failed due to server error.', true);
        }
    } catch (error) {
        console.error('Login error:', error);
        displayMessage('loginMsg', 'Network or server error during login.', true);
    }
}

/**
 * Loads all existing slots from the backend.
 */
async function loadSlots() {
    displayMessage('addMsg', 'Loading slots...', false);
    document.getElementById('statsBar').style.display = 'none';
    
    try {
        const response = await fetch(API_URL, {
            method: 'GET'
            // The browser automatically sends the simple 'admin_token' cookie
        });

        if (response.status === 401) {
             // Session expired or unauthenticated
            displayMessage('loginMsg', 'Session expired. Please log in again.', true);
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('adminSection').style.display = 'none';
            return;
        }

        const data = await response.json();
        
        if (response.ok && data.ok) {
            loadedSlots = data.slots;
            renderSlots(loadedSlots);
            updateStats(loadedSlots);
            createWeekendControls(); 
            displayMessage('addMsg', `Successfully loaded ${loadedSlots.length} slot entries.`, false);
        } else {
            displayMessage('addMsg', data.error || 'Failed to load slots.', true);
        }
    } catch (error) {
        console.error('Load slots error:', error);
        displayMessage('addMsg', 'Network error while loading slots.', true);
    }
}

/**
 * Submits the newly selected dates and time slots for batch creation.
 */
async function submitNewSlots() {
    if (selectedDates.length === 0) {
        displayMessage('addMsg', 'Please select at least one date.', true);
        return;
    }
    
    const newSlotsData = [];
    const slots = [];
    let totalSlots = 0;
    
    // 1. Gather configured slots
    DEFAULT_SLOTS.forEach((defaultSlot, index) => {
        const checkbox = document.getElementById(`slot-${index}`);
        const capacityInput = document.getElementById(`capacity-${index}`);
        
        if (checkbox && checkbox.checked) {
            const capacity = parseInt(capacityInput.value, 10);
            if (capacity > 0) {
                slots.push({
                    label: defaultSlot.label,
                    capacity: capacity
                });
                totalSlots++;
            }
        }
    });

    if (slots.length === 0) {
        displayMessage('addMsg', 'Please select at least one time slot with capacity > 0.', true);
        return;
    }
    
    // 2. Map slots to selected dates
    selectedDates.forEach(date => {
        newSlotsData.push({
            date: date,
            slots: slots
        });
    });

    // Confirmation
    if (!confirm(`Are you sure you want to add ${totalSlots * selectedDates.length} slots across ${selectedDates.length} dates?`)) {
        return;
    }

    displayMessage('addMsg', `Adding ${newSlotsData.length} entries...`, false);
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                action: 'addSlots',
                newSlotsData: newSlotsData
            })
        });

        const data = await response.json();
        
        if (response.ok && data.ok) {
            // Clear selection and refresh list on success
            selectedDates = [];
            document.getElementById('selectedDatesCount').textContent = '0';
            
            // Re-render the controls to reset chips
            await loadSlots(); 
            
            let message = data.message;
            if (data.details && data.details.length > 0) {
                message += ` (${data.details.join(', ')})`;
            }
            displayMessage('addMsg', message, false);
        } else {
            let errorMsg = data.error || 'Failed to add slots.';
            if (data.details && data.details.length > 0) {
                errorMsg += ` ${data.details.join(', ')}`;
            }
            displayMessage('addMsg', errorMsg, true);
        }
    } catch (error) {
        console.error('Submit slots error:', error);
        displayMessage('addMsg', 'Network error during slot creation.', true);
    }
}

/**
 * Handles batch deletion of selected slots.
 */
async function deleteSelectedSlots() {
    const selectedCheckboxes = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]:checked');
    const rowIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.rowId, 10));

    if (rowIds.length === 0) {
        displayMessage('addMsg', 'No slots selected for deletion.', true);
        return;
    }

    if (!confirm(`Are you sure you want to delete ${rowIds.length} slot(s)? This action is irreversible.`)) {
        return;
    }

    displayMessage('addMsg', `Deleting ${rowIds.length} slots...`, false);

    try {
        const response = await fetch(API_URL, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                action: 'deleteSlots',
                rowIds: rowIds 
            })
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            await loadSlots(); // Reload data to show changes
            updateDeleteButtonCount(); // Update the button count immediately
            displayMessage('addMsg', data.message, false);
        } else {
            displayMessage('addMsg', data.error || 'Failed to delete slots.', true);
        }
    } catch (error) {
        console.error('Delete slots error:', error);
        displayMessage('addMsg', 'Network error during slot deletion.', true);
    }
}

/**
 * Toggles all slot checkboxes.
 */
function selectAllSlots() {
    const isChecked = document.getElementById('selectAllBtn').textContent.includes('Deselect');
    const checkboxes = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]');
    
    checkboxes.forEach(cb => {
        cb.checked = !isChecked;
    });

    updateDeleteButtonCount();
    document.getElementById('selectAllBtn').textContent = isChecked ? '☑️ Select All' : '☐ Deselect All';
}


// ================================================================================================
// UI RENDERING AND STATS
// ================================================================================================

/**
 * Renders the loaded slots into the admin management section.
 * @param {Array<object>} slots The array of slot objects.
 */
function renderSlots(slots) {
    const displayContainer = document.getElementById('slotsDisplay');
    if (!displayContainer) return;
    
    displayContainer.innerHTML = '';
    
    // Group slots by date
    const groupedSlots = slots.reduce((acc, slot) => {
        (acc[slot.date] = acc[slot.date] || []).push(slot);
        return acc;
    }, {});

    for (const date in groupedSlots) {
        const dateObj = new Date(date);
        const dateStr = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const isPast = isPastDate(date);
        
        const dateGroup = document.createElement('div');
        dateGroup.className = `slot-date-group ${isPast ? 'past' : ''}`;
        
        const slotsHtml = groupedSlots[date].map(slot => {
            const isFull = slot.available <= 0;
            return `
                <div class="slot-row" data-row-id="${slot.id}">
                    <input type="checkbox" 
                           class="slot-row-checkbox" 
                           data-row-id="${slot.id}"
                           onchange="updateDeleteButtonCount()">
                    <div class="slot-info">
                        <span class="slot-label">${slot.slotLabel}</span>
                        <span class="slot-capacity ${isFull ? 'full' : ''}">
                            Booked: ${slot.taken} / Capacity: ${slot.capacity} 
                            (${slot.available} available)
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        dateGroup.innerHTML = `
            <div class="date-header">
                <span class="date-title">${dateStr}</span>
            </div>
            ${slotsHtml}
        `;
        
        displayContainer.appendChild(dateGroup);
    }
    
    updateDeleteButtonCount(); // Initial update after render
}

/**
 * Updates the text and visibility of the delete button based on selection count.
 */
function updateDeleteButtonCount() {
    const count = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]:checked').length;
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    
    if (deleteBtn) {
        deleteBtn.textContent = `🗑️ Delete Selected (${count})`;
        deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

/**
 * Calculates and updates the statistics bar.
 * @param {Array<object>} slots 
 */
function updateStats(slots) {
    if (slots.length === 0) {
        document.getElementById('statsBar').style.display = 'none';
        return;
    }
    
    const futureSlots = slots.filter(slot => !isPastDate(slot.date));

    const totalDates = new Set(futureSlots.map(s => s.date)).size;
    const totalSlots = futureSlots.length;
    const totalBookings = futureSlots.reduce((sum, slot) => sum + slot.taken, 0);
    const totalAvailable = futureSlots.reduce((sum, slot) => sum + slot.available, 0);

    document.getElementById('totalDates').textContent = totalDates;
    document.getElementById('totalSlots').textContent = totalSlots;
    document.getElementById('totalBookings').textContent = totalBookings;
    document.getElementById('totalAvailable').textContent = totalAvailable;
    document.getElementById('statsBar').style.display = 'flex';
}

// ================================================================================================
// INITIALIZATION AND EXPOSURE
// ================================================================================================

// Expose functions globally so they can be called by inline HTML attributes (onclick)
window.login = login;
window.loadSlots = loadSlots;
window.submitNewSlots = submitNewSlots;
window.deleteSelectedSlots = deleteSelectedSlots;
window.selectAllSlots = selectAllSlots;
window.updateDeleteButtonCount = updateDeleteButtonCount;

// Initial check to see if the user is already authenticated (e.g., cookie still valid)
window.onload = async () => {
    // Attempt to load slots to test the session cookie status
    await loadSlots(); 
    if (document.getElementById('adminSection').style.display === 'block') {
        createWeekendControls();
    }
};
