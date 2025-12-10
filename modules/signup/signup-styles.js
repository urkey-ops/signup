// ================================================================================================
// SIGNUP STYLES - CSS-IN-JS FOR SIGNUP MODULE (COLORS MATCHED TO MAIN CSS)
// ================================================================================================

/**
 * Inject all signup-related styles into the document head
 * Only runs once, subsequent calls are ignored
 */
export function injectSignupStyles() {
    // Prevent duplicate injection
    if (document.getElementById('signup-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'signup-styles';
    style.textContent = `
/* ================================================================================================
   SIGNUP MODULE STYLES (MATCHED TO MAIN CSS SYSTEM)
   Uses exact CSS variables from main stylesheet for perfect color consistency
   ================================================================================================ */

/* Conflict action buttons container (409 response UI) */
.conflict-actions {
    display: flex; 
    gap: var(--space-sm); 
    flex-wrap: wrap; 
    justify-content: center; 
    margin-top: var(--space-md); 
    padding: var(--space-base);
}

.conflict-actions button {
    padding: var(--space-md) var(--space-lg); 
    border: none; 
    border-radius: var(--radius-md);
    cursor: pointer; 
    font-weight: 600; 
    font-size: 1rem;
    min-height: var(--touch-min);
    font-family: var(--font-family);
    transition: all var(--transition-normal);
    -webkit-tap-highlight-color: transparent;
}

/* Primary conflict button */
.conflict-actions .primary-btn {
    background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
    color: white;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
}

.conflict-actions .primary-btn:active {
    box-shadow: 0 1px 4px rgba(16, 185, 129, 0.2);
    transform: scale(0.98);
}

/* Secondary conflict button */
.conflict-actions .secondary-btn {
    background: linear-gradient(135deg, var(--secondary-color), var(--secondary-hover));
    color: white;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
}

.conflict-actions .secondary-btn:active {
    box-shadow: 0 1px 4px rgba(59, 130, 246, 0.15);
    transform: scale(0.98);
}

/* Conflict details accordion */
.conflict-details {
    background: var(--background) !important; 
    padding: var(--space-lg); 
    border-radius: var(--radius-lg); 
    margin-top: var(--space-md);
    border: 1px solid var(--border);
    color: var(--text-primary) !important;
}

.conflict-details summary {
    font-weight: 600; 
    color: var(--text-primary); 
    cursor: pointer;
    padding: var(--space-sm) 0;
    list-style: none;
    user-select: none;
    font-size: 1rem;
}

.conflict-details summary::-webkit-details-marker {
    display: none;
}

.conflict-details summary::before {
    content: '▶';
    display: inline-block;
    margin-right: var(--space-sm);
    transition: transform var(--transition-normal);
    color: var(--secondary-color);
}

.conflict-details[open] summary::before {
    transform: rotate(90deg);
}

.conflict-details summary:hover {
    color: var(--text-primary);
}

.conflict-details summary:hover::before {
    color: var(--secondary-hover);
}

.conflict-details div {
    margin: var(--space-sm) 0; 
    padding: var(--space-md); 
    background: var(--surface); 
    border-radius: var(--radius-md);
    border-left: 4px solid var(--secondary-color);
    color: var(--text-primary) !important;
    font-size: 0.9375rem;
}

/* Ensure all text is readable */
.conflict-details,
.conflict-details *,
.conflict-details summary,
.conflict-details div {
    color: var(--text-primary) !important;
}

.conflict-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
}
    `;
    
    document.head.appendChild(style);
    console.log('✅ Signup styles injected (color-matched)');
}

/**
 * Remove signup styles from document (cleanup utility)
 */
export function removeSignupStyles() {
    const styleEl = document.getElementById('signup-styles');
    if (styleEl) {
        styleEl.remove();
        console.log('🗑️ Signup styles removed');
    }
}
