// ================================================================================================
// SIGNUP FRONTEND - MAIN ORCHESTRATOR (WITH MINOR IMPROVEMENTS)
// ================================================================================================

import { 
    API_URL, 
    CONFIG, 
    getSelectedSlots,
    getLastApiCall,
    getIsSubmitting,
    API_CACHE,
    updateSelectedSlots,
    updateLastApiCall,
    updateIsSubmitting,
    normalizePhone,
    canSubmit
} from './config.js';
import { 
    sanitizeInput,
    getErrorMessage
} from './utils.js';
import { injectSignupStyles } from './modules/signup/signup-styles.js';
import { 
    validateSignupForm,
    setupRealtimeValidation 
} from './modules/signup/signup-validation.js';
import {
    showSignupForm,
    hideSignupForm,
    getFormData,
    clearSignupForm,
    displayBookingSuccess,
    setButtonLoading,
    resetButtonState,
    showFormError,
    showFormInfo,
    clearFormMessages
} from './modules/signup/signup-form.js';
import {
    displayConflictUI,
    handleBookValidSlots,
    handleRemoveConflicts,
    handleBackToSlots,
    cleanupConflictButtons
} from './modules/signup/signup-conflict.js';

// ================================================================================================
// MODULE INITIALIZATION
// ================================================================================================

injectSignupStyles();

// ================================================================================================
// PROGRESS INDICATOR HELPER
// ================================================================================================

/**
 * Set the active step on the progress indicator.
 * Step 1 = Pick Slots, Step 2 = Your Info, Step 3 = Done!
 * @param {1|2|3} step
 */
const PROGRESS_SUBTITLES = {
  1: 'Choose your session times',
  2: 'Almost there — your details',
  3: 'Booking confirmed 🙏'
};

function setProgressStep(step) {
  // Update step circles
  const steps      = document.querySelectorAll('.progress-step');
  const connectors = document.querySelectorAll('.progress-connector');

  steps.forEach((el, i) => {
    const n = i + 1;
    el.classList.remove('active', 'done');
    if (n < step)       el.classList.add('done');
    else if (n === step) el.classList.add('active');
    el.setAttribute('aria-label',
      `Step ${n}: ${n === 1 ? 'Pick slots' : n === 2 ? 'Your info' : 'Done'}` +
      (n === step ? ', current step' : n < step ? ', completed' : '')
    );
  });

  // Fill connectors up to active step
  connectors.forEach((el, i) => {
    el.classList.toggle('done', i < step - 1);
  });

  // Animate subtitle swap
  const subtitle = document.getElementById('progressSubtitle');
  if (subtitle && PROGRESS_SUBTITLES[step]) {
    subtitle.classList.add('transitioning');
    setTimeout(() => {
      subtitle.textContent = PROGRESS_SUBTITLES[step];
      subtitle.classList.remove('transitioning');
    }, 150);
  }
}

// ================================================================================================
// CONFIGURATION & STATE
// ================================================================================================

const REQUEST_TIMEOUT_MS  = 30000;
const MAX_RETRIES         = 2;
const RETRY_DELAY_MS      = 1000;

let abortController     = null;
let submitDebounceTimer = null;

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

