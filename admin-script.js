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
let sessionExpiryTimeout = null;
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

// Check admin cache
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
// MULTI-DATE SELECTOR
// ================================================================================================

function generateDateOptions() {
    const container = document.getElementById('multiDateSelector');
    if (!container) return;

    container.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fragment = document.createDocumentFragment();

    // NOTE: Removed automatic weekend pre-selection logic per request.
    // The new UI provides a manual "Add next 8 weekends" control.

    // Render date chips
    for (let i = 0; i < CONFIG.DATE_SELECTOR.DAYS_AHEAD; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        const dateStr = `${month}/${day}/${year}`;
        
        const hasSlots = existingDateSet.has(dateStr);
        const isSelected = selectedDates.has(dateStr);
        
        const { monthName, dayNum, weekday } = formatDateShort(dateStr);
        
        const chip = document.createElement('div');
        chip.className = `date-chip ${hasSlots ? 'past' : ''} ${isSelected ? 'selected' : ''}`;
        chip.dataset.date = dateStr;
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', hasSlots ? '-1' : '0');
        chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        chip.setAttribute('aria-label', `Select ${dateStr}`);
        chip.title = hasSlots ? `${dateStr} - Already has slots` : `Click to toggle selection for ${dateStr}`;
        
        chip.innerHTML = `
            <span class="date-month">${sanitizeHTML(monthName)}</span>
            <span class="date-day">${sanitizeHTML(String(dayNum))}</span>
            <span class="date-weekday">${sanitizeHTML(weekday)}</span>
        `;
        
        fragment.appendChild(chip);
    }
    
    container.appendChild(fragment);
    
    // Setup event delegation
    const oldListener = container._clickListener;
    if (oldListener) {
        container.removeEventListener('click', oldListener);
        container.removeEventListener('keypress', oldListener);
    }
    
    const handleInteraction = (e) => {
        if (e.type === 'keypress' && e.key !== 'Enter' && e.key !== ' ') return;
        if (e.type === 'keypress') e.preventDefault();
        
        const chip = e.target.closest('.date-chip');
        if (!chip || chip.classList.contains('past')) return;
        
        const dateStr = chip.dataset.date;
        toggleDateSelection(dateStr); 
    };
    
    container._clickListener = handleInteraction;
    container.addEventListener('click', handleInteraction);
    container.addEventListener('keypress', handleInteraction);
    
    updateSelectedDatesCount();
}

// Removed the previous autoSelectWeekends helper entirely per request to remove the 8-weekend preselected logic.

