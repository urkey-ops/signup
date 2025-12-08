// ================================================================================================
// SLOTS.JS (BUG-FREE VERSION)
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    getSelectedSlots,
    API_CACHE, 
    updateSelectedSlots,
    normalizePhone,
    invalidateCache,
    isCacheValid,
    getCachedData,
    updateCache
} from './config.js';
import { 
    sanitizeHTML, 
    showMessage, 
    getErrorMessage, 
    parseTimeForSorting 
} from './utils.js';
import { goToSignupForm } from './signup-frontend.js';

// ================================================================================================
// LOADING STATE MANAGEMENT
// ================================================================================================
let isLoadingSlots = false;
let currentSlotListener = null; // Module-level listener reference for cleanup

// ================================================================================================
// INLINE STYLES FOR SKELETON UI
// ================================================================================================
(function() {
    if (document.getElementById('slots-skeleton-style')) return;
    
    const style = document.createElement('style');
    style.id = 'slots-skeleton-style';
    style.textContent = `
        @keyframes shimmer {
            0% { background-position: -468px 0; }
            100% { background-position: 468px 0; }
        }
        .skeleton-card { 
            background: #f8f8f8; 
            border: 1px solid #e0e0e0; 
            border-radius: 12px; 
            padding: 24px; 
            margin-bottom: 24px; 
            animation: fadeIn 0.3s ease; 
        }
        .skeleton-title { 
            height: 24px; 
            width: 150px; 
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); 
            background-size: 200% 100%; 
            animation: shimmer 1.5s infinite; 
            border-radius: 4px; 
            margin-bottom: 16px; 
        }
        .skeleton-slot { 
            background: linear-gradient(90deg, #f8f8f8 25%, #f0f0f0 50%, #f8f8f8 75%); 
            background-size: 200% 100%; 
            animation: shimmer 1.5s infinite; 
            border: 1px solid #e0e0e0; 
            pointer-events: none; 
            min-height: 64px; 
            border-radius: 8px; 
            padding: 16px; 
        }
        .skeleton-text { 
            height: 16px; 
            background: #e0e0e0; 
            border-radius: 4px; 
            margin: 8px auto; 
            width: 80%; 
        }
        .skeleton-text-small { 
            height: 12px; 
            background: #e8e8e8; 
            border-radius: 4px; 
            margin: 4px auto; 
            width: 50%; 
        }
        .fade-in { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { 
            from { opacity: 0; transform: translateY(20px); } 
            to { opacity: 1; transform: translateY(0); } 
        }
        @keyframes slideOut { 
            0% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.8) translateX(20px); }
        }
        .slot-chip.removing {
            animation: slideOut 0.3s ease-out forwards;
        }
    `;
    document.head.appendChild(style);
})();

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================
function formatDateWithDay(dateString) {
    const date = new Date(dateString); 
    const options = { weekday: 'short', month: 'short', day: 'numeric' }; 
    return date.toLocaleDateString('en-US', options); 
}

// ✅ Reset all slot UI selection states (fixes "Book Another Slot" preselection)
export function resetSlotSelectionUI() {
    const slotButtons = document.querySelectorAll('.slot.selected');
    slotButtons.forEach(slot => {
        slot.classList.remove('selected');
        slot.setAttribute('aria-pressed', 'false');
    });
    console.log('✅ Slot UI selection reset');
}

// ✅ Proper event listener management with module-level reference
let floatingButtonListener = null;

function updateFloatingButton() {
    const btnContainer = document.getElementById("floatingSignupBtnContainer");
    const btn = document.getElementById("floatingSignupBtn");
    
    if (!btnContainer || !btn) {
        console.warn('Floating button elements not found');
        return;
    }
    
    const selectedSlots = getSelectedSlots();
    const count = selectedSlots.length;
    
    if (count > 0) {
        btnContainer.style.display = "block";
        btn.textContent = `Continue to Sign Up (${count} Slot${count > 1 ? 's' : ''} Selected)`;
        
        // Clean up previous listener
        if (floatingButtonListener) {
            btn.removeEventListener('click', floatingButtonListener);
        }
        
        // Create new listener
        floatingButtonListener = (e) => {
            e.preventDefault();
            goToSignupForm();
            window.dispatchEvent(new CustomEvent('showSignupForm'));
        };
        
        btn.addEventListener('click', floatingButtonListener);
    } else {
        btnContainer.style.display = "none";
        if (floatingButtonListener) {
            btn.removeEventListener('click', floatingButtonListener);
            floatingButtonListener = null;
        }
    }
}