async function fetchWithTimeout(url, options, timeout = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') throw new Error('Request timeout - server took too long to respond');
        throw err;
    }
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    try {
        return await fetchWithTimeout(url, options);
    } catch (err) {
        const isNetworkError = err.message === 'Failed to fetch' ||
                               err.message.includes('network') ||
                               err.message.includes('NetworkError');
        if (retries > 0 && isNetworkError) {
            const attemptNumber = MAX_RETRIES - retries + 1;
            console.log(`🔄 Network error detected. Retrying... (Attempt ${attemptNumber}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw err;
    }
}

function cancelPendingRequest() {
    if (abortController) {
        abortController.abort();
        abortController = null;
        console.log('🚫 Pending request cancelled');
    }
}

// ================================================================================================
// MAIN SIGNUP SUBMISSION
// ================================================================================================

export async function submitSignup() {
    console.log('🚀 submitSignup() called');
    if (submitDebounceTimer) clearTimeout(submitDebounceTimer);
    return new Promise((resolve) => {
        submitDebounceTimer = setTimeout(async () => {
            await processSignupSubmission();
            resolve();
        }, 100);
    });
}

async function processSignupSubmission() {
    const submitBtn = document.getElementById('signupSubmitBtn');
    if (!submitBtn) { console.error('❌ Submit button not found'); return; }

    if (submitBtn.disabled) { console.warn('⚠️ Button already disabled'); return; }
    submitBtn.disabled = true;

    if (getIsSubmitting()) {
        console.warn('⚠️ Submission already in progress');
        submitBtn.disabled = false;
        return;
    }

    cancelPendingRequest();
    updateIsSubmitting(true);

    const originalBtnText = setButtonLoading(submitBtn);

    const formData     = getFormData();
    const sanitizedData = {
        name:          sanitizeInput(formData.name,     CONFIG.MAX_NAME_LENGTH),
        phone:         normalizePhone(formData.phone),
        email:         sanitizeInput(formData.email,    CONFIG.MAX_EMAIL_LENGTH)?.toLowerCase(),
        category:      sanitizeInput(formData.category, CONFIG.MAX_CATEGORY_LENGTH),
        notes:         sanitizeInput(formData.notes,    CONFIG.MAX_NOTES_LENGTH),
        selectedSlots: formData.selectedSlots
    };

    const resetSubmitState = () => {
        updateIsSubmitting(false);
        resetButtonState(submitBtn, originalBtnText);
        cancelPendingRequest();
    };

    // Validate
    const validation = validateSignupForm({
        name:          sanitizedData.name,
        phone:         formData.phone,
        email:         sanitizedData.email,
        category:      sanitizedData.category,
        notes:         sanitizedData.notes,
        selectedSlots: sanitizedData.selectedSlots
    });

    if (!validation.valid) {
        showFormError(validation.error);
        resetSubmitState();
        return;
    }

    // Cooldown
    const submitCheck = canSubmit();
    if (!submitCheck.canSubmit) {
        showFormError(`Please wait ${submitCheck.waitTime} seconds before submitting again.`);
        resetSubmitState();
        return;
    }

    showFormInfo('⏳ Processing your booking...', 0);

    try {
        const slotIds = sanitizedData.selectedSlots.map(s => s.id);
        const payload = {
            name:     sanitizedData.name,
            phone:    sanitizedData.phone,
            email:    sanitizedData.email,
            notes:    sanitizedData.notes,
            category: sanitizedData.category,
            slotIds
        };

        abortController = new AbortController();

        const response = await fetchWithRetry(API_URL, {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body:        JSON.stringify(payload),
            signal:      abortController.signal
        });

        updateLastApiCall(Date.now());

        const data = await response.json();

        // ── Success ──────────────────────────────────────────────────────────
        if (response.ok && data.ok) {
            if (API_CACHE) { API_CACHE.data = null; API_CACHE.timestamp = 0; }

            const bookedSlots = [...sanitizedData.selectedSlots];
            updateSelectedSlots([]);

            // Advance progress to Step 3 — Done!
            setProgressStep(3);

            displayBookingSuccess(bookedSlots, sanitizedData.category, sanitizedData.email);

            // Wire "Add to Calendar" button now that success section is visible
            wireCalendarButton(bookedSlots);

            resetSubmitState();
            return;
        }

        // ── Conflicts (409) ───────────────────────────────────────────────────
        if (response.status === 409) {
            const msgEl = document.getElementById('signupMessage');
            if (!msgEl) { resetSubmitState(); return; }

            displayConflictUI(
                msgEl, data,
                async () => { await handleBookValidSlots(data.slotStatus, submitSignup); },
                ()      => { handleRemoveConflicts(data.slotStatus, msgEl); },
                ()      => {
                    handleBackToSlots(() => {
                        window.dispatchEvent(new CustomEvent('reloadSlots'));
                        hideSignupForm();
                        setProgressStep(1);
                    });
                }
            );

            resetSubmitState();
            return;
        }

        // ── Other errors ──────────────────────────────────────────────────────
        let errorMsg = data.error || getErrorMessage(response.status, 'Booking failed');
        if (response.status === 429) errorMsg += ' Too many requests. Please wait a minute and try again.';
        showFormError(errorMsg);
        resetSubmitState();

    } catch (err) {
        if (err.name === 'AbortError') { resetSubmitState(); return; }

        let errorMsg;
        if (err.message.includes('timeout'))
            errorMsg = 'Request timed out. The server is taking too long to respond. Please try again.';
        else if (err.message === 'Failed to fetch' || err.message.includes('network'))
            errorMsg = 'Unable to connect to the server. Please check your internet connection and try again.';
        else
            errorMsg = 'An unexpected error occurred. Please try again.';

        showFormError(errorMsg);
        resetSubmitState();
    }
}

// ================================================================================================
// ADD TO CALENDAR
// ================================================================================================

/**
 * Wire the #addToCalendarBtn to generate .ics file downloads for booked slots.
 * @param {Array} bookedSlots - [{id, date, label}, ...]
 */
function wireCalendarButton(bookedSlots) {
    const btn = document.getElementById('addToCalendarBtn');
    if (!btn || !bookedSlots || bookedSlots.length === 0) return;

    btn.addEventListener('click', () => downloadCalendarFile(bookedSlots), { once: true });
}

/**
 * Build and trigger an .ics download for all booked slots.
 * @param {Array} slots
 */
function downloadCalendarFile(slots) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Seva Booking//EN', 'CALSCALE:GREGORIAN'];

    slots.forEach(slot => {
        const { startDt, endDt } = parseSlotDateTime(slot.date, slot.label);
        if (!startDt || !endDt) return;

        const uid = `seva-${slot.id}-${Date.now()}@sevabooking`;
        lines.push(
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${toIcsDate(new Date())}`,
            `DTSTART;TZID=America/New_York:${toIcsDate(startDt)}`,
            `DTEND;TZID=America/New_York:${toIcsDate(endDt)}`,
            'SUMMARY:Greeter Seva — Mandir',
            'DESCRIPTION:Thank you for your seva! Jai Swaminarayan 🙏',
            'END:VEVENT'
        );
    });

    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'seva-booking.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('📅 Calendar file downloaded');
}