// New: UI controls for adding next 8 weekends (stacked layout — checkbox then Add button)
function createWeekendControls() {
    const dateSelectorContainer = document.getElementById('multiDateSelectorContainer') || document.getElementById('multiDateSelector')?.parentElement;
    if (!dateSelectorContainer) return;

    // Ensure we don't duplicate the controls if they already exist
    if (document.getElementById('addWeekendsControls')) return;

    const controlsWrapper = document.createElement('div');
    controlsWrapper.id = 'addWeekendsControls';
    controlsWrapper.style.marginBottom = '10px';
    controlsWrapper.style.display = 'flex';
    controlsWrapper.style.flexDirection = 'column';
    controlsWrapper.style.gap = '8px';
    controlsWrapper.style.alignItems = 'flex-start';

    // Checkbox row
    const checkboxRow = document.createElement('label');
    checkboxRow.style.display = 'flex';
    checkboxRow.style.alignItems = 'center';
    checkboxRow.style.gap = '8px';
    checkboxRow.style.cursor = 'pointer';
    checkboxRow.style.userSelect = 'none';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'addNext8WeekendsCheckbox';
    checkbox.setAttribute('aria-label', 'Add next 8 weekends');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = 'Add next 8 weekends';
    labelSpan.style.fontSize = '0.95rem';
    labelSpan.style.color = '#0f172a';

    checkboxRow.appendChild(checkbox);
    checkboxRow.appendChild(labelSpan);

    // Button row (stacked under checkbox)
    const button = document.createElement('button');
    button.id = 'addNext8WeekendsBtn';
    button.type = 'button';
    button.textContent = 'Add';
    button.className = 'btn btn-primary';
    button.style.padding = '6px 12px';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.setAttribute('aria-label', 'Add next 8 weekends');

    // Handler
    button.addEventListener('click', async (e) => {
        e.preventDefault();
        const cb = document.getElementById('addNext8WeekendsCheckbox');
        if (!cb || !cb.checked) {
            showMessage('addMsg', 'Please check "Add next 8 weekends" to use this action.', true);
            setTimeout(() => showMessage('addMsg', '', false), 2500);
            return;
        }
        // Attempt to add next 8 weekends to selection
        try {
            const addedCount = addNext8Weekends();
            if (addedCount > 0) {
                showMessage('addMsg', `✅ Added ${addedCount} weekend day(s) to selection.`, false);
                generateDateOptions();
            } else {
                showMessage('addMsg', 'No new weekend dates could be added (they may already exist or are in the past).', true);
            }
        } catch (err) {
            console.error('Failed to add weekends:', err);
            showMessage('addMsg', `Failed to add weekends: ${err.message}`, true);
        } finally {
            setTimeout(() => showMessage('addMsg', '', false), 4000);
        }
    });

    controlsWrapper.appendChild(checkboxRow);
    controlsWrapper.appendChild(button);

    // Insert the controls immediately above the date chips container
    // If there is a parent container specifically for the multi-date selector, use that; otherwise insert before the multiDateSelector element.
    const multiSelector = document.getElementById('multiDateSelector');
    if (multiSelector && multiSelector.parentElement) {
        multiSelector.parentElement.insertBefore(controlsWrapper, multiSelector);
    } else if (dateSelectorContainer) {
        dateSelectorContainer.insertBefore(controlsWrapper, dateSelectorContainer.firstChild);
    } else {
        // Fallback: append to body
        document.body.insertBefore(controlsWrapper, document.body.firstChild);
    }
}

