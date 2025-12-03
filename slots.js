// START OF CODE: slots.js

import { 
    API_URL, 
    CONFIG, 
    selectedSlots, 
    API_CACHE, 
    updateSelectedSlots 
} from './config.js';
import { 
    sanitizeHTML, 
    getErrorMessage, 
    parseTimeForSorting 
} from './utils.js';
import { showSignupForm } from './signup.js';

// --- Skeleton Styles ---
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shimmer {0% { background-position: -468px 0; } 100% { background-position: 468px 0; }}
        .skeleton-card { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 12px; padding: 24px; margin-bottom: 24px; animation: fadeIn 0.3s ease; }
        .skeleton-title { height: 24px; width: 150px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 16px; }
        .skeleton-slot { background: linear-gradient(90deg, #f8f8f8 25%, #f0f0f0 50%, #f8f8f8 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border: 1px solid #e0e0e0; pointer-events: none; min-height: 64px; border-radius: 8px; padding: 16px; }
        .fade-in { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .date-chip.disabled { opacity: 0.5; cursor: not-allowed !important; }
    `;
    document.head.appendChild(style);
})();

// --- Format Date ---
function formatDateWithDay(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// --- Update Floating Button ---
function updateFloatingButton() {
    const btnContainer = document.getElementById("floatingSignupBtnContainer");
    const btn = document.getElementById("floatingSignupBtn");
    const count = selectedSlots.length;

    if (count > 0) {
        btnContainer.style.display = "block";
        btn.textContent = `Continue to Sign Up (${count} Slot${count > 1 ? 's' : ''} Selected)`;
        if (!btn._listener) {
            btn._listener = showSignupForm;
            btn.addEventListener('click', btn._listener);
        }
    } else {
        btnContainer.style.display = "none";
    }
}

// --- Toggle Slot Selection ---
export function toggleSlot(date, slotLabel, rowId, element) {
    const existingIndex = selectedSlots.findIndex(slot => slot.id === rowId);

    if (existingIndex > -1) {
        selectedSlots.splice(existingIndex, 1);
        element.classList.remove("selected");
        element.setAttribute('aria-pressed', 'false');
    } else {
        if (selectedSlots.length >= CONFIG.MAX_SLOTS_PER_BOOKING) {
            alert(`You can only select up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots at a time.`);
            return;
        }
        selectedSlots.push({ id: rowId, date: date, label: slotLabel });
        element.classList.add("selected");
        element.setAttribute('aria-pressed', 'true');
    }

    updateFloatingButton();
}

// --- Back / Reset ---
export function backToSlotSelection() {
    updateSelectedSlots([]);
    document.getElementById("signupSection").style.display = "none";
    loadSlots();
}

export function resetPage() {
    updateSelectedSlots([]);
    document.getElementById("successMessage").style.display = "none";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    loadSlots();
}

// --- Skeleton UI ---
function showSkeletonUI() {
    const container = document.getElementById("datesContainer");
    const skeletonHTML = Array(3).fill(0).map(() => `
        <div class="date-card skeleton-card">
            <div class="skeleton-title"></div>
            <div class="slots-grid">
                ${Array(4).fill(0).map(() => `<div class="slot skeleton-slot"></div>`).join('')}
            </div>
        </div>
    `).join('');
    container.innerHTML = skeletonHTML;
}

// --- Load Slots ---
export async function loadSlots() {
    const loadingMsg = document.getElementById("loadingMsg");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const signupSection = document.getElementById("signupSection");

    showSkeletonUI();
    signupSection.style.display = "none";

    const now = Date.now();
    if (API_CACHE.data && (now - API_CACHE.timestamp) < API_CACHE.TTL) {
        renderSlotsData(API_CACHE.data);
        return;
    }

    try {
        const res = await fetch(API_URL);
        if (!res.ok) return handleLoadError(res.status);

        const data = await res.json();
        if (!data.ok) return handleLoadError(null, data.error || 'Failed to load slots');

        API_CACHE.data = data;
        API_CACHE.timestamp = now;

        renderSlotsData(data);
    } catch (err) {
        handleLoadError(null, err.message);
        console.error(err);
    }
}

// --- Render Slots ---
function renderSlotsData(data) {
    const container = document.getElementById("datesContainer");
    const groupedSlotsByDate = data.dates || {};
    const today = new Date();
    today.setHours(0,0,0,0);

    const futureDates = Object.keys(groupedSlotsByDate)
        .filter(dateStr => new Date(dateStr) >= today)
        .sort((a,b) => new Date(a)-new Date(b));

    if (!futureDates.length) return showNoSlotsMessage();

    container.innerHTML = '';
    if (container._slotListener) container.removeEventListener('click', container._slotListener);

    const fragment = document.createDocumentFragment();
    futureDates.forEach(date => {
        const availableSlots = (groupedSlotsByDate[date] || [])
            .filter(s => s.available > 0)
            .sort((a,b) => parseTimeForSorting(a.slotLabel) - parseTimeForSorting(b.slotLabel));
        if (availableSlots.length) fragment.appendChild(createDateCard(date, availableSlots));
    });
    container.appendChild(fragment);

    container._slotListener = (e) => {
        const slot = e.target.closest('.slot');
        if (!slot || slot.classList.contains('disabled')) return;
        toggleSlot(slot.dataset.date, slot.dataset.label, parseInt(slot.dataset.slotId), slot);
    };
    container.addEventListener('click', container._slotListener);

    document.getElementById("loadingMsg").style.display = "none";
    slotsDisplay.style.display = "block";
    updateFloatingButton();
}

// --- Date Card / Slot Elements ---
function createDateCard(date, slots) {
    const card = document.createElement('div');
    card.className = 'date-card card fade-in';

    const title = document.createElement('h3');
    title.textContent = `📅 ${formatDateWithDay(date)}`;
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'slots-grid';
    slots.forEach(slot => grid.appendChild(createSlotElement(slot)));
    card.appendChild(grid);

    return card;
}

function createSlotElement(slot) {
    const div = document.createElement('div');
    const isSelected = selectedSlots.some(s => s.id === slot.id);
    div.className = `slot ${isSelected ? 'selected' : ''}`;
    div.dataset.slotId = slot.id;
    div.dataset.date = slot.date;
    div.dataset.label = slot.slotLabel;
    div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

    const label = document.createElement('span');
    label.textContent = slot.slotLabel;
    div.appendChild(label);

    div.appendChild(document.createElement('br'));
    const small = document.createElement('small');
    small.textContent = `(${slot.available} left)`;
    div.appendChild(small);

    return div;
}

// --- Messages / Errors ---
function showNoSlotsMessage() {
    document.getElementById("datesContainer").innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
            <p>📅 No available slots at this time.</p>
            <button onclick="window.loadSlots()" class="btn secondary-btn">🔄 Refresh</button>
        </div>
    `;
    document.getElementById("loadingMsg").style.display = "none";
    document.getElementById("slotsDisplay").style.display = "block";
}

function handleLoadError(status, message) {
    const loadingMsg = document.getElementById("loadingMsg");
    loadingMsg.innerHTML = `<p style="color:#dc2626;">⚠️ ${sanitizeHTML(message || getErrorMessage(status))}</p>
                            <button onclick="window.loadSlots()" class="btn secondary-btn">🔄 Retry</button>`;
    loadingMsg.style.display = "block";
    document.getElementById("slotsDisplay").style.display = "none";
}

// --- Summary Slots ---
export function removeSlotFromSummary(slotId) {
    const index = selectedSlots.findIndex(s => s.id === slotId);
    if (index > -1) {
        selectedSlots.splice(index, 1);
        const el = document.querySelector(`[data-slot-id='${slotId}']`);
        if (el) { el.classList.remove('selected'); el.setAttribute('aria-pressed','false'); }
        if (!selectedSlots.length) return backToSlotSelection();
        updateSummaryDisplay();
        updateFloatingButton();
    }
}

export function updateSummaryDisplay() {
    const summaryEl = document.getElementById('selectedSlotSummary');
    let html = `<div><strong>📋 Selected ${selectedSlots.length} Slot${selectedSlots.length>1?'s':''}:</strong></div>`;
    html += `<div class="chips-container">`;

    [...selectedSlots].sort((a,b)=>{
        const d = new Date(a.date)-new Date(b.date);
        if(d!==0) return d;
        return parseTimeForSorting(a.label)-parseTimeForSorting(b.label);
    }).forEach(slot => {
        const shortDate = new Date(slot.date).toLocaleDateString('en-US',{ weekday:'short', month:'short', day:'numeric' });
        const shortTime = slot.label.replace(/:\d{2}/g,'').replace(/\s*-\s*/g,'-').replace(/\s/g,'');
        html += `<div class="slot-chip" data-slot-id="${slot.id}">
                    <span class="chip-content"><span class="chip-date">${shortDate}</span><span class="chip-time">${shortTime}</span></span>
                    <button onclick="window.removeSlotFromSummary(${slot.id})" class="chip-remove-btn">✕</button>
                 </div>`;
    });
    html += `</div>`;
    summaryEl.innerHTML = html;
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    window.loadSlots = loadSlots;
    window.backToSlotSelection = backToSlotSelection;
    window.resetPage = resetPage;
    window.removeSlotFromSummary = removeSlotFromSummary;

    loadSlots();
});

window.addEventListener('beforeunload', (e) => {
    if (selectedSlots.length>0 && document.getElementById("signupSection").style.display==="none") {
        e.preventDefault();
        e.returnValue = 'You have selected slots but haven\'t completed your booking. Are you sure you want to leave?';
        return e.returnValue;
    }
});

// END OF CODE
