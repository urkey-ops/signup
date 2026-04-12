// ================================================================================================
// MAIN ENTRY POINT
// ================================================================================================

import { API_URL, STATE } from './config.js';
import { login, logout, loadSlots, submitNewSlots, deleteSelectedSlots } from './api.js';
import {
    renderSlots,
    updateStats,
    createWeekendControls,
    updateDeleteButtonCount,
    selectAllSlots,
    clearAllDates
} from './ui.js';

// ================================================================================================
// INITIALIZATION
// ================================================================================================

async function initialize() {
    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');

    if (!loginSection || !adminSection) {
        console.error('Required admin root elements not found');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.ok) {
                loginSection.style.display = 'none';
                adminSection.style.display = 'block';
                STATE.loadedSlots = data.slots;
                renderSlots(STATE.loadedSlots);
                updateStats(STATE.loadedSlots);
                createWeekendControls();
                return;
            }
        }
    } catch (error) {
        console.log('Not authenticated, showing login screen');
    }

    loginSection.style.display = 'block';
    adminSection.style.display = 'none';
}

// ================================================================================================
// EXPOSE GLOBAL FUNCTIONS (for inline event handlers in HTML)
// ================================================================================================

window.login = login;
window.logout = logout;
window.loadSlots = loadSlots;
window.submitNewSlots = submitNewSlots;
window.deleteSelectedSlots = deleteSelectedSlots;
window.selectAllSlots = selectAllSlots;
window.updateDeleteButtonCount = updateDeleteButtonCount;
window.clearAllDates = clearAllDates;

// ================================================================================================
// START APPLICATION
// ================================================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
