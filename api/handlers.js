// ================================================================================================
// REQUEST HANDLERS
// ================================================================================================

const { getSheets } = require('./sheets');
const {
    SHEETS,
    ENV,
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
    CONFIG
} = require('./config');

// ================================================================================================
// GET: FETCH SLOTS OR LOOKUP BOOKINGS
// ================================================================================================

async function handleGet(req, res) {
    console.log('📥 GET request');
    const sheets = await getSheets();
    
    // Phone lookup
    if (req.query.phone) {
        console.log('📞 Phone lookup');
        const rawPhone = req.query.phone;
        const normalizedPhone = normalizePhone(rawPhone);
        
        if (!isValidPhone(rawPhone)) {
            return res.status(400).json({ ok: false, error: "Invalid 10-digit phone number." });
        }

        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: ENV.SHEET_ID,
                range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
            });
            const rows = response.data.values || [];
            console.log(`📞 Found ${rows.length} total signups`);
            
            const userBookings = rows
                .map((row, idx) => ({
                    signupRowId: idx + 2,
                    timestamp: row[0], 
                    date: row[1], 
                    slotLabel: row[2],
                    name: row[3], 
                    email: row[4], 
                    phone: row[5],
                    category: row[6], 
                    notes: row[7],
                    slotRowId: parseInt(row[8]) || null,
                    status: row[9] || 'ACTIVE'
                }))
                .filter(b => normalizePhone(b.phone) === normalizedPhone && b.status === 'ACTIVE');

            console.log(`✅ Found ${userBookings.length} active bookings for ${normalizedPhone}`);
            return res.status(200).json({ ok: true, bookings: userBookings });
        } catch (err) {
            console.error('❌ Phone lookup failed:', err.message);
            return res.status(500).json({ ok: false, error: "Failed to fetch bookings." });
        }
    }

    // Fetch available slots
    console.log('📅 Fetching slots');
    try {
        const cached = getCachedSlots();
        if (cached) return res.status(200).json(cached);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: ENV.SHEET_ID,
            range: `${SHEETS.SLOTS.NAME}!${SHEETS.SLOTS.RANGE}`,
        });

        const rows = response.data.values || [];
        console.log(`📊 Got ${rows.length} slot rows`);
        
        const slots = rows.map((row, idx) => ({
            id: idx + 2,
            date: row[0] || "",
            slotLabel: row[1] || "",
            capacity: parseInt(row[2]) || 0,
            taken: parseInt(row[3]) || 0,
            available: Math.max(0, (parseInt(row[2]) || 0) - (parseInt(row[3]) || 0))
        }));

        const today = new Date(); 
        today.setHours(0, 0, 0, 0);
        const grouped = {};
        
        slots.forEach(slot => {
            const slotDate = new Date(slot.date);
            if (slotDate >= today && slot.capacity > 0 && slot.available > 0) {
                if (!grouped[slot.date]) grouped[slot.date] = [];
                grouped[slot.date].push(slot);
            }
        });

        console.log(`✅ Grouped into ${Object.keys(grouped).length} dates`);
        const result = { ok: true, dates: grouped };
        setCachedSlots(result);
        return res.status(200).json(result);
    } catch (err) {
        console.error('❌ Slots fetch failed:', err.message);
        return res.status(500).json({ ok: false, error: "Slots not available." });
    }
}

// ================================================================================================
// POST: CREATE BOOKING
// ================================================================================================

