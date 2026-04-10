// ================================================================================================
// SIGNUP FORM - UI MANAGEMENT & NAVIGATION (CSS CONSISTENT)
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots } from '../../config.js';
import { showMessage } from '../../utils.js';
import { updateSummaryDisplay, resetSlotSelectionUI } from '../../slots.js';
import { clearAllValidation } from './signup-validation.js';

// ================================================================================================
// FORM DISPLAY & NAVIGATION
// ================================================================================================

/**
 * Show signup form section
 * @returns {boolean} True if form shown successfully
 */
export function showSignupForm() {
  const selectedSlots = getSelectedSlots();

  if (selectedSlots.length === 0) {
    const msgEl = document.getElementById('slotsMessage');
    if (msgEl) {
      showMessage(msgEl, 'Please select at least one slot before continuing.', 'warning');
    }
    return false;
  }

  // Get elements
  const signupSection = document.getElementById('signupSection');
  const slotsSection = document.querySelector('.card[aria-label="Select time slots"]');
  const lookupSection = document.querySelector('.lookup-section');
  const nameInput = document.getElementById('signupName');

  if (!signupSection) {
    console.error('❌ Signup section element not found');
    return false;
  }

  // Hide slots and lookup sections
  if (slotsSection) slotsSection.style.display = 'none';
  if (lookupSection) lookupSection.style.display = 'none';

  // Show signup section
  signupSection.style.display = 'block';
  
  updateSummaryDisplay();

  // Scroll to top of page first, then to signup section
  window.scrollTo({ top: 0, behavior: 'instant' });
  
  setTimeout(() => {
    signupSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Auto-focus name input after scroll
    setTimeout(() => {
      if (nameInput) nameInput.focus();
    }, 300);
  }, 100);

  console.log('✅ Signup form ready for input');
  return true;
}

/**
 * Hide signup form and return to slot selection
 */
export function hideSignupForm() {
  console.log('📍 Returning to slot selection...');

  const successSection = document.getElementById('successMessage');
  const signupSection = document.getElementById('signupSection');
  const signupForm = document.getElementById('signupForm');
  const slotsSection = document.querySelector('.card[aria-label="Select time slots"]');
  const lookupSection = document.querySelector('.lookup-section');
  const summary = document.getElementById('selectedSlotsSummary');

  // Hide success & signup section
  if (successSection) successSection.style.display = 'none';
  if (signupSection) signupSection.style.display = 'none';
  if (signupForm) signupForm.reset();

  // Show slots and lookup sections again
  if (slotsSection) slotsSection.style.display = 'block';
  if (lookupSection) lookupSection.style.display = 'block';
  if (summary) summary.classList.add('hidden');

  // Reset state
  updateSelectedSlots([]);
  resetSlotSelectionUI();

  // Clear form
  clearSignupForm();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger slots reload
  window.dispatchEvent(new CustomEvent('reloadSlots'));

  console.log('✅ Returned to slot selection (state + UI reset)');
}

// ================================================================================================
// FORM DATA MANAGEMENT
// ================================================================================================

/**
 * Get all form data from signup form
 * @returns {Object} Form data object
 */
export function getFormData() {
  const nameInput = document.getElementById('signupName');
  const phoneInput = document.getElementById('signupPhone');
  const emailInput = document.getElementById('signupEmail');
  const categorySelect = document.getElementById('signupCategory');
  const notesInput = document.getElementById('signupNotes');

  return {
    name: nameInput?.value?.trim() || '',
    phone: phoneInput?.value?.trim() || '',
    email: emailInput?.value?.trim() || '',
    category: categorySelect?.value?.trim() || '',
    notes: notesInput?.value?.trim() || '',
    selectedSlots: getSelectedSlots(),
  };
}

/**
 * Clear all form inputs and validation states
 */
export function clearSignupForm() {
  const msgEl = document.getElementById('signupMessage');
  if (msgEl) {
    msgEl.textContent = '';
  }

  const formInputs = [
    'signupName',
    'signupPhone',
    'signupEmail',
    'signupCategory',
    'signupNotes',
  ];

  formInputs.forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      if (input.tagName === 'SELECT') {
        input.value = '';
      } else {
        input.value = '';
      }
    }
  });

  clearAllValidation();
  console.log('🧹 Form cleared');
}

/**
 * Reset form to initial state (for retry after error)
 */
export function resetFormState() {
  const msgEl = document.getElementById('signupMessage');
  if (msgEl) {
    msgEl.textContent = '';
  }

  clearAllValidation();
}

// ================================================================================================
// SUCCESS DISPLAY (CSS CONSISTENT + FIXED DATES)
// ================================================================================================

/**
 * Display booking success confirmation
 * @param {Array} bookedSlots - Array of successfully booked slots
 * @param {string} category - Selected category
 * @param {string} email - User email (optional)
 */
