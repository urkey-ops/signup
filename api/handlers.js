// ================================================================================================
// REQUEST HANDLERS - State-of-the-Art Version
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
    
    // Handle string conversion
    const str = String(dateStr).trim();
    
    // Try ISO format first (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const date = new Date(str + 'T00:00:00');
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Handle MM/DD/YYYY format (US format from Google Sheets)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
        const [month, day, year] = str.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Handle DD-MM-YYYY format
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str)) {
        const [day, month, year] = str.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Fallback: Try native Date parsing
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Check if a booking is active
 * @param {string} status - Booking status
 * @returns {boolean} True if active
 */
function isActiveBooking(status) {
    return !status || status === 'ACTIVE' || status.startsWith('ACTIVE');
}

/**
 * Get current timestamp in configured timezone
 * @returns {string} Formatted timestamp
 */
function getCurrentTimestamp() {
    return new Date().toLocaleString("en-US", { 
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
 * @param {string|Date} dateInput - Date in any format
 * @returns {string} Date in YYYY-MM-DD format
 */
function normalizeDateToISO(dateInput) {
    const date = typeof dateInput === 'string' ? parseDate(dateInput) : dateInput;
    if (!date || isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

// ================================================================================================
// GET HANDLER: FETCH SLOTS OR LOOKUP BOOKINGS
// ================================================================================================

/**
 * Handle GET requests for fetching slots or looking up bookings
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} requestId - Unique request identifier
 */
async function handleGet(req, res, requestId) {
    console.log(`📥 [${requestId}] GET request`);
    
    // ============================================================================================
    // PHONE LOOKUP ENDPOINT
    // ============================================================================================
    if (req.query.phone) {
        console.log(`📞 [${requestId}] Phone lookup request`);
        
        const rawPhone = req.query.phone;
        const normalizedPhone = normalizePhone(rawPhone);
        
        if (!isValidPhone(rawPhone)) {
            console.warn(`⚠️ [${requestId}] Invalid phone format: ${rawPhone}`);
            return res.status(400).json({ 
                ok: false, 
                error: "Invalid phone number. Must be 10 digits." 
            });
        }

        try {
            const sheets = await getSheets();
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: ENV.SHEET_ID,
                range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            });
            
            const rows = response.data.values || [];
            console.log(`📞 [${requestId}] Retrieved ${rows.length} signup records`);
            
            // Map and filter bookings
            const userBookings = rows
                .map((row, idx) => {
                    const rowId = idx + 2; // Sheet rows are 1-indexed, header at row 1
                    const status = row[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';
                    
                    return {
                        signupRowId: rowId,
                        timestamp: row[SHEETS.SIGNUPS.COLS.TIMESTAMP] || '',
                        date: row[SHEETS.SIGNUPS.COLS.DATE] || '',
                        slotLabel: row[SHEETS.SIGNUPS.COLS.SLOT_LABEL] || '',
                        name: row[SHEETS.SIGNUPS.COLS.NAME] || '',
                        email: row[SHEETS.SIGNUPS.COLS.EMAIL] || '',
                        phone: row[SHEETS.SIGNUPS.COLS.PHONE] || '',
                        category: row[SHEETS.SIGNUPS.COLS.CATEGORY] || '',
                        notes: row[SHEETS.SIGNUPS.COLS.NOTES] || '',
                        slotRowId: parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]) || null,
                        status: status
                    };
                })
                .filter(booking => {
                    const phoneMatch = normalizePhone(booking.phone) === normalizedPhone;
                    const isActive = isActiveBooking(booking.status);
                    return phoneMatch && isActive;
                });

            console.log(`✅ [${requestId}] Found ${userBookings.length} active bookings for ${normalizedPhone}`);
            
            return res.status(200).json({ 
                ok: true, 
                bookings: userBookings,
                count: userBookings.length
            });
            
        } catch (err) {
            console.error(`❌ [${requestId}] Phone lookup failed:`, err.message);
            return res.status(500).json({ 
                ok: false, 
                error: "Failed to retrieve bookings. Please try again." 
            });
        }
    }

    // ============================================================================================
    // FETCH AVAILABLE SLOTS ENDPOINT
    // ============================================================================================
    console.log(`📅 [${requestId}] Fetching available slots`);
    
    try {
        // Check cache first
        const cached = getCachedSlots();
        if (cached) {
            console.log(`✅ [${requestId}] Returning cached slots`);
            return res.status(200).json(cached);
        }

        // Fetch from Google Sheets
        const sheets = await getSheets();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: ENV.SHEET_ID,
            range: `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`,
            valueRenderOption: 'UNFORMATTED_VALUE'
        });

        const rows = response.data.values || [];
        console.log(`📊 [${requestId}] Retrieved ${rows.length} slot rows`);
        
        // Parse and structure slots
        const slots = rows
            .map((row, idx) => {
                const capacity = parseInt(row[SHEETS.SLOTS.COLS.CAPACITY]) || 0;
                const taken = parseInt(row[SHEETS.SLOTS.COLS.TAKEN]) || 0;
                const rawDate = row[SHEETS.SLOTS.COLS.DATE] || '';
                
                // Normalize date to ISO format (handles MM/DD/YYYY, DD-MM-YYYY, etc.)
                const normalizedDate = normalizeDateToISO(rawDate);
                
                return {
                    id: idx + 2, // Sheet row number (1-indexed, header at row 1)
                    date: normalizedDate,
                    slotLabel: row[SHEETS.SLOTS.COLS.LABEL] || '',
                    capacity: capacity,
                    taken: taken,
                    available: Math.max(0, capacity - taken)
                };
            })
            .filter(slot => {
                // Only include slots with valid data
                return slot.date && slot.slotLabel && slot.capacity > 0;
            });

        // Filter to future dates only
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const futureSlots = slots.filter(slot => {
            const slotDate = parseDate(slot.date);
            return slotDate && slotDate >= today && slot.available > 0;
        });

        // Group by date
        const grouped = {};
        futureSlots.forEach(slot => {
            if (!grouped[slot.date]) {
                grouped[slot.date] = [];
            }
            grouped[slot.date].push(slot);
        });

        // Sort dates and slots within each date
        const sortedDates = Object.keys(grouped).sort();
        const sortedGrouped = {};
        sortedDates.forEach(date => {
            sortedGrouped[date] = grouped[date].sort((a, b) => {
                return a.slotLabel.localeCompare(b.slotLabel);
            });
        });

        console.log(`✅ [${requestId}] Grouped into ${sortedDates.length} dates with ${futureSlots.length} available slots`);
        
        const result = { 
            ok: true, 
            dates: sortedGrouped,
            totalDates: sortedDates.length,
            totalSlots: futureSlots.length
        };
        
        // Cache the result
        setCachedSlots(result);
        
        return res.status(200).json(result);
        
    } catch (err) {
        console.error(`❌ [${requestId}] Slots fetch failed:`, err.message);
        console.error('Stack:', err.stack);
        return res.status(500).json({ 
            ok: false, 
            error: "Unable to fetch slots. Please try again later." 
        });
    }
}

// ================================================================================================
// POST HANDLER: CREATE BOOKING
// ================================================================================================

/**
 * Handle POST requests for creating bookings
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} requestId - Unique request identifier
 */
async function handlePost(req, res, requestId) {
    console.log(`📝 [${requestId}] POST booking request`);
    
    // Validate request body
    const errors = validateBookingRequest(req.body);
    if (errors.length > 0) {
        console.warn(`⚠️ [${requestId}] Validation failed:`, errors);
        return res.status(400).json({ 
            ok: false, 
            error: errors.join(' '),
            errors: errors
        });
    }

    // Extract and sanitize inputs
    const name = sanitizeInput(req.body.name, CONFIG.MAX_NAME_LENGTH);
    const normalizedPhone = normalizePhone(req.body.phone);
    const email = sanitizeInput(req.body.email || '', CONFIG.MAX_EMAIL_LENGTH)?.toLowerCase();
    const category = sanitizeInput(req.body.category, CONFIG.MAX_CATEGORY_LENGTH);
    const notes = sanitizeInput(req.body.notes || '', CONFIG.MAX_NOTES_LENGTH);
    const slotIds = req.body.slotIds;

    console.log(`👤 [${requestId}] Booking for: ${name} (${normalizedPhone}), ${slotIds.length} slots`);

    // Check concurrent booking limit
    if (!checkConcurrentBookings(normalizedPhone)) {
        console.warn(`⚠️ [${requestId}] Concurrent booking limit exceeded for ${normalizedPhone}`);
        return res.status(429).json({ 
            ok: false, 
            error: "Too many concurrent booking requests. Please wait and try again." 
        });
    }

    // Track active booking
    incrementActiveBookings(normalizedPhone);
    
    try {
        const sheets = await getSheets();
        
        // Fetch slot data and existing signups in parallel
        const [slotsResponse, signupsResponse] = await Promise.all([
            sheets.spreadsheets.values.batchGet({
                spreadsheetId: ENV.SHEET_ID,
                ranges: slotIds.map(id => `${SHEETS.SLOTS.NAME}!A${id}:D${id}`),
                valueRenderOption: 'UNFORMATTED_VALUE'
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId: ENV.SHEET_ID,
                range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            })
        ]);

        const slotRanges = slotsResponse.data.valueRanges;
        const existingSignups = signupsResponse.data.values || [];
        const timestamp = getCurrentTimestamp();

        // Process each slot
        const validBookings = [];
        const conflicts = [];
        const batchUpdates = [];
        
        for (let i = 0; i < slotIds.length; i++) {
            const slotId = slotIds[i];
            const slotData = slotRanges[i].values?.[0];
            
            // Validate slot exists
            if (!slotData || slotData.length < 4) {
                conflicts.push({
                    slotId,
                    date: 'Unknown',
                    label: 'Unknown',
                    reason: 'Slot not found'
                });
                continue;
            }

            const date = slotData[SHEETS.SLOTS.COLS.DATE];
            const label = slotData[SHEETS.SLOTS.COLS.LABEL];
            const capacity = parseInt(slotData[SHEETS.SLOTS.COLS.CAPACITY]) || 0;
            const taken = parseInt(slotData[SHEETS.SLOTS.COLS.TAKEN]) || 0;

            // Check for duplicate booking
            const isDuplicate = existingSignups.some(row => {
                const rowPhone = normalizePhone(row[SHEETS.SIGNUPS.COLS.PHONE] || '');
                const rowSlotId = parseInt(row[SHEETS.SIGNUPS.COLS.SLOT_ROW_ID]);
                const rowStatus = row[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';
                
                return rowPhone === normalizedPhone && 
                       rowSlotId === slotId && 
                       isActiveBooking(rowStatus);
            });
            
            if (isDuplicate) {
                conflicts.push({
                    slotId,
                    date,
                    label,
                    reason: 'Already booked by this phone number'
                });
                continue;
            }

            // Check capacity
            if (taken >= capacity) {
                conflicts.push({
                    slotId,
                    date,
                    label,
                    reason: 'Slot is full',
                    capacity,
                    taken
                });
                continue;
            }

            // Valid slot - prepare for booking
            validBookings.push({
                slotId,
                date,
                label,
                capacity,
                taken,
                newTaken: taken + 1
            });
        }

        // Handle conflicts
        if (conflicts.length > 0) {
            const validCount = validBookings.length;
            const conflictCount = conflicts.length;
            
            console.warn(`⚠️ [${requestId}] Booking conflicts: ${conflictCount}/${slotIds.length} unavailable`);
            decrementActiveBookings(normalizedPhone);
            
            // Build slotStatus array for frontend compatibility
            const slotStatus = slotIds.map(slotId => {
                const conflict = conflicts.find(c => c.slotId === slotId);
                if (conflict) {
                    return {
                        slotId: conflict.slotId,
                        date: conflict.date,
                        label: conflict.label,
                        status: 'conflict',
                        reason: conflict.reason
                    };
                }
                
                const valid = validBookings.find(b => b.slotId === slotId);
                if (valid) {
                    return {
                        slotId: valid.slotId,
                        date: valid.date,
                        label: valid.label,
                        status: 'valid',
                        reason: null
                    };
                }
                
                return {
                    slotId: slotId,
                    date: 'Unknown',
                    label: 'Unknown',
                    status: 'conflict',
                    reason: 'Slot not found'
                };
            });
            
            return res.status(409).json({ 
                ok: false,
                error: `${conflictCount} of ${slotIds.length} slot(s) unavailable`,
                validSlots: validCount,
                conflicts: conflicts,
                slotStatus: slotStatus, // ← Added for frontend compatibility
                message: validCount > 0 
                    ? `${validCount} slot(s) available, but ${conflictCount} conflict(s) detected`
                    : 'No slots available for booking'
            });
        }

        // No valid bookings
        if (validBookings.length === 0) {
            console.warn(`⚠️ [${requestId}] No valid slots to book`);
            decrementActiveBookings(normalizedPhone);
            return res.status(400).json({ 
                ok: false, 
                error: "No valid slots available for booking." 
            });
        }

        // Prepare batch update requests
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
            // Append signup rows
            {
                appendCells: {
                    sheetId: ENV.SIGNUPS_GID,
                    rows: signupRows.map(row => ({
                        values: row.map(cell => ({ 
                            userEnteredValue: { 
                                stringValue: String(cell) 
                            } 
                        }))
                    })),
                    fields: 'userEnteredValue'
                }
            },
            // Update slot taken counts
            ...validBookings.map(booking => ({
                updateCells: {
                    range: {
                        sheetId: ENV.SLOTS_GID,
                        startRowIndex: booking.slotId - 1,
                        endRowIndex: booking.slotId,
                        startColumnIndex: SHEETS.SLOTS.COLS.TAKEN,
                        endColumnIndex: SHEETS.SLOTS.COLS.TAKEN + 1
                    },
                    rows: [{
                        values: [{
                            userEnteredValue: { 
                                numberValue: booking.newTaken 
                            }
                        }]
                    }],
                    fields: 'userEnteredValue'
                }
            }))
        ];

        // Execute batch update
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: ENV.SHEET_ID,
            requestBody: {
                requests: updateRequests
            }
        });

        console.log(`✅ [${requestId}] Booking successful: ${validBookings.length} slot(s) for ${normalizedPhone}`);
        
        // Invalidate cache and cleanup
        invalidateCache();
        decrementActiveBookings(normalizedPhone);
        
        return res.status(200).json({ 
            ok: true, 
            message: `Successfully booked ${validBookings.length} slot(s)!`,
            bookedSlots: validBookings.map(b => ({
                date: b.date,
                label: b.label
            })),
            count: validBookings.length
        });
        
    } catch (err) {
        console.error(`❌ [${requestId}] Booking failed:`, err.message);
        console.error('Stack:', err.stack);
        decrementActiveBookings(normalizedPhone);
        
        return res.status(500).json({ 
            ok: false, 
            error: "Booking failed due to a server error. Please try again." 
        });
    }
}