// Add next 8 weekends from the last existing added date
// Returns the number of dates added (not pairs) — i.e., number of weekend days newly added to selectedDates
function addNext8Weekends() {
    // We need to find the last date already added (from existingDateSet).
    // If none exist, start from today.
    // Then find the next 8 weekends (Saturday + Sunday pairs) AFTER that date (starting the search from the next day).
    // Skip any dates that already exist in existingDateSet or are in the past.
    // Add both weekend days to selectedDates (if they don't already exist) up to MAX_BATCH_SIZE limit.

    // Prepare helper to parse mm/dd/yyyy -> Date
    function parseMMDDYYYY(str) {
        const [m, d, y] = str.split('/').map(Number);
        return new Date(y, m - 1, d);
    }

    function formatMMDDYYYY(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    // Determine starting date
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (existingDateSet.size > 0) {
        // find max date in existingDateSet
        let maxDate = null;
        existingDateSet.forEach(dStr => {
            if (!isValidDate(dStr)) return;
            const d = parseMMDDYYYY(dStr);
            if (!maxDate || d > maxDate) maxDate = d;
        });
        if (maxDate) {
            // Start searching from the day after maxDate
            startDate = new Date(maxDate);
            startDate.setDate(maxDate.getDate() + 1);
            startDate.setHours(0, 0, 0, 0);
        }
    }

    const maxPairs = 8;
    let pairsAdded = 0;
    let totalDaysAdded = 0;

    // Respect MAX_BATCH_SIZE limit
    const availableSlots = CONFIG.DATE_SELECTOR.MAX_BATCH_SIZE - selectedDates.size;
    if (availableSlots <= 0) {
        alert(`⚠️ Cannot add more dates: maximum ${CONFIG.DATE_SELECTOR.MAX_BATCH_SIZE} dates selected.`);
        return 0;
    }

    // We'll attempt to add up to maxPairs pairs, but also not exceed availableSlots
    const maxPossibleDaysToAdd = Math.min(availableSlots, maxPairs * 2);

    // Search forward for weekends until we get maxPairs or reach a lookahead limit
    const lookaheadLimitDays = 365 * 2; // search up to 2 years to find weekends (safe upper bound)
    let cursor = new Date(startDate);

    for (let i = 0; i < lookaheadLimitDays && pairsAdded < maxPairs && totalDaysAdded < maxPossibleDaysToAdd; i++) {
        const dayOfWeek = cursor.getDay(); // 0=Sun .. 6=Sat

        // If Saturday, try to add Saturday + Sunday
        if (dayOfWeek === 6) {
            const sat = new Date(cursor);
            const sun = new Date(cursor);
            sun.setDate(cursor.getDate() + 1);

            const satStr = formatMMDDYYYY(sat);
            const sunStr = formatMMDDYYYY(sun);

            // Check that neither is in existingDateSet and not past
            const satPast = isPastDate(satStr);
            const sunPast = isPastDate(sunStr);

            // If either day is past or already has slots, we should skip this pair
            // but still continue searching for future pairs.
            const satExists = existingDateSet.has(satStr);
            const sunExists = existingDateSet.has(sunStr);

            // Decide which of the pair to add. Requirement said add next 8 weekends (Saturday + Sunday pairs).
            // So we only add the pair when both days are available (not existing and not past).
            if (!satExists && !sunExists && !satPast && !sunPast) {
                // Ensure adding the pair won't exceed batch limit
                if (totalDaysAdded + 2 > maxPossibleDaysToAdd) {
                    // Not enough room to add both days as a pair; stop attempting further pairs.
                    break;
                }

                selectedDates.add(satStr);
                selectedDates.add(sunStr);
                totalDaysAdded += 2;
                pairsAdded++;
            }
            // advance cursor by 2 days (skip Sunday in next iteration)
            cursor.setDate(cursor.getDate() + 2);
            continue;
        }

        // Otherwise advance by 1 day
        cursor.setDate(cursor.getDate() + 1);
    }

    // Done searching — return the number of added days
    return totalDaysAdded;
}

function toggleDateSelection(dateStr) {
    if (!isValidDate(dateStr) || existingDateSet.has(dateStr) || isPastDate(dateStr)) {
        return;
    }
    
    if (!selectedDates.has(dateStr) && selectedDates.size >= CONFIG.DATE_SELECTOR.MAX_BATCH_SIZE) {
        alert(`⚠️ Maximum ${CONFIG.DATE_SELECTOR.MAX_BATCH_SIZE} dates can be selected at once.\n\nThis prevents overwhelming the system.`);
        return;
    }
    
    if (selectedDates.has(dateStr)) {
        selectedDates.delete(dateStr);
    } else {
        selectedDates.add(dateStr);
    }
    
    const chip = document.querySelector(`.date-chip[data-date="${dateStr}"]`);
    if (chip) {
        chip.classList.toggle('selected');
        chip.setAttribute('aria-pressed', selectedDates.has(dateStr) ? 'true' : 'false');
    }
    
    updateSelectedDatesCount();
}

function updateSelectedDatesCount() {
    const countEl = document.getElementById('selectedDatesCount');
    if (countEl) {
        countEl.textContent = selectedDates.size;
        countEl.style.color = selectedDates.size > 0 ? '#10b981' : '#64748b';
        countEl.style.fontWeight = selectedDates.size > 0 ? '700' : '600';
    }
}

// ================================================================================================
// SLOT CONFIGURATION
// ================================================================================================

function renderCheckboxes() {
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
// FIX #6: IMPROVED LOGIN WITH SESSION MANAGEMENT
// ================================================================================================

async function login() {
    const password = document.getElementById("adminPassword").value.trim();
    const loginMsg = document.getElementById("loginMsg");

    loginMsg.textContent = "Checking...";
    loginMsg.style.color = "#444";

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "login", password })
        });

        const data = await res.json();
        console.log("Login response:", data); // Debug

        if (data.ok) {
            adminToken = data.token; // ← store the token

            loginMsg.textContent = "Login successful!";
            loginMsg.style.color = "green";

            document.getElementById("loginSection").style.display = "none";
            document.getElementById("adminSection").style.display = "block";

            await loadSlots(); // Now will work with the token
        } else {
            loginMsg.textContent = data.error || "Invalid password";
            loginMsg.style.color = "red";
        }
    } catch (err) {
        console.error("Login error:", err);
        loginMsg.textContent = "Network error";
        loginMsg.style.color = "red";
    }
}


