// ================================================================================================
// SIGNUP CONFLICT HANDLER - 409 RESPONSE UI & LOGIC (FIXED DATE FORMATTING)
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots } from '../../config.js';
import { escapeHTML } from '../../utils.js';
import { updateSummaryDisplay } from '../../slots.js';

let activeConflictButtons = null;

// ================================================================================================
// CONFLICT UI RENDERING
// ================================================================================================

export function displayConflictUI(msgEl, data, onBookValid, onRemoveConflicts, onBackToSlots) {
    if (!msgEl || !data) {
        console.error('displayConflictUI: Missing required parameters');
        return;
    }

    cleanupConflictButtons();
    msgEl.innerHTML = '';

    const validSlots      = data.validSlots || 0;
    const slotStatus      = data.slotStatus || [];
    const conflictedCount = slotStatus.filter(s => s.status === 'conflict').length;

    const messageDiv = document.createElement('div');
    messageDiv.style.marginBottom = '10px';
    messageDiv.textContent = '⚠️ ' + (data.error || 'Some slots are no longer available');
    msgEl.appendChild(messageDiv);

    const details = createConflictDetailsAccordion(validSlots, conflictedCount, slotStatus);
    msgEl.appendChild(details);

    const actionsDiv = createConflictActionButtons(
        validSlots,
        conflictedCount,
        onBookValid,
        onRemoveConflicts,
        onBackToSlots
    );
    msgEl.appendChild(actionsDiv);

    console.log(`✅ Conflict UI displayed: ${validSlots} valid, ${conflictedCount} conflicts`);
}

function createConflictDetailsAccordion(validSlots, conflictedCount, slotStatus) {
    const details = document.createElement('details');
    details.className = 'conflict-details';

    const summary = document.createElement('summary');
    summary.textContent = `Show details (${validSlots}✅ ${conflictedCount}❌)`;
    details.appendChild(summary);

    if (slotStatus && Array.isArray(slotStatus) && slotStatus.length > 0) {
        slotStatus.forEach(slot => {
            const slotDiv = document.createElement('div');
            const icon    = slot.status === 'valid' ? '✅' : '❌';

            // FIX: append 'T00:00:00' to force local-time parse (avoids UTC off-by-one day)
            const readableDate = new Date(slot.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short',
                month:   'short',
                day:     'numeric'
            });

            const label  = escapeHTML(slot.label  || 'Unknown');
            const reason = escapeHTML(slot.reason || 'OK');

            slotDiv.textContent = `${icon} ${readableDate} ${label}: ${reason}`;
            details.appendChild(slotDiv);
        });
    } else {
        const noDetails = document.createElement('div');
        noDetails.textContent = 'No slot details available';
        details.appendChild(noDetails);
    }

    return details;
}

function createConflictActionButtons(validSlots, conflictedCount, onBookValid, onRemoveConflicts, onBackToSlots) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'conflict-actions';

    const bookBtn = document.createElement('button');
    bookBtn.className   = 'btn primary-btn';
    bookBtn.textContent = `✅ Book ${validSlots} Valid Slot${validSlots !== 1 ? 's' : ''}`;
    bookBtn.disabled    = validSlots === 0;

    const removeBtn = document.createElement('button');
    removeBtn.className   = 'btn secondary-btn';
    removeBtn.textContent = `🗑️ Remove ${conflictedCount} Conflict${conflictedCount !== 1 ? 's' : ''}`;

    const backBtn = document.createElement('button');
    backBtn.className   = 'btn secondary-btn';
    backBtn.textContent = '🔄 Back to Slots';

    actionsDiv.appendChild(bookBtn);
    actionsDiv.appendChild(removeBtn);
    actionsDiv.appendChild(backBtn);

    activeConflictButtons = [bookBtn, removeBtn, backBtn];

    bookBtn.addEventListener('click', async () => {
        if (validSlots > 0) await onBookValid();
    }, { once: true });

    removeBtn.addEventListener('click', () => {
        onRemoveConflicts();
    }, { once: true });

    backBtn.addEventListener('click', () => {
        onBackToSlots();
    }, { once: true });

    return actionsDiv;
}

// ================================================================================================
// CONFLICT RESOLUTION LOGIC
// ================================================================================================

export function filterValidSlots(slotStatus) {
    if (!slotStatus || !Array.isArray(slotStatus)) {
        console.warn('filterValidSlots: Invalid slotStatus');
        return [];
    }

    const validSlotIds   = slotStatus.filter(s => s.status === 'valid').map(s => s.slotId);
    const selectedSlots  = getSelectedSlots();
    const validSlots     = selectedSlots.filter(s => validSlotIds.includes(s.id));

    console.log(`✅ Filtered to ${validSlots.length} valid slots`);
    return validSlots;
}

export function removeConflictedSlots(slotStatus) {
    if (!slotStatus || !Array.isArray(slotStatus)) {
        console.warn('removeConflictedSlots: Invalid slotStatus');
        return getSelectedSlots();
    }

    const conflictedIds   = slotStatus.filter(s => s.status === 'conflict').map(s => s.slotId);
    const selectedSlots   = getSelectedSlots();
    const remainingSlots  = selectedSlots.filter(s => !conflictedIds.includes(s.id));

    console.log(`🗑️ Removed ${conflictedIds.length} conflicted slots`);
    return remainingSlots;
}

export function showConflictRemovalSuccess(msgEl, count) {
    if (!msgEl) return;

    msgEl.innerHTML = '';
    const successDiv = document.createElement('div');
    successDiv.className   = 'msg-box success';
    successDiv.textContent = `🗑️ Removed ${count} conflicted slot${count !== 1 ? 's' : ''}`;
    msgEl.appendChild(successDiv);
}

// ================================================================================================
// CONFLICT BUTTON CLEANUP
// ================================================================================================

export function cleanupConflictButtons() {
    if (activeConflictButtons) {
        activeConflictButtons.forEach(btn => {
            if (btn && btn.parentNode) {
                btn.replaceWith(btn.cloneNode(true));
            }
        });
        activeConflictButtons = null;
        console.log('🧹 Conflict buttons cleaned up');
    }
}

// ================================================================================================
// CONFLICT HANDLERS
// ================================================================================================

export async function handleBookValidSlots(slotStatus, submitCallback) {
    const validSlots = filterValidSlots(slotStatus);

    if (validSlots.length === 0) {
        console.warn('No valid slots remaining');
        return false;
    }

    updateSelectedSlots(validSlots);
    updateSummaryDisplay();
    cleanupConflictButtons();

    if (typeof submitCallback === 'function') {
        await submitCallback();
    }

    return true;
}

export function handleRemoveConflicts(slotStatus, msgEl) {
    const conflictedCount = slotStatus.filter(s => s.status === 'conflict').length;
    const remainingSlots  = removeConflictedSlots(slotStatus);

    updateSelectedSlots(remainingSlots);
    updateSummaryDisplay();
    cleanupConflictButtons();

    if (msgEl) showConflictRemovalSuccess(msgEl, conflictedCount);
}

export function handleBackToSlots(backCallback) {
    cleanupConflictButtons();
    if (typeof backCallback === 'function') backCallback();
}
