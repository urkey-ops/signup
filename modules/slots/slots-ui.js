// ================================================================================================
// SLOTS UI - DOM RENDERING & INTERACTIONS (FULLY CSS CONSISTENT)
// ================================================================================================

import { getSelectedSlots, CONFIG } from '../../config.js';
import { showMessage } from '../../utils.js';
import { sortSlotsByTime } from './slots-api.js';

// Module-level listener reference for cleanup
let currentSlotListener = null;

// Date nav IntersectionObserver reference for cleanup
let dateNavObserver = null;

// ================================================================================================
// SKELETON UI - LOADING STATE (FAST VISUAL FEEDBACK)
// ================================================================================================

/**
 * Show skeleton loading UI while slots are being fetched
 * Uses last known slot count for realistic placeholders
 */
export function showSkeletonUI(lastSlotsCount = 10) {
  const datesContainer = document.getElementById('datesContainer');
  const slotsDisplay = document.getElementById('slotsDisplay');
  const loadingMsg = document.getElementById('loadingMsg');

  if (!datesContainer || !slotsDisplay || !loadingMsg) {
    console.error('Required DOM elements for skeleton UI not found');
    return;
  }

  // Remove date nav if present from previous render
  destroyDateNav();

  loadingMsg.style.display = 'none';
  slotsDisplay.style.display = 'block';

  // Decide number of date cards (default 3)
  const dateCardsCount = Math.min(Math.ceil(lastSlotsCount / 4), 3);

  // Create skeleton cards
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < dateCardsCount; i++) {
    const card = document.createElement('div');
    card.className = 'date-card card skeleton-card fade-in';

    const title = document.createElement('div');
    title.className = 'skeleton-title';
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'slots-grid';
    for (let j = 0; j < 4; j++) {
      const slot = document.createElement('div');
      slot.className = 'slot skeleton-slot';
      const line1 = document.createElement('div');
      line1.className = 'skeleton-text';
      const line2 = document.createElement('div');
      line2.className = 'skeleton-text-small';
      slot.appendChild(line1);
      slot.appendChild(line2);
      grid.appendChild(slot);
    }

    card.appendChild(grid);
    fragment.appendChild(card);
  }

  datesContainer.innerHTML = '';
  datesContainer.appendChild(fragment);
}

// ================================================================================================
// DATE CARD CREATION
// ================================================================================================

/**
 * Format date string with day of week
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @returns {string} Formatted date (e.g., "Mon, Jan 15")
 */
