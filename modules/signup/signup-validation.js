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
 * @returns {Object} {valid: boolean, message?: string}
 */
export function validateName(name) {
    if (!name || name.length < 2) {
        return { valid: false, message: 'Name must be at least 2 characters' };
    }
    if (name.length > CONFIG.MAX_NAME_LENGTH) {
        return { 
            valid: false, 
            message: `Name too long (max ${CONFIG.MAX_NAME_LENGTH} characters)` 
        };
    }
    return { valid: true };
}

/**
 * Validate phone field
 * @param {string} phone - Phone number to validate
 * @returns {Object} {valid: boolean, message?: string}
 */
export function validatePhone(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 8) {
        return { 
            valid: false, 
            message: 'Please enter a valid phone number (10 digits)' 
        };
    }
    if (!isValidPhone(phone)) {
        return { 
            valid: false, 
            message: 'Phone must be exactly 10 digits' 
        };
    }
    return { valid: true };
}

/**
 * Validate email field (optional)
 * @param {string} email - Email to validate
 * @returns {Object} {valid: boolean, message?: string}
 */
export function validateEmailField(email) {
    if (!email) return { valid: true };
    if (!isValidEmail(email)) {
        return { 
            valid: false, 
            message: 'Please enter a valid email address' 
        };
    }
    return { valid: true };
}

/**
 * Validate category selection
 * @param {string} category - Category value
 * @returns {Object} {valid: boolean, message?: string}
 */
export function validateCategory(category) {
    if (!category || !category.trim()) {
        return { 
            valid: false, 
            message: 'Please select your category' 
        };
    }
    if (category.length > CONFIG.MAX_CATEGORY_LENGTH) {
        return { 
            valid: false, 
            message: `Category too long (max ${CONFIG.MAX_CATEGORY_LENGTH} characters)` 
        };
    }
    return { valid: true };
}

/**
 * Validate notes field (optional)
 * @param {string} notes - Notes to validate
 * @returns {Object} {valid: boolean, message?: string}
 */
export function validateNotes(notes) {
    if (!notes) return { valid: true };
    if (notes.length > CONFIG.MAX_NOTES_LENGTH) {
        return { 
            valid: false, 
            message: `Notes too long (max ${CONFIG.MAX_NOTES_LENGTH} characters)` 
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
    
    // ✅ FIXED: Use CSS class instead of inline color
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
    
    // ✅ FIXED: Remove CSS class instead of inline style
    input.classList.remove('input-invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('title');
}

/**
 * Setup real-time validation for an input field
 * @param {HTMLElement} input - Input element
 * @param {Function} validator - Validation function
 */
export function setupInputValidation(input, validator) {
    if (!input || typeof validator !== 'function') return;
    
    // Validate on blur
    input.addEventListener('blur', function() {
        const value = input.value;
        if (!value) {
            clearInputValidation(input);
            return;
        }
        
        const validation = validator(value);
        if (validation.valid) {
            clearInputValidation(input);
        } else {
            markInputInvalid(input, validation.message);
        }
    });
    
    // Clear validation on input
    input.addEventListener('input', function() {
        clearInputValidation(input);
    });
}

/**
 * Setup real-time validation for all signup form inputs
 */
export function setupRealtimeValidation() {
    const inputs = {
        nameInput: {
            element: document.getElementById('nameInput'),
            validator: validateName
        },
        phoneInput: {
            element: document.getElementById('phoneInput'),
            validator: validatePhone
        },
        emailInput: {
            element: document.getElementById('emailInput'),
            validator: validateEmailField
        }
    };
    
    Object.values(inputs).forEach(({ element, validator }) => {
        if (element && validator) {
            setupInputValidation(element, validator);
        }
    });
    
    console.log('✅ Real-time validation setup complete');
}

// ================================================================================================
// COMPLETE FORM VALIDATION
// ================================================================================================

/**
 * Validate all form fields and return first error
 * @param {Object} formData - Form data object
 * @returns {Object} {valid: boolean, error?: string}
 */
export function validateSignupForm(formData) {
    const { name, phone, email, category, notes, selectedSlots } = formData;
    
    // Validate name
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
        return { valid: false, error: nameValidation.message };
    }
    
    // Validate phone
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
        return { valid: false, error: phoneValidation.message };
    }
    
    // Validate email (optional)
    const emailValidation = validateEmailField(email);
    if (!emailValidation.valid) {
        return { valid: false, error: emailValidation.message };
    }
    
    // Validate category
    const categoryValidation = validateCategory(category);
    if (!categoryValidation.valid) {
        return { valid: false, error: categoryValidation.message };
    }
    
    // Validate notes (optional)
    const notesValidation = validateNotes(notes);
    if (!notesValidation.valid) {
        return { valid: false, error: notesValidation.message };
    }
    
    // Validate slots
    if (!selectedSlots || selectedSlots.length === 0) {
        return { valid: false, error: 'Please select at least one slot' };
    }
    
    if (selectedSlots.length > CONFIG.MAX_SLOTS_PER_BOOKING) {
        return { 
            valid: false, 
            error: `Maximum ${CONFIG.MAX_SLOTS_PER_BOOKING} slots allowed` 
        };
    }
    
    return { valid: true };
}

/**
 * Clear all form validation states
 */
export function clearAllValidation() {
    const inputIds = ['nameInput', 'phoneInput', 'emailInput', 'categorySelect', 'notesInput'];
    
    inputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            clearInputValidation(input);
        }
    });
}
