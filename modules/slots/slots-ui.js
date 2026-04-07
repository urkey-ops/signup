// ================================================================================================
// SLOTS UI - DOM RENDERING & INTERACTIONS
// ================================================================================================

import { getSelectedSlots, CONFIG } from '../../config.js';
import { showMessage } from '../../utils.js';
import { sortSlotsByTime } from './slots-api.js';

let currentSlotListener = null;
let dateNavObserver = null;
let headerResizeObserver = null;

// ================================================================================================
// SLOT TIME-OF-DAY ICON
// Returns an emoji icon based on the start hour of a slot label.
// Labels are expected to look like "9AM - 12PM", "12PM - 3PM", "3PM - 6PM" etc.
// ================================================================================================

/**
 * Get time-of-day icon for a slot label.
 * ☀️  Morning   — start hour  5 – 11
 * 🌤  Afternoon — start hour 12 – 16
 * 🌇  Evening   — start hour 17 – 21
 * @param {string} label - e.g. "9AM - 12PM"
 * @returns {string} emoji
 */
function getSlotIcon(label) {
  if (!label || typeof label !== 'string') return '';

  // Grab the first token before the dash
  const firstPart = label.split(/\s*[-–]\s*/)[0].trim().toLowerCase();
  const match = firstPart.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return '';

  let hour = Number(match[1]);
  const period = match[3] ? match[3].toLowerCase() : null;

  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;

  if (hour >= 5  && hour <= 11) return '☀️';
  if (hour >= 12 && hour <= 16) return '🌤';
  if (hour >= 17 && hour <= 21) return '🌇';
  return '';
}

// ================================================================================================
// STICKY HEADER OFFSET — measure real header height at runtime
// ================================================================================================

function syncStickyOffset() {
  const pageHeader = document.querySelector('header');
  const stickyEl   = document.querySelector('.slots-sticky-header');

  const headerH = pageHeader ? pageHeader.offsetHeight : 56;
  const stickyH = stickyEl  ? stickyEl.offsetHeight   : 0;
  const offset  = headerH + stickyH;

  document.documentElement.style.setProperty('--slots-header-offset', `${headerH}px`);

  document.querySelectorAll('.date-card').forEach(card => {
    card.style.scrollMarginTop = `${offset + 12}px`;
  });
}

function watchHeaderHeight() {
  if (headerResizeObserver) { headerResizeObserver.disconnect(); headerResizeObserver = null; }

  const pageHeader = document.querySelector('header');
  if (!pageHeader || typeof ResizeObserver === 'undefined') return;

  headerResizeObserver = new ResizeObserver(() => syncStickyOffset());
  headerResizeObserver.observe(pageHeader);

  const stickyEl = document.querySelector('.slots-sticky-header');
  if (stickyEl) headerResizeObserver.observe(stickyEl);
}

// ================================================================================================
// SKELETON UI
// ================================================================================================