function formatDateWithDay(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Format date for pill label — short form e.g. "Sat 3"
 * @param {string} dateString - YYYY-MM-DD
 * @returns {string}
 */
function formatDatePill(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

/**
 * Create a date card with slots
 * @param {string} date - Date string
 * @param {Array} slots - Array of slot objects
 * @returns {HTMLElement} Date card element
 */
export function createDateCard(date, slots) {
  const card = document.createElement('div');
  card.className = 'date-card card fade-in';
  card.dataset.dateSection = date; // used by scroll spy

  const title = document.createElement('h3');
  title.textContent = `📅 ${formatDateWithDay(date)}`;
  card.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'slots-grid';

  const sortedSlots = sortSlotsByTime(slots);
  sortedSlots.forEach(slot => {
    const slotDiv = createSlotElement(slot);
    grid.appendChild(slotDiv);
  });

  card.appendChild(grid);
  return card;
}

/**
 * Create a slot button element
 * @param {Object} slot - Slot data object
 * @returns {HTMLElement} Slot button element
 */
export function createSlotElement(slot) {
  const selectedSlots = getSelectedSlots();

  const div = document.createElement('div');
  const isSelected = selectedSlots.some(s => s.id === slot.id);

  div.className = `slot ${isSelected ? 'selected' : ''}`;
  div.id = `slot-btn-${slot.id}`;
  div.dataset.slotId = slot.id;
  div.dataset.date = slot.date || 'Unknown Date';
  div.dataset.label = slot.slotLabel || 'Unknown Time';
  div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  div.setAttribute('role', 'button');
  div.setAttribute('tabindex', '0');

  const label = document.createElement('span');
  label.textContent = slot.slotLabel || 'Unknown Time';
  div.appendChild(label);

  div.appendChild(document.createElement('br'));

  const small = document.createElement('small');
  const available = slot.available ?? 0;
  small.textContent = `(${available} left)`;

  if (available === 0) {
    small.className = 'availability-none';
    div.classList.add('disabled');
    div.setAttribute('aria-disabled', 'true');
  } else if (available <= 2) {
    small.className = 'availability-low';
  } else {
    small.className = 'availability-high';
  }

  div.appendChild(small);
  return div;
}

// ================================================================================================
// DATE NAV — PILL STRIP + NEXT AVAILABLE BUTTON
// ================================================================================================

/**
 * Build and inject the sticky date pill strip + "Next Available" button
 * @param {Object} groupedSlots - Slots grouped by date { 'YYYY-MM-DD': [...] }
 */
export function renderDateNav(groupedSlots) {
  // Remove any existing nav first
  destroyDateNav();

  const slotsDisplay = document.getElementById('slotsDisplay');
  const datesContainer = document.getElementById('datesContainer');
  if (!slotsDisplay || !datesContainer) return;

  const sortedDates = Object.keys(groupedSlots).sort((a, b) => new Date(a) - new Date(b));
  if (sortedDates.length <= 1) return; // not useful for a single date

  // Build nav wrapper
  const nav = document.createElement('div');
  nav.id = 'date-nav';
  nav.className = 'date-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Jump to date');

  // Pill strip
  const strip = document.createElement('div');
  strip.className = 'date-pill-strip';

  sortedDates.forEach(date => {
    const slots = groupedSlots[date] || [];
    const totalAvailable = slots.reduce((sum, s) => sum + (s.available ?? 0), 0);
    const isFull = totalAvailable === 0;

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `date-pill${isFull ? ' date-pill-full' : ''}`;
    pill.dataset.navDate = date;
    pill.setAttribute('aria-label', `Jump to ${formatDateWithDay(date)}${isFull ? ' (full)' : ` — ${totalAvailable} spot${totalAvailable !== 1 ? 's' : ''} left`}`);

    const pillLabel = document.createElement('span');
    pillLabel.className = 'pill-label';
    pillLabel.textContent = formatDatePill(date);

    const pillCount = document.createElement('span');
    pillCount.className = 'pill-count';
    pillCount.dataset.pillDate = date;
    pillCount.textContent = isFull ? 'Full' : `${totalAvailable}`;

    pill.appendChild(pillLabel);
    pill.appendChild(pillCount);

    pill.addEventListener('click', () => scrollToDate(date));
    strip.appendChild(pill);
  });

  nav.appendChild(strip);

  // Next Available button — find first date with available > 0
  const nextDate = sortedDates.find(date => {
    const slots = groupedSlots[date] || [];
    return slots.some(s => (s.available ?? 0) > 0);
  });

  if (nextDate) {
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.id = 'next-available-btn';
    nextBtn.className = 'next-available-btn';
    nextBtn.setAttribute('aria-label', `Jump to next available date: ${formatDateWithDay(nextDate)}`);
    nextBtn.innerHTML = `<span>Next Available</span><span class="next-arrow">↓</span>`;
    nextBtn.addEventListener('click', () => scrollToDate(nextDate));
    nav.appendChild(nextBtn);
  }

  // Insert nav before datesContainer
  slotsDisplay.insertBefore(nav, datesContainer);

  // Start scroll spy
  initScrollSpy(sortedDates);
}

/**
 * Smooth scroll to a date section card
 * @param {string} date - YYYY-MM-DD
 */
function scrollToDate(date) {
  const card = document.querySelector(`[data-date-section="${date}"]`);
  if (!card) return;

  // Account for sticky nav height
  const nav = document.getElementById('date-nav');
  const navHeight = nav ? nav.offsetHeight : 0;
  const top = card.getBoundingClientRect().top + window.scrollY - navHeight - 12;

  window.scrollTo({ top, behavior: 'smooth' });

  // Highlight the pill immediately on click
  setActivePill(date);
}

/**
 * Set active state on a pill and scroll it into view within the strip
 * @param {string} date - YYYY-MM-DD
 */
function setActivePill(date) {
  const pills = document.querySelectorAll('.date-pill');
  pills.forEach(p => p.classList.remove('date-pill-active'));

  const activePill = document.querySelector(`.date-pill[data-nav-date="${date}"]`);
  if (activePill) {
    activePill.classList.add('date-pill-active');
    // Scroll the pill into view within the strip
    activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

/**
 * Setup IntersectionObserver scroll spy on date section cards
 * @param {Array} sortedDates - Array of date strings in order
 */
function initScrollSpy(sortedDates) {
  // Disconnect previous observer
  if (dateNavObserver) {
    dateNavObserver.disconnect();
    dateNavObserver = null;
  }

  const options = {
    root: null,
    rootMargin: '-20% 0px -70% 0px', // trigger when card is in top 30% of viewport
    threshold: 0
  };

  dateNavObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const date = entry.target.dataset.dateSection;
        if (date) setActivePill(date);
      }
    });
  }, options);

  // Observe each date card
  sortedDates.forEach(date => {
    const card = document.querySelector(`[data-date-section="${date}"]`);
    if (card) dateNavObserver.observe(card);
  });
}

