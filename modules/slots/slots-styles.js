// ================================================================================================
// SLOTS STYLES - CSS-IN-JS FOR SLOTS MODULE
// ================================================================================================

/**
 * Inject all slots-related styles into the document head
 * Only runs once, subsequent calls are ignored
 */
export function injectSlotsStyles() {
    // Prevent duplicate injection
    if (document.getElementById('slots-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'slots-styles';
    style.textContent = `
/* ================================================================================================
   SLOTS MODULE STYLES (UNIQUE ADDITIONS ONLY)
   Main styles are in styles.css - these are slots-specific enhancements
   ================================================================================================ */

/* Skeleton loading animations */
@keyframes shimmer {
    0% { background-position: -468px 0; }
    100% { background-position: 468px 0; }
}

/* Skeleton card container */
.skeleton-card { 
    background: #f8f8f8; 
    border: 1px solid #e0e0e0; 
    border-radius: 12px; 
    padding: 24px; 
    margin-bottom: 24px; 
    animation: fadeIn 0.3s ease; 
}

/* Skeleton title placeholder */
.skeleton-title { 
    height: 24px; 
    width: 150px; 
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); 
    background-size: 200% 100%; 
    animation: shimmer 1.5s infinite; 
    border-radius: 4px; 
    margin-bottom: 16px; 
}

/* Skeleton slot placeholder */
.skeleton-slot { 
    background: linear-gradient(90deg, #f8f8f8 25%, #f0f0f0 50%, #f8f8f8 75%); 
    background-size: 200% 100%; 
    animation: shimmer 1.5s infinite; 
    border: 1px solid #e0e0e0; 
    pointer-events: none; 
    min-height: 64px; 
    border-radius: 8px; 
    padding: 16px; 
}

/* Skeleton text lines */
.skeleton-text { 
    height: 16px; 
    background: #e0e0e0; 
    border-radius: 4px; 
    margin: 8px auto; 
    width: 80%; 
}

.skeleton-text-small { 
    height: 12px; 
    background: #e8e8e8; 
    border-radius: 4px; 
    margin: 4px auto; 
    width: 50%; 
}
    `;
    
    document.head.appendChild(style);
    console.log('✅ Slots styles injected');
}

/**
 * Remove slots styles from document (cleanup utility)
 */
export function removeSlotsStyles() {
    const styleEl = document.getElementById('slots-styles');
    if (styleEl) {
        styleEl.remove();
        console.log('🗑️ Slots styles removed');
    }
}
