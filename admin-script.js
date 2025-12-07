// ================================================================================================
// ADMIN SCRIPT - CLEAN & UPDATED VERSION 2
// Synced with enhanced admin-style.css and admin.html v2
// ================================================================================================

// ================================================================================================
// CONFIGURATION
// ================================================================================================

const API_URL = '/api/admin';

const DEFAULT_SLOTS = [
    { label: "10AM - 12PM", capacity: 6 },
    { label: "12PM - 2PM", capacity: 6 },
    { label: "2PM - 4PM", capacity: 6 },
    { label: "4PM - 6PM", capacity: 6 },
];

let loadedSlots = [];
let selectedDates = [];

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

/**
 * Format Date object to MM/DD/YYYY string
 * @param {Date} date 
 * @returns {string}
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
 * Check if date is in the past
 * @param {string} dateStr - Format: MM/DD/YYYY
 * @returns {boolean}
 */
function isPastDate(dateStr) {
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
function displayMessage(msgId, message, type = 'success') {
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
function getNextSixtyDays() {
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
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Clear all selected dates
 */
function clearAllDates() {
    selectedDates = [];
    document.getElementById('selectedDatesCount').textContent = '0';
    
    // Remove selected class from all chips
    const chips = document.querySelectorAll('.date-chip.selected');
    chips.forEach(chip => chip.classList.remove('selected'));
    
    displayMessage('addMsg', 'All dates cleared.', 'info');
}

// ================================================================================================
// DATE SELECTOR RENDERING
// ================================================================================================

/**
 * Render interactive date chips
 */
function createWeekendControls() {
    const selector = document.getElementById('multiDateSelector');
    if (!selector) return;

    selector.innerHTML = '';
    const days = getNextSixtyDays();
    const existingDates = loadedSlots.map(s => s.date);
    
    days.forEach(dateObj => {
        const dateStr = formatDate(dateObj);
        const isPast = isPastDate(dateStr);
        const hasSlots = existingDates.includes(dateStr);
        const weekend = isWeekend(dateObj);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const monthName = dateObj.toLocaleDateString('en-US', { month: 'short' });
        const dayOfMonth = dateObj.getDate();
        
        const chip = document.createElement('div');
        
        // Build class list with clear visual states
        let chipClasses = 'date-chip';
        if (isPast) {
            chipClasses += ' past';
        } else if (hasSlots) {
            chipClasses += ' has-slots';
        } else if (weekend) {
            chipClasses += ' weekend-chip';
        }
        
        chip.className = chipClasses;
        chip.dataset.date = dateStr;
        
        // Add tooltip for unavailable dates
        if (hasSlots) {
            chip.title = `${dateStr} - Slots already exist`;
        } else if (isPast) {
            chip.title = `${dateStr} - Past date`;
        }
        
        chip.innerHTML = `
            <span class="date-month">${monthName}</span>
            <span class="date-day">${dayOfMonth}</span>
            <span class="date-weekday ${weekend ? 'weekend' : ''}">${dayName}</span>
        `;
        
        // Only allow selection for future dates without existing slots
        if (!isPast && !hasSlots) {
            chip.onclick = () => toggleDateSelection(dateStr, chip);
        }
        
        selector.appendChild(chip);
    });
    
    renderSlotCheckboxes();
}

/**
 * Render time slot checkboxes with capacity inputs
 */
function renderSlotCheckboxes() {
    const container = document.getElementById('slotCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    
    DEFAULT_SLOTS.forEach((slot, index) => {
        const div = document.createElement('div');
        div.className = 'form-group-inline';
        div.innerHTML = `
            <label class="form-label">
                <input type="checkbox" 
                       id="slot-${index}" 
                       checked 
                       aria-label="Enable ${slot.label} slot"> 
                <span>${slot.label}</span>
            </label>
            <input type="number" 
                   id="capacity-${index}" 
                   class="form-input-small" 
                   value="${slot.capacity}" 
                   min="1" 
                   max="99"
                   placeholder="Cap"
                   aria-label="Capacity for ${slot.label}">
        `;
        container.appendChild(div);
    });
}

/**
 * Toggle date selection
 * @param {string} dateStr 
 * @param {HTMLElement} chip 
 */
function toggleDateSelection(dateStr, chip) {
    if (!loadedSlots) {
        displayMessage('addMsg', 'Please wait for slots to load first.', 'warning');
        return;
    }
    
    const existingDates = loadedSlots.map(s => s.date);
    
    // Double-check: prevent selection if slots exist (shouldn't happen due to onclick removal, but safety check)
    if (existingDates.includes(dateStr)) {
        displayMessage('addMsg', `⚠️ Cannot select ${dateStr}. Slots already exist for this date.`, 'error');
        chip.classList.remove('selected');
        return;
    }

    const index = selectedDates.indexOf(dateStr);
    
    if (index === -1) {
        // Add to selection
        selectedDates.push(dateStr);
        chip.classList.add('selected');
    } else {
        // Remove from selection
        selectedDates.splice(index, 1);
        chip.classList.remove('selected');
    }
    
    document.getElementById('selectedDatesCount').textContent = selectedDates.length;
    
    // Clear message when selection changes
    const msgBox = document.getElementById('addMsg');
    if (msgBox && msgBox.classList.contains('error')) {
        msgBox.style.display = 'none';
    }
}

// ================================================================================================
// API CALLS
// ================================================================================================

/**
 * Handle admin login
 */
async function login() {
    const passwordInput = document.getElementById('adminPassword');
    const loginBtn = document.getElementById('loginBtn');
    const password = passwordInput.value.trim();
    
    if (!password) {
        displayMessage('loginMsg', 'Please enter a password.', 'error');
        return;
    }
    
    if (loginBtn) loginBtn.disabled = true;
    displayMessage('loginMsg', 'Logging in...', 'info');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                action: 'login',
                password: password 
            })
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            displayMessage('loginMsg', 'Login successful!', 'success');
            passwordInput.value = '';
            
            // Show admin section
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminSection').style.display = 'block';
            
            // Load data
            await loadSlots();
            createWeekendControls();
        } else {
            passwordInput.value = '';
            displayMessage('loginMsg', data.error || 'Login failed. Please check your password.', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        passwordInput.value = '';
        displayMessage('loginMsg', 'Network error. Please try again.', 'error');
    } finally {
        if (loginBtn) loginBtn.disabled = false;
    }
}

/**
 * Handle logout
 */
async function logout() {
    if (!confirm('Are you sure you want to logout?')) {
        return;
    }
    
    // Show login, hide admin
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminSection').style.display = 'none';
    
    // Clear state
    loadedSlots = [];
    selectedDates = [];
    
    displayMessage('loginMsg', 'Logged out successfully. Close your browser to clear the session completely.', 'info');
}

/**
 * Load all slots from backend
 */
async function loadSlots() {
    displayMessage('addMsg', 'Loading slots...', 'info');
    
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            credentials: 'include'
        });

        if (response.status === 401) {
            displayMessage('loginMsg', 'Session expired. Please log in again.', 'error');
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
            
            const msgBox = document.getElementById('addMsg');
            if (msgBox) msgBox.style.display = 'none';
        } else {
            displayMessage('addMsg', data.error || 'Failed to load slots.', 'error');
        }
    } catch (error) {
        console.error('Load slots error:', error);
        displayMessage('addMsg', 'Network error while loading slots.', 'error');
    }
}