/**
 * Update pill counts after SSE slot-availability changes
 * @param {Object} groupedSlots - Updated slots grouped by date
 */
export function updateDateNavCounts(groupedSlots) {
  if (!groupedSlots) return;

  Object.entries(groupedSlots).forEach(([date, slots]) => {
    const totalAvailable = slots.reduce((sum, s) => sum + (s.available ?? 0), 0);
    const isFull = totalAvailable === 0;

    // Update count badge
    const countEl = document.querySelector(`.pill-count[data-pill-date="${date}"]`);
    if (countEl) {
      countEl.textContent = isFull ? 'Full' : `${totalAvailable}`;
    }

    // Update pill full state
    const pill = document.querySelector(`.date-pill[data-nav-date="${date}"]`);
    if (pill) {
      pill.classList.toggle('date-pill-full', isFull);
      pill.setAttribute('aria-label',
        `Jump to ${formatDateWithDay(date)}${isFull ? ' (full)' : ` — ${totalAvailable} spot${totalAvailable !== 1 ? 's' : ''} left`}`
      );
    }
  });

  // Hide next-available-btn if all dates are full
  const anyAvailable = Object.values(groupedSlots).some(slots =>
    slots.some(s => (s.available ?? 0) > 0)
  );
  const nextBtn = document.getElementById('next-available-btn');
  if (nextBtn) nextBtn.style.display = anyAvailable ? '' : 'none';
}

/**
 * Remove date nav and disconnect observer
 */
function destroyDateNav() {
  if (dateNavObserver) {
    dateNavObserver.disconnect();
    dateNavObserver = null;
  }
  const existing = document.getElementById('date-nav');
  if (existing) existing.remove();
}

// ================================================================================================
// SLOT RENDERING
// ================================================================================================

/**
 * Render slots in the DOM
 * @param {Object} groupedSlots - Slots grouped by date
 * @param {Function} onSlotClick - Callback for slot click
 */
export function renderSlots(groupedSlots, onSlotClick) {
  const datesContainer = document.getElementById('datesContainer');
  if (!datesContainer) {
    console.error('datesContainer not found');
    return;
  }

  // Clean up previous listener
  if (currentSlotListener) {
    datesContainer.removeEventListener('click', currentSlotListener);
    currentSlotListener = null;
  }

  datesContainer.innerHTML = '';

  const dates = Object.keys(groupedSlots);
  if (dates.length === 0) {
    console.log('No slots to render');
    return;
  }

  const fragment = document.createDocumentFragment();
  const sortedDates = dates.sort((a, b) => new Date(a) - new Date(b));

  sortedDates.forEach(date => {
    const dateSlots = groupedSlots[date];
    const availableSlots = dateSlots.filter(slot => slot.available > 0);

    if (availableSlots.length > 0) {
      const card = createDateCard(date, availableSlots);
      fragment.appendChild(card);
    }
  });

  datesContainer.appendChild(fragment);

  // Setup click delegation
  currentSlotListener = (e) => {
    const slot = e.target.closest('.slot');
    if (!slot || slot.classList.contains('disabled')) return;

    const slotId = parseInt(slot.dataset.slotId);
    const date = slot.dataset.date;
    const label = slot.dataset.label;

    if (slotId && date && label && typeof onSlotClick === 'function') {
      onSlotClick(date, label, slotId, slot);
    }
  };

  datesContainer.addEventListener('click', currentSlotListener);

  // Keyboard accessibility
  datesContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const slot = e.target.closest('.slot');
      if (slot && !slot.classList.contains('disabled')) {
        e.preventDefault();
        slot.click();
      }
    }
  });

  console.log(`✅ Rendered ${sortedDates.length} date cards`);
}