// ================================================================================================
// PATCH HANDLER: CANCEL BOOKING
// ================================================================================================

/**
 * Handle PATCH requests for cancelling bookings
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} requestId - Unique request identifier
 */
async function handlePatch(req, res, requestId) {
    console.log(`🗑️ [${requestId}] PATCH cancellation request`);
    
    // Validate request
    const errors = validateCancellationRequest(req.body);
    if (errors.length > 0) {
        console.warn(`⚠️ [${requestId}] Validation failed:`, errors);
        return res.status(400).json({ 
            ok: false, 
            error: errors.join(' '),
            errors: errors
        });
    }
    
    const { signupRowId, slotRowId, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);
    
    console.log(`👤 [${requestId}] Cancelling: signupRow=${signupRowId}, slotRow=${slotRowId}, phone=${normalizedPhone}`);

    try {
        const sheets = await getSheets();
        
        // Fetch signup and slot data in parallel
        const [signupResponse, slotResponse] = await Promise.all([
            sheets.spreadsheets.values.get({
                spreadsheetId: ENV.SHEET_ID,
                range: `${SHEETS.SIGNUPS.NAME}!A${signupRowId}:J${signupRowId}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId: ENV.SHEET_ID,
                range: `${SHEETS.SLOTS.NAME}!D${slotRowId}`,
                valueRenderOption: 'UNFORMATTED_VALUE'
            })
        ]);
        
        const signupRow = signupResponse.data.values?.[0];
        if (!signupRow) {
            console.warn(`⚠️ [${requestId}] Booking not found: signupRow=${signupRowId}`);
            return res.status(404).json({ 
                ok: false, 
                error: "Booking not found." 
            });
        }
        
        // Verify phone number matches
        const bookingPhone = normalizePhone(signupRow[SHEETS.SIGNUPS.COLS.PHONE] || '');
        if (bookingPhone !== normalizedPhone) {
            console.warn(`⚠️ [${requestId}] Phone mismatch: expected=${normalizedPhone}, got=${bookingPhone}`);
            return res.status(403).json({ 
                ok: false, 
                error: "Phone number does not match. Cannot cancel this booking." 
            });
        }
        
        // Check if already cancelled
        const currentStatus = signupRow[SHEETS.SIGNUPS.COLS.STATUS] || 'ACTIVE';
        if (currentStatus.startsWith('CANCELLED')) {
            console.warn(`⚠️ [${requestId}] Booking already cancelled`);
            return res.status(400).json({ 
                ok: false, 
                error: "This booking has already been cancelled." 
            });
        }

        // Calculate new taken count
        const currentTaken = parseInt(slotResponse.data.values?.[0]?.[0] || 0);
        const newTaken = Math.max(0, currentTaken - 1);
        const cancelTimestamp = new Date().toISOString();

        // Batch update: mark as cancelled and decrement slot count
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: ENV.SHEET_ID,
            requestBody: {
                requests: [
                    // Update signup status
                    {
                        updateCells: {
                            range: {
                                sheetId: ENV.SIGNUPS_GID,
                                startRowIndex: signupRowId - 1,
                                endRowIndex: signupRowId,
                                startColumnIndex: SHEETS.SIGNUPS.COLS.STATUS,
                                endColumnIndex: SHEETS.SIGNUPS.COLS.STATUS + 1
                            },
                            rows: [{
                                values: [{
                                    userEnteredValue: { 
                                        stringValue: `CANCELLED:${cancelTimestamp}` 
                                    }
                                }]
                            }],
                            fields: 'userEnteredValue'
                        }
                    },
                    // Decrement slot taken count
                    {
                        updateCells: {
                            range: {
                                sheetId: ENV.SLOTS_GID,
                                startRowIndex: slotRowId - 1,
                                endRowIndex: slotRowId,
                                startColumnIndex: SHEETS.SLOTS.COLS.TAKEN,
                                endColumnIndex: SHEETS.SLOTS.COLS.TAKEN + 1
                            },
                            rows: [{
                                values: [{
                                    userEnteredValue: { 
                                        numberValue: newTaken 
                                    }
                                }]
                            }],
                            fields: 'userEnteredValue'
                        }
                    }
                ]
            }
        });

        console.log(`✅ [${requestId}] Cancellation successful: signupRow=${signupRowId}, slotRow=${slotRowId}`);
        
        // Invalidate cache
        invalidateCache();
        
        return res.status(200).json({ 
            ok: true, 
            message: "Booking cancelled successfully.",
            cancelledSlot: {
                date: signupRow[SHEETS.SIGNUPS.COLS.DATE],
                label: signupRow[SHEETS.SIGNUPS.COLS.SLOT_LABEL]
            }
        });
        
    } catch (err) {
        console.error(`❌ [${requestId}] Cancellation failed:`, err.message);
        console.error('Stack:', err.stack);
        
        return res.status(500).json({ 
            ok: false, 
            error: "Cancellation failed due to a server error. Please try again." 
        });
    }
}

// ================================================================================================
// EXPORTS
// ================================================================================================

module.exports = {
    handleGet,
    handlePost,
    handlePatch
};