/**
 * Submit new slots
 */
async function submitNewSlots() {
    const submitBtn = document.getElementById('submitBtn');
    
    if (selectedDates.length === 0) {
        displayMessage('addMsg', 'Please select at least one date.', 'warning');
        return;
    }
    
    const slots = [];
    let totalSlots = 0;
    
    // Gather enabled slots
    DEFAULT_SLOTS.forEach((defaultSlot, index) => {
        const checkbox = document.getElementById(`slot-${index}`);
        const capacityInput = document.getElementById(`capacity-${index}`);
        
        if (checkbox && checkbox.checked) {
            const capacity = parseInt(capacityInput.value, 10);
            if (capacity > 0 && capacity <= 99) {
                slots.push({
                    label: defaultSlot.label,
                    capacity: capacity
                });
                totalSlots++;
            }
        }
    });

    if (slots.length === 0) {
        displayMessage('addMsg', 'Please select at least one time slot with valid capacity (1-99).', 'warning');
        return;
    }
    
    // Create slots data
    const newSlotsData = selectedDates.map(date => ({
        date: date,
        slots: slots
    }));

    // Confirmation
    const totalCount = totalSlots * selectedDates.length;
    if (!confirm(`Create ${totalCount} slot${totalCount !== 1 ? 's' : ''} across ${selectedDates.length} date${selectedDates.length !== 1 ? 's' : ''}?`)) {
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    displayMessage('addMsg', `Creating ${totalCount} slots...`, 'info');
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                action: 'addSlots',
                newSlotsData: newSlotsData
            })
        });

        const data = await response.json();
        
        if (response.ok && data.ok) {
            // Clear selection
            selectedDates = [];
            document.getElementById('selectedDatesCount').textContent = '0';
            
            // Reload
            await loadSlots();
            
            let message = data.message || 'Slots created successfully!';
            if (data.details && data.details.length > 0) {
                message += ` (${data.details.join(', ')})`;
            }
            displayMessage('addMsg', message, 'success');
        } else {
            let errorMsg = data.error || 'Failed to create slots.';
            if (data.details && data.details.length > 0) {
                errorMsg += ` Details: ${data.details.join(', ')}`;
            }
            displayMessage('addMsg', errorMsg, 'error');
        }
    } catch (error) {
        console.error('Submit slots error:', error);
        displayMessage('addMsg', 'Network error during slot creation.', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

/**
 * Delete selected slots
 */
async function deleteSelectedSlots() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const selectedCheckboxes = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]:checked');
    const rowIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.rowId, 10));

    if (rowIds.length === 0) {
        displayMessage('addMsg', 'No slots selected for deletion.', 'warning');
        return;
    }

    if (!confirm(`Delete ${rowIds.length} slot${rowIds.length !== 1 ? 's' : ''}? This cannot be undone.`)) {
        return;
    }

    if (deleteBtn) deleteBtn.disabled = true;
    displayMessage('addMsg', `Deleting ${rowIds.length} slot${rowIds.length !== 1 ? 's' : ''}...`, 'info');

    try {
        const response = await fetch(API_URL, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                action: 'deleteSlots',
                rowIds: rowIds 
            })
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            await loadSlots();
            updateDeleteButtonCount();
            displayMessage('addMsg', data.message || 'Slots deleted successfully.', 'success');
        } else {
            let errorMsg = data.error || 'Failed to delete slots.';
            if (data.details && data.details.length > 0) {
                errorMsg += ` Details: ${data.details.join(', ')}`;
            }
            displayMessage('addMsg', errorMsg, 'error');
        }
    } catch (error) {
        console.error('Delete slots error:', error);
        displayMessage('addMsg', 'Network error during deletion.', 'error');
    } finally {
        if (deleteBtn) deleteBtn.disabled = false;
    }
}

