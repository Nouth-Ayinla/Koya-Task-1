// Varma Clinic — Interactive Client Application

const configBase = window.CLINIC_CONFIG?.API_BASE_URL || "";

let appState = {
  currentStep: 1,
  apiBase: configBase.replace(/\/$/, ""),
  apiKey: "",
  slots: [],
  selectedDoctor: "",
  selectedSlot: null,
  completedBooking: null,
};

// DOM Elements
const stepItems = document.querySelectorAll(".step-item");
const stepPanes = {
  1: document.getElementById("step1"),
  2: document.getElementById("step2"),
  3: document.getElementById("step3"),
  4: document.getElementById("step4"),
};

const alertBox = document.getElementById("alertBox");
const step2Alert = document.getElementById("step2Alert");
const selectDoctor = document.getElementById("selectDoctor");
const selectTreatment = document.getElementById("selectTreatment");
const selectedDoctorName = document.getElementById("selectedDoctorName");
const slotsList = document.getElementById("slotsList");

const reviewDoctor = document.getElementById("reviewDoctor");
const reviewTime = document.getElementById("reviewTime");
const inputName = document.getElementById("inputName");
const inputEmail = document.getElementById("inputEmail");

const confRef = document.getElementById("confRef");
const confDoctor = document.getElementById("confDoctor");
const confPatient = document.getElementById("confPatient");

const btnCancel = document.getElementById("btnCancel");
const btnNext = document.getElementById("btnNext");

// Drawer & Contact Elements
const drawerOverlay = document.getElementById("drawerOverlay");
const btnMenu = document.getElementById("btnMenu");
const btnCloseDrawer = document.getElementById("btnCloseDrawer");
const drawerEmailInput = document.getElementById("drawerEmailInput");
const btnRunLookup = document.getElementById("btnRunLookup");
const drawerBookingsList = document.getElementById("drawerBookingsList");
const drawerAlert = document.getElementById("drawerAlert");

const contactOverlay = document.getElementById("contactOverlay");
const btnContact = document.getElementById("btnContact");
const btnCloseContact = document.getElementById("btnCloseContact");

// Helpers
function showAlert(message, type = "error") {
  alertBox.className = `alert-box ${type}`;
  alertBox.textContent = message;
  alertBox.classList.remove("hidden");
}

function hideAlert() {
  alertBox.classList.add("hidden");
  alertBox.textContent = "";
  if (step2Alert) {
    step2Alert.classList.add("hidden");
    step2Alert.textContent = "";
  }
}

function showSlotSelectionError() {
  const msg = "Please choose an available appointment slot.";
  if (step2Alert) {
    step2Alert.textContent = msg;
    step2Alert.classList.remove("hidden");
  }
  showAlert(msg);
  if (slotsList) {
    slotsList.classList.add("shake-highlight");
    setTimeout(() => slotsList.classList.remove("shake-highlight"), 600);
  }
}

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return { date: dateStr, time: timeStr, full: `${dateStr} at ${timeStr}` };
  } catch {
    return { date: isoString, time: "", full: isoString };
  }
}

