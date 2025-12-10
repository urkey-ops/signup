// ================================================================================================
// SIGNUP FORM - UI MANAGEMENT & NAVIGATION (CSS CONSISTENT)
// ================================================================================================

import { getSelectedSlots, updateSelectedSlots } from '../../config.js';
import { showMessage, escapeHTML } from '../../utils.js';
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
        showMessage('Please select at least one slot before continuing.', 'warning');
        return false;
    }
    
    const slotsDisplay = document.getElementById("slotsDisplay");
    const floatingBtn = document.getElementById("floatingSignupBtnContainer");
    const signupSection = document.getElementById("signupSection");
    
    if (!signupSection) {
        console.error('Signup section not found');
        return false;
    }
    
    // Hide slot selection UI
    if (slotsDisplay) slotsDisplay.style.display = "none";
    if (floatingBtn) floatingBtn.style.display = "none";
    
    // Show signup form
    signupSection.style.display = "block";
    updateSummaryDisplay();
    signupSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Auto-focus name input after animation
    setTimeout(() => {
        const nameInput = document.getElementById("nameInput");
        if (nameInput) nameInput.focus();
    }, 300);
    
    console.log('✅ Signup form displayed');
    return true;
}

/**
 * Hide signup form and return to slot selection
 */
export function hideSignupForm() {
    console.log('📍 Returning to slot selection...');
    
    const successSection = document.getElementById("successMessage");
    const signupSection = document.getElementById("signupSection");
    const slotsDisplay = document.getElementById("slotsDisplay");
    const floatingBtn = document.getElementById("floatingSignupBtnContainer");
    
    // Hide form sections
    if (successSection) successSection.style.display = "none";
    if (signupSection) signupSection.style.display = "none";
    
    // Show slot selection
    if (slotsDisplay) slotsDisplay.style.display = "block";
    if (floatingBtn) floatingBtn.style.display = "none";
    
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
    const nameInput = document.getElementById("nameInput");
    const phoneInput = document.getElementById("phoneInput");
    const emailInput = document.getElementById("emailInput");
    const categorySelect = document.getElementById("categorySelect");
    const notesInput = document.getElementById("notesInput");
    
    return {
        name: nameInput?.value?.trim() || '',
        phone: phoneInput?.value?.trim() || '',
        email: emailInput?.value?.trim() || '',
        category: categorySelect?.value?.trim() || '',
        notes: notesInput?.value?.trim() || '',
        selectedSlots: getSelectedSlots()
    };
}

/**
 * Clear all form inputs and validation states
 */
export function clearSignupForm() {
    const msgEl = document.getElementById("signupMsg");
    if (msgEl) msgEl.textContent = '';
    
    const formInputs = [
        'nameInput', 
        'phoneInput', 
        'emailInput', 
        'categorySelect', 
        'notesInput'
    ];
    
    formInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
        }
    });
    
    clearAllValidation();
    console.log('🧹 Form cleared');
}

/**
 * Reset form to initial state (for retry after error)
 */
export function resetFormState() {
    const msgEl = document.getElementById("signupMsg");
    if (msgEl) msgEl.textContent = '';
    
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
    const successSection = document.getElementById("successMessage");
    const confirmationDetails = document.getElementById("confirmationDetails");
    const signupSection = document.getElementById("signupSection");
    
    if (!successSection || !confirmationDetails) {
        console.error('Success section elements not found');
        return;
    }
    
    // Clear previous content
    confirmationDetails.innerHTML = '';
    
    // Create confirmation container
    const container = document.createElement('div');
    container.className = 'selected-slots-summary';
    container.style.marginBottom = 'var(--space-xl)';
    
    // Heading
    const heading = document.createElement('h3');
    heading.textContent = 'Your bookings:';
    container.appendChild(heading);
    
    // Booking chips (reuse slot chip system)
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'chips-container';
    
    // ✅ FIXED: Perfect chronological sort + readable dates
    const sortedSlots = [...bookedSlots].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
        
        // Same date: sort by time
        const timeA = a.label.match(/(\d+)(AM|PM)/i);
        const timeB = b.label.match(/(\d+)(AM|PM)/i);
        const hourA = timeA ? parseInt(timeA[1]) + (timeA[2].toUpperCase() === 'PM' ? 12 : 0) : 0;
        const hourB = timeB ? parseInt(timeB[1]) + (timeB[2].toUpperCase() === 'PM' ? 12 : 0) : 0;
        return hourA - hourB;
    });
    
    sortedSlots.forEach(slot => {
        const chip = document.createElement('div');
        chip.className = 'slot-chip';
        
        // ✅ FIXED: Readable date format (Mon, Dec 15)
        const readableDate = new Date(slot.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
        
        // Short time format
        const shortTime = slot.label
            .replace(/:\d{2}/g, '')
            .replace(/\s*-\s*/g, '-')
            .replace(/\s/g, '');
        
        const chipContent = document.createElement('span');
        chipContent.className = 'chip-content';
        
        const chipDate = document.createElement('span');
        chipDate.className = 'chip-date';
        chipDate.textContent = readableDate;
        
        const chipTime = document.createElement('span');
        chipTime.className = 'chip-time';
        chipTime.textContent = shortTime;
        
        chipContent.appendChild(chipDate);
        chipContent.appendChild(chipTime);
        chip.appendChild(chipContent);
        
        chipsContainer.appendChild(chip);
    });
    
    container.appendChild(chipsContainer);
    confirmationDetails.appendChild(container);
    
    // Show success section
    if (signupSection) signupSection.style.display = "none";
    successSection.style.display = "block";
    successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
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
    button.textContent = originalText || 'Submit';
}

// ================================================================================================
// MESSAGE DISPLAY HELPERS
// ================================================================================================

/**
 * Show error message in form
 * @param {string} message - Error message
 */
export function showFormError(message) {
    const msgEl = document.getElementById("signupMsg");
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
    const msgEl = document.getElementById("signupMsg");
    if (msgEl) {
        showMessage(msgEl, message, 'info', duration);
    }
}

/**
 * Clear form messages
 */
export function clearFormMessages() {
    const msgEl = document.getElementById("signupMsg");
    if (msgEl) {
        msgEl.textContent = '';
    }
}