/**
 * Toggle all slot checkboxes
 */
function selectAllSlots() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    const checkboxes = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]');
    
    if (checkboxes.length === 0) return;
    
    const isSelectAll = selectAllBtn.textContent.includes('Select All');
    
    checkboxes.forEach(cb => {
        cb.checked = isSelectAll;
    });

    updateDeleteButtonCount();
    selectAllBtn.textContent = isSelectAll ? '☐ Deselect All' : '☑️ Select All';
}

// ================================================================================================
// UI RENDERING
// ================================================================================================

/**
 * Render slots grouped by date
 * @param {Array} slots 
 */
function renderSlots(slots) {
    const displayContainer = document.getElementById('slotsDisplay');
    if (!displayContainer) return;
    
    displayContainer.innerHTML = '';
    
    if (slots.length === 0) {
        displayContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <div class="empty-state-title">No Slots Available</div>
                <p class="empty-state-description">Create your first slots using the form above.</p>
            </div>
        `;
        return;
    }
    
    // Group by date
    const groupedSlots = slots.reduce((acc, slot) => {
        (acc[slot.date] = acc[slot.date] || []).push(slot);
        return acc;
    }, {});

    // Sort dates
    const sortedDates = Object.keys(groupedSlots).sort((a, b) => {
        const [monthA, dayA, yearA] = a.split('/').map(Number);
        const [monthB, dayB, yearB] = b.split('/').map(Number);
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateA - dateB;
    });

    sortedDates.forEach(date => {
        const dateObj = new Date(date.split('/').reverse().join('-'));
        const dateStr = dateObj.toLocaleDateString('en-US', { 
            weekday: 'short',
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });
        const isPast = isPastDate(date);
        
        const dateGroup = document.createElement('div');
        dateGroup.className = `slot-date-group ${isPast ? 'past' : ''}`;
        
        const slotsHtml = groupedSlots[date].map(slot => {
            const isFull = slot.available <= 0;
            const capacityClass = isFull ? 'full' : '';
            
            return `
                <div class="slot-row">
                    <input type="checkbox" 
                           class="slot-row-checkbox" 
                           data-row-id="${slot.id}"
                           onchange="updateDeleteButtonCount()"
                           aria-label="Select ${slot.slotLabel} on ${dateStr}">
                    <div class="slot-info">
                        <span class="slot-label">${slot.slotLabel}</span>
                        <span class="slot-capacity ${capacityClass}">
                            ${slot.taken}/${slot.capacity} booked
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        const slotCount = groupedSlots[date].length;
        const bookedCount = groupedSlots[date].reduce((sum, s) => sum + s.taken, 0);
        
        dateGroup.innerHTML = `
            <div class="date-header">
                <span class="date-title">${dateStr}</span>
                <span class="date-badge">${slotCount} slot${slotCount !== 1 ? 's' : ''}, ${bookedCount} booked</span>
            </div>
            ${slotsHtml}
        `;
        
        displayContainer.appendChild(dateGroup);
    });
    
    updateDeleteButtonCount();
}

