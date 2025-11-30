//===== admin-script.js (PART 1/6 START) =====
const API_URL = "/api/admin";

// Configuration Constants
const CONFIG = {
    DATE_SELECTOR: {
        DAYS_AHEAD: 60,
        MAX_BATCH_SIZE: 30,
        MIN_CHIP_WIDTH: 110
    },
    GRID: {
        MIN_CARD_WIDTH: 150,
        MOBILE_COLUMNS: 2
    },
    WEEKEND: {
        TOTAL: 8,
        DAYS: [0, 6] // Sunday=0, Saturday=6
    },
    SLOTS: {
        MIN_CAPACITY: 1,
        MAX_CAPACITY: 99,
        DEFAULT_CAPACITY: 6
    },
    CACHE_TTL: 5000 // 5 second cache for admin panel
};

const DEFAULT_SLOT_LABELS = [
    "10AM-12PM",
    "12PM-2PM",
    "2PM-4PM",
    "4PM-6PM"
];

// State management
let adminToken = null;
let existingDateSet = new Set();
let selectedDates = new Set();
let slotsToDelete = [];
let allSlots = [];

// Admin cache (shorter TTL than user side)
const adminCache = {
    data: null,
    timestamp: 0
};

// ================================================================================================
// SECURITY & VALIDATION
// ================================================================================================

function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function isValidDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return false;

    const [month, day, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);

    return date.getMonth() === month - 1 &&
           date.getDate() === day &&
           date.getFullYear() === year;
}

function isPastDate(dateStr) {
    if (!isValidDate(dateStr)) return true;
    const [month, day, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
}

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

function showMessage(elementId, message, isError) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = isError ? "msg-box error" : "msg-box success";
    el.style.display = message ? "block" : "none";
}