async function handlePost(req, res) {
    console.log('📝 POST booking');
    
    const errors = validateBookingRequest(req.body);
    if (errors.length) {
        console.log('❌ Validation failed:', errors);
        return res.status(400).json({ ok: false, error: errors.join('; ') });
    }

    const name = sanitizeInput(req.body.name, CONFIG.MAX_NAME_LENGTH);
    const normalizedPhone = normalizePhone(req.body.phone);
    const email = sanitizeInput(req.body.email || '', CONFIG.MAX_EMAIL_LENGTH)?.toLowerCase();
    const category = sanitizeInput(req.body.category, CONFIG.MAX_CATEGORY_LENGTH);
    const notes = sanitizeInput(req.body.notes, CONFIG.MAX_NOTES_LENGTH);
    const slotIds = req.body.slotIds;

    if (!checkConcurrentBookings(normalizedPhone)) {
        return res.status(429).json({ ok: false, error: "Too many concurrent requests." });
    }

    incrementActiveBookings(normalizedPhone);
    
    try {
        const sheets = await getSheets();
        
        const sheetsData = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: ENV.SHEET_ID,
            ranges: slotIds.map(id => `${SHEETS.SLOTS.NAME}!A${id}:D${id}`)
        });

        const signupFetch = await sheets.spreadsheets.values.get({
            spreadsheetId: ENV.SHEET_ID,
            range: `${SHEETS.SIGNUPS.NAME}!${SHEETS.SIGNUPS.RANGE}`,
        });

        const slotRanges = sheetsData.data.valueRanges;
        const existing = signupFetch.data.values || [];
        const nowStr = new Date().toLocaleString("en-US", { timeZone: ENV.TIMEZONE });

        const signupRows = [];
        const updateRequests = [];
        const slotStatusMap = new Map();
        
        for (let i = 0; i < slotIds.length; i++) {
            const slotId = slotIds[i];
            const row = slotRanges[i].values?.[0];
            
            if (!row) {
                slotStatusMap.set(slotId, {
                    slotId,
                    date: 'Unknown',
                    label: 'Unknown',
                    status: 'conflict',
                    reason: 'Slot data missing'
                });
                continue;
            }

            const date = row[0];
            const label = row[1];
            const capacity = parseInt(row[2]) || 0;
            const taken = parseInt(row[3]) || 0;

            // Check duplicate
            const duplicate = existing.find(r =>
                normalizePhone(r[5]) === normalizedPhone &&
                parseInt(r[8]) === slotId &&
                (r[9] || 'ACTIVE').startsWith('ACTIVE')
            );
            
            if (duplicate) {
                slotStatusMap.set(slotId, {
                    slotId,
                    date,
                    label,
                    status: 'conflict',
                    reason: 'Already booked'
                });
                continue;
            }

            // Check capacity
            if (taken >= capacity) {
                slotStatusMap.set(slotId, {
                    slotId,
                    date,
                    label,
                    status: 'conflict',
                    reason: 'Slot full'
                });
                continue;
            }

            // Valid slot
            slotStatusMap.set(slotId, {
                slotId,
                date,
                label,
                status: 'valid',
                reason: null
            });
            
            signupRows.push([nowStr, date, label, name, email, normalizedPhone, category, notes, slotId, 'ACTIVE']);
            updateRequests.push({
                range: `${SHEETS.SLOTS.NAME}!D${slotId}`,
                values: [[taken + 1]]
            });
        }

        const slotStatus = Array.from(slotStatusMap.values());
        const conflicts = slotStatus.filter(s => s.status === 'conflict');

        // Handle conflicts
        if (conflicts.length > 0) {
            console.log(`⚠️ Conflicts found: ${conflicts.length}/${slotIds.length}`);
            decrementActiveBookings(normalizedPhone);
            return res.status(409).json({ 
                ok: false,
                error: `${conflicts.length} of ${slotIds.length} slots unavailable`,
                validSlots: signupRows.length,
                slotStatus
            });
        }

        if (signupRows.length === 0) {
            decrementActiveBookings(normalizedPhone);
            return res.status(400).json({ ok: false, error: "No valid slots available." });
        }

        // Batch update
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: ENV.SHEET_ID,
            requestBody: {
                requests: [
                    {
                        appendCells: {
                            sheetId: ENV.SIGNUPS_GID,
                            rows: signupRows.map(r => ({
                                values: r.map(c => ({ userEnteredValue: { stringValue: String(c) } }))
                            })),
                            fields: 'userEnteredValue'
                        }
                    },
                    ...updateRequests.map(u => ({
                        updateCells: {
                            range: {
                                sheetId: ENV.SLOTS_GID,
                                startRowIndex: parseInt(u.range.match(/\d+/)[0]) - 1,
                                endRowIndex: parseInt(u.range.match(/\d+/)[0]),
                                startColumnIndex: 3,
                                endColumnIndex: 4
                            },
                            rows: [{ values: u.values.map(val => ({ userEnteredValue: { numberValue: parseInt(val[0]) } })) }],
                            fields: 'userEnteredValue'
                        }
                    }))
                ]
            }
        });

        console.log(`✅ Booking successful for ${normalizedPhone}: ${signupRows.length}/${slotIds.length} slots`);
        invalidateCache();
        decrementActiveBookings(normalizedPhone);
        return res.status(200).json({ ok: true, message: `Booked ${signupRows.length} slots successfully!` });
        
    } catch (err) {
        console.error('❌ Booking failed:', err.message);
        decrementActiveBookings(normalizedPhone);
        return res.status(500).json({ ok: false, error: "Booking failed. Please try again." });
    }
}

