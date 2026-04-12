// ================================================================================================
// API CALLS MODULE
// ================================================================================================

import { API_URL, STATE, DEFAULT_SLOTS } from './config.js';
import { displayMessage } from './utils.js';
import { renderSlots, updateStats, createWeekendControls, updateDeleteButtonCount } from './ui.js';

/**
 * Handle admin login
 */
export async function login() {
    const passwordInput = document.getElementById('adminPassword');
    const loginBtn = document.getElementById('loginBtn');
    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');

    if (!passwordInput || !loginSection || !adminSection) {
        console.error('Required login DOM elements not found');
        return;
    }

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
                password
            })
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            displayMessage('loginMsg', 'Login successful!', 'success');
            passwordInput.value = '';

            loginSection.style.display = 'none';
            adminSection.style.display = 'block';

            await loadSlots();
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
export async function logout() {
    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');

    if (!loginSection || !adminSection) {
        console.error('Required logout DOM elements not found');
        return;
    }

    if (!confirm('Are you sure you want to logout?')) {
        return;
    }

    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'logout' })
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    loginSection.style.display = 'block';
    adminSection.style.display = 'none';

    STATE.loadedSlots = [];
    STATE.selectedDates = [];

    displayMessage('loginMsg', 'Logged out successfully. Close your browser to clear the session completely.', 'info');
}

/**
 * Load all slots from backend
 */
export async function loadSlots() {
    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');

    if (!loginSection || !adminSection) {
        console.error('Required admin root elements not found');
        return;
    }

    displayMessage('addMsg', 'Loading slots...', 'info');

    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            credentials: 'include'
        });

        if (response.status === 401) {
            STATE.loadedSlots = [];
            STATE.selectedDates = [];
            displayMessage('loginMsg', 'Session expired. Please log in again.', 'error');
            loginSection.style.display = 'block';
            adminSection.style.display = 'none';
            return;
        }

        const data = await response.json();

        if (response.ok && data.ok) {
            STATE.loadedSlots = data.slots;
            renderSlots(STATE.loadedSlots);
            updateStats(STATE.loadedSlots);
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
export async function submitNewSlots() {
    const submitBtn = document.getElementById('submitBtn');
    const selectedDatesCount = document.getElementById('selectedDatesCount');

    if (STATE.selectedDates.length === 0) {
        displayMessage('addMsg', 'Please select at least one date.', 'warning');
        return;
    }

    const slots = [];
    let totalSlots = 0;

    DEFAULT_SLOTS.forEach((defaultSlot, index) => {
        const checkbox = document.getElementById(`slot-${index}`);
        const capacityInput = document.getElementById(`capacity-${index}`);

        if (checkbox && capacityInput && checkbox.checked) {
            const capacity = parseInt(capacityInput.value, 10);
            if (capacity > 0 && capacity <= 99) {
                slots.push({
                    label: defaultSlot.label,
                    capacity
                });
                totalSlots++;
            }
        }
    });

    if (slots.length === 0) {
        displayMessage('addMsg', 'Please select at least one time slot with valid capacity (1-99).', 'warning');
        return;
    }

    const newSlotsData = STATE.selectedDates.map(date => ({
        date,
        slots
    }));

    const totalCount = totalSlots * STATE.selectedDates.length;
    if (!confirm(`Create ${totalCount} slot${totalCount !== 1 ? 's' : ''} across ${STATE.selectedDates.length} date${STATE.selectedDates.length !== 1 ? 's' : ''}?`)) {
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
                newSlotsData
            })
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            STATE.selectedDates = [];
            if (selectedDatesCount) selectedDatesCount.textContent = '0';

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
export async function deleteSelectedSlots() {
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
                rowIds
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
