// ================================================================================================
// SLOTS UI - DOM RENDERING & INTERACTIONS
// ================================================================================================

import { getSelectedSlots, CONFIG } from '../../config.js';
import { showMessage } from '../../utils.js';
import { sortSlotsByTime } from './slots-api.js';

// Module-level listener reference for cleanup
let currentSlotListener = null;

// ================================================================================================
// SKELETON UI (LOADING STATE)
// ================================================================================================

/**
 * Show skeleton loading UI while slots are being fetched
 */
export function showSkeletonUI() {
    const datesContainer = document.getElementById("datesContainer");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const loadingMsg = document.getElementById("loadingMsg");
    
    if (!datesContainer || !slotsDisplay || !loadingMsg) {
        console.error('Required DOM elements for skeleton UI not found');
        showMessage('Unable to display slots. Please refresh the page.', 'error');
        return;
    }
    
    loadingMsg.style.display = "none";
    slotsDisplay.style.display = "block";
    
    // Generate skeleton cards
    const skeletonHTML = Array(3).fill(0).map(() => `
        <div class="date-card card skeleton-card">
            <div class="skeleton-title"></div>
            <div class="slots-grid">
                ${Array(4).fill(0).map(() => `
                    <div class="slot skeleton-slot">
                        <div class="skeleton-text"></div>
                        <div class="skeleton-text-small"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
    
    datesContainer.innerHTML = skeletonHTML;
}

// ================================================================================================
// DATE CARD CREATION
// ================================================================================================

/**
 * Format date string with day of week
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @returns {string} Formatted date (e.g., "Mon, Jan 15")
 */
function formatDateWithDay(dateString) {
    const date = new Date(dateString); 
    const options = { weekday: 'short', month: 'short', day: 'numeric' }; 
    return date.toLocaleDateString('en-US', options); 
}

/**
 * Create a date card with slots
 * @param {string} date - Date string
 * @param {Array} slots - Array of slot objects
 * @returns {HTMLElement} Date card element
 */
export function createDateCard(date, slots) {
    const card = document.createElement('div');
    card.className = 'date-card card fade-in';
    
    // Date heading
    const title = document.createElement('h3');
    title.textContent = `📅 ${formatDateWithDay(date)}`;
    card.appendChild(title);
    
    // Slots grid
    const grid = document.createElement('div');
    grid.className = 'slots-grid';
    
    // Sort slots by time
    const sortedSlots = sortSlotsByTime(slots);
    
    sortedSlots.forEach(slot => {
        const slotDiv = createSlotElement(slot);
        grid.appendChild(slotDiv);
    });
    
    card.appendChild(grid);
    return card;
}

/**
 * Create a slot button element
 * @param {Object} slot - Slot data object
 * @returns {HTMLElement} Slot button element
 */
export function createSlotElement(slot) {
    const selectedSlots = getSelectedSlots();
    
    const div = document.createElement('div');
    const isSelected = selectedSlots.some(s => s.id === slot.id);
    
    div.className = `slot ${isSelected ? 'selected' : ''}`;
    div.id = `slot-btn-${slot.id}`;
    div.dataset.slotId = slot.id;
    div.dataset.date = slot.date || 'Unknown Date';
    div.dataset.label = slot.slotLabel || 'Unknown Time';
    div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    
    // Slot label
    const label = document.createElement('span');
    label.textContent = slot.slotLabel || 'Unknown Time';
    div.appendChild(label);
    
    div.appendChild(document.createElement('br'));
    
    // Availability count
    const small = document.createElement('small');
    const available = slot.available ?? 0;
    small.textContent = `(${available} left)`;
    
    // Color code based on availability
    if (available === 0) {
        small.style.color = '#ef4444';
        div.classList.add('disabled');
        div.setAttribute('aria-disabled', 'true');
    } else if (available <= 2) {
        small.style.color = '#f59e0b';
    } else {
        small.style.color = '#10b981';
    }
    
    div.appendChild(small);
    
    return div;
}

// ================================================================================================
// SLOT RENDERING
// ================================================================================================

/**
 * Render slots in the DOM
 * @param {Object} groupedSlots - Slots grouped by date
 * @param {Function} onSlotClick - Callback for slot click
 */
export function renderSlots(groupedSlots, onSlotClick) {
    const datesContainer = document.getElementById("datesContainer");
    if (!datesContainer) {
        console.error('datesContainer not found');
        return;
    }
    
    // Clean up previous listener
    if (currentSlotListener) {
        datesContainer.removeEventListener('click', currentSlotListener);
        currentSlotListener = null;
    }
    
    // Clear container
    datesContainer.innerHTML = '';
    
    // Check if there are any dates
    const dates = Object.keys(groupedSlots);
    if (dates.length === 0) {
        console.log('No slots to render');
        return;
    }
    
    // Create document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Sort dates chronologically
    const sortedDates = dates.sort((a, b) => new Date(a) - new Date(b));
    
    sortedDates.forEach(date => {
        const dateSlots = groupedSlots[date];
        const availableSlots = dateSlots.filter(slot => slot.available > 0);
        
        if (availableSlots.length > 0) {
            const card = createDateCard(date, availableSlots);
            fragment.appendChild(card);
        }
    });
    
    datesContainer.appendChild(fragment);
    
    // Setup click delegation for better performance
    currentSlotListener = (e) => {
        const slot = e.target.closest('.slot');
        if (!slot || slot.classList.contains('disabled')) return;
        
        const slotId = parseInt(slot.dataset.slotId);
        const date = slot.dataset.date;
        const label = slot.dataset.label;
        
        if (slotId && date && label && typeof onSlotClick === 'function') {
            onSlotClick(date, label, slotId, slot);
        }
    };
    
    datesContainer.addEventListener('click', currentSlotListener);
    
    // Keyboard accessibility
    datesContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const slot = e.target.closest('.slot');
            if (slot && !slot.classList.contains('disabled')) {
                e.preventDefault();
                slot.click();
            }
        }
    });
    
    console.log(`✅ Rendered ${sortedDates.length} date cards`);
}

