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
   SIGNUP MODULE STYLES
   ================================================================================================ */

/* Loading spinner animation */
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.loading-spinner {
    display: inline-block;
    width: 20px; 
    height: 20px;
    border: 3px solid #e5e7eb; 
    border-top-color: #3b82f6;
    border-radius: 50%; 
    animation: spin 0.8s linear infinite;
    vertical-align: middle; 
    margin-right: 8px;
}

/* Conflict action buttons container */
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

/* Primary button (main action) */
.btn-primary { 
    background: #3b82f6 !important; 
    color: white !important;
    box-shadow: 0 2px 8px rgba(59,130,246,0.3);
}

.btn-primary:hover { 
    background: #2563eb !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59,130,246,0.4);
}

.btn-primary:active {
    transform: translateY(0);
}

/* Secondary button (alternative action) */
.btn-secondary { 
    background: #6b7280 !important; 
    color: white !important;
    box-shadow: 0 2px 8px rgba(107,114,128,0.3);
}

.btn-secondary:hover { 
    background: #4b5563 !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(107,114,128,0.4);
}

.btn-secondary:active {
    transform: translateY(0);
}

/* Outline button (tertiary action) */
.btn-outline { 
    background: white !important; 
    color: #3b82f6 !important; 
    border: 2px solid #3b82f6 !important;
    font-weight: 600;
}

.btn-outline:hover { 
    background: #3b82f6 !important; 
    color: white !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59,130,246,0.3);
}

.btn-outline:active {
    transform: translateY(0);
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

/* Form validation states */
input[aria-invalid="true"],
select[aria-invalid="true"],
textarea[aria-invalid="true"] {
    border-color: #ef4444 !important;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

input[aria-invalid="true"]:focus,
select[aria-invalid="true"]:focus,
textarea[aria-invalid="true"]:focus {
    outline: none;
    border-color: #dc2626 !important;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

/* Success state for inputs */
input:focus:not([aria-invalid="true"]),
select:focus:not([aria-invalid="true"]),
textarea:focus:not([aria-invalid="true"]) {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Disabled state */
button:disabled {
    opacity: 0.6;
    cursor: not-allowed !important;
    transform: none !important;
}

button:disabled:hover {
    transform: none !important;
    box-shadow: none !important;
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
