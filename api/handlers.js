// ================================================================================================
// REQUEST HANDLERS
// FIX #1: Slot sort is now chronological (parseSlotHour) — not alphabetical (localeCompare)
// FIX #2: Removed dead `batchUpdates` array that was declared but never used
// FIX #5: Added post-write capacity guard to partially mitigate race condition
// FIX #6: Added explicit console.warn on empty normalizeDateToISO result
// FIX #7: Extracted getTodayMidnight() helper — no more duplicated today logic
// ================================================================================================

const { getSheets } = require('./sheets');
const {
    SHEETS,
    ENV,
    CONFIG,
    getCachedSlots,
    setCachedSlots,
    invalidateCache,
    checkConcurrentBookings,
    incrementActiveBookings,
    decrementActiveBookings,
    normalizePhone,
    sanitizeInput,
    isValidPhone,
    validateBookingRequest,
    validateCancellationRequest
} = require('./config');

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

/**
 * Parse date string to Date object (supports multiple formats)
 * @param {string} dateStr - Date string in various formats
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateStr) {
    if (!dateStr) return null;

    const str = String(dateStr).trim();

    // ISO format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const date = new Date(str + 'T00:00:00');
        return isNaN(date.getTime()) ? null : date;
    }

    // MM/DD/YYYY (US — Google Sheets default)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const [month, day, year] = str.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
    }

    // DD-MM-YYYY
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str)) {
        const [day, month, year] = str.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
    }

    // Fallback: native Date parsing
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Check if a booking is active
 * @param {string} status - Booking status
 * @returns {boolean}
 */
function isActiveBooking(status) {
    return !status || status === 'ACTIVE' || status.startsWith('ACTIVE');
}

/**
 * Get current timestamp in configured timezone
 * @returns {string} Formatted timestamp
 */
