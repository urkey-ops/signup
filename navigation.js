// ================================================================================================
// NAVIGATION.JS - SHARED NAVIGATION LOGIC (PREVENTS CIRCULAR DEPENDENCIES)
// ================================================================================================

import { updateSelectedSlots } from './config.js';

// ================================================================================================
// NAVIGATION FUNCTIONS
// ================================================================================================

/**
 * Navigate back from signup form to slot selection view
 * Clears selected slots and shows the slots display
 */
export function backToSlotSelection() {
    // Clear selected slots
    updateSelectedSlots([]);
    
    // Hide signup section
    const signupSection = document.getElementById("signupSection");
    if (signupSection) {
        signupSection.style.display = "none";
    }
    
    // Clear any error messages in signup form
    const msgEl = document.getElementById("signupMsg");
    if (msgEl) {
        msgEl.textContent = '';
        msgEl.style.display = 'none';
    }
    
    // Show slots display
    const slotsDisplay = document.getElementById("slotsDisplay");
    if (slotsDisplay) {
        slotsDisplay.style.display = "block";
    }
    
    // Dispatch event to trigger slot reload
    window.dispatchEvent(new CustomEvent('reloadSlots'));
    
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Reset the entire page after successful booking
 * Clears all state and returns to initial slot selection view
 */
export function resetPage() {
    // Clear selected slots
    updateSelectedSlots([]);
    
    // Hide success message
    const successMessage = document.getElementById("successMessage");
    if (successMessage) {
        successMessage.style.display = "none";
    }
    
    // Hide floating signup button
    const floatingBtn = document.getElementById("floatingSignupBtnContainer");
    if (floatingBtn) {
        floatingBtn.style.display = "none";
    }
    
    // Hide signup section if visible
    const signupSection = document.getElementById("signupSection");
    if (signupSection) {
        signupSection.style.display = "none";
    }
    
    // Show slots display
    const slotsDisplay = document.getElementById("slotsDisplay");
    if (slotsDisplay) {
        slotsDisplay.style.display = "block";
    }
    
    // Dispatch event to reload slots
    window.dispatchEvent(new CustomEvent('reloadSlots'));
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Navigate to signup form from slot selection
 * Shows the signup form with selected slots
 */
export function goToSignupForm() {
    // Hide slots display
    const slotsDisplay = document.getElementById("slotsDisplay");
    if (slotsDisplay) {
        slotsDisplay.style.display = "none";
    }
    
    // Hide floating button
    const floatingBtn = document.getElementById("floatingSignupBtnContainer");
    if (floatingBtn) {
        floatingBtn.style.display = "none";
    }
    
    // Show signup section
    const signupSection = document.getElementById("signupSection");
    if (signupSection) {
        signupSection.style.display = "block";
        signupSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Show success message after booking completion
 */
export function showSuccessMessage() {
    // Hide signup section
    const signupSection = document.getElementById("signupSection");
    if (signupSection) {
        signupSection.style.display = "none";
    }
    
    // Show success message
    const successMessage = document.getElementById("successMessage");
    if (successMessage) {
        successMessage.style.display = "block";
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ================================================================================================
// EVENT LISTENERS SETUP
// ================================================================================================

/**
 * Initialize navigation event listeners
 * Call this once on page load
 */
export function initializeNavigation() {
    // Listen for reload slots event
    window.addEventListener('reloadSlots', async () => {
        // Dynamically import loadSlots to avoid circular dependency
        try {
            const { loadSlots } = await import('./slots.js');
            loadSlots();
        } catch (err) {
            console.error('Failed to reload slots:', err);
        }
    });
    
    // Escape key to go back from signup form
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const signupSection = document.getElementById("signupSection");
            if (signupSection && signupSection.style.display === "block") {
                backToSlotSelection();
            }
        }
    });
    
    // Setup reset page button
    const resetBtn = document.getElementById('resetPageBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetPage);
    }
    
    console.log('✅ Navigation module initialized');
}