// API Call Wrapper
async function apiCall(endpoint, options = {}) {
  const url = `${appState.apiBase}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": appState.apiKey,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error || `HTTP ${response.status}: Request failed`);
    err.status = response.status;
    err.retryAfter = response.headers.get("Retry-After");
    throw err;
  }
  return data;
}

// Initialize Application
async function initApp() {
  try {
    const res = await fetch(`${appState.apiBase}/api/public-key`);
    if (res.ok) {
      const json = await res.json();
      if (json.apiKey) {
        appState.apiKey = json.apiKey;
      }
    }
  } catch (e) {
    console.warn("Could not retrieve key from API host:", e);
  }

  await loadSlotsData();
}

// Load Slots from API
async function loadSlotsData() {
  try {
    const data = await apiCall("/slots");
    appState.slots = data.slots || [];
    populateDoctorsDropdown();
  } catch (err) {
    showAlert("Could not load clinic slots. Please ensure your API is running.", "error");
  }
}

// Populate Doctor Select
function populateDoctorsDropdown() {
  selectDoctor.innerHTML = "";
  const providers = Array.from(new Set(appState.slots.map((s) => s.provider).filter(Boolean)));

  if (providers.length === 0) {
    selectDoctor.innerHTML = '<option value="">No doctors currently available</option>';
    return;
  }

  providers.forEach((prov, i) => {
    const opt = document.createElement("option");
    opt.value = prov;
    opt.textContent = prov;
    if (i === 0) opt.selected = true;
    selectDoctor.appendChild(opt);
  });
}

// Step Navigation
function goToStep(step) {
  hideAlert();
  appState.currentStep = step;

  // Update Stepper UI
  stepItems.forEach((item) => {
    const s = parseInt(item.getAttribute("data-step"), 10);
    item.classList.remove("active", "completed");
    if (s === step) {
      item.classList.add("active");
    } else if (s < step) {
      item.classList.add("completed");
    }
  });

  // Toggle step panes
  Object.keys(stepPanes).forEach((k) => {
    if (parseInt(k, 10) === step) {
      stepPanes[k].classList.remove("hidden");
    } else {
      stepPanes[k].classList.add("hidden");
    }
  });

  // Action button states
  if (step === 1) {
    btnCancel.textContent = "Cancel";
    btnNext.textContent = "Next";
    btnNext.disabled = false;
  } else if (step === 2) {
    btnCancel.textContent = "Back";
    btnNext.textContent = "Next";
    renderDoctorSlots();
  } else if (step === 3) {
    btnCancel.textContent = "Back";
    btnNext.textContent = "Confirm Booking";
    reviewDoctor.textContent = appState.selectedDoctor;
    const t = formatTime(appState.selectedSlot.start);
    reviewTime.textContent = t.full;
  } else if (step === 4) {
    btnCancel.style.display = "none";
    btnNext.textContent = "Book Another";
    btnNext.disabled = false;
  }
}

// Step 2: Render Slots for Doctor
function renderDoctorSlots() {
  slotsList.innerHTML = "";
  appState.selectedDoctor = selectDoctor.value;
  selectedDoctorName.textContent = appState.selectedDoctor || "Selected Doctor";

  const doctorSlots = appState.slots.filter(
    (s) => !appState.selectedDoctor || s.provider === appState.selectedDoctor
  );

  if (doctorSlots.length === 0) {
    slotsList.innerHTML = `<p style="color: #64748b; font-size: 13px; text-align: center; padding: 20px;">No slots found for this doctor.</p>`;
    return;
  }

  doctorSlots.forEach((slot) => {
    const isPast = new Date(slot.start).getTime() <= Date.now();
    const canBook = slot.available && !isPast;
    const startFmt = formatTime(slot.start);
    const endFmt = formatTime(slot.end);

    const btn = document.createElement("div");
    btn.className = `slot-item-btn ${!canBook ? "disabled" : ""}`;
    if (appState.selectedSlot && appState.selectedSlot.id === slot.id) {
      btn.classList.add("selected");
    }

    btn.innerHTML = `
      <div>
        <div class="slot-item-time">${startFmt.time} – ${endFmt.time}</div>
        <div class="slot-item-date">${startFmt.date}</div>
      </div>
      <div>
        ${
          canBook
            ? `<span class="slot-badge-avail">Available</span>`
            : `<span class="slot-badge-booked">${isPast ? "Expired" : "Booked"}</span>`
        }
      </div>
    `;

    if (canBook) {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".slot-item-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        appState.selectedSlot = slot;
        hideAlert();
      });
    }

    slotsList.appendChild(btn);
  });
}

// Handle Next / Submit
btnNext.addEventListener("click", async () => {
  if (appState.currentStep === 1) {
    appState.selectedDoctor = selectDoctor.value;
    if (!appState.selectedDoctor) {
      showAlert("Please select a doctor to continue.");
      return;
    }
    goToStep(2);
  } else if (appState.currentStep === 2) {
    if (!appState.selectedSlot) {
      showSlotSelectionError();
      return;
    }
    goToStep(3);
  } else if (appState.currentStep === 3) {
    const name = inputName.value.trim();
    const email = inputEmail.value.trim();

    if (!name) {
      showAlert("Please enter your full name.");
      inputName.focus();
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert("Please enter a valid email address.");
      inputEmail.focus();
      return;
    }

    // Submit Booking
    btnNext.disabled = true;
    btnNext.textContent = "Securing Slot...";
    hideAlert();

    const idempKey = "req_" + Math.random().toString(36).substring(2, 12);

    try {
      const booking = await apiCall("/bookings", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempKey,
        },
        body: JSON.stringify({
          slot_id: appState.selectedSlot.id,
          name,
          email,
        }),
      });

      appState.completedBooking = booking;

      // Populate Step 4
      confRef.textContent = booking.id;
      confDoctor.textContent = appState.selectedDoctor;
      confPatient.textContent = `${booking.name} (${booking.email})`;

      loadSlotsData();
      goToStep(4);
    } catch (err) {
      if (err.status === 429 && err.retryAfter) {
        showAlert(`Rate limit reached: Please wait ${err.retryAfter} seconds before retrying.`);
      } else if (err.status === 409) {
        showAlert("This slot was just booked by another patient. Please choose another time.");
        await loadSlotsData();
        goToStep(2);
      } else {
        showAlert(err.message || "Failed to schedule appointment. Please try again.");
      }
    } finally {
      btnNext.disabled = false;
      if (appState.currentStep === 3) {
        btnNext.textContent = "Confirm Booking";
      }
    }
  } else if (appState.currentStep === 4) {
    appState.selectedSlot = null;
    appState.completedBooking = null;
    inputName.value = "";
    inputEmail.value = "";
    btnCancel.style.display = "block";
    goToStep(1);
  }
});

// Handle Cancel / Back
btnCancel.addEventListener("click", () => {
  if (appState.currentStep === 2) {
    goToStep(1);
  } else if (appState.currentStep === 3) {
    goToStep(2);
  } else {
    appState.selectedSlot = null;
    goToStep(1);
  }
});

// Drawer (My Appointments)
function openDrawer() {
  drawerOverlay.classList.remove("hidden");
  drawerEmailInput.focus();
}

function closeDrawer() {
  drawerOverlay.classList.add("hidden");
  drawerAlert.classList.add("hidden");
}

btnMenu.addEventListener("click", openDrawer);
btnCloseDrawer.addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", (e) => {
  if (e.target === drawerOverlay) closeDrawer();
});

btnRunLookup.addEventListener("click", async () => {
  const email = drawerEmailInput.value.trim();
  if (!email) {
    drawerAlert.textContent = "Please enter your email.";
    drawerAlert.className = "alert-box error";
    drawerAlert.classList.remove("hidden");
    return;
  }

  drawerAlert.classList.add("hidden");
  drawerBookingsList.innerHTML = `<p style="font-size: 13px; color: #64748b;">Searching appointments...</p>`;

  try {
    const res = await apiCall(`/bookings?email=${encodeURIComponent(email)}`);
    const bookings = res.bookings || [];

    if (bookings.length === 0) {
      drawerBookingsList.innerHTML = `<p style="font-size: 13px; color: #64748b; text-align: center; padding: 20px;">No appointments found for ${email}.</p>`;
      return;
    }

    drawerBookingsList.innerHTML = "";
    bookings.forEach((b) => {
      const isConfirmed = b.status === "confirmed";
      const card = document.createElement("div");
      card.className = "drawer-booking-card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <div style="font-weight: 800; font-size: 13px; color: #0f172a;">Ref: <span style="font-family: monospace;">${b.id}</span></div>
            <div style="font-size: 12px; color: #64748b;">Slot ID: ${b.slot_id}</div>
          </div>
          <span class="${isConfirmed ? 'status-badge-confirmed' : 'slot-badge-booked'}">${b.status}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
          <span style="font-size: 12px; color: #64748b;">Patient: <strong>${b.name}</strong></span>
          ${
            isConfirmed
              ? `<button class="btn-pill-cancel-sm cancel-booking-btn" data-id="${b.id}">Cancel</button>`
              : `<span style="font-size: 11px; color: #94a3b8;">Slot Released</span>`
          }
        </div>
      `;
      drawerBookingsList.appendChild(card);
    });

    document.querySelectorAll(".cancel-booking-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (confirm("Are you sure you want to cancel this booking?")) {
          try {
            await apiCall(`/bookings/${id}`, { method: "DELETE" });
            btnRunLookup.click();
            await loadSlotsData();
          } catch (e) {
            alert(e.message || "Failed to cancel booking.");
          }
        }
      });
    });
  } catch (err) {
    drawerAlert.textContent = err.message || "Could not retrieve bookings.";
    drawerAlert.className = "alert-box error";
    drawerAlert.classList.remove("hidden");
  }
});

// Contact Modal
btnContact.addEventListener("click", () => {
  contactOverlay.classList.remove("hidden");
});

btnCloseContact.addEventListener("click", () => {
  contactOverlay.classList.add("hidden");
});

contactOverlay.addEventListener("click", (e) => {
  if (e.target === contactOverlay) contactOverlay.classList.add("hidden");
});

// Start App
window.addEventListener("DOMContentLoaded", initApp);