function formatDateShort(dateStr) {
    if (!isValidDate(dateStr)) return { monthName: '', dayNum: '', weekday: '' };
    const [month, day, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    return {
        monthName: date.toLocaleDateString('en-US', { month: 'short' }),
        dayNum: date.getDate(),
        weekday: date.toLocaleDateString('en-US', { weekday: 'short' })
    };
}

function handleError(context, error, userMessage) {
    console.error(`[${context}]`, error);
    showMessage('addMsg', userMessage, true);
}

// Cache helpers
function getCachedData() {
    const now = Date.now();
    if (adminCache.data && (now - adminCache.timestamp) < CONFIG.CACHE_TTL) {
        return adminCache.data;
    }
    return null;
}

function setCachedData(data) {
    adminCache.data = data;
    adminCache.timestamp = Date.now();
}

function invalidateCache() {
    adminCache.data = null;
    adminCache.timestamp = 0;
}

// ================================================================================================
// WEEKEND UTILITIES
// ================================================================================================

function isWeekendDateObj(dateObj) {
    return CONFIG.WEEKEND.DAYS.includes(dateObj.getDay());
}

function formatDateFromObj(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

// Generate next N weekends (Saturday/Sunday) after today or last selected weekend
function getNextWeekends(count) {
    const weekends = [];
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    while (weekends.length < count) {
        if (isWeekendDateObj(startDate) && !existingDateSet.has(formatDateFromObj(startDate)) && !isPastDate(formatDateFromObj(startDate))) {
            weekends.push(new Date(startDate));
        }
        startDate.setDate(startDate.getDate() + 1);
    }

    return weekends;
}

// ================================================================================================
// SHARED DATE CHIP CREATION
// ================================================================================================

function createDateChip(dateStr, hasSlots, isSelected, options = {}) {
    const { isWeekendChip = false, highlightWeekend = false } = options;
    const { monthName, dayNum, weekday } = formatDateShort(dateStr) || {};

    const chip = document.createElement('div');
    chip.className = `date-chip ${hasSlots ? 'past' : ''} ${isSelected ? 'selected' : ''} ${isWeekendChip ? 'weekend-chip' : ''} ${highlightWeekend ? 'weekend-highlight' : ''}`;
    chip.dataset.date = dateStr;
    chip.setAttribute('role', 'button');
    chip.tabIndex = hasSlots ? -1 : 0;
    chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    chip.title = hasSlots ? `${dateStr} - Already has slots` : `Click to select ${dateStr}`;

    chip.innerHTML = `
        <span class="date-month">${sanitizeHTML(monthName)}</span>
        <span class="date-day">${sanitizeHTML(String(dayNum))}</span>
        <span class="date-weekday ${highlightWeekend ? 'weekend' : ''}">${sanitizeHTML(weekday)}</span>
        ${isWeekendChip ? '<small class="weekend-badge">WKND</small>' : ''}
        ${highlightWeekend && !isWeekendChip ? '<small class="weekend-dot">●</small>' : ''}
    `;

    return chip;
}

function setupDateChipListeners(container) {
    if (container._adminChipHandler) {
        container.removeEventListener('click', container._adminChipHandler);
        container.removeEventListener('keypress', container._adminChipHandler);
    }

    const handleInteraction = (e) => {
        if (e.type === 'keypress' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keypress') e.preventDefault();

        const chip = e.target.closest('.date-chip');
        if (!chip || chip.classList.contains('past')) return;

        const dateStr = chip.dataset.date;
        toggleDateSelection(dateStr);
    };

    container._adminChipHandler = handleInteraction;
    container.addEventListener('click', handleInteraction);
    container.addEventListener('keypress', handleInteraction);
}
//===== admin-script.js (PART 1/6 END) =====


//===== admin-script.js (PART 2/6 START) =====
// ================================================================================================
// DATE SELECTION LOGIC
// ================================================================================================

function toggleDateSelection(dateStr) {
    if (!dateStr || existingDateSet.has(dateStr)) return;

    if (selectedDates.has(dateStr)) {
        selectedDates.delete(dateStr);
    } else {
        selectedDates.add(dateStr);
    }
    renderSelectedDates();
}

function renderSelectedDates() {
    const container = document.getElementById('dateChipsContainer');
    if (!container) return;

    container.innerHTML = '';
    const sortedDates = Array.from(selectedDates).sort((a, b) => {
        const [m1, d1, y1] = a.split('/').map(Number);
        const [m2, d2, y2] = b.split('/').map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    sortedDates.forEach(dateStr => {
        const chip = createDateChip(dateStr, false, true, { isWeekendChip: isWeekendDateObj(new Date(dateStr.split('/').reverse().join('-'))) });
        container.appendChild(chip);
    });

    setupDateChipListeners(container);
}

// ================================================================================================
// WEEKEND AUTO-REPLENISH
// ================================================================================================

function addWeekendsToSelection() {
    const needed = CONFIG.WEEKEND.TOTAL - Array.from(selectedDates).filter(dateStr => {
        const [month, day, year] = dateStr.split('/').map(Number);
        return isWeekendDateObj(new Date(year, month - 1, day));
    }).length;

    if (needed <= 0) return;

    const newWeekends = getNextWeekends(needed);
    newWeekends.forEach(dateObj => {
        const dateStr = formatDateFromObj(dateObj);
        selectedDates.add(dateStr);
    });

    renderSelectedDates();
}

// ================================================================================================
// SLOT MANAGEMENT
// ================================================================================================

function generateDefaultSlots(dateStr) {
    return DEFAULT_SLOT_LABELS.map(label => ({
        date: dateStr,
        label,
        capacity: CONFIG.SLOTS.DEFAULT_CAPACITY
    }));
}

function addSlotsForDate(dateStr) {
    if (!dateStr || existingDateSet.has(dateStr)) return;

    const slots = generateDefaultSlots(dateStr);
    allSlots.push(...slots);
    existingDateSet.add(dateStr);
    invalidateCache();
    showMessage('addMsg', `Added slots for ${dateStr}`, false);
    renderSlots();
}

function deleteSlot(dateStr, label) {
    const index = allSlots.findIndex(s => s.date === dateStr && s.label === label);
    if (index === -1) return;

    allSlots.splice(index, 1);

    // If all slots for date removed, remove date
    if (!allSlots.some(s => s.date === dateStr)) {
        existingDateSet.delete(dateStr);
    }

    invalidateCache();
    renderSlots();
    addWeekendsToSelection(); // Auto-replenish weekends
}

function renderSlots() {
    const container = document.getElementById('slotsContainer');
    if (!container) return;

    container.innerHTML = '';

    const sortedSlots = allSlots.slice().sort((a, b) => {
        const [m1, d1, y1] = a.date.split('/').map(Number);
        const [m2, d2, y2] = b.date.split('/').map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    sortedSlots.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = 'slot-card';
        slotEl.dataset.date = slot.date;
        slotEl.dataset.label = slot.label;

        slotEl.innerHTML = `
            <span class="slot-date">${sanitizeHTML(slot.date)}</span>
            <span class="slot-label">${sanitizeHTML(slot.label)}</span>
            <span class="slot-capacity">${slot.capacity}</span>
            <button class="slot-delete-btn" aria-label="Delete slot for ${slot.label} on ${slot.date}">🗑</button>
        `;

        slotEl.querySelector('.slot-delete-btn').addEventListener('click', () => deleteSlot(slot.date, slot.label));
        container.appendChild(slotEl);
    });
}

// ================================================================================================
// BULK ADD & DELETE
// ================================================================================================

function addSelectedDates() {
    selectedDates.forEach(dateStr => addSlotsForDate(dateStr));
    selectedDates.clear();
    renderSelectedDates();
}

function deleteSelectedDates() {
    const datesToDelete = Array.from(selectedDates);
    datesToDelete.forEach(dateStr => {
        allSlots = allSlots.filter(s => s.date !== dateStr);
        existingDateSet.delete(dateStr);
    });
    selectedDates.clear();
    invalidateCache();
    renderSlots();
    renderSelectedDates();
    addWeekendsToSelection();
}

// ================================================================================================
// KEYBOARD SHORTCUTS
// ================================================================================================

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        addSelectedDates();
    }
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        deleteSelectedDates();
    }
});

// ================================================================================================
// INITIALIZATION
// ================================================================================================

function initAdminPanel(token) {
    adminToken = token;
    renderSlots();
    addWeekendsToSelection();
}

document.addEventListener('DOMContentLoaded', () => {
    const tokenInput = document.getElementById('adminTokenInput');
    const loginBtn = document.getElementById('adminLoginBtn');

    if (loginBtn && tokenInput) {
        loginBtn.addEventListener('click', () => {
            const token = tokenInput.value.trim();
            if (!token) {
                showMessage('loginMsg', 'Admin token required', true);
                return;
            }
            initAdminPanel(token);
            showMessage('loginMsg', 'Logged in successfully', false);
        });
    }
});
//===== admin-script.js (PART 2/6 END) =====

//===== admin-script.js (PART 3/6 START) =====
// ================================================================================================
// DATE CHIP RENDERING
// ================================================================================================

function createDateChip(dateStr, isSelected = false, options = {}) {
    const { isWeekendChip = false, highlightWeekend = false } = options;
    const [month, day, year] = dateStr.split('/').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const chip = document.createElement('div');
    chip.className = `date-chip ${isSelected ? 'selected' : ''} ${isWeekendChip ? 'weekend-chip' : ''} ${highlightWeekend ? 'weekend-highlight' : ''}`;
    chip.dataset.date = dateStr;
    chip.setAttribute('role', 'button');
    chip.tabIndex = 0;
    chip.title = `Click to ${isSelected ? 'deselect' : 'select'} ${dateStr}`;

    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const monthName = dateObj.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = dateObj.getDate();

    chip.innerHTML = `
        <span class="date-month">${sanitizeHTML(monthName)}</span>
        <span class="date-day">${sanitizeHTML(dayNum)}</span>
        <span class="date-weekday">${sanitizeHTML(weekday)}</span>
        ${isWeekendChip ? '<small class="weekend-badge">WKND</small>' : ''}
        ${highlightWeekend && !isWeekendChip ? '<small class="weekend-dot">●</small>' : ''}
    `;

    chip.addEventListener('click', () => toggleDateSelection(dateStr));
    chip.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') toggleDateSelection(dateStr);
    });

    return chip;
}