// ================================================================================================
// SUBMIT NEW SLOTS (Batch Submission with Validation)
// ================================================================================================

async function submitNewSlots() {
    const submitBtn = document.getElementById("submitSlotsBtn");
    const checkboxes = document.querySelectorAll(".slot-checkbox");
    
    if (selectedDates.size === 0) {
        showMessage("addMsg", "Please select at least one date.", true);
        return;
    }
    
    // Determine which time slots to add
    const slots = [];
    let slotsSelected = false;
    
    checkboxes.forEach((cb, index) => {
        const capacityInput = document.getElementById(`capacity-${index}`);
        
        if (cb.checked) {
            slotsSelected = true;
            let capacity = parseInt(capacityInput.value) || CONFIG.SLOTS.DEFAULT_CAPACITY;
            capacity = Math.max(CONFIG.SLOTS.MIN_CAPACITY, Math.min(CONFIG.SLOTS.MAX_CAPACITY, capacity));
            
            slots.push({
                label: DEFAULT_SLOT_LABELS[index],
                capacity: capacity
            });
        }
    });
    
    if (!slotsSelected) {
        showMessage("addMsg", "Please select at least one time slot.", true);
        return;
    }
    
    // FIX #3: Client-side validation before sending
    const errors = [];
    selectedDates.forEach(dateStr => {
        if (!isValidDate(dateStr)) {
            errors.push(`Invalid date format: ${dateStr}`);
        }
        if (isPastDate(dateStr)) {
            errors.push(`Date is in the past: ${dateStr}`);
        }
        if (existingDateSet.has(dateStr)) {
            errors.push(`Date already has slots: ${dateStr}`);
        }
    });
    
    if (errors.length > 0) {
        showMessage("addMsg", `Validation errors:\n${errors.join('\n')}`, true);
        return;
    }
    
    // Prepare the batch payload
    const newSlotsData = [];
    selectedDates.forEach(dateString => {
        newSlotsData.push({
            date: dateString,
            slots: slots
        });
    });

    if (newSlotsData.length === 0) {
        showMessage("addMsg", "Internal error: No slot data was prepared.", true);
        return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    
    submitBtn.textContent = `Processing ${selectedDates.size} date(s)...`;
    showMessage("addMsg", `🚀 Submitting ${selectedDates.size} date(s) in a single batch...`, false);
    
    try {
        const startTime = performance.now();
        
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ newSlotsData }), 
        });

        const result = await response.json();
        const duration = performance.now() - startTime;
        
        if (response.ok && result.ok) {
            const message = result.message || `Successfully added ${selectedDates.size} date(s)!`;
            
            showMessage("addMsg", `✅ ${message} in ${(duration/1000).toFixed(1)}s!`, false);

            // Clear state and reload
            selectedDates.clear();
            invalidateCache();
            await loadSlots(); 
            generateDateOptions();

            // Animate stats
            ['totalDates', 'totalSlots', 'totalBookings', 'totalAvailable'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.style.animation = 'none';
                    setTimeout(() => el.style.animation = 'pulse 0.5s', 10);
                }
            });

        } else {
            // Handle validation errors from backend
            const errorMsg = result.error || "Failed to add slots";
            let displayError = errorMsg;
            
            if (result.details && Array.isArray(result.details)) {
                displayError = `${errorMsg}\n\nDetails:\n${result.details.join('\n')}`;
            }
            
            showMessage("addMsg", `❌ ${displayError}`, true);
        }
    } catch (error) {
        console.error("Batch Submission failed:", error);
        showMessage("addMsg", `❌ Submission failed: ${error.message}`, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// ================================================================================================
// LOAD SLOTS (With Caching)
// ================================================================================================

async function loadSlots() {
    const display = document.getElementById("slotsDisplay");
    
    // Check cache first
    const cached = getCachedData();
    if (cached) {
        console.log('✅ Using admin cache');
        renderSlots(cached);
        return;
    }
    
    // Show loading skeleton
    display.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;">
            ${Array(6).fill('<div class="slot-date-group" style="height: 200px; background: #f1f5f9; animation: pulse 1.5s infinite;"></div>').join('')}
        </div>
    `;
    
    slotsToDelete = [];
    existingDateSet = new Set();
    allSlots = [];
    updateDeleteButton();
    
    try {
        const startTime = performance.now();
        
        const res = await fetch(API_URL, {
            headers: { "Authorization": `Bearer ${adminToken}` }
        });
        
        const fetchTime = performance.now() - startTime;
        console.log(`⏱️ Admin API fetch took ${fetchTime.toFixed(0)}ms`);
        
        const data = await res.json();
        
        if (!data.ok) {
            if (res.status === 401) {
                alert("⚠️ Session expired. Please log in again.");
                adminToken = null;
                location.reload();
                return;
            }
            display.innerHTML = "<p class='msg-box error'>Failed to load slots</p>";
            return;
        }
        
        // Cache the data
        setCachedData(data);
        
        renderSlots(data);
        
    } catch (err) {
        handleError('LoadSlots', err, 'Error loading slots. Please refresh the page.');
        display.innerHTML = "<p class='msg-box error'>Error loading slots. Check console and refresh.</p>";
    }
}

function renderSlots(data) {
    const display = document.getElementById("slotsDisplay");
    
    allSlots = data.slots;
    
    // Group by date
    const grouped = {};
    let totalBookings = 0;
    let totalAvailable = 0;
    
    data.slots.forEach(slot => {
        if (!grouped[slot.date]) grouped[slot.date] = [];
        grouped[slot.date].push(slot);
        existingDateSet.add(slot.date);
        totalBookings += slot.taken;
        totalAvailable += slot.available;
    });
    
    // Update statistics
    document.getElementById('totalDates').textContent = Object.keys(grouped).length;
    document.getElementById('totalSlots').textContent = data.slots.length;
    document.getElementById('totalBookings').textContent = totalBookings;
    document.getElementById('totalAvailable').textContent = totalAvailable;
    document.getElementById('statsBar').style.display = 'flex';
    
    if (Object.keys(grouped).length === 0) {
        display.innerHTML = "<p style='text-align: center; padding: 40px; color: #64748b;'>📅 No slots added yet. Add some dates above!</p>";
        document.getElementById('statsBar').style.display = 'none';
        return;
    }
    
    // Sort dates chronologically
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
    
    let html = '<div class="compact-slots-grid">';
    
    sortedDates.forEach(date => {
        const slots = grouped[date];
        const isPast = isPastDate(date);
        const pastClass = isPast ? 'past' : '';
        const { monthName, dayNum, weekday } = formatDateShort(date);
        
        html += `
            <div class="slot-date-group ${pastClass}">
                <div class="date-header">
                    <div class="date-title">
                        ${sanitizeHTML(monthName)} ${sanitizeHTML(String(dayNum))}
                        <span style="font-size: 0.7rem; opacity: 0.7; display: block;">${sanitizeHTML(weekday)}</span>
                    </div>
                    <input type="checkbox" 
                            class="date-select-all" 
                            onchange="toggleSelectAllForDate('${date.replace(/'/g, "\\'")}', this.checked)"
                            aria-label="Select all slots for ${sanitizeHTML(date)}"
                            title="Select all slots for this date">
                </div>
        `;
        
        slots.forEach(slot => {
            const isFull = slot.available <= 0;
            html += `
                <div class="slot-row">
                    <input type="checkbox" 
                            class="slot-row-checkbox" 
                            data-row-id="${slot.id}" 
                            data-date="${date}"
                            onchange="toggleSlotSelection(${slot.id}, this.checked)"
                            aria-label="Select ${sanitizeHTML(slot.slotLabel)}">
                    <div class="slot-info">
                        <span class="slot-label">${sanitizeHTML(slot.slotLabel)}</span>
                        <span class="slot-capacity ${isFull ? 'full' : ''}">
                            ${slot.taken}/${slot.capacity} booked
                        </span>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    html += '</div>';
    display.innerHTML = html;
}

// ================================================================================================
// SLOT SELECTION & DELETION
// ================================================================================================

function toggleSlotSelection(rowId, isChecked) {
    if (isChecked) {
        if (!slotsToDelete.includes(rowId)) {
            slotsToDelete.push(rowId);
        }
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
            if (!slotsToDelete.includes(rowId)) {
                slotsToDelete.push(rowId);
            }
        });
    }
    
    updateDeleteButton();
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const count = slotsToDelete.length;
    
    if (deleteBtn) {
        if (count > 0) {
            deleteBtn.textContent = `🗑️ Delete Selected (${count})`;
            deleteBtn.style.display = 'inline-block';
        } else {
            deleteBtn.style.display = 'none';
        }
    }
    
    if (selectAllBtn) {
        const allCheckboxes = document.querySelectorAll('.slot-row-checkbox');
        const allSelected = allCheckboxes.length > 0 && slotsToDelete.length === allCheckboxes.length;
        selectAllBtn.textContent = allSelected ? '☐ Deselect All' : '☑️ Select All';
    }
}