/**
 * Update delete button text and visibility
 */
function updateDeleteButtonCount() {
    const count = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]:checked').length;
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const deleteCountSpan = document.getElementById('deleteCount');
    
    if (deleteCountSpan) {
        deleteCountSpan.textContent = count;
    }
    
    if (deleteBtn) {
        deleteBtn.style.display = count > 0 ? 'block' : 'none';
    }
}

/**
 * Update statistics display
 * @param {Array} slots 
 */
function updateStats(slots) {
    const statsBar = document.getElementById('statsBar');
    
    if (!statsBar) return;
    
    if (slots.length === 0) {
        statsBar.style.display = 'none';
        return;
    }
    
    // Filter future slots only
    const futureSlots = slots.filter(slot => !isPastDate(slot.date));

    const totalDates = new Set(futureSlots.map(s => s.date)).size;
    const totalSlots = futureSlots.length;
    const totalBookings = futureSlots.reduce((sum, slot) => sum + slot.taken, 0);
    const totalCapacity = futureSlots.reduce((sum, slot) => sum + slot.capacity, 0);
    const totalAvailable = futureSlots.reduce((sum, slot) => sum + slot.available, 0);
    
    const utilizationRate = totalCapacity > 0 
        ? Math.round((totalBookings / totalCapacity) * 100) 
        : 0;

    document.getElementById('totalDates').textContent = totalDates;
    document.getElementById('totalSlots').textContent = totalSlots;
    document.getElementById('totalBookings').textContent = totalBookings;
    document.getElementById('totalAvailable').textContent = totalAvailable;
    document.getElementById('utilizationRate').textContent = `${utilizationRate}%`;
    
    statsBar.style.display = 'grid';
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================

// Expose functions globally
window.login = login;
window.logout = logout;
window.loadSlots = loadSlots;
window.submitNewSlots = submitNewSlots;
window.deleteSelectedSlots = deleteSelectedSlots;
window.selectAllSlots = selectAllSlots;
window.updateDeleteButtonCount = updateDeleteButtonCount;
window.clearAllDates = clearAllDates;

// Check authentication on page load
window.onload = async () => {
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.ok) {
                // Already authenticated
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('adminSection').style.display = 'block';
                loadedSlots = data.slots;
                renderSlots(loadedSlots);
                updateStats(loadedSlots);
                createWeekendControls();
                return;
            }
        }
    } catch (error) {
        console.log('Not authenticated, showing login screen');
    }
    
    // Show login
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminSection').style.display = 'none';
};