// ================================================================================================
// SLOT SELECTION
// ================================================================================================
export function toggleSlot(date, slotLabel, rowId, element) {
    const selectedSlots = getSelectedSlots();
    const existingIndex = selectedSlots.findIndex(slot => slot.id === rowId);
    
    if (existingIndex > -1) {
        const newSlots = selectedSlots.filter(slot => slot.id !== rowId);
        updateSelectedSlots(newSlots);
        if (element) {
            element.classList.remove("selected");
            element.setAttribute('aria-pressed', 'false');
        }
    } else {
        if (selectedSlots.length >= CONFIG.MAX_SLOTS_PER_BOOKING) {
            showMessage(`You can only select up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots at a time. Please complete your current booking first.`, 'warning');
            return;
        }
        const newSlots = [...selectedSlots, { id: rowId, date: date, label: slotLabel }];
        updateSelectedSlots(newSlots);
        if (element) {
            element.classList.add("selected");
            element.setAttribute('aria-pressed', 'true');
        }
    }
    
    updateFloatingButton();
}

// ================================================================================================
// SKELETON UI
// ================================================================================================
function showSkeletonUI() {
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
// LOAD SLOTS
// ================================================================================================
export async function loadSlots() {
    if (isLoadingSlots) {
        console.log('⚠️ Already loading slots, skipping duplicate request');
        return;
    }

    // Set flag immediately to prevent race condition
    isLoadingSlots = true;

    const loadingMsg = document.getElementById("loadingMsg");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const signupSection = document.getElementById("signupSection");
    
    if (!loadingMsg || !slotsDisplay) {
        console.error('Required DOM elements for slots loading not found');
        isLoadingSlots = false;
        return;
    }
    
    showSkeletonUI();
    if (signupSection) signupSection.style.display = "none";

    // Check cache using helper
    const cachedData = getCachedData();
    if (cachedData) {
        console.log('✅ Using client cache');
        renderSlotsData(cachedData);
        isLoadingSlots = false;
        return;
    }

    try {
        const startTime = performance.now();
        const res = await fetch(API_URL);
        const fetchTime = performance.now() - startTime;
        console.log(`⏱️ API fetch took ${fetchTime.toFixed(0)}ms`);
        
        if (!res.ok) {
            handleLoadError(res.status);
            return;
        }

        const data = await res.json();
        
        if (!data.ok) {
            handleLoadError(null, data.error || 'Failed to load slots');
            return;
        }

        // Use cache helper instead of manual update
        updateCache(data);
        renderSlotsData(data);

    } catch (err) {
        handleLoadError(null, err.message);
        console.error("Load Slots Error:", err);
    } finally {
        isLoadingSlots = false;
    }
}

// ================================================================================================
// RENDER SLOTS DATA
// ================================================================================================
function renderSlotsData(data) {
    const datesContainer = document.getElementById("datesContainer");
    if (!datesContainer) {
        console.error('datesContainer not found');
        return;
    }
    
    const groupedSlotsByDate = data.dates || {};
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const futureDates = Object.keys(groupedSlotsByDate)
        .filter(dateStr => new Date(dateStr) >= today)
        .sort((a, b) => new Date(a) - new Date(b));
    
    if (futureDates.length === 0) {
        showNoSlotsMessage();
        return;
    }
    
    // ✅ Clean up previous listener using module-level reference
    if (currentSlotListener) {
        datesContainer.removeEventListener('click', currentSlotListener);
        currentSlotListener = null;
    }
    
    datesContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    futureDates.forEach(date => {
        const dateSlots = groupedSlotsByDate[date];
        const availableSlots = dateSlots
            .filter(slot => slot.available > 0)
            .sort((a, b) => parseTimeForSorting(a.slotLabel) - parseTimeForSorting(b.slotLabel));
        
        if (availableSlots.length > 0) {
            const card = createDateCard(date, availableSlots);
            fragment.appendChild(card);
        }
    });
    
    datesContainer.appendChild(fragment);
    
    // ✅ Add click delegation with module-level reference
    currentSlotListener = (e) => {
        const slot = e.target.closest('.slot');
        if (!slot || slot.classList.contains('disabled')) return;
        
        const slotId = parseInt(slot.dataset.slotId);
        const date = slot.dataset.date;
        const label = slot.dataset.label;
        
        if (slotId && date && label) {
            toggleSlot(date, label, slotId, slot);
        }
    };
    
    datesContainer.addEventListener('click', currentSlotListener);
    
    const loadingMsgEl = document.getElementById("loadingMsg");
    const slotsDisplayEl = document.getElementById("slotsDisplay");
    if (loadingMsgEl) loadingMsgEl.style.display = "none";
    if (slotsDisplayEl) slotsDisplayEl.style.display = "block";
    
    updateFloatingButton();
}

// ================================================================================================
// DOM CREATION HELPERS WITH VALIDATION
// ================================================================================================
function createDateCard(date, slots) {
    const card = document.createElement('div');
    card.className = 'date-card card fade-in';
    
    const title = document.createElement('h3');
    title.textContent = `📅 ${formatDateWithDay(date)}`;
    card.appendChild(title);
    
    const grid = document.createElement('div');
    grid.className = 'slots-grid';
    
    slots.forEach(slot => {
        const slotDiv = createSlotElement(slot);
        grid.appendChild(slotDiv);
    });
    
    card.appendChild(grid);
    return card;
}

function createSlotElement(slot) {
    const selectedSlots = getSelectedSlots();
    
    const div = document.createElement('div');
    const isSelected = selectedSlots.some(s => s.id === slot.id);
    div.className = `slot ${isSelected ? 'selected' : ''}`;
    div.id = `slot-btn-${slot.id}`;
    div.dataset.slotId = slot.id;
    div.dataset.date = slot.date || 'Unknown Date';
    div.dataset.label = slot.slotLabel || 'Unknown Time';
    div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    
    const label = document.createElement('span');
    // ✅ Validate slot data with fallbacks
    label.textContent = slot.slotLabel || 'Unknown Time';
    div.appendChild(label);
    
    div.appendChild(document.createElement('br'));
    
    const small = document.createElement('small');
    // ✅ Use nullish coalescing for available count
    small.textContent = `(${slot.available ?? 0} left)`;
    div.appendChild(small);
    
    return div;
}

// ================================================================================================
// ERROR AND EMPTY STATE HANDLERS
// ================================================================================================
function showNoSlotsMessage() {
    const datesContainer = document.getElementById("datesContainer");
    if (!datesContainer) return;
    
    datesContainer.innerHTML = '';
    
    const container = document.createElement('div');
    container.style.textAlign = 'center';
    container.style.padding = '40px 20px';
    
    const message = document.createElement('p');
    message.style.fontSize = '1.1rem';
    message.style.color = '#64748b';
    message.style.marginBottom = '20px';
    message.textContent = '📅 No available slots at this time.';
    container.appendChild(message);
    
    const subMessage = document.createElement('p');
    subMessage.style.color = '#94a3b8';
    subMessage.textContent = 'Please check back later!';
    container.appendChild(subMessage);
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn secondary-btn';
    refreshBtn.style.maxWidth = '200px';
    refreshBtn.style.margin = '20px auto 0';
    refreshBtn.textContent = '🔄 Refresh';
    refreshBtn.addEventListener('click', loadSlots);
    container.appendChild(refreshBtn);
    
    datesContainer.appendChild(container);
    
    const loadingMsgEl = document.getElementById("loadingMsg");
    const slotsDisplayEl = document.getElementById("slotsDisplay");
    if (loadingMsgEl) loadingMsgEl.style.display = "none";
    if (slotsDisplayEl) slotsDisplayEl.style.display = "block";
}

function handleLoadError(status, message) {
    const loadingMsg = document.getElementById("loadingMsg");
    const datesContainer = document.getElementById("datesContainer");
    
    if (!loadingMsg || !datesContainer) return;
    
    datesContainer.innerHTML = '';
    loadingMsg.innerHTML = ''; 
    
    const errorMessage = status ? 
        getErrorMessage(status, "Failed to load slots") :
        (message || "Connection error. Please check your internet.");
    
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
    retryBtn.addEventListener('click', loadSlots);
    loadingMsg.appendChild(retryBtn);
    
    loadingMsg.style.display = "block";
    const slotsDisplayEl = document.getElementById("slotsDisplay");
    if (slotsDisplayEl) slotsDisplayEl.style.display = "none";
}

// ================================================================================================
// SUMMARY FUNCTIONS WITH DEBOUNCED REMOVAL
// ================================================================================================
let pendingRemovals = new Set();
let removalTimeout = null;

export function updateSummaryDisplay() {
    const summaryEl = document.getElementById('selectedSlotSummary');
    if (!summaryEl) return;
    
    summaryEl.innerHTML = '';
    
    const selectedSlots = getSelectedSlots();
    
    const heading = document.createElement('div');
    heading.style.marginBottom = '12px';
    const headingStrong = document.createElement('strong');
    headingStrong.textContent = `📋 Selected ${selectedSlots.length} Slot${selectedSlots.length > 1 ? 's' : ''}:`;
    heading.appendChild(headingStrong);
    summaryEl.appendChild(heading);
    
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'chips-container';
    
    const sortedSlots = [...selectedSlots].sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        return parseTimeForSorting(a.label) - parseTimeForSorting(b.label);
    });
    
    sortedSlots.forEach(slot => {
        const dateObj = new Date(slot.date);
        const shortDate = dateObj.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
        });
        const shortTime = slot.label.replace(/:\d{2}/g, '').replace(/\s*-\s*/g, '-').replace(/\s/g, '');
        
        const chip = document.createElement('div');
        chip.className = 'slot-chip';
        chip.dataset.slotId = slot.id;
        
        const chipContent = document.createElement('span');
        chipContent.className = 'chip-content';
        
        const chipDate = document.createElement('span');
        chipDate.className = 'chip-date';
        chipDate.textContent = shortDate;
        chipContent.appendChild(chipDate);
        
        const chipTime = document.createElement('span');
        chipTime.className = 'chip-time';
        chipTime.textContent = shortTime;
        chipContent.appendChild(chipTime);
        
        chip.appendChild(chipContent);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'chip-remove-btn';
        removeBtn.textContent = '✕';
        removeBtn.setAttribute('aria-label', `Remove ${slot.date} ${slot.label}`);
        removeBtn.setAttribute('title', 'Remove this booking');
        removeBtn.addEventListener('click', () => removeSlotFromSummary(slot.id));
        chip.appendChild(removeBtn);
        
        chipsContainer.appendChild(chip);
    });
    
    summaryEl.appendChild(chipsContainer);
}

