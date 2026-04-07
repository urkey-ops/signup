// ================================================================================================
// SLOTS STYLES - CSS-IN-JS FOR SLOTS MODULE
// ================================================================================================

/**
 * Inject all slots-related styles into the document head
 * Only runs once, subsequent calls are ignored
 */
export function injectSlotsStyles() {
  if (document.getElementById('slots-styles')) return;

  const style = document.createElement('style');
  style.id = 'slots-styles';
  style.textContent = `
/* ================================================================================================
   SLOTS MODULE SKELETON STYLES (LOADING STATES)
================================================================================================ */

@keyframes shimmer {
  0%   { background-position: -468px 0; }
  100% { background-position:  468px 0; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.skeleton-card {
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
  animation: fadeIn var(--transition-slow) ease;
}

.skeleton-title {
  height: 24px;
  width: 150px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-base);
}

.skeleton-slot {
  background: linear-gradient(90deg, #f8f8f8 25%, #f0f0f0 50%, #f8f8f8 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border: 1px solid #e0e0e0;
  pointer-events: none;
  min-height: 64px;
  border-radius: var(--radius-md);
  padding: var(--space-base);
}

.skeleton-text {
  height: 16px;
  background: #e0e0e0;
  border-radius: var(--radius-sm);
  margin: var(--space-sm) auto;
  width: 80%;
}

.skeleton-text-small {
  height: 12px;
  background: #e8e8e8;
  border-radius: var(--radius-sm);
  margin: var(--space-xs) auto;
  width: 50%;
}

/* ================================================================================================
   DATE NAV — STICKY PILL STRIP + NEXT AVAILABLE BUTTON
================================================================================================ */

.date-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-primary, #fff);
  padding: 10px 0 8px;
  margin: 0 0 4px;
  /* Subtle bottom shadow to separate from content */
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  border-radius: 0 0 var(--radius-md, 8px) var(--radius-md, 8px);
  /* Negative margins to stretch edge-to-edge within the card */
  margin-left: calc(-1 * var(--space-xl, 1.5rem));
  margin-right: calc(-1 * var(--space-xl, 1.5rem));
  padding-left: var(--space-xl, 1.5rem);
  padding-right: var(--space-xl, 1.5rem);
}

/* Horizontal scrollable pill strip */
.date-pill-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  /* Hide scrollbar visually but keep scroll functional */
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 2px;
  /* Padding so last pill isn't clipped */
  padding-right: 16px;
}

.date-pill-strip::-webkit-scrollbar {
  display: none;
}

/* Individual date pill */
.date-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  min-width: 56px;
  min-height: 44px; /* touch target */
  padding: 6px 12px;
  border: 1.5px solid var(--border-color, #e0d5c5);
  border-radius: 999px;
  background: var(--bg-secondary, #faf7f2);
  color: var(--text-primary, #1a0f00);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
  white-space: nowrap;
  line-height: 1.2;
}

.date-pill:hover {
  border-color: var(--primary-color, #c2692a);
  background: var(--primary-light, #fdf0e6);
}

.date-pill:active {
  transform: scale(0.96);
}

/* Active pill — currently in viewport */
.date-pill.date-pill-active {
  background: var(--primary-color, #c2692a);
  border-color: var(--primary-color, #c2692a);
  color: #fff;
  box-shadow: 0 2px 8px rgba(194, 105, 42, 0.3);
}

.date-pill.date-pill-active .pill-count {
  color: rgba(255,255,255,0.85);
}

/* Full pill — no available slots */
.date-pill.date-pill-full {
  opacity: 0.55;
  border-style: dashed;
}

.date-pill.date-pill-full:hover {
  background: var(--bg-secondary, #faf7f2);
  border-color: var(--border-color, #e0d5c5);
}

.pill-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.pill-count {
  font-size: 11px;
  color: var(--primary-color, #c2692a);
  font-weight: 500;
}

/* Next Available button */
.next-available-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #c2692a 0%, #a8501c 100%);
  color: #fff;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(194, 105, 42, 0.3);
  min-height: 36px;
  letter-spacing: 0.02em;
}

.next-available-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(194, 105, 42, 0.4);
}

.next-available-btn:active {
  transform: scale(0.97);
}

.next-arrow {
  font-size: 14px;
  animation: bounceDown 1.4s ease-in-out infinite;
}

@keyframes bounceDown {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(3px); }
}

/* ================================================================================================
   REDUCED MOTION — disable animations for accessibility
================================================================================================ */
@media (prefers-reduced-motion: reduce) {
  .next-arrow { animation: none; }
  .date-pill, .next-available-btn { transition: none; }
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