function renderDateChips() {
    const container = document.getElementById('multiDateSelector');
    if (!container) return;
    container.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < CONFIG.DATE_SELECTOR.DAYS_AHEAD; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = formatDateFromObj(date);

        const isSelected = selectedDates.has(dateStr);
        const isWeekendDay = isWeekendDateObj(date);

        const chip = createDateChip(dateStr, isSelected, { highlightWeekend: isWeekendDay });
        container.appendChild(chip);
    }
}

// ================================================================================================
// WEEKEND CHIPS
// ================================================================================================

function renderWeekendChips() {
    const container = document.getElementById('weekendSelector');
    if (!container) return;
    container.innerHTML = '';

    const weekends = getNextWeekends(CONFIG.WEEKEND.TOTAL);
    weekends.forEach(dateObj => {
        const dateStr = formatDateFromObj(dateObj);
        const isSelected = selectedDates.has(dateStr);

        const chip = createDateChip(dateStr, isSelected, { isWeekendChip: true });
        container.appendChild(chip);
    });
}

// ================================================================================================
// DYNAMIC SLOT CAPACITY CONTROLS
// ================================================================================================

function renderSlotCapacityControls() {
    const container = document.getElementById('slotCheckboxes');
    if (!container) return;

    container.innerHTML = '';

    DEFAULT_SLOT_LABELS.forEach((label, index) => {
        const div = document.createElement('div');
        div.className = 'slot-capacity-control';

        div.innerHTML = `
            <label class="slot-label">
                <input type="checkbox" class="slot-checkbox" checked value="${index}" aria-label="Include ${sanitizeHTML(label)}">
                ${sanitizeHTML(label)}
            </label>
            <div class="capacity-input-group">
                <label for="capacity-${index}">Capacity:</label>
                <input type="number" 
                       id="capacity-${index}" 
                       class="capacity-input form-input" 
                       value="${CONFIG.SLOTS.DEFAULT_CAPACITY}" 
                       min="${CONFIG.SLOTS.MIN_CAPACITY}" 
                       max="${CONFIG.SLOTS.MAX_CAPACITY}"
                       aria-label="Capacity for ${sanitizeHTML(label)}">
            </div>
        `;

        container.appendChild(div);
    });
}

