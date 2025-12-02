// START OF CODE: signup.js

import { 
    API_URL, 
    CONFIG, 
    selectedSlots, 
    API_CACHE, 
    lastApiCall, 
    isSubmitting, 
    updateLastApiCall, 
    updateIsSubmitting 
} from './config.js';
import { 
    sanitizeInput, 
    sanitizeHTML, 
    isValidEmail, 
    isValidPhone, 
    showMessage, 
    getErrorMessage, 
    parseTimeForSorting 
} from './utils.js';
import { 
    updateSummaryDisplay, 
    backToSlotSelection 
} from './slots.js';

// Function to show signup form with selected slots summary
export function showSignupForm() {
    if (selectedSlots.length === 0) {
        alert("Please select at least one time slot.");
        return;
    }

    updateSummaryDisplay();

    document.getElementById("slotsDisplay").style.display = "none";
    document.getElementById("floatingSignupBtnContainer").style.display = "none";
    document.getElementById("signupSection").style.display = "block";
    showMessage("signupMsg", "", false);
}

// UPDATED: Better validation and error handling
async function submitSignup() {
    if (isSubmitting) {
        showMessage("signupMsg", "Please wait, your booking is being processed...", true);
        return;
    }
    
    const now = Date.now();
    if (now - lastApiCall < CONFIG.API_COOLDOWN) {
        showMessage("signupMsg", "Please wait a moment before submitting again.", true);
        return;
    }

    const name = sanitizeInput(document.getElementById("nameInput").value, CONFIG.MAX_NAME_LENGTH);
    const email = sanitizeInput(document.getElementById("emailInput").value.toLowerCase(), CONFIG.MAX_EMAIL_LENGTH);
    const phone = sanitizeInput(document.getElementById("phoneInput").value, CONFIG.MAX_PHONE_LENGTH);
    const notes = sanitizeInput(document.getElementById("notesInput").value, CONFIG.MAX_NOTES_LENGTH);

    // Validation
    if (!name || !email) { 
        showMessage("signupMsg", "Please fill in all required fields (Name and Email).", true);
        return;
    }

    if (!isValidEmail(email)) {
        showMessage("signupMsg", "Please enter a valid email address (e.g., name@example.com).", true);
        return;
    }

    if (phone && !isValidPhone(phone)) {
        showMessage("signupMsg", "Please enter a valid phone number (numbers, spaces, dashes, and parentheses only).", true);
        return;
    }

    if (selectedSlots.length === 0) {
        showMessage("signupMsg", "Error: No slots selected. Please go back and select at least one slot.", true);
        return;
    }

    if (selectedSlots.length > CONFIG.MAX_SLOTS_PER_BOOKING) {
        showMessage("signupMsg", `Error: You can only book up to ${CONFIG.MAX_SLOTS_PER_BOOKING} slots at once.`, true);
        return;
    }

    updateIsSubmitting(true);
    updateLastApiCall(now);
    
    showMessage("signupMsg", "📤 Submitting your booking...", false);
    const submitBtn = document.getElementById("submitSignupBtn");
    const backBtn = document.getElementById("backToSlotsBtn");
    submitBtn.disabled = true;
    backBtn.disabled = true;
    submitBtn.textContent = "Processing...";

    const slotIds = selectedSlots.map(slot => slot.id);

    const signupData = {
        name,
        email,
        phone,
        notes,
        slotIds: slotIds
    };

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
            },
            body: JSON.stringify(signupData)
        });
        
        const data = await res.json();
        
        if (res.ok && data.ok) {
            let confirmationHTML = `Thank you, <strong>${sanitizeHTML(name)}</strong>! Your spot${selectedSlots.length > 1 ? 's have' : ' has'} been reserved for:<br><br>`;
            
            const slotsByDate = {};
            selectedSlots.forEach(slot => {
                const safeDate = sanitizeHTML(slot.date);
                if (!slotsByDate[safeDate]) {
                    slotsByDate[safeDate] = [];
                }
                slotsByDate[safeDate].push(sanitizeHTML(slot.label));
            });
            
            Object.keys(slotsByDate).sort((a, b) => new Date(a) - new Date(b)).forEach(date => {
                const sortedSlots = slotsByDate[date].sort((a, b) => {
                    return parseTimeForSorting(a) - parseTimeForSorting(b);
                });
                
                confirmationHTML += `📅 <strong>${date}</strong><br>`;
                confirmationHTML += `🕰️ ${sortedSlots.join(', ')}<br><br>`;
            });
            
            confirmationHTML += `<p style="color: #64748b; margin-top: 15px;">A confirmation has been sent to <strong>${sanitizeHTML(email)}</strong></p>`;
            
            document.getElementById("signupSection").style.display = "none";
            document.getElementById("confirmationDetails").innerHTML = confirmationHTML;
            document.getElementById("successMessage").style.display = "block";
            
            // Clear form
            document.getElementById("nameInput").value = "";
            document.getElementById("emailInput").value = "";
            document.getElementById("phoneInput").value = "";
            document.getElementById("notesInput").value = "";
            selectedSlots.length = 0; // Clear selectedSlots in place
            
            // Invalidate cache so fresh data loads on next view
            API_CACHE.data = null;
            
        } else {
            // Handle specific error codes
            const errorMessage = getErrorMessage(res.status, data.error || "Booking failed. Please try again.");
            showMessage("signupMsg", sanitizeHTML(errorMessage), true);
            
            // If slot was taken (409), suggest refresh
            if (res.status === 409) {
                API_CACHE.data = null;
                setTimeout(() => {
                    if (confirm("Would you like to refresh and see available slots?")) {
                        backToSlotSelection();
                    }
                }, 2000);
            }
        }
    } catch (err) {
        console.error("Submit signup error:", err);
        showMessage("signupMsg", "Unable to connect to the server. Please check your internet connection and try again.", true);
    } finally {
        updateIsSubmitting(false);
        submitBtn.disabled = false;
        backBtn.disabled = false;
        submitBtn.textContent = "Submit Signup";
    }
}

// Function to attach event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Expose necessary functions to the global scope for inline onclick handlers
    window.submitSignup = submitSignup;
    window.showSignupForm = showSignupForm; 

    const submitBtn = document.getElementById("submitSignupBtn");
    if (submitBtn) {
        submitBtn.addEventListener('click', submitSignup);
    }
});

// END OF CODE: signup.js