export function showSkeletonUI(lastSlotsCount = 9) {
  const datesContainer = document.getElementById('datesContainer');
  const slotsDisplay   = document.getElementById('slotsDisplay');
  const loadingMsg     = document.getElementById('loadingMsg');

  if (!datesContainer || !slotsDisplay || !loadingMsg) {
    console.error('Required DOM elements for skeleton UI not found');
    return;
  }

  destroyDateNav();

  loadingMsg.style.display  = 'none';
  slotsDisplay.style.display = 'block';

  // 3 skeleton slots per card matches the new 3-slot-per-day structure
  const dateCardsCount = Math.min(Math.ceil(lastSlotsCount / 3), 3);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < dateCardsCount; i++) {
    const card  = document.createElement('div');
    card.className = 'date-card card skeleton-card fade-in';

    const title = document.createElement('div');
    title.className = 'skeleton-title';
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'slots-grid';

    // Always 3 skeleton slots — one per session
    for (let j = 0; j < 3; j++) {
      const slot  = document.createElement('div');
      slot.className = 'slot skeleton-slot';
      const line1 = document.createElement('div'); line1.className = 'skeleton-text';
      const line2 = document.createElement('div'); line2.className = 'skeleton-text-small';
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

function formatDateWithDay(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDatePill(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // "Tue 12" — day-of-week + date number
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum  = date.toLocaleDateString('en-US', { day: 'numeric' });
  return { weekday, dayNum };
}

export function createDateCard(date, slots) {
  const card = document.createElement('div');
  card.className = 'date-card card fade-in';
  card.dataset.dateSection = date;

  const title = document.createElement('h3');
  title.textContent = `📅 ${formatDateWithDay(date)}`;
  card.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'slots-grid';

  const sortedSlots = sortSlotsByTime(slots);
  sortedSlots.forEach(slot => grid.appendChild(createSlotElement(slot)));

  card.appendChild(grid);
  return card;
}

export function createSlotElement(slot) {
  const selectedSlots = getSelectedSlots();
  const isSelected    = selectedSlots.some(s => s.id === slot.id);
  const available     = slot.available ?? 0;

  const div = document.createElement('div');
  div.className  = `slot ${isSelected ? 'selected' : ''}`;
  div.id         = `slot-btn-${slot.id}`;
  div.dataset.slotId = slot.id;
  div.dataset.date   = slot.date  || 'Unknown Date';
  div.dataset.label  = slot.slotLabel || 'Unknown Time';
  div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  div.setAttribute('role', 'button');
  div.setAttribute('tabindex', '0');

  // Row: icon + label
  const labelRow = document.createElement('span');
  labelRow.className = 'slot-label-row';

  const icon = document.createElement('span');
  icon.className   = 'slot-tod-icon';
  icon.textContent = getSlotIcon(slot.slotLabel);
  icon.setAttribute('aria-hidden', 'true');

  const labelText = document.createElement('span');
  labelText.className   = 'slot-label-text';
  labelText.textContent = slot.slotLabel || 'Unknown Time';

  labelRow.appendChild(icon);
  labelRow.appendChild(labelText);
  div.appendChild(labelRow);

  div.appendChild(document.createElement('br'));

  const small = document.createElement('small');
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
// DATE NAV — sticky pill strip inside .slots-sticky-header
// ================================================================================================

export function renderDateNav(groupedSlots) {
  destroyDateNav();

  const stickyHeader = document.querySelector('.slots-sticky-header');
  if (!stickyHeader) { console.warn('slots-sticky-header not found — date nav skipped'); return; }

  const sortedDates = Object.keys(groupedSlots).sort((a, b) => new Date(a) - new Date(b));
  if (sortedDates.length === 0) return;

  const nav = document.createElement('div');
  nav.id = 'date-nav';
  nav.className = 'date-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Jump to date');

  // Pill strip
  const strip = document.createElement('div');
  strip.className = 'date-pill-strip';

  sortedDates.forEach(date => {
    const slots          = groupedSlots[date] || [];
    const totalAvailable = slots.reduce((sum, s) => sum + (s.available ?? 0), 0);
    const isFull         = totalAvailable === 0;

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className    = `date-pill${isFull ? ' date-pill-full' : ''}`;
    pill.dataset.navDate = date;
    pill.setAttribute('aria-label',
      `Jump to ${formatDateWithDay(date)}${isFull ? ' (full)' : ` — ${totalAvailable} spot${totalAvailable !== 1 ? 's' : ''} left`}`
    );

    const { weekday, dayNum } = formatDatePill(date);

    // Weekday row
    const pillWeekday = document.createElement('span');
    pillWeekday.className   = 'pill-weekday';
    pillWeekday.textContent = weekday;

    // Day-number row
    const pillDay = document.createElement('span');
    pillDay.className   = 'pill-day';
    pillDay.textContent = dayNum;

    // Availability count row
    const pillCount = document.createElement('span');
    pillCount.className         = 'pill-count';
    pillCount.dataset.pillDate  = date;
    pillCount.textContent       = isFull ? 'Full' : `${totalAvailable}`;

    pill.appendChild(pillWeekday);
    pill.appendChild(pillDay);
    pill.appendChild(pillCount);
    pill.addEventListener('click', () => scrollToDate(date));
    strip.appendChild(pill);
  });

  nav.appendChild(strip);

  // Next Available button
  const nextDate = sortedDates.find(date =>
    (groupedSlots[date] || []).some(s => (s.available ?? 0) > 0)
  );

  if (nextDate) {
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.id        = 'next-available-btn';
    nextBtn.className = 'next-available-btn';
    nextBtn.setAttribute('aria-label', `Jump to next available date: ${formatDateWithDay(nextDate)}`);
    nextBtn.innerHTML = `<span>Next Available</span><span class="next-arrow">↓</span>`;
    nextBtn.addEventListener('click', () => scrollToDate(nextDate));
    nav.appendChild(nextBtn);
  }

  stickyHeader.appendChild(nav);

  syncStickyOffset();
  watchHeaderHeight();
  initScrollSpy(sortedDates);
}

function scrollToDate(date) {
  const card = document.querySelector(`[data-date-section="${date}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActivePill(date);
}

function setActivePill(date) {
  document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('date-pill-active'));
  const activePill = document.querySelector(`.date-pill[data-nav-date="${date}"]`);
  if (activePill) {
    activePill.classList.add('date-pill-active');
    activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function initScrollSpy(sortedDates) {
  if (dateNavObserver) { dateNavObserver.disconnect(); dateNavObserver = null; }

  const stickyEl     = document.querySelector('.slots-sticky-header');
  const stickyH      = stickyEl ? stickyEl.offsetHeight : 80;
  const pageHeaderH  = document.querySelector('header')?.offsetHeight ?? 56;
  const totalOffset  = pageHeaderH + stickyH;
  const rootMarginTop = `-${totalOffset + 4}px`;

  dateNavObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const date = entry.target.dataset.dateSection;
        if (date) setActivePill(date);
      }
    });
  }, { root: null, rootMargin: `${rootMarginTop} 0px -65% 0px`, threshold: 0 });

  sortedDates.forEach(date => {
    const card = document.querySelector(`[data-date-section="${date}"]`);
    if (card) dateNavObserver.observe(card);
  });
}

export function updateDateNavCounts(groupedSlots) {
  if (!groupedSlots) return;

  Object.entries(groupedSlots).forEach(([date, slots]) => {
    const totalAvailable = slots.reduce((sum, s) => sum + (s.available ?? 0), 0);
    const isFull         = totalAvailable === 0;

    const countEl = document.querySelector(`.pill-count[data-pill-date="${date}"]`);
    if (countEl) countEl.textContent = isFull ? 'Full' : `${totalAvailable}`;

    const pill = document.querySelector(`.date-pill[data-nav-date="${date}"]`);
    if (pill) {
      pill.classList.toggle('date-pill-full', isFull);
      pill.setAttribute('aria-label',
        `Jump to ${formatDateWithDay(date)}${isFull ? ' (full)' : ` — ${totalAvailable} spot${totalAvailable !== 1 ? 's' : ''} left`}`
      );
    }
  });

  const anyAvailable = Object.values(groupedSlots).some(slots =>
    slots.some(s => (s.available ?? 0) > 0)
  );
  const nextBtn = document.getElementById('next-available-btn');
  if (nextBtn) nextBtn.style.display = anyAvailable ? '' : 'none';
}

function destroyDateNav() {
  if (dateNavObserver)     { dateNavObserver.disconnect();     dateNavObserver = null; }
  if (headerResizeObserver){ headerResizeObserver.disconnect(); headerResizeObserver = null; }
  const existing = document.getElementById('date-nav');
  if (existing) existing.remove();
}

// ================================================================================================
// SLOT RENDERING
// ================================================================================================

export function renderSlots(groupedSlots, onSlotClick) {
  const datesContainer = document.getElementById('datesContainer');
  if (!datesContainer) { console.error('datesContainer not found'); return; }

  if (currentSlotListener) {
    datesContainer.removeEventListener('click', currentSlotListener);
    currentSlotListener = null;
  }

  datesContainer.innerHTML = '';

  const dates = Object.keys(groupedSlots);
  if (dates.length === 0) { console.log('No slots to render'); return; }

  const fragment    = document.createDocumentFragment();
  const sortedDates = dates.sort((a, b) => new Date(a) - new Date(b));

  sortedDates.forEach(date => {
    const dateSlots      = groupedSlots[date];
    const availableSlots = dateSlots.filter(slot => slot.available > 0);
    if (availableSlots.length > 0) {
      fragment.appendChild(createDateCard(date, availableSlots));
    }
  });

  datesContainer.appendChild(fragment);

  requestAnimationFrame(() => syncStickyOffset());

  // Click delegation
  currentSlotListener = (e) => {
    const slot = e.target.closest('.slot');
    if (!slot || slot.classList.contains('disabled')) return;
    const slotId = parseInt(slot.dataset.slotId);
    const date   = slot.dataset.date;
    const label  = slot.dataset.label;
    if (slotId && date && label && typeof onSlotClick === 'function') {
      onSlotClick(date, label, slotId, slot);
    }
  };
  datesContainer.addEventListener('click', currentSlotListener);

  // Keyboard accessibility
  datesContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const slot = e.target.closest('.slot');
      if (slot && !slot.classList.contains('disabled')) { e.preventDefault(); slot.click(); }
    }
  });

  console.log(`✅ Rendered ${sortedDates.length} date cards`);
}

// ================================================================================================
// UI STATE MANAGEMENT
// ================================================================================================

export function toggleDisplay(showSlots) {
  const loadingMsg   = document.getElementById('loadingMsg');
  const slotsDisplay = document.getElementById('slotsDisplay');
  if (loadingMsg)   loadingMsg.style.display   = showSlots ? 'none'  : 'block';
  if (slotsDisplay) slotsDisplay.style.display = showSlots ? 'block' : 'none';
}

export function resetSlotSelectionUI() {
  document.querySelectorAll('.slot.selected').forEach(slot => {
    slot.classList.remove('selected');
    slot.setAttribute('aria-pressed', 'false');
  });
  console.log('✅ Slot UI selection reset');
}

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

export function showNoSlotsMessage() {
  const datesContainer = document.getElementById('datesContainer');
  if (!datesContainer) return;

  destroyDateNav();
  datesContainer.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className   = 'empty-state-icon';
  icon.textContent = '📅';
  container.appendChild(icon);

  const heading = document.createElement('h3');
  heading.textContent = 'No available slots right now';
  container.appendChild(heading);

  const message = document.createElement('p');
  message.textContent = 'New sessions are added regularly — please check back soon!';
  container.appendChild(message);

  const refreshBtn = document.createElement('button');
  refreshBtn.className   = 'btn secondary-btn';
  refreshBtn.textContent = '🔄 Refresh';
  refreshBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('reloadSlots')));
  container.appendChild(refreshBtn);

  datesContainer.appendChild(container);
  toggleDisplay(true);
}

export function showErrorMessage(errorMessage) {
  const loadingMsg     = document.getElementById('loadingMsg');
  const datesContainer = document.getElementById('datesContainer');
  if (!loadingMsg || !datesContainer) return;

  destroyDateNav();
  datesContainer.innerHTML = '';
  loadingMsg.innerHTML = '';

  const errorText = document.createElement('p');
  errorText.className   = 'error-text';
  errorText.textContent = `⚠️ ${errorMessage}`;
  loadingMsg.appendChild(errorText);

  const retryBtn = document.createElement('button');
  retryBtn.className   = 'btn secondary-btn';
  retryBtn.textContent = '🔄 Retry';
  retryBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('reloadSlots')));
  loadingMsg.appendChild(retryBtn);

  loadingMsg.style.display  = 'block';
  const slotsDisplay = document.getElementById('slotsDisplay');
  if (slotsDisplay) slotsDisplay.style.display = 'none';
}

export function cleanupSlotListeners() {
  const datesContainer = document.getElementById('datesContainer');
  if (datesContainer && currentSlotListener) {
    datesContainer.removeEventListener('click', currentSlotListener);
    currentSlotListener = null;
  }
  destroyDateNav();
  console.log('🧹 Slot listeners cleaned up');
}
