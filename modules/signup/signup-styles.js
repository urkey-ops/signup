// ================================================================================================
// SIGNUP STYLES - CSS-IN-JS FOR SIGNUP MODULE
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
   SIGNUP MODULE STYLES (UNIQUE ADDITIONS ONLY)
   Main styles are in styles.css - these are signup-specific enhancements
   ================================================================================================ */

/* Conflict action buttons container (409 response UI) */
.conflict-actions {
    display: flex; 
    gap: 10px; 
    flex-wrap: wrap; 
    justify-content: center; 
    margin-top: 15px; 
    padding: 12px;
}

.conflict-actions button {
    padding: 12px 24px; 
    border: none; 
    border-radius: 8px;
    cursor: pointer; 
    font-weight: 500; 
    font-size: 14px;
    min-height: 44px;
    color: white !important;
    transition: all 0.2s ease;
}

/* Conflict details accordion */
.conflict-details {
    background: #f8fafc !important; 
    padding: 16px; 
    border-radius: 12px; 
    margin-top: 12px;
    border: 1px solid #e2e8f0;
    color: #1e293b !important;
}

.conflict-details summary {
    font-weight: 600; 
    color: #334155; 
    cursor: pointer;
    padding: 8px 0;
    list-style: none;
    user-select: none;
}

.conflict-details summary::-webkit-details-marker {
    display: none;
}

.conflict-details summary::before {
    content: '▶';
    display: inline-block;
    margin-right: 8px;
    transition: transform 0.2s ease;
}

.conflict-details[open] summary::before {
    transform: rotate(90deg);
}

.conflict-details summary:hover {
    color: #1e293b;
}

.conflict-details div {
    margin: 8px 0; 
    padding: 6px 12px;
    background: white; 
    border-radius: 6px;
    border-left: 4px solid #3b82f6;
    color: #1f2937 !important;
    font-size: 14px;
}
    `;
    
    document.head.appendChild(style);
    console.log('✅ Signup styles injected');
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