// ================================================================================================
// UI STATE MANAGEMENT
// ================================================================================================

/**
 * Show/hide loading message and slots display
 * @param {boolean} showSlots - True to show slots, false to show loading
 */
export function toggleDisplay(showSlots) {
    const loadingMsg = document.getElementById("loadingMsg");
    const slotsDisplay = document.getElementById("slotsDisplay");
    
    if (loadingMsg) {
        loadingMsg.style.display = showSlots ? "none" : "block";
    }
    
    if (slotsDisplay) {
        slotsDisplay.style.display = showSlots ? "block" : "none";
    }
}

/**
 * Reset all slot selection UI states
 */
export function resetSlotSelectionUI() {
    const slotButtons = document.querySelectorAll('.slot.selected');
    slotButtons.forEach(slot => {
        slot.classList.remove('selected');
        slot.setAttribute('aria-pressed', 'false');
    });
    console.log('✅ Slot UI selection reset');
}

/**
 * Update a single slot's UI state
 * @param {number} slotId - Slot ID
 * @param {boolean} selected - True if selected
 */
export function updateSlotUI(slotId, selected) {
    const slotElement = document.getElementById(`slot-btn-${slotId}`);
    if (!slotElement) return;
    
    if (selected) {
        slotElement.classList.add('selected');
        slotElement.setAttribute('aria-pressed', 'true');
    } else {
        slotElement.classList.remove('selected');
        slotElement.setAttribute('aria-pressed', 'false');
    }
}

// ================================================================================================
// EMPTY & ERROR STATES
// ================================================================================================

/**
 * Show "no slots available" message
 */
export function showNoSlotsMessage() {
    const datesContainer = document.getElementById("datesContainer");
    if (!datesContainer) return;
    
    datesContainer.innerHTML = '';
    
    const container = document.createElement('div');
    container.className = 'empty-state';
    
    const icon = document.createElement('div');
    icon.style.fontSize = '3rem';
    icon.style.marginBottom = '16px';
    icon.textContent = '📅';
    container.appendChild(icon);
    
    const heading = document.createElement('h3');
    heading.textContent = 'No available slots at this time';
    container.appendChild(heading);
    
    const message = document.createElement('p');
    message.textContent = 'Please check back later for new availability!';
    container.appendChild(message);
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn secondary-btn';
    refreshBtn.style.maxWidth = '200px';
    refreshBtn.style.margin = '20px auto 0';
    refreshBtn.textContent = '🔄 Refresh';
    refreshBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('reloadSlots'));
    });
    container.appendChild(refreshBtn);
    
    datesContainer.appendChild(container);
    
    toggleDisplay(true);
}

/**
 * Show error message
 * @param {string} errorMessage - Error message to display
 */
export function showErrorMessage(errorMessage) {
    const loadingMsg = document.getElementById("loadingMsg");
    const datesContainer = document.getElementById("datesContainer");
    
    if (!loadingMsg || !datesContainer) return;
    
    datesContainer.innerHTML = '';
    loadingMsg.innerHTML = ''; 
    
    const errorText = document.createElement('p');
    errorText.style.color = '#dc2626';
    errorText.style.marginBottom = '15px';
    errorText.textContent = `⚠️ ${errorMessage}`;
    loadingMsg.appendChild(errorText);
    
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn secondary-btn';
    retryBtn.style.maxWidth = '200px';
    retryBtn.style.margin = '0 auto';
    retryBtn.textContent = '🔄 Retry';
    retryBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('reloadSlots'));
    });
    loadingMsg.appendChild(retryBtn);
    
    loadingMsg.style.display = "block";
    
    const slotsDisplay = document.getElementById("slotsDisplay");
    if (slotsDisplay) slotsDisplay.style.display = "none";
}

/**
 * Cleanup slot listeners (called on module unload)
 */
export function cleanupSlotListeners() {
    const datesContainer = document.getElementById("datesContainer");
    if (datesContainer && currentSlotListener) {
        datesContainer.removeEventListener('click', currentSlotListener);
        currentSlotListener = null;
        console.log('🧹 Slot listeners cleaned up');
    }
}
