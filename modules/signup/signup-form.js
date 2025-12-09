// ================================================================================================
// SIGNUP FORM - UI MANAGEMENT & NAVIGATION
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
// SUCCESS DISPLAY
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
    
    // Create confirmation message
    const container = document.createElement('div');
    container.style.margin = '20px 0';
    
    // Heading
    const heading = document.createElement('strong');
    heading.textContent = 'Your bookings:';
    container.appendChild(heading);
    
    // Booking list
    const list = document.createElement('ul');
    list.style.textAlign = 'left';
    list.style.display = 'inline-block';
    list.style.margin = '10px auto';
    list.style.paddingLeft = '20px';
    
    // Sort slots by date and time
    const sortedSlots = [...bookedSlots].sort((a, b) => {
        const dateCompare = new Date(a.date) - new Date(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.label.localeCompare(b.label);
    });
    
    sortedSlots.forEach(slot => {
        const li = document.createElement('li');
        li.style.marginBottom = '8px';
        li.textContent = `📅 ${slot.date} at 🕰️ ${slot.label}`;
        list.appendChild(li);
    });
    
    container.appendChild(list);
    confirmationDetails.appendChild(container);
    
    // Category info
    const categoryInfo = document.createElement('p');
    categoryInfo.style.marginTop = '15px';
    categoryInfo.innerHTML = `Selected category: <strong>${escapeHTML(category)}</strong>`;
    confirmationDetails.appendChild(categoryInfo);
    
    // Email confirmation
    if (email) {
        const emailConfirmation = document.createElement('p');
        emailConfirmation.style.marginTop = '10px';
        emailConfirmation.innerHTML = `A confirmation email will be sent to <strong>${escapeHTML(email)}</strong>`;
        confirmationDetails.appendChild(emailConfirmation);
    }
    
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