// ================================================================================================
// PATCH: CANCEL BOOKING
// ================================================================================================

async function handlePatch(req, res) {
    console.log('🗑️ PATCH cancel');
    const { signupRowId, slotRowId, phone } = req.body;
    
    if (!signupRowId || !slotRowId || !phone) {
        return res.status(400).json({ ok: false, error: "Missing signupRowId, slotRowId, or phone." });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!isValidPhone(phone)) {
        return res.status(400).json({ ok: false, error: "Invalid 10-digit phone number." });
    }

    try {
        const sheets = await getSheets();
        
        const signupResp = await sheets.spreadsheets.values.get({
            spreadsheetId: ENV.SHEET_ID,
            range: `${SHEETS.SIGNUPS.NAME}!A${signupRowId}:J${signupRowId}`,
        });
        const row = signupResp.data.values?.[0];
        if (!row) {
            return res.status(404).json({ ok: false, error: "Booking not found." });
        }
        
        // Verify phone match
        if (normalizePhone(row[5]) !== normalizedPhone) {
            return res.status(403).json({ ok: false, error: "Phone mismatch. Cannot cancel." });
        }

        const slotResp = await sheets.spreadsheets.values.get({
            spreadsheetId: ENV.SHEET_ID,
            range: `${SHEETS.SLOTS.NAME}!D${slotRowId}`
        });
        const currentTaken = parseInt(slotResp.data.values?.[0]?.[0] || 0);
        const newTaken = Math.max(0, currentTaken - 1);
        const ts = new Date().toISOString();

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: ENV.SHEET_ID,
            requestBody: {
                requests: [
                    {
                        updateCells: {
                            range: {
                                sheetId: ENV.SIGNUPS_GID,
                                startRowIndex: signupRowId - 1,
                                endRowIndex: signupRowId,
                                startColumnIndex: 9,
                                endColumnIndex: 10
                            },
                            rows: [{ values: [{ userEnteredValue: { stringValue: `CANCELLED:${ts}` } }] }],
                            fields: 'userEnteredValue'
                        }
                    },
                    {
                        updateCells: {
                            range: {
                                sheetId: ENV.SLOTS_GID,
                                startRowIndex: slotRowId - 1,
                                endRowIndex: slotRowId,
                                startColumnIndex: 3,
                                endColumnIndex: 4
                            },
                            rows: [{ values: [{ userEnteredValue: { numberValue: newTaken } }] }],
                            fields: 'userEnteredValue'
                        }
                    }
                ]
            }
        });

        console.log(`✅ Cancellation successful: signupRow ${signupRowId}, slotRow ${slotRowId}`);
        invalidateCache();
        return res.status(200).json({ ok: true, message: "Cancelled successfully." });
        
    } catch (err) {
        console.error('❌ Cancel failed:', err.message);
        return res.status(500).json({ ok: false, error: "Cancellation failed. Please try again." });
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
