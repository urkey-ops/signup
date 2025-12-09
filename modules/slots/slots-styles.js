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
   SLOTS MODULE STYLES
   ================================================================================================ */

/* Skeleton loading animations */
@keyframes shimmer {
    0% { background-position: -468px 0; }
    100% { background-position: 468px 0; }
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes fadeInUp {
    from { 
        opacity: 0; 
        transform: translateY(20px); 
    }
    to { 
        opacity: 1; 
        transform: translateY(0); 
    }
}

@keyframes slideOut {
    0% { 
        opacity: 1; 
        transform: scale(1); 
    }
    100% { 
        opacity: 0; 
        transform: scale(0.8) translateX(20px); 
    }
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

/* Fade in animation for loaded content */
.fade-in { 
    animation: fadeInUp 0.4s ease-out forwards; 
}

/* Slide out animation for removed items */
.slot-chip.removing {
    animation: slideOut 0.3s ease-out forwards;
}

/* Date card styling */
.date-card {
    margin-bottom: 20px;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.date-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Slot button states */
.slot {
    transition: all 0.2s ease;
    cursor: pointer;
    user-select: none;
}

.slot:hover:not(.disabled) {
    transform: scale(1.02);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.slot:active:not(.disabled) {
    transform: scale(0.98);
}

.slot.selected {
    border-color: #3b82f6;
    background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.slot.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Slot chip (summary) styling */
.slot-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin: 4px;
    transition: all 0.2s ease;
}

.slot-chip:hover {
    background: #e5e7eb;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.chip-content {
    display: flex;
    gap: 6px;
    align-items: center;
}

.chip-date {
    font-weight: 600;
    color: #374151;
}

.chip-time {
    color: #6b7280;
    font-size: 0.9em;
}

.chip-remove-btn {
    background: transparent;
    border: none;
    color: #ef4444;
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.2s ease;
    line-height: 1;
}

.chip-remove-btn:hover {
    background: #fee2e2;
    color: #dc2626;
}

.chip-remove-btn:active {
    transform: scale(0.9);
}

/* Chips container */
.chips-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}

/* Empty state styling */
.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #6b7280;
}

.empty-state h3 {
    color: #374151;
    margin-bottom: 12px;
    font-size: 1.2rem;
}

.empty-state p {
    margin-bottom: 20px;
    color: #9ca3af;
}

/* Responsive adjustments */
@media (max-width: 768px) {
    .skeleton-card {
        padding: 16px;
    }
    
    .slot-chip {
        font-size: 0.9em;
    }
    
    .chip-content {
        flex-direction: column;
        gap: 2px;
        align-items: flex-start;
    }
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