function getCurrentTimestamp() {
    return new Date().toLocaleString('en-US', {
        timeZone: ENV.TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

/**
 * Normalize date to ISO format (YYYY-MM-DD)
 * @param {string|Date} dateInput
 * @returns {string} Date in YYYY-MM-DD format, or '' if invalid
 */
function normalizeDateToISO(dateInput) {
    const date = typeof dateInput === 'string' ? parseDate(dateInput) : dateInput;
    if (!date || isNaN(date.getTime())) return '';

    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day   = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * FIX #7: Shared helper — returns today at local midnight.
 * Previously duplicated in both GET branches.
 * @returns {Date}
 */
function getTodayMidnight() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

/**
 * FIX #1: Parse a slot label (e.g. "9AM", "12PM", "3:30PM") to minutes-since-midnight.
 * Used for chronological sorting instead of alphabetical localeCompare.
 * @param {string} label
 * @returns {number} Minutes since midnight
 */
function parseSlotHour(label) {
    if (!label || typeof label !== 'string') return 0;
    // Take the start time of a range like "9AM-11AM" or "3:30 PM - 5 PM"
    const first  = label.replace(/\s*-\s*/g, '-').trim().split('-')[0].trim();
    const m      = first.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return 0;
    let hour     = Number(m[1]);
    const mins   = m[2] ? Number(m[2]) : 0;
    const period = m[3] ? m[3].toLowerCase() : null;
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return hour * 60 + mins;
}

// ================================================================================================
// GET HANDLER: FETCH SLOTS OR LOOKUP BOOKINGS
// ================================================================================================

async function handleGet(req, res, requestId) {
    console.log(`📥 [${requestId}] GET request`);

    // ============================================================================================
    // PHONE LOOKUP ENDPOINT
    // ============================================================================================
    if (req.query.phone) {
        console.log(`📞 [${requestId}] Phone lookup request`);

        const rawPhone        = req.query.phone;
        const normalizedPhone = normalizePhone(rawPhone);

        if (!isValidPhone(rawPhone)) {
            console.warn(`⚠️ [${requestId}] Invalid phone format: ${rawPhone}`);
            return res.status(400).json({
                ok: false,
                error: 'Invalid phone number. Must be 10 digits.'
            });
        }

        try {
            const sheets = await getSheets();

            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: ENV.SHEET_ID,
                range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            });

            const rows  = response.data.values || [];
            console.log(`📞 [${requestId}] Retrieved ${rows.length} signup records`);

            // FIX #7: Use shared getTodayMidnight()
            const today = getTodayMidnight();

            const userBookings = rows
                .map((row, idx) => {
                    const rowId  = idx + 2; // 1-indexed, header at row 1
                    const status = row[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';

                    return {
                        signupRowId: rowId,
                        timestamp:  row[SHEETS.SIGNUPS.COLS.TIMESTAMP]  || '',
                        date:       row[SHEETS.SIGNUPS.COLS.DATE]        || '',
                        slotLabel:  row[SHEETS.SIGNUPS.COLS.SLOT_LABEL]  || '',
                        name:       row[SHEETS.SIGNUPS.COLS.NAME]        || '',
                        email:      row[SHEETS.SIGNUPS.COLS.EMAIL]       || '',
                        phone:      row[SHEETS.SIGNUPS.COLS.PHONE]       || '',
                        category:   row[SHEETS.SIGNUPS.COLS.CATEGORY]    || '',
                        notes:      row[SHEETS.SIGNUPS.COLS.NOTES]       || '',
                        slotRowId:  parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]) || null,
                        status:     status
                    };
                })
                .filter(booking => {
                    const phoneMatch = normalizePhone(booking.phone) === normalizedPhone;
                    const isActive   = isActiveBooking(booking.status);

                    if (!phoneMatch || !isActive) return false;

                    const bookingDate = parseDate(booking.date);
                    if (!bookingDate || isNaN(bookingDate.getTime())) return false;

                    bookingDate.setHours(0, 0, 0, 0);
                    return bookingDate >= today;
                });

            console.log(`✅ [${requestId}] Found ${userBookings.length} active upcoming bookings for ${normalizedPhone}`);

            return res.status(200).json({
                ok:       true,
                bookings: userBookings,
                count:    userBookings.length
            });

        } catch (err) {
            console.error(`❌ [${requestId}] Phone lookup failed:`, err.message);
            return res.status(500).json({
                ok:    false,
                error: 'Failed to retrieve bookings. Please try again.'
            });
        }
    }

    // ============================================================================================
    // FETCH AVAILABLE SLOTS ENDPOINT
    // ============================================================================================
    console.log(`📅 [${requestId}] Fetching available slots`);

    try {
        const cached = getCachedSlots();
        if (cached) {
            console.log(`✅ [${requestId}] Returning cached slots`);
            return res.status(200).json(cached);
        }

        const sheets   = await getSheets();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId:     ENV.SHEET_ID,
            range:             `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`,
            valueRenderOption: 'UNFORMATTED_VALUE'
        });

        const rows = response.data.values || [];
        console.log(`📊 [${requestId}] Retrieved ${rows.length} slot rows`);

        const slots = rows
            .map((row, idx) => {
                const capacity  = parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0;
                const taken     = parseInt(row[SHEETS.SLOTS.COLS.TAKEN])    || 0;
                const rawDate   = row[SHEETS.SLOTS.COLS.DATE] || '';

                // FIX #6: Warn explicitly when date normalization yields empty string
                const normalizedDate = normalizeDateToISO(rawDate);
                if (rawDate && !normalizedDate) {
                    console.warn(`⚠️ [${requestId}] Could not normalize date for row ${idx + 2}: "${rawDate}"`);
                }

                return {
                    id:        idx + 2,
                    date:      normalizedDate,
                    slotLabel: row[SHEETS.SLOTS.COLS.LABEL] || '',
                    capacity,
                    taken,
                    available: Math.max(0, capacity - taken)
                };
            })
            .filter(slot => slot.date && slot.slotLabel && slot.capacity > 0);

        // FIX #7: Use shared getTodayMidnight()
        const today       = getTodayMidnight();
        const futureSlots = slots.filter(slot => {
            const slotDate = parseDate(slot.date);
            return slotDate && slotDate >= today && slot.available > 0;
        });

        // Group by date
        const grouped = {};
        futureSlots.forEach(slot => {
            if (!grouped[slot.date]) grouped[slot.date] = [];
            grouped[slot.date].push(slot);
        });

        // Sort dates, then sort slots within each date chronologically
        const sortedDates   = Object.keys(grouped).sort();
        const sortedGrouped = {};

        sortedDates.forEach(date => {
            // FIX #1: Chronological sort using parseSlotHour()
            // Previous: a.slotLabel.localeCompare(b.slotLabel) — alphabetical, wrong for times
            // e.g. "12PM" sorted before "3PM" alphabetically, but 3PM comes after 12PM
            sortedGrouped[date] = grouped[date].sort(
                (a, b) => parseSlotHour(a.slotLabel) - parseSlotHour(b.slotLabel)
            );
        });

        console.log(`✅ [${requestId}] Grouped into ${sortedDates.length} dates with ${futureSlots.length} available slots`);

        const result = {
            ok:         true,
            dates:      sortedGrouped,
            totalDates: sortedDates.length,
            totalSlots: futureSlots.length
        };

        setCachedSlots(result);
        return res.status(200).json(result);

    } catch (err) {
        console.error(`❌ [${requestId}] Slots fetch failed:`, err.message);
        console.error('Stack:', err.stack);
        return res.status(500).json({
            ok:    false,
            error: 'Unable to fetch slots. Please try again later.'
        });
    }
}