// ✅ Fixed: Debounced removal to prevent race conditions
function removeSlotFromSummary(slotId) {
    // Prevent duplicate removals
    if (pendingRemovals.has(slotId)) {
        console.log('Removal already pending for slot:', slotId);
        return;
    }
    
    pendingRemovals.add(slotId);
    
    const chipElement = document.querySelector(`.slot-chip[data-slot-id="${slotId}"]`);
    
    if (chipElement) {
        chipElement.classList.add('removing');
        
        // Clear any existing timeout
        if (removalTimeout) {
            clearTimeout(removalTimeout);
        }
        
        removalTimeout = setTimeout(() => {
            // Process all pending removals at once
            const selectedSlots = getSelectedSlots();
            const newSlots = selectedSlots.filter(slot => !pendingRemovals.has(slot.id));
            updateSelectedSlots(newSlots);
            
            // Update UI for all removed slots
            pendingRemovals.forEach(id => {
                const slotElement = document.getElementById(`slot-btn-${id}`);
                if (slotElement) {
                    slotElement.classList.remove("selected");
                    slotElement.setAttribute('aria-pressed', 'false');
                }
            });
            
            // Clear pending set
            const removalCount = pendingRemovals.size;
            pendingRemovals.clear();
            removalTimeout = null;
            
            updateSummaryDisplay();
            updateFloatingButton();
            
            showMessage(`Removed ${removalCount} slot${removalCount > 1 ? 's' : ''} from selection`, 'info', 2000);
        }, 350); // Slightly longer than animation duration
    } else {
        // Immediate removal if chip not found
        const selectedSlots = getSelectedSlots();
        const newSlots = selectedSlots.filter(slot => slot.id !== slotId);
        updateSelectedSlots(newSlots);
        pendingRemovals.delete(slotId);
        updateSummaryDisplay();
        updateFloatingButton();
    }
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSlots();
});

// Handle slots reload event (from "Book Another Slot")
window.addEventListener('reloadSlots', () => {
    invalidateCache();
    loadSlots();
});

// ✅ Fixed: Warn before unload - removed !isOnSignupForm check
window.addEventListener('beforeunload', (e) => {
    const successSection = document.getElementById("successMessage");
    
    if (!successSection) return;
    
    const isOnSuccessPage = successSection.style.display === "block";
    const selectedSlots = getSelectedSlots();
    
    // Warn if user has selected slots and hasn't completed booking
    if (selectedSlots.length > 0 && !isOnSuccessPage) {
        e.preventDefault();
        e.returnValue = 'You have selected slots but have not completed your booking. Are you sure you want to leave?';
        return e.returnValue;
    }
});