// ================================================================================================
// HELPER: CHECK IF DATE IS WEEKEND
// ================================================================================================

function isWeekendDateObj(dateObj) {
    return CONFIG.WEEKEND.DAYS.includes(dateObj.getDay());
}

function formatDateFromObj(dateObj) {
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${month}/${day}/${year}`;
}

function getNextWeekends(count) {
    const weekends = [];
    let current = new Date();
    current.setHours(0, 0, 0, 0);

    while (weekends.length < count) {
        current.setDate(current.getDate() + 1);
        if (isWeekendDateObj(current)) {
            const dateStr = formatDateFromObj(current);
            if (!existingDateSet.has(dateStr)) weekends.push(new Date(current));
        }
    }

    return weekends;
}
// ===== admin-script.js (PART 3/6 END) =====
//===== admin-script.js (PART 4/6 START) =====
// ================================================================================================
// ADMIN LOGIN
// ================================================================================================

async function login() {
    const passwordInput = document.getElementById("adminPassword");
    const password = passwordInput.value.trim();

    if (!password) {
        showMessage("loginMsg", "Please enter a password", true);
        passwordInput.focus();
        return;
    }

    adminToken = password;
    showMessage("loginMsg", "Logging in...", false);

    try {
        const res = await fetch(API_URL, {
            headers: { "Authorization": `Bearer ${adminToken}` }
        });
        const data = await res.json();

        if (data.ok) {
            document.getElementById("loginSection").style.display = "none";
            document.getElementById("adminSection").style.display = "block";
            showMessage("loginMsg", "Login successful!", false);

            await loadSlots();
            renderWeekendChips();
            renderDateChips();
            renderSlotCapacityControls();
        } else {
            showMessage("loginMsg", "Invalid password", true);
            adminToken = null;
            passwordInput.select();
        }
    } catch (err) {
        handleError('Login', err, 'Login failed. Please check your connection.');
        adminToken = null;
    }
}

// ================================================================================================
// FETCH EXISTING SLOTS WITH CACHING
// ================================================================================================

async function loadSlots() {
    const display = document.getElementById("slotsDisplay");
    if (!display) return;

    const cached = getCachedData();
    if (cached) {
        renderSlots(cached);
        return;
    }

    display.innerHTML = `<div class="loading-skeleton">Loading slots...</div>`;
    slotsToDelete = [];
    existingDateSet = new Set();
    allSlots = [];
    updateDeleteButton();

    try {
        const res = await fetch(API_URL, {
            headers: { "Authorization": `Bearer ${adminToken}` }
        });

        const data = await res.json();
        if (!data.ok) {
            display.innerHTML = "<p class='msg-box error'>Failed to load slots</p>";
            return;
        }

        setCachedData(data);
        renderSlots(data);
    } catch (err) {
        handleError('LoadSlots', err, 'Error loading slots. Please refresh.');
        display.innerHTML = "<p class='msg-box error'>Error loading slots. Check console and refresh.</p>";
    }
}

// ================================================================================================
// RENDER SLOTS GRID
// ================================================================================================

function renderSlots(data) {
    const display = document.getElementById("slotsDisplay");
    if (!display) return;

    allSlots = data.slots || [];
    const grouped = {};
    let totalBookings = 0;
    let totalAvailable = 0;

    allSlots.forEach(slot => {
        if (!grouped[slot.date]) grouped[slot.date] = [];
        grouped[slot.date].push(slot);
        existingDateSet.add(slot.date);
        totalBookings += slot.taken || 0;
        totalAvailable += slot.available || 0;
    });

    document.getElementById('totalDates').textContent = Object.keys(grouped).length;
    document.getElementById('totalSlots').textContent = allSlots.length;
    document.getElementById('totalBookings').textContent = totalBookings;
    document.getElementById('totalAvailable').textContent = totalAvailable;

    if (Object.keys(grouped).length === 0) {
        display.innerHTML = "<p style='text-align:center;padding:40px;color:#64748b;'>📅 No slots added yet.</p>";
        return;
    }

    const sortedDates = Object.keys(grouped).sort((a, b) => {
        const [am, ad, ay] = a.split('/').map(Number);
        const [bm, bd, by] = b.split('/').map(Number);
        return new Date(ay, am - 1, ad) - new Date(by, bm - 1, bd);
    });

    let html = '<div class="compact-slots-grid">';
    sortedDates.forEach(date => {
        const slots = grouped[date];
        const { monthName, dayNum, weekday } = formatDateShort(date);
        const isPast = isPastDate(date);

        html += `
            <div class="slot-date-group ${isPast ? 'past' : ''}">
                <div class="date-header">
                    <div class="date-title">
                        ${sanitizeHTML(monthName)} ${sanitizeHTML(dayNum)}
                        <span style="font-size:0.7rem;opacity:0.7;display:block;">${sanitizeHTML(weekday)}</span>
                    </div>
                    <input type="checkbox" class="date-select-all" 
                           onchange="toggleSelectAllForDate('${date}', this.checked)"
                           aria-label="Select all slots for ${sanitizeHTML(date)}">
                </div>
        `;

        slots.forEach(slot => {
            const isFull = (slot.available || 0) <= 0;
            html += `
                <div class="slot-row">
                    <input type="checkbox" class="slot-row-checkbox" 
                           data-row-id="${slot.id}" data-date="${date}" 
                           onchange="toggleSlotSelection(${slot.id}, this.checked)">
                    <div class="slot-info">
                        <span class="slot-label">${sanitizeHTML(slot.slotLabel)}</span>
                        <span class="slot-capacity ${isFull ? 'full' : ''}">
                            ${slot.taken || 0}/${slot.capacity || 0} booked
                        </span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    });

    html += '</div>';
    display.innerHTML = html;
}
//===== admin-script.js (PART 4/6 END) =====
//===== admin-script.js (PART 5/6 START) =====
// ================================================================================================
// SLOT SELECTION & DELETION
// ================================================================================================

