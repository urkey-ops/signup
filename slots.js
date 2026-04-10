// ================================================================================================
// SLOTS - MAIN ORCHESTRATOR
// FIX #4: Removed dead import 'sortDates' — was imported but never called;
//         sorting is handled internally inside slots-ui.js renderSlots()
// ================================================================================================

import { getSelectedSlots, invalidateCache, getIsSubmitting } from './config.js';
import { injectSlotsStyles } from './modules/slots/slots-styles.js';
import {
  fetchSlots,
  filterFutureSlots,
  isValidSlotsData,
  countAvailableSlots
  // sortDates removed — FIX #4
} from './modules/slots/slots-api.js';
import {
  showSkeletonUI,
  renderSlots,
  renderDateNav,
  updateDateNavCounts,
  toggleDisplay,
  showNoSlotsMessage,
  showErrorMessage,
  resetSlotSelectionUI,
  cleanupSlotListeners
} from './modules/slots/slots-ui.js';
import {
  updateSummaryDisplay,
  updateFloatingButton,
  clearPendingRemovals,
  cleanupFloatingButton
} from './modules/slots/slots-summary.js';
import {
  toggleSlot,
  selectMultipleSlots,
  deselectMultipleSlots,
  clearAllSelections,
  isSlotSelected,
  getSelectionCount,
  isSelectionFull
} from './modules/slots/slots-selection.js';

// MODULE INITIALIZATION
injectSlotsStyles();

// ================================================================================================
// CONFIGURATION / STATE
// ================================================================================================

const MAX_LOAD_RETRIES   = 2;
const RETRY_DELAY_MS     = 1000;
const RELOAD_DEBOUNCE_MS = 300;

let isLoading           = false;
let loadAbortController = null;
let reloadDebounceTimer = null;
let lastRenderedSlots   = null;

// ================================================================================================
// HELPERS
// ================================================================================================

function cancelPendingLoad() {
  if (loadAbortController) {
    loadAbortController.abort();
    loadAbortController = null;
    console.log('Pending slot load cancelled');
  }
}

function resetLoadingState() {
  isLoading = false;
  cancelPendingLoad();
}

// ================================================================================================
// MAIN LOAD FUNCTION
// ================================================================================================

export async function loadSlots(retryCount = 0) {
  if (isLoading) {
    console.warn('Slots already loading, skipping duplicate request');
    return;
  }

  isLoading = true;
  console.log(`Loading slots... ${retryCount > 0 ? `Retry ${retryCount}/${MAX_LOAD_RETRIES}` : ''}`);

  if (loadAbortController) loadAbortController.abort();
  loadAbortController = new AbortController();

  try {
    showSkeletonUI();

    const signupSection = document.getElementById('signupSection');
    if (signupSection) signupSection.style.display = 'none';

    const data = await fetchSlots(loadAbortController.signal);

    if (!data) {
      if (retryCount < MAX_LOAD_RETRIES) {
        console.log(`Retrying slot load... ${retryCount + 1}/${MAX_LOAD_RETRIES}`);
        resetLoadingState();
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return loadSlots(retryCount + 1);
      }
      showErrorMessage('Failed to load slots. Please try again.');
      resetLoadingState();
      return;
    }

    if (data.error) {
      if (retryCount < MAX_LOAD_RETRIES) {
        console.log(`Retrying after error... ${retryCount + 1}/${MAX_LOAD_RETRIES}`);
        resetLoadingState();
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return loadSlots(retryCount + 1);
      }
      showErrorMessage(data.error);
      resetLoadingState();
      return;
    }

    if (!isValidSlotsData(data)) {
      console.error('Invalid data structure received', data);
      showErrorMessage('Invalid data received from server.');
      resetLoadingState();
      return;
    }

    const futureSlots    = filterFutureSlots(data);
    const dateCount      = Object.keys(futureSlots).length;
    const availableCount = countAvailableSlots(futureSlots);
    console.log(`Total dates: ${dateCount}, Available slots: ${availableCount}`);

    if (availableCount === 0) {
      showNoSlotsMessage();
      resetLoadingState();
      return;
    }

    try {
      renderSlots(futureSlots, handleSlotClick);
      toggleDisplay(true);
    } catch (renderErr) {
      console.error('Error rendering slots', renderErr);
      showErrorMessage('Failed to display slots. Please refresh the page.');
      resetLoadingState();
      return;
    }

    renderDateNav(futureSlots);
    lastRenderedSlots = futureSlots;

    updateSummaryDisplay();
    updateFloatingButton();
    console.log(`Successfully loaded ${availableCount} available slots`);

  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Slot loading was cancelled');
      resetLoadingState();
      return;
    }

    console.error('Error loading slots', err);

    if (retryCount < MAX_LOAD_RETRIES) {
      console.log(`Retrying after error... ${retryCount + 1}/${MAX_LOAD_RETRIES}`);
      resetLoadingState();
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return loadSlots(retryCount + 1);
    }

    showErrorMessage('An unexpected error occurred. Please refresh the page.');
    resetLoadingState();

  } finally {
    isLoading = false;
    loadAbortController = null;
  }
}

