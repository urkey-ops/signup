// ================================================================================================
// UI RENDERING MODULE
// ================================================================================================

import { STATE, DEFAULT_SLOTS } from './config.js';
import { formatDate, isPastDate, isWeekend, displayMessage, getNextSixtyDays } from './utils.js';

/**
 * Clear all selected dates
 */
export function clearAllDates() {
    STATE.selectedDates = [];

    const countEl = document.getElementById('selectedDatesCount');
    if (countEl) countEl.textContent = '0';

    const chips = document.querySelectorAll('.date-chip.selected');
    chips.forEach(chip => chip.classList.remove('selected'));

    displayMessage('addMsg', 'All dates cleared.', 'info');
}

/**
 * Toggle date selection
 * @param {string} dateStr
 * @param {HTMLElement} chip
 */
export function toggleDateSelection(dateStr, chip) {
    if (!STATE.loadedSlots) {
        displayMessage('addMsg', 'Please wait for slots to load first.', 'warning');
        return;
    }

    const existingDates = STATE.loadedSlots.map(s => s.date);

    if (existingDates.includes(dateStr)) {
        displayMessage('addMsg', `⚠️ Cannot select ${dateStr}. Slots already exist for this date.`, 'error');
        chip.classList.remove('selected');
        return;
    }

    const index = STATE.selectedDates.indexOf(dateStr);

    if (index === -1) {
        STATE.selectedDates.push(dateStr);
        chip.classList.add('selected');
    } else {
        STATE.selectedDates.splice(index, 1);
        chip.classList.remove('selected');
    }

    const countEl = document.getElementById('selectedDatesCount');
    if (countEl) countEl.textContent = STATE.selectedDates.length;

    const msgBox = document.getElementById('addMsg');
    if (msgBox && msgBox.classList.contains('error')) {
        msgBox.style.display = 'none';
    }
}

/**
 * Render interactive date chips
 */
export function createWeekendControls() {
    const selector = document.getElementById('multiDateSelector');
    if (!selector) return;

    selector.innerHTML = '';
    const days = getNextSixtyDays();
    const existingDates = STATE.loadedSlots.map(s => s.date);

    days.forEach(dateObj => {
        const dateStr = formatDate(dateObj);
        const isPast = isPastDate(dateStr);
        const hasSlots = existingDates.includes(dateStr);
        const weekend = isWeekend(dateObj);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const monthName = dateObj.toLocaleDateString('en-US', { month: 'short' });
        const dayOfMonth = dateObj.getDate();

        const chip = document.createElement('div');

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
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', isPast || hasSlots ? '-1' : '0');

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

        if (!isPast && !hasSlots) {
            chip.addEventListener('click', () => toggleDateSelection(dateStr, chip));
            chip.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleDateSelection(dateStr, chip);
                }
            });
        }

        selector.appendChild(chip);
    });

    renderSlotCheckboxes();
}

/**
 * Render time slot checkboxes with capacity inputs
 */
export function renderSlotCheckboxes() {
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
 * Render slots grouped by date
 * @param {Array} slots
 */
export function renderSlots(slots) {
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

    const groupedSlots = slots.reduce((acc, slot) => {
        (acc[slot.date] = acc[slot.date] || []).push(slot);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedSlots).sort((a, b) => {
        const [monthA, dayA, yearA] = a.split('/').map(Number);
        const [monthB, dayB, yearB] = b.split('/').map(Number);
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateA - dateB;
    });

    sortedDates.forEach(date => {
        const [month, day, year] = date.split('/').map(Number);
        const dateObj = new Date(year, month - 1, day);

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

    bindSlotCheckboxEvents();
    updateDeleteButtonCount();
}

function bindSlotCheckboxEvents() {
    const checkboxes = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateDeleteButtonCount);
    });
}

/**
 * Update delete button text and visibility
 */
export function updateDeleteButtonCount() {
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
export function updateStats(slots) {
    const statsBar = document.getElementById('statsBar');
    if (!statsBar) return;

    const totalDatesEl = document.getElementById('totalDates');
    const totalSlotsEl = document.getElementById('totalSlots');
    const totalBookingsEl = document.getElementById('totalBookings');
    const totalAvailableEl = document.getElementById('totalAvailable');
    const utilizationRateEl = document.getElementById('utilizationRate');

    if (slots.length === 0) {
        statsBar.style.display = 'none';
        return;
    }

    const futureSlots = slots.filter(slot => !isPastDate(slot.date));

    const totalDates = new Set(futureSlots.map(s => s.date)).size;
    const totalSlots = futureSlots.length;
    const totalBookings = futureSlots.reduce((sum, slot) => sum + slot.taken, 0);
    const totalCapacity = futureSlots.reduce((sum, slot) => sum + slot.capacity, 0);
    const totalAvailable = futureSlots.reduce((sum, slot) => sum + slot.available, 0);

    const utilizationRate = totalCapacity > 0
        ? Math.round((totalBookings / totalCapacity) * 100)
        : 0;

    if (totalDatesEl) totalDatesEl.textContent = totalDates;
    if (totalSlotsEl) totalSlotsEl.textContent = totalSlots;
    if (totalBookingsEl) totalBookingsEl.textContent = totalBookings;
    if (totalAvailableEl) totalAvailableEl.textContent = totalAvailable;
    if (utilizationRateEl) utilizationRateEl.textContent = `${utilizationRate}%`;

    statsBar.style.display = 'grid';
}

/**
 * Toggle all slot checkboxes
 */
export function selectAllSlots() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    const checkboxes = document.querySelectorAll('#slotsDisplay input[type="checkbox"][data-row-id]');

    if (!selectAllBtn || checkboxes.length === 0) return;

    const isSelectAll = selectAllBtn.textContent.includes('Select All');

    checkboxes.forEach(cb => {
        cb.checked = isSelectAll;
    });

    updateDeleteButtonCount();
    selectAllBtn.textContent = isSelectAll ? '☐ Deselect All' : '☑️ Select All';
}