let slotsToDelete = [];

function toggleSlotSelection(rowId, isChecked) {
    if (isChecked) {
        if (!slotsToDelete.includes(rowId)) slotsToDelete.push(rowId);
    } else {
        slotsToDelete = slotsToDelete.filter(id => id !== rowId);
    }
    updateDeleteButton();
}

function toggleSelectAllForDate(date, isChecked) {
    const checkboxes = document.querySelectorAll(`.slot-row-checkbox[data-date="${date}"]`);
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        toggleSlotSelection(parseInt(cb.dataset.rowId), isChecked);
    });
}

function selectAllSlots() {
    const allCheckboxes = document.querySelectorAll('.slot-row-checkbox');
    const allSelected = slotsToDelete.length === allCheckboxes.length;

    if (allSelected) {
        allCheckboxes.forEach(cb => cb.checked = false);
        slotsToDelete = [];
    } else {
        allCheckboxes.forEach(cb => {
            cb.checked = true;
            const rowId = parseInt(cb.dataset.rowId);
            if (!slotsToDelete.includes(rowId)) slotsToDelete.push(rowId);
        });
    }
    updateDeleteButton();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (!deleteBtn) return;

    if (slotsToDelete.length > 0) {
        deleteBtn.textContent = `🗑️ Delete Selected (${slotsToDelete.length})`;
        deleteBtn.style.display = 'inline-block';
    } else {
        deleteBtn.style.display = 'none';
    }

    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) {
        const allCheckboxes = document.querySelectorAll('.slot-row-checkbox');
        selectAllBtn.textContent = slotsToDelete.length === allCheckboxes.length ? '☐ Deselect All' : '☑️ Select All';
    }
}

