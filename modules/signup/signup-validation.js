// ================================================================================================
// SIGNUP VALIDATION - ALL FORM VALIDATION LOGIC (CSS CONSISTENT)
// ================================================================================================

import { CONFIG, normalizePhone } from '../../config.js';
import { isValidEmail, isValidPhone } from '../../utils.js';

// ================================================================================================
// VALIDATION FUNCTIONS
// ================================================================================================

/**
 * Validate name field
 * @param {string} name - Name to validate
 * @returns {{valid: boolean, message?: string}}
 */
export function validateName(name) {
  const value = (name || '').trim();

  if (!value || value.length < 2) {
    return { valid: false, message: 'Name must be at least 2 characters' };
  }
  if (value.length > CONFIG.MAX_NAME_LENGTH) {
    return {
      valid: false,
      message: `Name too long (max ${CONFIG.MAX_NAME_LENGTH} characters)`,
    };
  }
  return { valid: true };
}

/**
 * Validate phone field
 * @param {string} phone - Phone number to validate
 * @returns {{valid: boolean, message?: string}}
 */
export function validatePhone(phone) {
  const normalized = normalizePhone(phone);

  if (!normalized || normalized.length < 8) {
    return {
      valid: false,
      message: 'Please enter a valid phone number (10 digits)',
    };
  }
  if (!isValidPhone(phone)) {
    return {
      valid: false,
      message: 'Phone must be exactly 10 digits',
    };
  }
  return { valid: true };
}

/**
 * Validate email field (optional)
 * @param {string} email - Email to validate
 * @returns {{valid: boolean, message?: string}}
 */
export function validateEmailField(email) {
  const value = (email || '').trim();
  if (!value) return { valid: true };

  if (!isValidEmail(value)) {
    return {
      valid: false,
      message: 'Please enter a valid email address',
    };
  }
  return { valid: true };
}

/**
 * Validate category selection
 * @param {string} category - Category value
 * @returns {{valid: boolean, message?: string}}
 */
export function validateCategory(category) {
  const value = (category || '').trim();

  if (!value) {
    return {
      valid: false,
      message: 'Please select your category',
    };
  }
  if (value.length > CONFIG.MAX_CATEGORY_LENGTH) {
    return {
      valid: false,
      message: `Category too long (max ${CONFIG.MAX_CATEGORY_LENGTH} characters)`,
    };
  }
  return { valid: true };
}

/**
 * Validate notes field (optional)
 * @param {string} notes - Notes to validate
 * @returns {{valid: boolean, message?: string}}
 */
export function validateNotes(notes) {
  const value = notes || '';
  if (!value) return { valid: true };

  if (value.length > CONFIG.MAX_NOTES_LENGTH) {
    return {
      valid: false,
      message: `Notes too long (max ${CONFIG.MAX_NOTES_LENGTH} characters)`,
    };
  }
  return { valid: true };
}

// ================================================================================================
// REAL-TIME VALIDATION HELPERS (CSS CONSISTENT)
// ================================================================================================

/**
 * Apply validation error styling to input (CSS CONSISTENT)
 * @param {HTMLElement} input - Input element
 * @param {string} message - Error message (optional)
 */
export function markInputInvalid(input, message) {
  if (!input) return;

  input.classList.add('input-invalid');
  input.setAttribute('aria-invalid', 'true');

  if (message) {
    input.setAttribute('title', message);
  }
}

/**
 * Clear validation error styling from input (CSS CONSISTENT)
 * @param {HTMLElement} input - Input element
 */
export function clearInputValidation(input) {
  if (!input) return;

  input.classList.remove('input-invalid');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('title');
}

/**
 * Setup real-time validation for an input field
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} input
 * @param {Function} validator - Validation function
 * @param {HTMLElement|null} messageEl - Optional element to show inline error text
 */
export function setupInputValidation(input, validator, messageEl = null) {
  if (!input || typeof validator !== 'function') return;

  function applyValidation() {
    const value = input.value;
    const result = validator(value);

    if (result.valid) {
      clearInputValidation(input);
      if (messageEl) {
        messageEl.textContent = '';
      }
    } else {
      markInputInvalid(input, result.message);
      if (messageEl) {
        messageEl.textContent = result.message || '';
      }
    }
  }

  // Validate on blur
  input.addEventListener('blur', () => {
    if (!input.value) {
      clearInputValidation(input);
      if (messageEl) {
        messageEl.textContent = '';
      }
      return;
    }
    applyValidation();
  });

  // Clear on input
  input.addEventListener('input', () => {
    clearInputValidation(input);
    if (messageEl) {
      messageEl.textContent = '';
    }
  });
}

/**
 * Setup real-time validation for all signup form inputs
 */
export function setupRealtimeValidation() {
  const nameInput = document.getElementById('signupName');
  const phoneInput = document.getElementById('signupPhone');
  const emailInput = document.getElementById('signupEmail');
  const categorySelect = document.getElementById('signupCategory');
  const notesInput = document.getElementById('signupNotes');

  const nameHelp = document.getElementById('signupNameHelp');
  const phoneHelp = document.getElementById('signupPhoneHelp');
  const emailHelp = document.getElementById('signupEmailHelp');
  // Category/notes helpers are static text; keep messages there short if you override.

  if (nameInput) {
    setupInputValidation(nameInput, validateName, nameHelp);
  }
  if (phoneInput) {
    setupInputValidation(phoneInput, validatePhone, phoneHelp);
  }
  if (emailInput) {
    setupInputValidation(emailInput, validateEmailField, emailHelp);
  }
  if (categorySelect) {
    setupInputValidation(categorySelect, validateCategory);
  }
  if (notesInput) {
    setupInputValidation(notesInput, validateNotes);
  }

  console.log('✅ Real-time validation setup complete');
}

// ================================================================================================
// COMPLETE FORM VALIDATION
// ================================================================================================

/**
 * Validate all form fields and return first error
 * @param {Object} formData - Form data object
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSignupForm(formData) {
  const {
    name,
    phone,
    email,
    category,
    notes,
    selectedSlots,
  } = formData;

  // Name
  const nameValidation = validateName(name);
  if (!nameValidation.valid) {
    return { valid: false, error: nameValidation.message };
  }

  // Phone
  const phoneValidation = validatePhone(phone);
  if (!phoneValidation.valid) {
    return { valid: false, error: phoneValidation.message };
  }

  // Email (optional)
  const emailValidation = validateEmailField(email);
  if (!emailValidation.valid) {
    return { valid: false, error: emailValidation.message };
  }

  // Category
  const categoryValidation = validateCategory(category);
  if (!categoryValidation.valid) {
    return { valid: false, error: categoryValidation.message };
  }

  // Notes (optional)
  const notesValidation = validateNotes(notes);
  if (!notesValidation.valid) {
    return { valid: false, error: notesValidation.message };
  }

  // Slots
  if (!selectedSlots || selectedSlots.length === 0) {
    return { valid: false, error: 'Please select at least one slot' };
  }

  if (selectedSlots.length > CONFIG.MAX_SLOTS_PER_BOOKING) {
    return {
      valid: false,
      error: `Maximum ${CONFIG.MAX_SLOTS_PER_BOOKING} slots allowed`,
    };
  }

  return { valid: true };
}

/**
 * Clear all form validation states
 */
export function clearAllValidation() {
  const inputIds = [
    'signupName',
    'signupPhone',
    'signupEmail',
    'signupCategory',
    'signupNotes',
  ];

  inputIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      clearInputValidation(input);
    }
  });
}
