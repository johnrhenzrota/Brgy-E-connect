
document.addEventListener("DOMContentLoaded", function () {

    // =====================================
    // 1. STAFF ACCOUNT (DEMO ONLY)
    // =====================================

    const demoStaff = {
        username: "admin",
        password: "admin123",
        name: "Barangay Staff Admin",
        position: "Barangay Administrator"
    };

    let currentStaff = null;


    // =====================================
    // 2. SAMPLE DATABASE
    // =====================================

    const defaultResidents = [
        {
            id: "RES-001",
            name: "Juan Dela Cruz",
            address: "Purok 1",
            contact: "09123456789"
        },
        {
            id: "RES-002",
            name: "Maria Santos",
            address: "Purok 3",
            contact: "09234567890"
        },
        {
            id: "RES-003",
            name: "Ana Reyes",
            address: "Purok 2",
            contact: "09345678901"
        },
        {
            id: "RES-004",
            name: "Pedro Garcia",
            address: "Purok 4",
            contact: "09456789012"
        }
    ];

    const defaultRequests = [
        {
            id: "REQ-2026-001",
            residentId: "RES-001",
            resident: "Juan Dela Cruz",
            document: "Barangay Clearance",
            date: "2026-11-10",
            purpose: "Employment",
            status: "Pending",
            remarks: ""
        },
        {
            id: "REQ-2026-002",
            residentId: "RES-002",
            resident: "Maria Santos",
            document: "Certificate of Residency",
            date: "2026-11-10",
            purpose: "School Requirement",
            status: "Processing",
            remarks: ""
        },
        {
            id: "REQ-2026-003",
            residentId: "RES-003",
            resident: "Ana Reyes",
            document: "Certificate of Indigency",
            date: "2026-11-11",
            purpose: "Financial Assistance",
            status: "Completed",
            remarks: ""
        },
        {
            id: "REQ-2026-004",
            residentId: "RES-004",
            resident: "Pedro Garcia",
            document: "Barangay ID",
            date: "2026-11-11",
            purpose: "Identification",
            status: "Canceled",
            remarks: ""
        }
    ];


    // =====================================
    // 3. LOCAL STORAGE
    // =====================================

    function loadData(key, defaultData) {
        const savedData = localStorage.getItem(key);

        if (savedData === null) {
            localStorage.setItem(key, JSON.stringify(defaultData));
            return defaultData;
        }

        try {
            const parsed = JSON.parse(savedData);
            return Array.isArray(parsed) ? parsed : defaultData;
        } catch (error) {
            return defaultData;
        }
    }

    let residents = loadData("ebrgy_residents", defaultResidents);
    let requests = loadData("ebrgy_requests", defaultRequests);
    let notifications = loadData("ebrgy_notifications", []);

    function saveData() {
        localStorage.setItem("ebrgy_residents", JSON.stringify(residents));
        localStorage.setItem("ebrgy_requests", JSON.stringify(requests));
        localStorage.setItem("ebrgy_notifications", JSON.stringify(notifications));
    }


    // =====================================
    // 4. HTML ELEMENTS
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
    // 5. HELPER FUNCTIONS
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

    function getStatusClass(status) {
        return status.toLowerCase();
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

        saveData();
        renderNotifications();
    }


    // =====================================
    // 6. LOGIN
    // =====================================

    loginForm.addEventListener("submit", function (e) {

        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (
            username === demoStaff.username &&
            password === demoStaff.password
        ) {

            currentStaff = demoStaff;

            loginWrapper.style.display = "none";
            dashboardWrapper.style.display = "flex";

            errorMsg.textContent = "";

            document.getElementById("loggedInStaff").textContent =
                currentStaff.name;

            document.getElementById("profileName").textContent =
                currentStaff.name;

            document.getElementById("profileUsername").textContent =
                currentStaff.username;

            document.getElementById("profilePosition").textContent =
                currentStaff.position;

            document.getElementById("currentDate").textContent =
                new Date().toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                });

            refreshDashboard();

        } else {

            errorMsg.textContent = "Invalid username or password.";

            passwordInput.value = "";

        }

    });


    // =====================================
    // 7. NAVIGATION
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
    // 8. DASHBOARD STATISTICS
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

        document.getElementById("pendingNavCount").textContent = pending;

        document.getElementById("notificationNavCount").textContent =
            notifications.filter(function (item) {
                return !item.read;
            }).length;

        renderRecentRequests();
        renderActivities();
    }


    // =====================================
    // 9. RECENT REQUESTS
    // =====================================

    function renderRecentRequests() {

        const recent = requests.slice().sort(function (a, b) {
            return b.id.localeCompare(a.id);
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
                    <td>${escapeHTML(request.resident)}</td>
                    <td>${escapeHTML(request.document)}</td>
                    <td>${formatDate(request.date)}</td>
                    <td>${statusBadge(request.status)}</td>
                </tr>
            `;

        }).join("");
    }


    // =====================================
    // 10. DOCUMENT REQUEST MANAGEMENT
    // =====================================

    function renderRequests() {

        const search = requestSearch.value.toLowerCase();
        const filter = statusFilter.value;

        const filtered = requests.filter(function (request) {

            const matchesSearch =
                request.id.toLowerCase().includes(search) ||
                request.resident.toLowerCase().includes(search) ||
                request.document.toLowerCase().includes(search);

            const matchesStatus =
                filter === "All" || request.status === filter;

            return matchesSearch && matchesStatus;

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
                    <td>${escapeHTML(request.resident)}</td>
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
    // 11. VIEW REQUEST DETAILS
    // =====================================

    function viewRequest(id) {

        const request = requests.find(function (item) {
            return item.id === id;
        });

        if (!request) return;

        modalTitle.textContent = "Document Request Details";

        modalBody.innerHTML = `
            <div class="detail-row">
                <strong>Request ID</strong>
                <span>${escapeHTML(request.id)}</span>
            </div>

            <div class="detail-row">
                <strong>Resident</strong>
                <span>${escapeHTML(request.resident)}</span>
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
        `;

        modalActions.innerHTML = "";

        if (request.status === "Pending") {

            addModalButton("Approve Request", "Processing", "primary");

            addModalButton("Reject Request", "Rejected", "danger");

        } else if (request.status === "Processing") {

            addModalButton("Mark as Completed", "Completed", "primary");

        }

        detailsModal.classList.remove("hidden");

        function addModalButton(label, status, style) {

            const button = document.createElement("button");

            button.className = "action-btn " + style;
            button.textContent = label;

            button.addEventListener("click", function () {
                updateRequestStatus(request.id, status);
            });

            modalActions.appendChild(button);
        }
    }


    // =====================================
    // 12. UPDATE REQUEST STATUS
    // =====================================

    function updateRequestStatus(id, newStatus) {

        const request = requests.find(function (item) {
            return item.id === id;
        });

        if (!request) return;

        const confirmation = confirm(
            "Are you sure you want to change this request to " +
            newStatus + "?"
        );

        if (!confirmation) return;

        const oldStatus = request.status;

        request.status = newStatus;

        request.remarks =
            "Status updated by " + currentStaff.name;

        saveData();

        addNotification(
            request.id + " (" + request.document + ") changed from " +
            oldStatus + " to " + newStatus + "."
        );

        detailsModal.classList.add("hidden");

        renderRequests();
        refreshDashboard();

        showMessage("Request status successfully updated.");
    }


    // =====================================
    // 13. RESIDENT MANAGEMENT
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
    // 14. RESIDENT DETAILS
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
    // 15. NOTIFICATIONS
    // =====================================

    function renderNotifications() {

        const notificationList =
            document.getElementById("notificationList");

        document.getElementById("notificationNavCount").textContent =
            notifications.filter(function (item) {
                return !item.read;
            }).length;

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

            saveData();
            renderNotifications();
            refreshDashboard();

            showMessage("All notifications marked as read.");
        }
    );


    // =====================================
    // 16. RECENT ACTIVITIES
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
    // 17. MODAL CONTROLS
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
    // 18. TABLE ACTION EVENTS
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
    // 19. LOGOUT
    // =====================================

    logoutBtn.addEventListener("click", function () {

        const confirmation = confirm(
            "Are you sure you want to log out?"
        );

        if (!confirmation) return;

        currentStaff = null;

        dashboardWrapper.style.display = "none";
        loginWrapper.style.display = "flex";

        loginForm.reset();

        errorMsg.textContent = "";

        detailsModal.classList.add("hidden");

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