// ================================================================================================
// DELETE SELECTED SLOTS
// ================================================================================================

async function deleteSelectedSlots() {
    if (slotsToDelete.length === 0) {
        alert("⚠️ Please select at least one slot to delete.");
        return;
    }

    const slotDetails = slotsToDelete.map(id => {
        const slot = allSlots.find(s => s.id === id);
        return slot ? `• ${slot.date} ${slot.slotLabel} (${slot.taken} booking${slot.taken !== 1 ? 's' : ''})` : '';
    }).filter(Boolean).join('\n');

    const totalBookings = slotsToDelete.reduce((sum, id) => {
        const slot = allSlots.find(s => s.id === id);
        return sum + (slot ? slot.taken : 0);
    }, 0);

    if (!confirm(`⚠️ DELETE ${slotsToDelete.length} SLOT${slotsToDelete.length > 1 ? 'S' : ''}?\n\n${slotDetails}\n\nThis affects ${totalBookings} bookings!\n\nTHIS CANNOT BE UNDONE!`)) {
        return;
    }

    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const originalText = deleteBtn.textContent;
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";

    try {
        const res = await fetch(API_URL, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`
            },
            body: JSON.stringify({ rowIds: slotsToDelete })
        });

        const data = await res.json();
        if (data.ok) {
            alert(`✅ ${data.message}`);
            invalidateCache();
            await loadSlots();
            renderWeekendChips();
            renderDateChips();
        } else {
            alert(`❌ ${data.error || 'Failed to delete slots'}`);
        }
    } catch (err) {
        handleError('DeleteSlots', err, `Failed to delete slots: ${err.message}`);
        alert(`❌ Failed to delete slots: ${err.message}`);
    } finally {
        slotsToDelete = [];
        updateDeleteButton();
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = originalText;
        }
    }
}

// ================================================================================================
// WEEKEND MANAGEMENT (DYNAMIC 8 WEEKENDS)
// ================================================================================================

function getNextWeekends(count) {
    const weekends = [];
    let current = new Date();
    current.setHours(0, 0, 0, 0);

    while (weekends.length < count) {
        current.setDate(current.getDate() + 1);
        if ([0,6].includes(current.getDay()) && !isPastDate(formatDateFromObj(current))) {
            weekends.push(new Date(current));
        }
    }

    return weekends;
}

function renderWeekendChips() {
    const container = document.getElementById('weekendSelector');
    if (!container) return;
    container.innerHTML = '';

    const weekends = getNextWeekends(8);
    const fragment = document.createDocumentFragment();

    weekends.forEach(dateObj => {
        const dateStr = formatDateFromObj(dateObj);
        const hasSlots = existingDateSet.has(dateStr);
        const isSelected = selectedDates.has(dateStr);
        const chip = createDateChip(dateStr, hasSlots, isSelected, { isWeekendChip: true, highlightWeekend: false });
        fragment.appendChild(chip);
    });

    container.appendChild(fragment);
    setupDateChipListeners(container);
}
//===== admin-script.js (PART 5/6 END) =====
//===== admin-script.js (PART 6/6 START) =====
// ================================================================================================
// MULTI-DATE SELECTOR
// ================================================================================================

function renderDateChips() {
    const container = document.getElementById('multiDateSelector');
    if (!container) return;
    container.innerHTML = '';

    const today = new Date();
    today.setHours(0,0,0,0);
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < CONFIG.DATE_SELECTOR.DAYS_AHEAD; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = formatDateFromObj(date);

        const hasSlots = existingDateSet.has(dateStr);
        const isSelected = selectedDates.has(dateStr);
        const isWeekend = isWeekendDateObj(date);

        const chip = createDateChip(dateStr, hasSlots, isSelected, { isWeekendChip: false, highlightWeekend: isWeekend });
        fragment.appendChild(chip);
    }

    container.appendChild(fragment);
    setupDateChipListeners(container);
    updateSelectedDatesCount();
}

// ================================================================================================
// SLOT CAPACITY UI
// ================================================================================================

function renderSlotCheckboxes() {
    const container = document.getElementById('slotCheckboxes');
    if (!container) return;
    container.innerHTML = '';

    DEFAULT_SLOT_LABELS.forEach((label, index) => {
        const div = document.createElement('div');
        div.className = 'slot-capacity-control';
        div.innerHTML = `
            <label class="slot-label">
                <input type="checkbox" class="slot-checkbox" checked value="${index}" aria-label="Include ${sanitizeHTML(label)}">
                ${sanitizeHTML(label)}
            </label>
            <div class="capacity-input-group">
                <label for="capacity-${index}">Capacity:</label>
                <input type="number" 
                       id="capacity-${index}" 
                       class="capacity-input form-input" 
                       value="${CONFIG.SLOTS.DEFAULT_CAPACITY}" 
                       min="${CONFIG.SLOTS.MIN_CAPACITY}" 
                       max="${CONFIG.SLOTS.MAX_CAPACITY}" 
                       aria-label="Capacity for ${sanitizeHTML(label)}">
            </div>
        `;
        container.appendChild(div);
    });
}

// ================================================================================================
// KEYBOARD SHORTCUTS
// ================================================================================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            const inputFocused = ['INPUT','TEXTAREA'].includes(e.target.tagName);
            if (!inputFocused) {
                e.preventDefault();
                selectAllSlots();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            if (slotsToDelete.length > 0) {
                e.preventDefault();
                deleteSelectedSlots();
            }
        }
        if (e.key === 'Escape' && slotsToDelete.length > 0) {
            document.querySelectorAll('.slot-row-checkbox').forEach(cb => cb.checked = false);
            slotsToDelete = [];
            updateDeleteButton();
        }
    });
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================

document.addEventListener('DOMContentLoaded', () => {
    renderSlotCheckboxes();
    setupKeyboardShortcuts();

    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    }

    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%,100%{transform:scale(1);}
            50%{transform:scale(1.1);color:#10b981;}
        }
    `;
    document.head.appendChild(style);
});
//===== admin-script.js (PART 6/6 END) =====





