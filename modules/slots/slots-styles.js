// ================================================================================================
// SLOTS STYLES - CSS-IN-JS FOR SLOTS MODULE
// ================================================================================================

export function injectSlotsStyles() {
  if (document.getElementById('slots-styles')) return;

  const style = document.createElement('style');
  style.id = 'slots-styles';
  style.textContent = `

/* ============================================================ */
/* SLOTS CARD                                                   */
/* ============================================================ */

.slots-card {
  contain: none !important;
  overflow: visible !important;
}

/* ============================================================ */
/* STICKY SLOTS HEADER                                          */
/* ============================================================ */

.slots-sticky-header {
  position: sticky;
  top: var(--slots-header-offset, 56px);
  z-index: 90;
  background: var(--surface);
  margin-left:  calc(-1 * var(--space-base));
  margin-right: calc(-1 * var(--space-base));
  padding: var(--space-base) var(--space-base) 0;
  border-bottom: 1px solid var(--border-light);
  box-shadow: 0 3px 10px rgba(26, 15, 0, 0.06);
  border-radius: 0;
  transition: box-shadow var(--transition-normal);
}

@media (min-width: 640px) {
  .slots-sticky-header {
    margin-left:  calc(-1 * var(--space-xl));
    margin-right: calc(-1 * var(--space-xl));
    padding-left:  var(--space-xl);
    padding-right: var(--space-xl);
  }
}

.slots-sticky-header h2 { margin-bottom: var(--space-md); }

.slots-sticky-spacer { height: var(--space-lg); }

/* ============================================================ */
/* DATE NAV — pill strip + next available button               */
/* ============================================================ */

.date-nav { padding-bottom: var(--space-md); }

.date-pill-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 2px;
  padding-right: 16px;
}
.date-pill-strip::-webkit-scrollbar { display: none; }

/* Date pill — now shows weekday / date-number / count in 3 rows */
.date-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
  min-width: 52px;
  min-height: 44px;
  padding: 6px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface-warm);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    transform 0.1s;
  white-space: nowrap;
  line-height: 1.2;
  -webkit-tap-highlight-color: transparent;
}

.date-pill:hover {
  border-color: var(--primary-color);
  background: var(--primary-lighter);
}

.date-pill:active { transform: scale(0.95); }

.date-pill.date-pill-active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
  box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.3);
}

.date-pill.date-pill-active .pill-count { color: rgba(255,255,255,0.85); }

.date-pill.date-pill-full {
  opacity: 0.5;
  border-style: dashed;
}
.date-pill.date-pill-full:hover {
  background: var(--surface-warm);
  border-color: var(--border);
}

/* Weekday row — e.g. "Tue" */
.pill-weekday {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.75;
  line-height: 1;
}

/* Day number row — e.g. "12" */
.pill-day {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.1;
}

/* Availability count row */
.pill-count {
  font-size: 0.65rem;
  color: var(--primary-color);
  font-weight: 500;
  line-height: 1;
}

/* Next Available button */
.next-available-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-md);
  padding: 7px 16px;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-family: var(--font-body);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  box-shadow: var(--shadow-primary);
  min-height: 36px;
  letter-spacing: 0.02em;
  -webkit-tap-highlight-color: transparent;
}

.next-available-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 16px rgba(var(--primary-rgb), 0.4);
}

.next-available-btn:active {
  transform: scale(0.97);
  box-shadow: var(--shadow-sm);
}

.next-arrow {
  font-size: 13px;
  animation: navBounceDown 1.5s ease-in-out infinite;
}

@keyframes navBounceDown {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(3px); }
}

/* ============================================================ */
/* SLOT ELEMENT — time-of-day icon row                         */
/* ============================================================ */



/* ============================================================ */
/* FLOATING BUTTON — badge + summary line                      */
/* ============================================================ */

/* Badge that sits on the button */
.floating-btn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  margin-left: 8px;
  background: rgba(255,255,255,0.25);
  border: 1.5px solid rgba(255,255,255,0.6);
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  vertical-align: middle;
  line-height: 1;
}

/* Pop animation when count increments */
@keyframes badgePop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.45); }
  70%  { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.floating-btn-badge.badge-pop {
  animation: badgePop 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Summary line below the floating button */
.floating-btn-summary {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.88);
  text-align: center;
  letter-spacing: 0.02em;
  line-height: 1.4;
  min-height: 1em;
  padding: 0 4px;
  word-break: break-word;
}

/* ============================================================ */
/* SKELETON LOADING                                             */
/* ============================================================ */

.skeleton-card { pointer-events: none; user-select: none; }

.skeleton-title,
.skeleton-slot,
.skeleton-text,
.skeleton-text-small {
  background: linear-gradient(
    90deg,
    var(--border-light) 25%,
    var(--border) 50%,
    var(--border-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: var(--radius-sm);
}

.skeleton-title      { height: 24px; width: 55%; margin-bottom: var(--space-base); }
.skeleton-slot       { height: var(--touch-min); border-radius: var(--radius-md); }
.skeleton-text       { height: 15px; margin-bottom: var(--space-sm); }
.skeleton-text-small { height: 11px; width: 65%; }

/* ============================================================ */
/* EMPTY STATE                                                  */
/* ============================================================ */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3rem 1.5rem;
  gap: var(--space-md);
}

.empty-state-icon {
  font-size: 2.5rem;
  line-height: 1;
  margin-bottom: var(--space-sm);
  opacity: 0.6;
}

.empty-state h3 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.empty-state p {
  font-size: 0.9rem;
  color: var(--text-secondary);
  max-width: 30ch;
  margin: 0;
  line-height: 1.6;
}



/* ============================================================ */
/* FORM ROW — phone + email side by side at tablet+            */
/* ============================================================ */

.form-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-base);
}

@media (min-width: 560px) {
  .form-row {
    grid-template-columns: 1fr 1fr;
  }
}

/* ============================================================ */
/* FORM BUTTON ROW                                              */
/* ============================================================ */

.form-btn-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.form-btn-back   { flex: 1; min-width: 140px; }
.form-btn-submit { flex: 2; min-width: 190px; }

/* ============================================================ */
/* REDUCED MOTION                                               */
/* ============================================================ */

@media (prefers-reduced-motion: reduce) {
  .next-arrow                 { animation: none; }
  .date-pill, .next-available-btn { transition: none; }
  .floating-btn-badge.badge-pop   { animation: none; }
}

@media (prefers-contrast: high) {
  .date-pill             { border-width: 2px; }
  .date-pill.date-pill-active { border-width: 3px; }
}
`;

  document.head.appendChild(style);
  console.log('✅ Slots styles injected');
}

export function removeSlotsStyles() {
  const el = document.getElementById('slots-styles');
  if (el) { el.remove(); console.log('🗑️ Slots styles removed'); }
}