// ================================================================================================
// SLOT CLICK HANDLER
// ================================================================================================

function handleSlotClick(date, label, slotId, element) {
  const wasSelected = isSlotSelected(slotId);
  toggleSlot(date, label, slotId, element);
  if (!wasSelected) {
    console.log(`Slot selected: ${label} on ${date} ID: ${slotId}`);
  } else {
    console.log(`Slot deselected: ${label} on ${date} ID: ${slotId}`);
  }
}

// ================================================================================================
// PUBLIC API
// ================================================================================================

export async function forceReloadSlots() {
  if (reloadDebounceTimer) {
    console.log('Reload already scheduled, skipping duplicate');
    clearTimeout(reloadDebounceTimer);
  }
  reloadDebounceTimer = setTimeout(async () => {
    console.log('Force reloading slots...');
    cancelPendingLoad();
    invalidateCache();
    isLoading = false;
    lastRenderedSlots = null;
    await loadSlots();
    reloadDebounceTimer = null;
  }, RELOAD_DEBOUNCE_MS);
}

export { resetSlotSelectionUI };
export { updateSummaryDisplay };
export { toggleSlot };
export { selectMultipleSlots, deselectMultipleSlots, clearAllSelections, isSlotSelected, getSelectionCount, isSelectionFull };

// ================================================================================================
// SSE LIVE UPDATE HANDLER
// ================================================================================================

export function onSlotsAvailabilityChanged(updatedGroupedSlots) {
  lastRenderedSlots = updatedGroupedSlots;
  updateDateNavCounts(updatedGroupedSlots);
}

// ================================================================================================
// BEFOREUNLOAD WARNING
// ================================================================================================

function setupBeforeUnloadWarning() {
  window.addEventListener('beforeunload', (e) => {
    if (getIsSubmitting()) return;

    const successSection = document.getElementById('successMessage');
    const signupSection  = document.getElementById('signupSection');

    if (!successSection || !signupSection) return;
    if (successSection.style.display === 'block') return;
    if (signupSection.style.display === 'block') return;

    const selectedSlots = getSelectedSlots();
    if (selectedSlots.length === 0) return;

    e.preventDefault();
    e.returnValue = 'You have selected slots but have not completed your booking. Are you sure you want to leave?';
    return e.returnValue;
  });
}

// ================================================================================================
// CLEANUP
// ================================================================================================

export function cleanup() {
  console.log('Cleaning up slots module...');
  cancelPendingLoad();
  if (reloadDebounceTimer) { clearTimeout(reloadDebounceTimer); reloadDebounceTimer = null; }
  cleanupSlotListeners();
  cleanupFloatingButton();
  clearPendingRemovals();
  isLoading = false;
  lastRenderedSlots = null;
  console.log('Slots module cleaned up');
}

// ================================================================================================
// INITIALIZATION
// ================================================================================================

function initialize() {
  console.log('Slots module initializing...');

  setupBeforeUnloadWarning();

  window.addEventListener('reloadSlots', (e) => {
    console.log('Reload slots event triggered');
    if (e instanceof Event) {
      forceReloadSlots();
    } else {
      console.warn('Invalid reload event received');
    }
  });

  window.addEventListener('slots-availability-changed', (e) => {
    if (e.detail?.groupedSlots) {
      onSlotsAvailabilityChanged(e.detail.groupedSlots);
    }
  });

  window.addEventListener('pagehide', cleanup);

  console.log('Slots module initialized');
}

initialize();
