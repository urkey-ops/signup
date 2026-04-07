// ================================================================================================
// SLOTS SUMMARY - SELECTED SLOTS DISPLAY & MANAGEMENT
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots } from '../../config.js';
import { showMessage } from '../../utils.js';
import { updateSlotUI } from './slots-ui.js';
import { sortSlotsByTime } from './slots-api.js';

// Track pending removals to prevent race conditions
let pendingRemovals  = new Set();
let removalTimeout   = null;

// ================================================================================================
// SLOT TIME-OF-DAY ICON (mirrors slots-ui.js — kept local to avoid circular import)
// ================================================================================================


// ================================================================================================
// SUMMARY DISPLAY
// ================================================================================================

export function updateSummaryDisplay() {
  const summaryEl = document.getElementById('selectedSlotSummary');
  if (!summaryEl) return;

  const selectedSlots = getSelectedSlots();
  summaryEl.innerHTML = '';

  const heading = document.createElement('div');
  heading.style.marginBottom = '12px';
  const headingStrong = document.createElement('strong');
  headingStrong.textContent = `📋 Selected ${selectedSlots.length} Slot${selectedSlots.length !== 1 ? 's' : ''}:`;
  heading.appendChild(headingStrong);
  summaryEl.appendChild(heading);

  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'chips-container';

  const sortedSlots = sortSlotsByDate(selectedSlots);
  sortedSlots.forEach(slot => chipsContainer.appendChild(createSlotChip(slot)));

  summaryEl.appendChild(chipsContainer);
  console.log(`✅ Summary updated: ${selectedSlots.length} slots`);
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
  const normalized = timeStr.replace(/\s*-\s*/g, '-').trim();
  const firstPart  = normalized.split('-')[0].trim().toLowerCase();
  const match      = firstPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return 0;
  let hour = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const period  = match[3] ? match[3].toLowerCase() : null;
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

function createSlotChip(slot) {
  const dateObj   = new Date(slot.date);
  const shortDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Shorten time: "10:00am-12:00pm" → "10am-12pm" ; "9AM - 12PM" → "9AM-12PM"
  const shortTime = slot.label
    .replace(/:\d{2}/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s/g, '');

 

  const chip = document.createElement('div');
  chip.className        = 'slot-chip';
  chip.dataset.slotId   = slot.id;

  const chipContent = document.createElement('span');
  chipContent.className = 'chip-content';

  const chipDate = document.createElement('span');
  chipDate.className   = 'chip-date';
  chipDate.textContent = shortDate;

  const chipTime = document.createElement('span');
  chipTime.className   = 'chip-time';
  // Prepend icon to the time text inside the chip
  chipTime.textContent = shortTime;


  chipContent.appendChild(chipDate);
  chipContent.appendChild(chipTime);
  chip.appendChild(chipContent);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'chip-remove-btn';
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

  const chipElement = document.querySelector(`.slot-chip[data-slot-id="${slotId}"]`);

  if (chipElement) {
    chipElement.classList.add('removing');

    if (removalTimeout) clearTimeout(removalTimeout);

    removalTimeout = setTimeout(() => {
      const selectedSlots = getSelectedSlots();
      const newSlots = selectedSlots.filter(slot => !pendingRemovals.has(slot.id));
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
    const selectedSlots = getSelectedSlots();
    const newSlots = selectedSlots.filter(slot => slot.id !== slotId);
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
  const btnContainer  = document.getElementById('floatingSignupBtnContainer');
  const btn           = document.getElementById('floatingSignupBtn');
  const countBadge    = document.getElementById('floatingSlotCount');
  const summaryLine   = document.getElementById('floatingSlotSummary');

  if (!btnContainer || !btn) { console.warn('Floating button elements not found'); return; }

  const selectedSlots = getSelectedSlots();
  const count         = selectedSlots.length;

  if (count > 0) {
    btnContainer.style.display = 'block';

    // Update badge count — animate on increment
    if (countBadge) {
      const prev = parseInt(countBadge.textContent) || 0;
      countBadge.textContent = count;
      if (count > prev) {
        countBadge.classList.remove('badge-pop');
        // Force reflow so animation re-triggers on every increment
        void countBadge.offsetWidth;
        countBadge.classList.add('badge-pop');
      }
    }

    // Build a compact date summary below the button: "Apr 12 ☀️ · Apr 13 🌤"
    if (summaryLine) {
      const sorted = [...selectedSlots].sort((a, b) => new Date(a.date) - new Date(b.date));
     const parts  = sorted.map(s => {
  const d    = new Date(s.date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
});
      summaryLine.textContent = parts.join(' · ');
    }

    // Clean up previous listener
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
  console.log('🧹 Pending removals cleared');
}

export function cleanupFloatingButton() {
  const btn = document.getElementById('floatingSignupBtn');
  if (btn && floatingButtonListener) {
    btn.removeEventListener('click', floatingButtonListener);
    floatingButtonListener = null;
    console.log('🧹 Floating button listener cleaned up');
  }
}