// ================================================================================================
// UI STATE MANAGEMENT
// ================================================================================================

/**
 * Show/hide loading message and slots display
 * @param {boolean} showSlots - True to show slots, false to show loading
 */
export function toggleDisplay(showSlots) {
  const loadingMsg = document.getElementById('loadingMsg');
  const slotsDisplay = document.getElementById('slotsDisplay');

  if (loadingMsg) loadingMsg.style.display = showSlots ? 'none' : 'block';
  if (slotsDisplay) slotsDisplay.style.display = showSlots ? 'block' : 'none';
}

/**
 * Reset all slot selection UI states
 */
export function resetSlotSelectionUI() {
  const slotButtons = document.querySelectorAll('.slot.selected');
  slotButtons.forEach(slot => {
    slot.classList.remove('selected');
    slot.setAttribute('aria-pressed', 'false');
  });
  console.log('✅ Slot UI selection reset');
}

/**
 * Update a single slot's UI state
 * @param {number} slotId - Slot ID
 * @param {boolean} selected - True if selected
 */
export function updateSlotUI(slotId, selected) {
  const slotElement = document.getElementById(`slot-btn-${slotId}`);
  if (!slotElement) return;

  if (selected) {
    slotElement.classList.add('selected');
    slotElement.setAttribute('aria-pressed', 'true');
  } else {
    slotElement.classList.remove('selected');
    slotElement.setAttribute('aria-pressed', 'false');
  }
}

// ================================================================================================
// EMPTY & ERROR STATES
// ================================================================================================

/**
 * Show "no slots available" message
 */
export function showNoSlotsMessage() {
  const datesContainer = document.getElementById('datesContainer');
  if (!datesContainer) return;

  destroyDateNav();
  datesContainer.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-state-icon';
  icon.textContent = '📅';
  container.appendChild(icon);

  const heading = document.createElement('h3');
  heading.textContent = 'No available slots at this time';
  container.appendChild(heading);

  const message = document.createElement('p');
  message.textContent = 'Please check back later for new availability!';
  container.appendChild(message);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn secondary-btn';
  refreshBtn.textContent = '🔄 Refresh';
  refreshBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('reloadSlots'));
  });
  container.appendChild(refreshBtn);

  datesContainer.appendChild(container);
  toggleDisplay(true);
}

/**
 * Show error message
 * @param {string} errorMessage - Error message to display
 */
export function showErrorMessage(errorMessage) {
  const loadingMsg = document.getElementById('loadingMsg');
  const datesContainer = document.getElementById('datesContainer');

  if (!loadingMsg || !datesContainer) return;

  destroyDateNav();
  datesContainer.innerHTML = '';
  loadingMsg.innerHTML = '';

  const errorText = document.createElement('p');
  errorText.className = 'error-text';
  errorText.textContent = `⚠️ ${errorMessage}`;
  loadingMsg.appendChild(errorText);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn secondary-btn';
  retryBtn.textContent = '🔄 Retry';
  retryBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('reloadSlots'));
  });
  loadingMsg.appendChild(retryBtn);

  loadingMsg.style.display = 'block';
  const slotsDisplay = document.getElementById('slotsDisplay');
  if (slotsDisplay) slotsDisplay.style.display = 'none';
}

/**
 * Cleanup slot listeners and date nav (called on module unload)
 */
export function cleanupSlotListeners() {
  const datesContainer = document.getElementById('datesContainer');
  if (datesContainer && currentSlotListener) {
    datesContainer.removeEventListener('click', currentSlotListener);
    currentSlotListener = null;
  }
  destroyDateNav();
  console.log('🧹 Slot listeners cleaned up');
}