export function displayBookingSuccess(bookedSlots, category, email) {
  const successSection      = document.getElementById('successMessage');
  const confirmationDetails = document.getElementById('confirmationDetails');
  const signupSection       = document.getElementById('signupSection');
  const slotsSection        = document.querySelector('.card[aria-label="Select time slots"]');
  const lookupSection       = document.querySelector('.lookup-section');

  if (!successSection || !confirmationDetails) {
    console.error('Success section elements not found');
    return;
  }

  confirmationDetails.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'selected-slots-summary';
  container.style.marginBottom = 'var(--space-xl)';

  const heading = document.createElement('h3');
  heading.textContent = 'Your bookings:';
  container.appendChild(heading);

  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'chips-container';

  // ── ROBUST TIME PARSER (fixes 12PM → 720 not 1440) ──────────────────────
  const parseTime = (label) => {
    if (!label) return 0;
    const start  = label.replace(/\s*[-–]\s*/g, '-').split('-')[0].trim();
    const m      = start.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return 0;
    let hour     = Number(m[1]);
    const mins   = m[2] ? Number(m[2]) : 0;
    const period = m[3] ? m[3].toLowerCase() : null;
    if (period === 'pm' && hour !== 12) hour += 12;  // 12PM stays 12, not 24
    if (period === 'am' && hour === 12) hour  = 0;
    return hour * 60 + mins;
  };

  // ── ROBUST DATE NORMALIZER (handles ISO + MM/DD/YYYY from Sheets) ────────
  const toISO = (d) => {
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const p = d.split('/');
    if (p.length === 3)
      return `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
    return d;
  };

  // ── CHRONOLOGICAL SORT: date first, then time ────────────────────────────
  const sortedSlots = [...bookedSlots].sort((a, b) => {
    const dateDiff = toISO(a.date).localeCompare(toISO(b.date));
    if (dateDiff !== 0) return dateDiff;
    return parseTime(a.label) - parseTime(b.label);
  });

  sortedSlots.forEach((slot) => {
    const chip = document.createElement('div');
    chip.className = 'slot-chip';

    const iso         = toISO(slot.date);
    const readableDate = iso
      ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short',
          month:   'short',
          day:     'numeric',
        })
      : slot.date;

    const shortTime = slot.label
      .replace(/:\d{2}/g, '')
      .replace(/\s*-\s*/g, ' - ')   // normalize spacing around dash
      .trim();

    const chipContent  = document.createElement('span');
    chipContent.className = 'chip-content';

    const chipDate     = document.createElement('span');
    chipDate.className = 'chip-date';
    chipDate.textContent = readableDate;

    // ── FIX: separator span so date and time don't jam together ─────────────
    const chipSep      = document.createElement('span');
    chipSep.className  = 'chip-sep';
    chipSep.textContent = ' · ';
    chipSep.setAttribute('aria-hidden', 'true');

    const chipTime     = document.createElement('span');
    chipTime.className = 'chip-time';
    chipTime.textContent = shortTime;

    chipContent.appendChild(chipDate);
    chipContent.appendChild(chipSep);
    chipContent.appendChild(chipTime);
    chip.appendChild(chipContent);
    chipsContainer.appendChild(chip);
  });

  container.appendChild(chipsContainer);
  confirmationDetails.appendChild(container);

  // Calendar card container — injectCalendarCard() in signup-frontend.js populates this
  const calendarContainer    = document.createElement('div');
  calendarContainer.id       = 'calendarCardContainer';
  confirmationDetails.appendChild(calendarContainer);

  if (signupSection) signupSection.style.display = 'none';
  if (slotsSection)  slotsSection.style.display  = 'none';
  if (lookupSection) lookupSection.style.display  = 'none';

  successSection.style.display = 'block';

  window.scrollTo({ top: 0, behavior: 'instant' });
  setTimeout(() => {
    successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  console.log('✅ Success message displayed');
}

// ================================================================================================
// BUTTON STATE MANAGEMENT
// ================================================================================================

/**
 * Set submit button to loading state
 * @param {HTMLElement} button - Submit button element
 * @returns {string} Original button text
 */
export function setButtonLoading(button) {
  if (!button) return '';

  const originalText = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="loading-spinner"></span> Submitting...';

  return originalText;
}

/**
 * Reset submit button to original state
 * @param {HTMLElement} button - Submit button element
 * @param {string} originalText - Original button text
 */
export function resetButtonState(button, originalText) {
  if (!button) return;

  button.disabled = false;
  button.textContent = originalText || 'Confirm booking';
}

// ================================================================================================
// MESSAGE DISPLAY HELPERS
// ================================================================================================

/**
 * Show error message in form
 * @param {string} message - Error message
 */
export function showFormError(message) {
  const msgEl = document.getElementById('signupMessage');
  if (msgEl) {
    showMessage(msgEl, `⚠️ ${message}`, 'error');
  }
}

/**
 * Show info message in form
 * @param {string} message - Info message
 * @param {number} duration - Display duration in ms (0 = persistent)
 */
export function showFormInfo(message, duration = 8000) {
  const msgEl = document.getElementById('signupMessage');
  if (msgEl) {
    showMessage(msgEl, message, 'info', duration);
  }
}

/**
 * Clear form messages
 */
export function clearFormMessages() {
  const msgEl = document.getElementById('signupMessage');
  if (msgEl) {
    msgEl.textContent = '';
  }
}