// ================================================================================================
// POST HANDLER: CREATE BOOKING
// ================================================================================================

async function handlePost(req, res, requestId) {
    console.log(`📝 [${requestId}] POST booking request`);

    const errors = validateBookingRequest(req.body);
    if (errors.length > 0) {
        console.warn(`⚠️ [${requestId}] Validation failed:`, errors);
        return res.status(400).json({
            ok:     false,
            error:  errors.join(' '),
            errors: errors
        });
    }

    const name            = sanitizeInput(req.body.name,          CONFIG.MAX_NAME_LENGTH);
    const normalizedPhone = normalizePhone(req.body.phone);
    const email           = sanitizeInput(req.body.email || '',   CONFIG.MAX_EMAIL_LENGTH)?.toLowerCase();
    const category        = sanitizeInput(req.body.category,      CONFIG.MAX_CATEGORY_LENGTH);
    const notes           = sanitizeInput(req.body.notes || '',   CONFIG.MAX_NOTES_LENGTH);
    const slotIds         = req.body.slotIds;

    console.log(`👤 [${requestId}] Booking for: ${name} (${normalizedPhone}), ${slotIds.length} slots`);

    if (!checkConcurrentBookings(normalizedPhone)) {
        console.warn(`⚠️ [${requestId}] Concurrent booking limit exceeded for ${normalizedPhone}`);
        return res.status(429).json({
            ok:    false,
            error: 'Too many concurrent booking requests. Please wait and try again.'
        });
    }

    incrementActiveBookings(normalizedPhone);

    try {
        const sheets = await getSheets();

        const [slotsResponse, signupsResponse] = await Promise.all([
            sheets.spreadsheets.values.batchGet({
                spreadsheetId:     ENV.SHEET_ID,
                ranges:            slotIds.map(id => `${SHEETS.SLOTS.NAME}!A${id}:D${id}`),
                valueRenderOption: 'UNFORMATTED_VALUE'
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId:     ENV.SHEET_ID,
                range:             `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            })
        ]);

        const slotRanges     = slotsResponse.data.valueRanges;
        const existingSignups = signupsResponse.data.values || [];
        const timestamp      = getCurrentTimestamp();

        const validBookings = [];
        const conflicts     = [];
        // FIX #2: Removed dead `batchUpdates` array — was declared but never populated or read

        for (let i = 0; i < slotIds.length; i++) {
            const slotId   = slotIds[i];
            const slotData = slotRanges[i].values?.[0];

            if (!slotData || slotData.length < 4) {
                conflicts.push({ slotId, date: 'Unknown', label: 'Unknown', reason: 'Slot not found' });
                continue;
            }

            const date     = slotData[SHEETS.SLOTS.COLS.DATE];
            const label    = slotData[SHEETS.SLOTS.COLS.LABEL];
            const capacity = parseInt(slotData[SHEETS.SLOTS.COLS.CAPACITY]) || 0;
            const taken    = parseInt(slotData[SHEETS.SLOTS.COLS.TAKEN])    || 0;

            // Check for duplicate booking
            const isDuplicate = existingSignups.some(row => {
                const rowPhone  = normalizePhone(row[SHEETS.SIGNUPS.COLS.PHONE]       || '');
                const rowSlotId = parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]);
                const rowStatus = row[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';
                return rowPhone === normalizedPhone &&
                       rowSlotId === slotId &&
                       isActiveBooking(rowStatus);
            });

            if (isDuplicate) {
                conflicts.push({ slotId, date, label, reason: 'Already booked by this phone number' });
                continue;
            }

            // Check capacity
            if (taken >= capacity) {
                conflicts.push({ slotId, date, label, reason: 'Slot is full', capacity, taken });
                continue;
            }

            validBookings.push({ slotId, date, label, capacity, taken, newTaken: taken + 1 });
        }

        // Return conflicts
        if (conflicts.length > 0) {
            const validCount    = validBookings.length;
            const conflictCount = conflicts.length;

            console.warn(`⚠️ [${requestId}] Booking conflicts: ${conflictCount}/${slotIds.length} unavailable`);
            decrementActiveBookings(normalizedPhone);

            const slotStatus = slotIds.map(slotId => {
                const conflict = conflicts.find(c => c.slotId === slotId);
                if (conflict) {
                    return { slotId: conflict.slotId, date: conflict.date, label: conflict.label, status: 'conflict', reason: conflict.reason };
                }
                const valid = validBookings.find(b => b.slotId === slotId);
                if (valid) {
                    return { slotId: valid.slotId, date: valid.date, label: valid.label, status: 'valid', reason: null };
                }
                return { slotId, date: 'Unknown', label: 'Unknown', status: 'conflict', reason: 'Slot not found' };
            });

            return res.status(409).json({
                ok:         false,
                error:      `${conflictCount} of ${slotIds.length} slot(s) unavailable`,
                validSlots: validCount,
                conflicts,
                slotStatus,
                message:    validCount > 0
                    ? `${validCount} slot(s) available, but ${conflictCount} conflict(s) detected`
                    : 'No slots available for booking'
            });
        }

        if (validBookings.length === 0) {
            console.warn(`⚠️ [${requestId}] No valid slots to book`);
            decrementActiveBookings(normalizedPhone);
            return res.status(400).json({ ok: false, error: 'No valid slots available for booking.' });
        }

        // Build signup rows
        const signupRows = validBookings.map(booking => [
            timestamp,
            booking.date,
            booking.label,
            name,
            email,
            normalizedPhone,
            category,
            notes,
            booking.slotId.toString(),
            'ACTIVE'
        ]);

        const updateRequests = [
            {
                appendCells: {
                    sheetId: ENV.SIGNUPS_GID,
                    rows: signupRows.map(row => ({
                        values: row.map(cell => ({
                            userEnteredValue: { stringValue: String(cell) }
                        }))
                    })),
                    fields: 'userEnteredValue'
                }
            },
            ...validBookings.map(booking => ({
                updateCells: {
                    range: {
                        sheetId:          ENV.SLOTS_GID,
                        startRowIndex:    booking.slotId - 1,
                        endRowIndex:      booking.slotId,
                        startColumnIndex: SHEETS.SLOTS.COLS.TAKEN,
                        endColumnIndex:   SHEETS.SLOTS.COLS.TAKEN + 1
                    },
                    rows:   [{ values: [{ userEnteredValue: { numberValue: booking.newTaken } }] }],
                    fields: 'userEnteredValue'
                }
            }))
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: ENV.SHEET_ID,
            requestBody: { requests: updateRequests }
        });

        // FIX #5: Post-write validation — re-read each slot's taken count and warn if
        // it exceeds capacity (indicates a race condition occurred between read and write).
        // Google Sheets has no row-level locks; this is a best-effort guard.
        try {
            const verifyResponse = await sheets.spreadsheets.values.batchGet({
                spreadsheetId:     ENV.SHEET_ID,
                ranges:            validBookings.map(b => `${SHEETS.SLOTS.NAME}!C${b.slotId}:D${b.slotId}`),
                valueRenderOption: 'UNFORMATTED_VALUE'
            });

            verifyResponse.data.valueRanges.forEach((range, i) => {
                const row      = range.values?.[0];
                const capacity = parseInt(row?.[0]) || 0;
                const taken    = parseInt(row?.[1]) || 0;
                if (taken > capacity) {
                    console.warn(
                        `⚠️ [${requestId}] Race condition detected on slotId=${validBookings[i].slotId}: ` +
                        `taken=${taken} > capacity=${capacity}. Manual review may be needed.`
                    );
                }
            });
        } catch (verifyErr) {
            // Non-fatal: log and continue — booking already written
            console.warn(`⚠️ [${requestId}] Post-write verification failed (non-fatal):`, verifyErr.message);
        }

        console.log(`✅ [${requestId}] Booking successful: ${validBookings.length} slot(s) for ${normalizedPhone}`);

        invalidateCache();
        decrementActiveBookings(normalizedPhone);

        return res.status(200).json({
            ok:          true,
            message:     `Successfully booked ${validBookings.length} slot(s)!`,
            bookedSlots: validBookings.map(b => ({ date: b.date, label: b.label })),
            count:       validBookings.length
        });

    } catch (err) {
        console.error(`❌ [${requestId}] Booking failed:`, err.message);
        console.error('Stack:', err.stack);
        decrementActiveBookings(normalizedPhone);
        return res.status(500).json({
            ok:    false,
            error: 'Booking failed due to a server error. Please try again.'
        });
    }
}

// ================================================================================================
// PATCH HANDLER: CANCEL BOOKING
// ================================================================================================

async function handlePatch(req, res, requestId) {
    console.log(`🗑️ [${requestId}] PATCH cancellation request`);

    const errors = validateCancellationRequest(req.body);
    if (errors.length > 0) {
        console.warn(`⚠️ [${requestId}] Validation failed:`, errors);
        return res.status(400).json({ ok: false, error: errors.join(' '), errors });
    }

    const { signupRowId, slotRowId, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    console.log(`👤 [${requestId}] Cancelling: signupRow=${signupRowId}, slotRow=${slotRowId}, phone=${normalizedPhone}`);

    try {
        const sheets = await getSheets();

        const [signupResponse, slotResponse] = await Promise.all([
            sheets.spreadsheets.values.get({
                spreadsheetId:     ENV.SHEET_ID,
                range:             `${SHEETS.SIGNUPS.NAME}!A${signupRowId}:J${signupRowId}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId:     ENV.SHEET_ID,
                range:             `${SHEETS.SLOTS.NAME}!D${slotRowId}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            })
        ]);

        const signupRow = signupResponse.data.values?.[0];
        if (!signupRow) {
            console.warn(`⚠️ [${requestId}] Booking not found: signupRow=${signupRowId}`);
            return res.status(404).json({ ok: false, error: 'Booking not found.' });
        }

        // Verify phone matches
        const bookingPhone = normalizePhone(signupRow[SHEETS.SIGNUPS.COLS.PHONE] || '');
        if (bookingPhone !== normalizedPhone) {
            console.warn(`⚠️ [${requestId}] Phone mismatch: expected=${normalizedPhone}, got=${bookingPhone}`);
            return res.status(403).json({
                ok:    false,
                error: 'Phone number does not match. Cannot cancel this booking.'
            });
        }

        // Check if already cancelled
        const currentStatus = signupRow[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';
        if (currentStatus.startsWith('CANCELLED')) {
            console.warn(`⚠️ [${requestId}] Booking already cancelled`);
            return res.status(400).json({ ok: false, error: 'This booking has already been cancelled.' });
        }

        const currentTaken  = parseInt(slotResponse.data.values?.[0]?.[0] || 0);
        const newTaken      = Math.max(0, currentTaken - 1);
        const cancelTimestamp = new Date().toISOString();

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: ENV.SHEET_ID,
            requestBody: {
                requests: [
                    {
                        updateCells: {
                            range: {
                                
