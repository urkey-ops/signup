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

/**
 * Check authentication on page load
 */
async function initialize() {
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
    
    // Show login
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminSection').style.display = 'none';
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

window.onload = initialize;
