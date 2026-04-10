// ================================================================================================
// SLOTS SUMMARY - SELECTED SLOTS DISPLAY & MANAGEMENT
// FIX #1: updateSummaryDisplay now populates BOTH #selectedSlotsSummary (slots section)
//         AND #selectedSlotSummary (signup section) — previously only one was ever updated.
// FIX #8: Removed dead import of sortSlotsByTime (imported but never used)
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots } from '../../config.js';
import { showMessage } from '../../utils.js';
import { updateSlotUI } from './slots-ui.js';

let pendingRemovals = new Set();
let removalTimeout  = null;

// ================================================================================================
// SUMMARY DISPLAY
// ================================================================================================

export function updateSummaryDisplay() {
  const slotsSectionSummary  = document.getElementById('selectedSlotsSummary');
  const signupSectionSummary = document.getElementById('selectedSlotSummary');

  const selectedSlots = getSelectedSlots();

  function populateSummaryEl(summaryEl) {
    if (!summaryEl) return;
    summaryEl.innerHTML = '';

    const heading = document.createElement('div');
    heading.style.marginBottom = '12px';
    const headingStrong = document.createElement('strong');
    headingStrong.textContent = `📋 Selected ${selectedSlots.length} Slot${selectedSlots.length !== 1 ? 's' : ''}:`;
    heading.appendChild(headingStrong);
    summaryEl.appendChild(heading);

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'chips-container';

    sortSlotsByDate(selectedSlots).forEach(slot =>
      chipsContainer.appendChild(createSlotChip(slot))
    );

    summaryEl.appendChild(chipsContainer);
  }

  populateSummaryEl(slotsSectionSummary);
  populateSummaryEl(signupSectionSummary);

  if (slotsSectionSummary) {
    if (selectedSlots.length > 0) {
      slotsSectionSummary.classList.remove('hidden');
    } else {
      slotsSectionSummary.classList.add('hidden');
    }
  }

  console.log(`Summary updated: ${selectedSlots.length} slots`);
}

function sortSlotsByDate(slots) {
  return [...slots].sort((a, b) => {
    const dateCompare = new Date(a.date) - new Date(b.date);
    if (dateCompare !== 0) return dateCompare;
    return parseTimeForSorting(a.label) - parseTimeForSorting(b.label);
  });
}

function parseTimeForSorting(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const firstPart = timeStr.replace(/\s*-\s*/g, '-').trim().split('-')[0].trim().toLowerCase();  // FIX: was /\\s*-\\s*/g
  const m = firstPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);  // FIX: was \\d, \\s
  if (!m) return 0;
  let hour      = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const period  = m[3] ? m[3].toLowerCase() : null;
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

function createSlotChip(slot) {
  // FIX: append 'T00:00:00' to force local-time parse (avoids UTC off-by-one)
  const dateObj   = new Date(slot.date + 'T00:00:00');
  const shortDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // FIX: all three regex were double-escaped (:\\d{2}, \\s*-\\s*, \\s)
  const shortTime = slot.label
    .replace(/:\d{2}/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s/g, '');

  const chip = document.createElement('div');
  chip.className      = 'slot-chip';
  chip.dataset.slotId = slot.id;

  const chipContent = document.createElement('span');
  chipContent.className = 'chip-content';

  const chipDate = document.createElement('span');
  chipDate.className   = 'chip-date';
  chipDate.textContent = shortDate;

  const chipTime = document.createElement('span');
  chipTime.className   = 'chip-time';
  chipTime.textContent = shortTime;

  chipContent.appendChild(chipDate);
  chipContent.appendChild(chipTime);
  chip.appendChild(chipContent);

  const removeBtn = document.createElement('button');
  removeBtn.className   = 'chip-remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.setAttribute('aria-label', `Remove ${slot.date} ${slot.label}`);
  removeBtn.setAttribute('title', 'Remove this booking');
  removeBtn.addEventListener('click', () => removeSlotFromSummary(slot.id));
  chip.appendChild(removeBtn);

  return chip;
}

// ================================================================================================
// SLOT REMOVAL
// ================================================================================================

function removeSlotFromSummary(slotId) {
  if (pendingRemovals.has(slotId)) return;
  pendingRemovals.add(slotId);

  const chipElements = document.querySelectorAll(`.slot-chip[data-slot-id="${slotId}"]`);

  if (chipElements.length > 0) {
    chipElements.forEach(chip => chip.classList.add('removing'));

    if (removalTimeout) clearTimeout(removalTimeout);

    removalTimeout = setTimeout(() => {
      const newSlots = getSelectedSlots().filter(slot => !pendingRemovals.has(slot.id));
      updateSelectedSlots(newSlots);

      pendingRemovals.forEach(id => updateSlotUI(id, false));

      const removalCount = pendingRemovals.size;
      pendingRemovals.clear();
      removalTimeout = null;

      updateSummaryDisplay();
      updateFloatingButton();

      showMessage(
        `Removed ${removalCount} slot${removalCount !== 1 ? 's' : ''} from selection`,
        'info',
        2000
      );
    }, 350);

  } else {
    const newSlots = getSelectedSlots().filter(slot => slot.id !== slotId);
    updateSelectedSlots(newSlots);
    pendingRemovals.delete(slotId);
    updateSlotUI(slotId, false);
    updateSummaryDisplay();
    updateFloatingButton();
  }
}

// ================================================================================================
// FLOATING BUTTON
// ================================================================================================

let floatingButtonListener = null;

export function updateFloatingButton() {
  const btnContainer = document.getElementById('floatingSignupBtnContainer');
  const btn          = document.getElementById('floatingSignupBtn');
  const countBadge   = document.getElementById('floatingSlotCount');
  const summaryLine  = document.getElementById('floatingSlotSummary');

  if (!btnContainer || !btn) { console.warn('Floating button elements not found'); return; }

  const selectedSlots = getSelectedSlots();
  const count         = selectedSlots.length;

  if (count > 0) {
    btnContainer.style.display = 'block';

    if (countBadge) {
      const prev = parseInt(countBadge.textContent) || 0;
      countBadge.textContent = count;
      if (count > prev) {
        countBadge.classList.remove('badge-pop');
        void countBadge.offsetWidth;
        countBadge.classList.add('badge-pop');
      }
    }

    if (summaryLine) {
      const sorted = [...selectedSlots].sort((a, b) => new Date(a.date) - new Date(b.date));
      summaryLine.textContent = sorted
        .map(s => new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
        .join(' · ');
    }

    if (floatingButtonListener) btn.removeEventListener('click', floatingButtonListener);

    floatingButtonListener = (e) => {
      e.preventDefault();
      if (typeof window.goToSignupForm === 'function') window.goToSignupForm();
      window.dispatchEvent(new CustomEvent('showSignupForm'));
    };

    btn.addEventListener('click', floatingButtonListener);

  } else {
    btnContainer.style.display = 'none';
    if (floatingButtonListener) {
      btn.removeEventListener('click', floatingButtonListener);
      floatingButtonListener = null;
    }
    if (summaryLine) summaryLine.textContent = '';
  }
}

// ================================================================================================
// CLEANUP
// ================================================================================================

export function clearPendingRemovals() {
  if (removalTimeout) { clearTimeout(removalTimeout); removalTimeout = null; }
  pendingRemovals.clear();
  console.log('Pending removals cleared');
}

export function cleanupFloatingButton() {
  const btn = document.getElementById('floatingSignupBtn');
  if (btn && floatingButtonListener) {
    btn.removeEventListener('click', floatingButtonListener);
    floatingButtonListener = null;
    console.log('Floating button listener cleaned up');
  }
}
