document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const loginWrapper = document.getElementById("loginWrapper");
    const dashboardWrapper = document.getElementById("dashboardWrapper");
    const errorMsg = document.getElementById("errorMsg");

    // Sidebar Navigation Elements
    const navDashboard = document.getElementById("navDashboard");
    const navRequests = document.getElementById("navRequests");
    const navResidents = document.getElementById("navResidents");

    // Content Sections
    const sectionDashboard = document.getElementById("sectionDashboard");
    const sectionRequests = document.getElementById("sectionRequests");
    const sectionResidents = document.getElementById("sectionResidents");

    // Login Handler
    loginForm.addEventListener("submit", function(e) {
        e.preventDefault();

        const user = document.getElementById("username").value.trim();
        const pass = document.getElementById("password").value.trim();

        if (user === "admin" && pass === "admin123") {
            loginWrapper.style.display = "none";
            dashboardWrapper.style.display = "flex";
        } else {
            errorMsg.style.display = "block";
        }
    });

    // Helper function to switch tabs
    function switchSection(activeNav, activeSection) {
        // Alisin ang active class sa lahat ng nav
        navDashboard.classList.remove("active");
        navRequests.classList.remove("active");
        navResidents.classList.remove("active");

        // Itago ang lahat ng sections
        sectionDashboard.style.display = "none";
        sectionRequests.style.display = "none";
        sectionResidents.style.display = "none";

        // I-activate ang napiling nav at section
        activeNav.classList.add("active");
        activeSection.style.display = "block";
    }

    // Sidebar Click Events
    navDashboard.addEventListener("click", (e) => {
        e.preventDefault();
        switchSection(navDashboard, sectionDashboard);
    });

    navRequests.addEventListener("click", (e) => {
        e.preventDefault();
        switchSection(navRequests, sectionRequests);
    });

    navResidents.addEventListener("click", (e) => {
        e.preventDefault();
        switchSection(navResidents, sectionResidents);
    });
});