import { auth, db } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    setPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import {
    getStorage,
    ref,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-storage.js";

// =====================================
// SESSION LOGIN
// =====================================
// - Nananatili ang login kapag nire-refresh lang ang page.
// - Kapag isinara ang tab/browser at binuksan ulit, kailangan mag-login.
// Ang SESSION_KEY ay nasa sessionStorage, na nabubura kapag isinara ang tab.

const SESSION_KEY = "ebrgy_staff_session";

const persistenceReady = setPersistence(auth, browserSessionPersistence)
    .catch(function (error) {
        console.error("Persistence error:", error.code);
    });

document.addEventListener("DOMContentLoaded", function () {

    // =====================================
    // 1. STATE
    // =====================================

    let currentStaff = null;

    let residents = [];
    let requests = [];
    let notifications = loadNotifications();

    let unsubscribeRequests = null;
    let unsubscribeResidents = null;


    // =====================================
    // 2. LOCAL NOTIFICATIONS (staff activity log only)
    // =====================================

    function loadNotifications() {
        try {
            const parsed = JSON.parse(localStorage.getItem("ebrgy_notifications"));
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function saveNotifications() {
        localStorage.setItem("ebrgy_notifications", JSON.stringify(notifications));
    }


    // =====================================
    // 3. HTML ELEMENTS
    // =====================================

    const loginWrapper = document.getElementById("loginWrapper");
    const dashboardWrapper = document.getElementById("dashboardWrapper");

    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const errorMsg = document.getElementById("errorMsg");

    const logoutBtn = document.getElementById("logoutBtn");

    const navLinks = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".content-section");

    const requestsTable = document.getElementById("requestsTable");
    const residentsTable = document.getElementById("residentsTable");
    const recentRequestsTable = document.getElementById("recentRequestsTable");

    const requestSearch = document.getElementById("requestSearch");
    const statusFilter = document.getElementById("statusFilter");
    const residentSearch = document.getElementById("residentSearch");

    const detailsModal = document.getElementById("detailsModal");
    const modalBody = document.getElementById("modalBody");
    const modalTitle = document.getElementById("modalTitle");
    const modalActions = document.getElementById("modalActions");


    // =====================================
    // 4. HELPER FUNCTIONS
    // =====================================

    function escapeHTML(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[char];
        });
    }

    function formatDate(date) {
        if (!date) return "-";

        const parts = date.split("-");
        if (parts.length !== 3) return escapeHTML(date);

        return parts[1] + "/" + parts[2] + "/" + parts[0];
    }

    function getResident(id) {
        return residents.find(function (resident) {
            return resident.id === id;
        });
    }

    function getRequestResident(request) {
        if (request.residentName) return request.residentName;

        const resident = getResident(request.residentId);
        return resident ? resident.name : "Unknown resident";
    }

    // "Ready to Pickup" -> "ready-to-pickup" (tugma sa CSS)
    function getStatusClass(status) {
        return status.toLowerCase().replace(/\s+/g, "-");
    }

    function statusBadge(status) {
        return '<span class="badge ' +
            escapeHTML(getStatusClass(status)) + '">' +
            escapeHTML(status) +
            '</span>';
    }

    function showMessage(message) {
        const messageBox = document.getElementById("messageBox");

        messageBox.textContent = message;
        messageBox.classList.remove("hidden");

        setTimeout(function () {
            messageBox.classList.add("hidden");
        }, 3000);
    }

    function addNotification(message) {
        notifications.unshift({
            id: Date.now().toString(),
            message: message,
            date: new Date().toLocaleString(),
            read: false
        });

        saveNotifications();
        renderNotifications();
    }


    // =====================================
    // 5. FIRESTORE DATA MAPPING
    // =====================================
    // Kung iba ang field names sa Firestore ninyo, dito lang ang aayusin.

    function toDateObject(value) {
        if (!value) return null;

        if (typeof value.toDate === "function") return value.toDate();
        if (value instanceof Date) return value;

        if (typeof value === "string" || typeof value === "number") {
            const parsed = new Date(value);
            return isNaN(parsed.getTime()) ? null : parsed;
        }

        return null;
    }

    function toDateString(value) {
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            return value.slice(0, 10);
        }

        const date = toDateObject(value);
        if (!date) return "";

        return date.getFullYear() + "-" +
            String(date.getMonth() + 1).padStart(2, "0") + "-" +
            String(date.getDate()).padStart(2, "0");
    }

    function normalizeStatus(value) {
        if (!value) return "Pending";

        const known = {
            "pending": "Pending",
            "processing": "Processing",
            "ready to pickup": "Ready to Pickup",
            "ready for pickup": "Ready to Pickup",
            "completed": "Completed",
            "rejected": "Rejected",
            "canceled": "Canceled"
        };

        const key = String(value).trim().toLowerCase();
        if (known[key]) return known[key];

        return key.charAt(0).toUpperCase() + key.slice(1);
    }

    // =====================================
    // 5B. UPLOADED REQUIREMENTS (ATTACHMENTS)
    // =====================================
    // Binabasa nito ang mga file na in-upload ng resident sa app.
    // Kung iba ang pangalan ng field sa Firestore ninyo, idagdag lang
    // sa ATTACHMENT_FIELDS sa ibaba.

    const ATTACHMENT_FIELDS = [
        "requirements", "requirement", "attachments", "attachment",
        "files", "uploads", "uploadedFiles", "requirementFiles",
        "requirementUrls", "documents", "images", "photos",
        "fileUrl", "imageUrl", "proofUrl", "validId", "idUrl"
    ];

    const URL_KEYS = [
        "url", "downloadURL", "downloadUrl", "fileUrl",
        "imageUrl", "link", "src", "path", "storagePath"
    ];

    const NAME_KEYS = ["name", "fileName", "filename", "label", "title"];

    // Mga URL lang na ligtas buksan/ipakita
    const SAFE_URL = /^(https?:\/\/|data:image\/|data:application\/pdf)/i;

    function prettyLabel(key) {
        const text = String(key)
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/[_-]+/g, " ")
            .trim();

        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function firstString(obj, keys) {
        for (let i = 0; i < keys.length; i++) {
            if (typeof obj[keys[i]] === "string" && obj[keys[i]]) {
                return obj[keys[i]];
            }
        }
        return "";
    }

    // URL, data URI, gs:// o storage path lang ang tatanggapin
    function looksLikeFile(text) {
        return /^(https?:|data:|gs:)/i.test(text) ||
            /^[^\s]+\/.+\.[A-Za-z0-9]{2,5}$/.test(text);
    }

    function collectAttachments(value, label, list) {

        if (!value) return;

        if (Array.isArray(value)) {
            value.forEach(function (item, index) {
                const itemLabel = value.length > 1
                    ? label + " " + (index + 1)
                    : label;
                collectAttachments(item, itemLabel, list);
            });
            return;
        }

        if (typeof value === "string") {
            if (looksLikeFile(value)) {
                list.push({ url: value, name: label, type: "" });
            }
            return;
        }

        if (typeof value !== "object" || typeof value.toDate === "function") {
            return;
        }

        const url = firstString(value, URL_KEYS);

        if (url) {
            if (looksLikeFile(url)) {
                list.push({
                    url: url,
                    name: firstString(value, NAME_KEYS) || label,
                    type: firstString(value, ["contentType", "mimeType", "type"])
                });
            }
            return;
        }

        // Map ng mga file (hal. { validId: "...", cedula: "..." })
        Object.keys(value).forEach(function (key) {
            collectAttachments(value[key], prettyLabel(key), list);
        });
    }

    function extractAttachments(data) {
        const list = [];

        ATTACHMENT_FIELDS.forEach(function (field) {
            if (data[field]) {
                collectAttachments(data[field], prettyLabel(field), list);
            }
        });

        // Alisin ang doble
        const seen = new Set();

        return list.filter(function (item) {
            if (seen.has(item.url)) return false;
            seen.add(item.url);
            return true;
        });
    }

    function isImageAttachment(item) {
        const cleanUrl = item.url.split("?")[0].split("#")[0];

        return /^data:image\//i.test(item.url) ||
            /^image\//i.test(item.type || "") ||
            /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(cleanUrl) ||
            /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(item.name || "");
    }

    // Kung storage path ang nakasave (hindi buong link), kunin ang download link
    async function resolveAttachmentUrl(url) {

        if (/^(https?:|data:)/i.test(url)) return url;

        try {
            return await getDownloadURL(ref(getStorage(), url));
        } catch (error) {
            console.error("Attachment error:", error.code || error.message, url);
            return "";
        }
    }

    function buildFileLink(item) {
        const link = document.createElement("a");

        link.className = "attachment-file";
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open file";

        if (/^data:/i.test(item.url)) {
            link.download = item.name || "requirement";
        }

        return link;
    }

    function buildAttachmentItem(item) {

        const wrapper = document.createElement("div");
        wrapper.className = "attachment-item";

        const caption = document.createElement("span");
        caption.className = "attachment-name";
        caption.textContent = item.name || "Requirement";

        if (!item.url || !SAFE_URL.test(item.url)) {
            const missing = document.createElement("div");
            missing.className = "attachment-file missing";
            missing.textContent = "File unavailable";

            wrapper.appendChild(missing);
            wrapper.appendChild(caption);
            return wrapper;
        }

        if (isImageAttachment(item)) {
            const img = document.createElement("img");

            img.className = "attachment-thumb";
            img.src = item.url;
            img.alt = item.name || "Requirement";
            img.loading = "lazy";

            img.addEventListener("click", function () {
                openLightbox(item.url, item.name);
            });

            // Kung hindi ma-load bilang image, gawing link
            img.addEventListener("error", function () {
                img.replaceWith(buildFileLink(item));
            });

            wrapper.appendChild(img);
        } else {
            wrapper.appendChild(buildFileLink(item));
        }

        wrapper.appendChild(caption);
        return wrapper;
    }

    let viewedRequestId = null;

    async function loadAttachments(request) {

        const box = document.getElementById("attachmentList");
        if (!box) return;

        viewedRequestId = request.id;

        if (request.attachments.length === 0) {
            box.textContent = "No uploaded requirements.";
            return;
        }

        box.textContent = "Loading requirements...";

        const resolved = await Promise.all(
            request.attachments.map(async function (item) {
                return Object.assign({}, item, {
                    url: await resolveAttachmentUrl(item.url)
                });
            })
        );

        // Kung ibang request na ang nakabukas, huwag nang ituloy
        if (viewedRequestId !== request.id || !document.body.contains(box)) {
            return;
        }

        box.innerHTML = "";

        resolved.forEach(function (item) {
            box.appendChild(buildAttachmentItem(item));
        });
    }

    // Malaking preview ng image
    function openLightbox(url, name) {

        closeLightbox();

        const overlay = document.createElement("div");
        overlay.id = "lightbox";
        overlay.className = "lightbox";

        const img = document.createElement("img");
        img.src = url;
        img.alt = name || "Requirement";

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "lightbox-close";
        closeButton.setAttribute("aria-label", "Close");
        closeButton.innerHTML = "&times;";

        overlay.appendChild(img);
        overlay.appendChild(closeButton);

        overlay.addEventListener("click", closeLightbox);

        document.body.appendChild(overlay);
    }

    function closeLightbox() {
        const overlay = document.getElementById("lightbox");
        if (overlay) overlay.remove();
    }

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeLightbox();
    });


    function mapRequest(snapshot) {
        const data = snapshot.data();

        const created =
            data.createdAt ||
            data.requestDate ||
            data.dateRequested ||
            data.timestamp ||
            null;

        const createdDate = toDateObject(created);

        return {
            id: snapshot.id,
            residentId: data.uid || "",
            residentName: data.residentName || data.fullName || data.name || "",
            document: data.documentType || data.document || "-",
            date: toDateString(created),
            createdMs: createdDate ? createdDate.getTime() : 0,
            purpose: data.purpose || "-",
            status: normalizeStatus(data.status),
            remarks: data.remarks || "",
            rejectionReason: data.rejectionReason || "",
            attachments: extractAttachments(data)
        };
    }

    function mapResident(snapshot) {
        const data = snapshot.data();

        const fullName =
            data.fullName ||
            data.name ||
            [data.firstName, data.middleName, data.lastName]
                .filter(Boolean)
                .join(" ");

        return {
            id: snapshot.id,
            name: fullName || "(No name)",
            address: data.address || "-",
            contact: data.contact || data.contactNumber || data.phone || data.mobile || "-"
        };
    }


    // =====================================
    // 6. LIVE DATA FROM FIRESTORE
    // =====================================

    function refreshAll() {
        renderRequests();
        renderResidents();
        refreshDashboard();
    }

    function startListeners() {
        stopListeners();

        unsubscribeRequests = onSnapshot(
            collection(db, "requests"),
            function (snapshot) {
                requests = snapshot.docs.map(mapRequest);
                refreshAll();
            },
            function (error) {
                console.error("Requests error:", error.code, error.message);
                showMessage("Hindi ma-load ang requests: " + error.code);
            }
        );

        unsubscribeResidents = onSnapshot(
            collection(db, "users"),
            function (snapshot) {
                residents = snapshot.docs
                    .map(mapResident)
                    .sort(function (a, b) {
                        return a.name.localeCompare(b.name);
                    });
                refreshAll();
            },
            function (error) {
                console.error("Residents error:", error.code, error.message);
                showMessage("Hindi ma-load ang residents: " + error.code);
            }
        );
    }

    function stopListeners() {
        if (unsubscribeRequests) unsubscribeRequests();
        if (unsubscribeResidents) unsubscribeResidents();

        unsubscribeRequests = null;
        unsubscribeResidents = null;
    }


    // =====================================
    // 7. LOGIN (FIREBASE AUTH)
    // =====================================

    function showLogin() {
        stopListeners();

        sessionStorage.removeItem(SESSION_KEY);

        currentStaff = null;
        requests = [];
        residents = [];

        dashboardWrapper.style.display = "none";
        loginWrapper.style.display = "flex";

        detailsModal.classList.add("hidden");
    }

    function showDashboard(user, staffData) {
        currentStaff = {
            uid: user.uid,
            username: user.email,
            name: staffData.name || staffData.admin || user.email,
            position: staffData.position || "Barangay Staff"
        };

        loginWrapper.style.display = "none";
        dashboardWrapper.style.display = "flex";

        errorMsg.textContent = "";

        document.getElementById("loggedInStaff").textContent = currentStaff.name;
        document.getElementById("profileName").textContent = currentStaff.name;
        document.getElementById("profileUsername").textContent = currentStaff.username;
        document.getElementById("profilePosition").textContent = currentStaff.position;

        document.getElementById("currentDate").textContent =
            new Date().toLocaleDateString("en-PH", {
                year: "numeric",
                month: "long",
                day: "numeric"
            });

        startListeners();
        refreshDashboard();
    }

    // Ang pagpasok sa dashboard ay laging dumadaan dito,
    // kaya pati pag-refresh ng page ay naka-login pa rin.
    onAuthStateChanged(auth, async function (user) {

        if (!user) {
            showLogin();
            return;
        }

        // Unang bukas (walang session flag): kahit may natirang login
        // mula sa nakaraan, i-sign out at pabalikin sa login page.
        if (!sessionStorage.getItem(SESSION_KEY)) {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Sign out error:", error.code);
            }
            showLogin();
            return;
        }

        try {
            // Staff lang ang may document sa "staff" collection
            const staffSnap = await getDoc(doc(db, "staff", user.uid));

            if (!staffSnap.exists()) {
                errorMsg.textContent =
                    "This account is not authorized for the staff portal.";
                await signOut(auth);
                return;
            }

            showDashboard(user, staffSnap.data());

        } catch (error) {
            console.error("Staff check error:", error.code, error.message);
            errorMsg.textContent = "Unable to verify staff access.";
            await signOut(auth);
        }
    });

    loginForm.addEventListener("submit", async function (e) {

        e.preventDefault();

        let email = usernameInput.value.trim();
        const password = passwordInput.value;

        // Kung username lang ang tinype (walang @), dagdagan ng domain
        if (email && email.indexOf("@") === -1) {
            email = email + "@brgy.local";
        }

        errorMsg.textContent = "";

        const submitButton = loginForm.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = true;

        try {
            await persistenceReady;

            // Itatakda bago mag-login para pasado ito sa check ng onAuthStateChanged
            sessionStorage.setItem(SESSION_KEY, "1");

            await signInWithEmailAndPassword(auth, email, password);
            // Ang susunod na hakbang ay ginagawa ng onAuthStateChanged

        } catch (error) {
            sessionStorage.removeItem(SESSION_KEY);

            console.error("Login error:", error.code);

            if (error.code === "auth/too-many-requests") {
                errorMsg.textContent = "Too many attempts. Please try again later.";
            } else if (error.code === "auth/network-request-failed") {
                errorMsg.textContent = "Network error. Check your connection.";
            } else {
                errorMsg.textContent = "Invalid username or password.";
            }

            passwordInput.value = "";

        } finally {
            if (submitButton) submitButton.disabled = false;
        }

    });


    // =====================================
    // 8. NAVIGATION
    // =====================================

    function switchSection(sectionName) {

        sections.forEach(function (section) {
            section.classList.add("hidden");
        });

        const selectedSection = document.getElementById(
            "section-" + sectionName
        );

        if (selectedSection) {
            selectedSection.classList.remove("hidden");
        }

        navLinks.forEach(function (link) {
            link.classList.remove("active");

            if (link.dataset.section === sectionName) {
                link.classList.add("active");
            }
        });

        if (sectionName === "dashboard") {
            refreshDashboard();
        }

        if (sectionName === "requests") {
            renderRequests();
        }

        if (sectionName === "residents") {
            renderResidents();
        }

        if (sectionName === "notifications") {
            renderNotifications();
        }
    }

    navLinks.forEach(function (link) {

        link.addEventListener("click", function () {
            switchSection(link.dataset.section);
        });

    });

    document.querySelectorAll("[data-go]").forEach(function (button) {

        button.addEventListener("click", function () {
            switchSection(button.dataset.go);
        });

    });


    // =====================================
    // 9. DASHBOARD STATISTICS
    // =====================================

    function refreshDashboard() {

        const total = requests.length;

        const pending = requests.filter(function (request) {
            return request.status === "Pending";
        }).length;

        const processing = requests.filter(function (request) {
            return request.status === "Processing";
        }).length;

        const completed = requests.filter(function (request) {
            return request.status === "Completed";
        }).length;

        document.getElementById("totalRequests").textContent = total;

        document.getElementById("pendingRequests").textContent = pending;

        document.getElementById("processingRequests").textContent = processing;

        document.getElementById("completedRequests").textContent = completed;

        const pendingNavCount = document.getElementById("pendingNavCount");
        pendingNavCount.textContent = pending;
        pendingNavCount.classList.toggle("hidden", pending === 0);

        updateNotificationCount();

        renderRecentRequests();
        renderActivities();
    }


    // =====================================
    // 10. RECENT REQUESTS
    // =====================================

    function renderRecentRequests() {

        const recent = requests.slice().sort(function (a, b) {
            return b.createdMs - a.createdMs;
        }).slice(0, 5);

        if (recent.length === 0) {
            recentRequestsTable.innerHTML =
                '<tr><td colspan="5" class="empty-row">No requests found.</td></tr>';
            return;
        }

        recentRequestsTable.innerHTML = recent.map(function (request) {

            return `
                <tr>
                    <td>${escapeHTML(request.id)}</td>
                    <td>${escapeHTML(getRequestResident(request))}</td>
                    <td>${escapeHTML(request.document)}</td>
                    <td>${formatDate(request.date)}</td>
                    <td>${statusBadge(request.status)}</td>
                </tr>
            `;

        }).join("");
    }


    // =====================================
    // 11. DOCUMENT REQUEST MANAGEMENT
    // =====================================

    function renderRequests() {

        const search = requestSearch.value.toLowerCase();
        const filter = statusFilter.value;

        const filtered = requests.filter(function (request) {

            const matchesSearch =
                request.id.toLowerCase().includes(search) ||
                getRequestResident(request).toLowerCase().includes(search) ||
                request.document.toLowerCase().includes(search);

            const matchesStatus =
                filter === "All" || request.status === filter;

            return matchesSearch && matchesStatus;

        }).sort(function (a, b) {
            return b.createdMs - a.createdMs;
        });

        if (filtered.length === 0) {

            requestsTable.innerHTML =
                '<tr><td colspan="6" class="empty-row">No matching requests found.</td></tr>';

            return;
        }

        requestsTable.innerHTML = filtered.map(function (request) {

            return `
                <tr>
                    <td>${escapeHTML(request.id)}</td>
                    <td>${escapeHTML(getRequestResident(request))}</td>
                    <td>${escapeHTML(request.document)}</td>
                    <td>${formatDate(request.date)}</td>
                    <td>${statusBadge(request.status)}</td>
                    <td>
                        <button class="action-btn primary"
                            data-request-action="view"
                            data-id="${escapeHTML(request.id)}">
                            View
                        </button>
                    </td>
                </tr>
            `;

        }).join("");
    }

    requestSearch.addEventListener("input", renderRequests);
    statusFilter.addEventListener("change", renderRequests);


    // =====================================
    // 12. VIEW REQUEST DETAILS
    // =====================================

    function viewRequest(id) {

        const request = requests.find(function (item) {
            return item.id === id;
        });

        if (!request) return;

        modalTitle.textContent = "Document Request Details";

        // Ipakita ang reason kung Rejected na ang request
        const rejectionRow = (request.status === "Rejected" && request.rejectionReason)
            ? `
            <div class="detail-row">
                <strong>Rejection Reason</strong>
                <span>${escapeHTML(request.rejectionReason)}</span>
            </div>`
            : "";

        modalBody.innerHTML = `
            <div class="detail-row">
                <strong>Request ID</strong>
                <span>${escapeHTML(request.id)}</span>
            </div>

            <div class="detail-row">
                <strong>Resident</strong>
                <span>${escapeHTML(getRequestResident(request))}</span>
            </div>

            <div class="detail-row">
                <strong>Document</strong>
                <span>${escapeHTML(request.document)}</span>
            </div>

            <div class="detail-row">
                <strong>Date Submitted</strong>
                <span>${formatDate(request.date)}</span>
            </div>

            <div class="detail-row">
                <strong>Purpose</strong>
                <span>${escapeHTML(request.purpose)}</span>
            </div>

            <div class="detail-row">
                <strong>Status</strong>
                <span>${statusBadge(request.status)}</span>
            </div>

            <div class="detail-row">
                <strong>Remarks</strong>
                <span>${escapeHTML(request.remarks || "None")}</span>
            </div>

            ${rejectionRow}

            <div class="attachments-section">
                <strong>Submitted Requirements</strong>
                <div id="attachmentList" class="attachment-list">Loading...</div>
            </div>
        `;

        showModalActions(request);

        detailsModal.classList.remove("hidden");

        loadAttachments(request);
    }

    // Mga button ng modal (Approve / Reject / Ready / Complete)
    function showModalActions(request) {

        modalActions.innerHTML = "";

        // Alisin ang reject form kung may natira
        const oldForm = document.getElementById("rejectForm");
        if (oldForm) oldForm.remove();

        if (request.status === "Pending") {

            addModalButton("Approve Request", "primary", function () {
                updateRequestStatus(request.id, "Processing");
            });

            addModalButton("Reject Request", "danger", function () {
                showRejectForm(request);
            });

        } else if (request.status === "Processing") {

            addModalButton("Ready to Pickup", "primary", function () {
                updateRequestStatus(request.id, "Ready to Pickup");
            });

        } else if (request.status === "Ready to Pickup") {

            addModalButton("Mark as Completed", "primary", function () {
                updateRequestStatus(request.id, "Completed");
            });

        }
    }

    function addModalButton(label, style, onClick) {

        const button = document.createElement("button");

        button.className = "action-btn " + style;
        button.textContent = label;
        button.addEventListener("click", onClick);

        modalActions.appendChild(button);
    }

    // Form para sa reason ng pag-reject
    function showRejectForm(request) {

        modalActions.innerHTML = "";

        const oldForm = document.getElementById("rejectForm");
        if (oldForm) oldForm.remove();

        const form = document.createElement("div");
        form.id = "rejectForm";
        form.className = "reject-form";

        form.innerHTML = `
            <label for="rejectReason">Reason for rejection <span class="required">*</span></label>
            <textarea id="rejectReason" rows="3" maxlength="300"
                placeholder="Halimbawa: Kulang ang requirements, hindi tugma ang impormasyon..."></textarea>
            <small id="rejectReasonError" class="error-msg"></small>
        `;

        modalBody.appendChild(form);

        const reasonInput = document.getElementById("rejectReason");
        const reasonError = document.getElementById("rejectReasonError");
        reasonInput.focus();

        addModalButton("Confirm Reject", "danger", function () {

            const reason = reasonInput.value.trim();

            if (!reason) {
                reasonError.textContent = "Please enter a reason for rejecting this request.";
                reasonInput.focus();
                return;
            }

            updateRequestStatus(request.id, "Rejected", reason);
        });

        addModalButton("Back", "secondary", function () {
            form.remove();
            showModalActions(request);
        });
    }


    // =====================================
    // 13. UPDATE REQUEST STATUS (FIRESTORE)
    // =====================================

    async function updateRequestStatus(id, newStatus, reason) {

        const request = requests.find(function (item) {
            return item.id === id;
        });

        if (!request || !currentStaff) return;

        const confirmation = confirm(
            "Are you sure you want to change this request to " +
            newStatus + "?"
        );

        if (!confirmation) return;

        const oldStatus = request.status;

        const updates = {
            status: newStatus,
            remarks: "Status updated by " + currentStaff.name
        };

        if (newStatus === "Rejected") {
            updates.rejectionReason = reason || "";
            updates.remarks = "Rejected: " + (reason || "No reason provided");
            updates.rejectedBy = currentStaff.name;
        }

        try {
            await updateDoc(doc(db, "requests", id), updates);

        } catch (error) {
            console.error("Update error:", error.code, error.message);
            showMessage("Failed to update request: " + error.code);
            return;
        }

        addNotification(
            request.id + " (" + request.document + ") changed from " +
            oldStatus + " to " + newStatus + "." +
            (newStatus === "Rejected" && reason ? " Reason: " + reason : "")
        );

        detailsModal.classList.add("hidden");

        showMessage("Request status successfully updated.");
    }


    // =====================================
    // 14. RESIDENT MANAGEMENT
    // =====================================

    function renderResidents() {

        const search = residentSearch.value.toLowerCase();

        const filtered = residents.filter(function (resident) {

            return (
                resident.name.toLowerCase().includes(search) ||
                resident.id.toLowerCase().includes(search) ||
                resident.address.toLowerCase().includes(search)
            );

        });

        if (filtered.length === 0) {

            residentsTable.innerHTML =
                '<tr><td colspan="5" class="empty-row">No residents found.</td></tr>';

            return;
        }

        residentsTable.innerHTML = filtered.map(function (resident) {

            return `
                <tr>
                    <td>${escapeHTML(resident.id)}</td>
                    <td>${escapeHTML(resident.name)}</td>
                    <td>${escapeHTML(resident.address)}</td>
                    <td>${escapeHTML(resident.contact)}</td>
                    <td>
                        <button class="action-btn primary"
                            data-resident-action="view"
                            data-id="${escapeHTML(resident.id)}">
                            View
                        </button>
                    </td>
                </tr>
            `;

        }).join("");
    }

    residentSearch.addEventListener("input", renderResidents);


    // =====================================
    // 15. RESIDENT DETAILS
    // =====================================

    function viewResident(id) {

        const resident = getResident(id);

        if (!resident) return;

        const residentRequests = requests.filter(function (request) {
            return request.residentId === resident.id;
        });

        modalTitle.textContent = "Resident Information";

        modalBody.innerHTML = `
            <div class="detail-row">
                <strong>Resident ID</strong>
                <span>${escapeHTML(resident.id)}</span>
            </div>

            <div class="detail-row">
                <strong>Full Name</strong>
                <span>${escapeHTML(resident.name)}</span>
            </div>

            <div class="detail-row">
                <strong>Address</strong>
                <span>${escapeHTML(resident.address)}</span>
            </div>

            <div class="detail-row">
                <strong>Contact Number</strong>
                <span>${escapeHTML(resident.contact)}</span>
            </div>

            <div class="detail-row">
                <strong>Total Requests</strong>
                <span>${residentRequests.length}</span>
            </div>

            <div class="detail-row">
                <strong>Active Resident</strong>
                <span>Registered</span>
            </div>
        `;

        modalActions.innerHTML = "";

        detailsModal.classList.remove("hidden");
    }


    // =====================================
    // 16. NOTIFICATIONS
    // =====================================

    function updateNotificationCount() {
        const notificationCount =
            document.getElementById("notificationNavCount");
        const unreadCount = notifications.filter(function (item) {
            return !item.read;
        }).length;

        notificationCount.textContent = unreadCount;
        notificationCount.classList.toggle("hidden", unreadCount === 0);
    }

    function renderNotifications() {

        const notificationList =
            document.getElementById("notificationList");

        updateNotificationCount();

        if (notifications.length === 0) {

            notificationList.innerHTML =
                '<div class="empty-row">No notifications available.</div>';

            return;
        }

        notificationList.innerHTML = notifications.map(function (item) {

            return `
                <div class="notification-item ${item.read ? "read" : "unread"}">
                    <p>${escapeHTML(item.message)}</p>
                    <small>${escapeHTML(item.date)}</small>
                </div>
            `;

        }).join("");
    }

    document.getElementById("markAllReadBtn").addEventListener(
        "click",
        function () {

            notifications.forEach(function (item) {
                item.read = true;
            });

            saveNotifications();
            renderNotifications();
            refreshDashboard();

            showMessage("All notifications marked as read.");
        }
    );


    // =====================================
    // 17. RECENT ACTIVITIES
    // =====================================

    function renderActivities() {

        const container =
            document.getElementById("recentActivities");

        const recent = notifications.slice(0, 5);

        if (recent.length === 0) {

            container.innerHTML =
                '<div class="activity-item">No recent activities.</div>';

            return;
        }

        container.innerHTML = recent.map(function (item) {

            return `
                <div class="activity-item">
                    <p>${escapeHTML(item.message)}</p>
                    <small>${escapeHTML(item.date)}</small>
                </div>
            `;

        }).join("");
    }


    // =====================================
    // 18. MODAL CONTROLS
    // =====================================

    document.getElementById("closeModal").addEventListener(
        "click",
        function () {
            detailsModal.classList.add("hidden");
        }
    );

    detailsModal.addEventListener("click", function (e) {

        if (e.target === detailsModal) {
            detailsModal.classList.add("hidden");
        }

    });


    // =====================================
    // 19. TABLE ACTION EVENTS
    // =====================================

    requestsTable.addEventListener("click", function (e) {

        const button = e.target.closest("[data-request-action]");

        if (!button) return;

        if (button.dataset.requestAction === "view") {
            viewRequest(button.dataset.id);
        }

    });

    residentsTable.addEventListener("click", function (e) {

        const button = e.target.closest("[data-resident-action]");

        if (!button) return;

        if (button.dataset.residentAction === "view") {
            viewResident(button.dataset.id);
        }

    });


    // =====================================
    // 20. LOGOUT
    // =====================================

    logoutBtn.addEventListener("click", async function () {

        const confirmation = confirm(
            "Are you sure you want to log out?"
        );

        if (!confirmation) return;

        sessionStorage.removeItem(SESSION_KEY);

        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout error:", error.code);
        }

        loginForm.reset();

        errorMsg.textContent = "";

        showMessage("You have logged out.");

    });

});

function showToast(message, type) {
    type = type || "success";

    let container = document.querySelector(".toast-container");

    if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "toast " + type;

    let icon = "✓";

    if (type === "error") {
        icon = "✕";
    } else if (type === "warning") {
        icon = "!";
    }

    const iconElement = document.createElement("span");
    iconElement.className = "toast-icon";
    iconElement.textContent = icon;

    const messageElement = document.createElement("span");
    messageElement.className = "toast-message";
    messageElement.textContent = message;

    toast.appendChild(iconElement);
    toast.appendChild(messageElement);
    container.appendChild(toast);

    setTimeout(function () {
        toast.style.animation = "slideOut 0.3s ease forwards";

        setTimeout(function () {
            toast.remove();

            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 3000);
}

// Kailangan ito dahil module na ang file na ito (hindi na global ang function)
window.showToast = showToast;