/**
 * Parse "YYYY-MM-DD" date + "9AM - 12PM" label into Date objects.
 * Handles formats like "9AM - 12PM", "9:00 AM - 12:00 PM", "9AM-12PM".
 */
function parseSlotDateTime(dateStr, label) {
    if (!dateStr || !label) return {};

    // Normalise: "9AM - 12PM" → ["9AM", "12PM"]
    const parts = label.replace(/\s/g, '').split(/[-–]/);
    if (parts.length < 2) return {};

    const startHour = parseHour(parts[0]);
    const endHour   = parseHour(parts[1]);
    if (startHour === null || endHour === null) return {};

    const [year, month, day] = dateStr.split('-').map(Number);

    const startDt = new Date(year, month - 1, day, startHour, 0, 0);
    const endDt   = new Date(year, month - 1, day, endHour,   0, 0);

    return { startDt, endDt };
}

function parseHour(str) {
    const m = str.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const period = m[3]?.toLowerCase();
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return h;
}

function toIcsDate(date) {
    const pad = n => String(n).padStart(2, '0');
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
}

// ================================================================================================
// PUBLIC API
// ================================================================================================

export function goToSignupForm() {
    console.log('📝 Navigating to signup form');
    showSignupForm();
    setProgressStep(2);
}

export function backToSlotSelection() {
    console.log('🔙 Returning to slot selection');
    cancelPendingRequest();
    updateIsSubmitting(false);
    hideSignupForm();
    setProgressStep(1);
}

window.goToSignupForm      = goToSignupForm;
window.backToSlotSelection = backToSlotSelection;

// ================================================================================================
// CLEANUP
// ================================================================================================

export function cleanup() {
    cancelPendingRequest();
    if (submitDebounceTimer) { clearTimeout(submitDebounceTimer); submitDebounceTimer = null; }
    updateIsSubmitting(false);
    console.log('✅ Signup module cleaned up');
}

window.addEventListener('beforeunload', cleanup);

// ================================================================================================
// INITIALIZATION
// ================================================================================================

function initializeSignup() {
    console.log('📝 Signup module initializing...');

    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => { e.preventDefault(); submitSignup(); });
        console.log('✅ Form submission handler attached');
    } else {
        console.error('❌ Signup form not found');
    }

    const backBtn = document.getElementById('backToSlotsBtn');
    if (backBtn) {
        backBtn.addEventListener('click', backToSlotSelection);
        console.log('✅ Back button handler attached');
    }

    const resetPageBtn = document.getElementById('resetPageBtn');
    if (resetPageBtn) {
        resetPageBtn.addEventListener('click', () => {
            updateIsSubmitting(false);
            cancelPendingRequest();
            backToSlotSelection();
            // Reset progress back to step 1 when booking another slot
            setProgressStep(1);
        });
        console.log('✅ Book Another Slot button initialized');
    }

    setupRealtimeValidation();
    setProgressStep(1); // ← add this line at the end
    console.log('✅ Signup module initialized');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSignup);
} else {
    initializeSignup();
}