async function deleteSelectedSlots() {
    if (slotsToDelete.length === 0) {
        alert("⚠️ Please select at least one slot to delete.");
        return;
    }
    
    const slotDetails = slotsToDelete.map(id => {
        const slot = allSlots.find(s => s.id === id);
        if (!slot) return null;
        return `  • ${slot.date} ${slot.slotLabel} (${slot.taken} booking${slot.taken !== 1 ? 's' : ''})`;
    }).filter(Boolean).join('\n');
    
    const totalBookings = slotsToDelete.reduce((sum, id) => {
        const slot = allSlots.find(s => s.id === id);
        return sum + (slot ? slot.taken : 0);
    }, 0);
    
    const confirmMsg = `⚠️ DELETE ${slotsToDelete.length} SLOT${slotsToDelete.length > 1 ? 'S' : ''}?\n\n${slotDetails}\n\n` +
                         `This will affect ${totalBookings} booking${totalBookings !== 1 ? 's' : ''}!\n\n` +
                         `⚠️ THIS CANNOT BE UNDONE!\n\nAre you absolutely sure?`;
    
    if (!confirm(confirmMsg)) {
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
            generateDateOptions();
        } else {
            alert(`❌ ${data.error || 'Failed to delete'}`);
            deleteBtn.disabled = false;
            deleteBtn.textContent = originalText;
        }
    } catch (err) {
        handleError('DeleteSlots', err, `Failed to delete slots: ${err.message}`);
        alert(`❌ Failed to delete slots: ${err.message}`);
        deleteBtn.disabled = false;
        deleteBtn.textContent = originalText;
    }
}

// ================================================================================================
// KEYBOARD SHORTCUTS
// ================================================================================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + A: Select all
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            const isInInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
            if (!isInInput && document.getElementById('adminSection').style.display !== 'none') {
                e.preventDefault();
                selectAllSlots();
            }
        }
        
        // Ctrl/Cmd + D: Delete selected
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            if (slotsToDelete.length > 0 && document.getElementById('adminSection').style.display !== 'none') {
                e.preventDefault();
                deleteSelectedSlots();
            }
        }
        
        // ESC: Clear selection
        if (e.key === 'Escape' && slotsToDelete.length > 0) {
            const allCheckboxes = document.querySelectorAll('.slot-row-checkbox');
            allCheckboxes.forEach(cb => cb.checked = false);
            slotsToDelete = [];
            updateDeleteButton();
        }
    });
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================

document.addEventListener('DOMContentLoaded', () => {
    renderCheckboxes();
    setupKeyboardShortcuts();
    // Create the new weekend controls (stacked layout above date chips)
    createWeekendControls();
    // Generate the date chips (no automatic weekend pre-selection)
    generateDateOptions(); 
    
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    }
    
    // Add CSS animation for stats pulse
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); color: #10b981; }
        }
    `;
    document.head.appendChild(style);
});
