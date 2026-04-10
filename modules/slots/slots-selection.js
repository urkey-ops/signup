// ================================================================================================
// SLOTS SELECTION - SLOT TOGGLE, MULTI-SELECT, DESELECT LOGIC
// FIX #2: showMessage now targets #slotsMessage (inline) instead of global toast
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots, CONFIG } from '../../config.js';
import { showMessage } from '../../utils.js';
import { updateSummaryDisplay, updateFloatingButton } from './slots-summary.js';

// ================================================================================================
// SLOT TOGGLE
// ================================================================================================

export function toggleSlot(date, label, slotId, element) {
  const selectedSlots = getSelectedSlots();
  const alreadySelected = isSlotSelected(slotId);

  if (alreadySelected) {
    const newSlots = selectedSlots.filter(s => s.id !== slotId);
    updateSelectedSlots(newSlots);
    if (element) {
      element.classList.remove('selected');
      element.setAttribute('aria-pressed', 'false');
    }
  } else {
    if (selectedSlots.length >= CONFIG.MAX_SLOTS_PER_BOOKING) {
      // FIX #2: use inline container, not global toast
      const inlineMsg = document.getElementById('slotsMessage');
      const msg = `You can only select up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slot${CONFIG.MAX_SLOTS_PER_BOOKING !== 1 ? 's' : ''} per booking.`;
      if (inlineMsg) {
        showMessage(inlineMsg, msg, 'warning', 4000);
      } else {
        showMessage(msg, 'warning', 4000);
      }
      return;
    }

    const newSlots = [...selectedSlots, { id: slotId, date, label }];
    updateSelectedSlots(newSlots);
    if (element) {
      element.classList.add('selected');
      element.setAttribute('aria-pressed', 'true');
    }
  }

  updateSummaryDisplay();
  updateFloatingButton();
}

// ================================================================================================
// MULTI-SELECT / DESELECT
// ================================================================================================

export function selectMultipleSlots(slots) {
  if (!Array.isArray(slots) || slots.length === 0) return;

  const selectedSlots = getSelectedSlots();
  const existingIds   = new Set(selectedSlots.map(s => s.id));
  const available     = CONFIG.MAX_SLOTS_PER_BOOKING - selectedSlots.length;

  const toAdd = slots.filter(s => !existingIds.has(s.id)).slice(0, available);

  if (toAdd.length === 0) {
    const inlineMsg = document.getElementById('slotsMessage');
    const msg = `You can only select up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots per booking.`;
    if (inlineMsg) {
      showMessage(inlineMsg, msg, 'warning', 4000);
    } else {
      showMessage(msg, 'warning', 4000);
    }
    return;
  }

  updateSelectedSlots([...selectedSlots, ...toAdd]);

  toAdd.forEach(slot => {
    const el = document.querySelector(`[data-slot-id="${slot.id}"]`);
    if (el) {
      el.classList.add('selected');
      el.setAttribute('aria-pressed', 'true');
    }
  });

  if (toAdd.length < slots.length) {
    const skipped   = slots.length - toAdd.length;
    const inlineMsg = document.getElementById('slotsMessage');
    const msg       = `Added ${toAdd.length} slot${toAdd.length !== 1 ? 's' : ''}. ${skipped} skipped (limit reached).`;
    if (inlineMsg) {
      showMessage(inlineMsg, msg, 'warning', 4000);
    } else {
      showMessage(msg, 'warning', 4000);
    }
  }

  updateSummaryDisplay();
  updateFloatingButton();
}

export function deselectMultipleSlots(slotIds) {
  if (!Array.isArray(slotIds) || slotIds.length === 0) return;

  const idSet    = new Set(slotIds);
  const newSlots = getSelectedSlots().filter(s => !idSet.has(s.id));
  updateSelectedSlots(newSlots);

  slotIds.forEach(id => {
    const el = document.querySelector(`[data-slot-id="${id}"]`);
    if (el) {
      el.classList.remove('selected');
      el.setAttribute('aria-pressed', 'false');
    }
  });

  updateSummaryDisplay();
  updateFloatingButton();
}

export function clearAllSelections() {
  getSelectedSlots().forEach(slot => {
    const el = document.querySelector(`[data-slot-id="${slot.id}"]`);
    if (el) {
      el.classList.remove('selected');
      el.setAttribute('aria-pressed', 'false');
    }
  });

  updateSelectedSlots([]);
  updateSummaryDisplay();
  updateFloatingButton();
  console.log('All slot selections cleared');
}

// ================================================================================================
// QUERY HELPERS
// ================================================================================================

export function isSlotSelected(slotId) {
  return getSelectedSlots().some(s => s.id === slotId);
}

export function getSelectionCount() {
  return getSelectedSlots().length;
}

export function isSelectionFull() {
  return getSelectedSlots().length >= CONFIG.MAX_SLOTS_PER_BOOKING;
}
