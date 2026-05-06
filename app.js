// Use unique names to avoid conflicts with the library
const MY_SUPABASE_URL = 'https://ciygyijepuysmzpsxtqv.supabase.co';
const MY_SUPABASE_KEY = 'sb_publishable_TNEByRr0uYBDMqb-QiD9Cg_HiyM2is4';

// Initialize the client once
const supabaseClient = supabase.createClient(MY_SUPABASE_URL, MY_SUPABASE_KEY);
//Initializations for Kanban Board
const REGIONS = ["EMEA MNT", "APAC MNT", "AMER MNT", "EMEA EXP", "APAC EXP", "AMER EXP"];

const PROCESSES = [
    { id: 'pre', name: 'Pre-Processing', target: 15 },
    { id: 'sign', name: 'Sign Creation', target: 5.6 },
    { id: 'assoc', name: 'Association', target: 13 },
    { id: 'adj', name: 'Adjustment', target: 228 }
];

let columnStates = {
    'pre': true, 'sign': true, 'assoc': true, 'adj': true 
};

// Initialize global data arrays
let taskDB = [];
let userList = [];
let currentUser = null;
let userRole = 'employee'; // ADD THIS LINE
let myChart = null; // To prevent chart duplication
// Add a global state for card expansion
let cardsExpanded = true;

// 1. Check Session immediately
async function checkSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error || !session) {
        // Not logged in? Go to login page
        window.location.href = 'index.html';
    } else {
        // Logged in? Reveal the page and load data
        document.body.style.visibility = 'visible';
        currentUser = session.user; // CRITICAL: This fills the global variable
        loadUserInfo(session.user);
        loadNotifications(session.user.id);
    }
    if (session) {
        currentUser = session.user; // This fills the variable
    }
}

// 2. Populate Profile Dropdown
function loadUserInfo(user, fullName) {
    // 1. Get the display name
    const name = fullName || user.email.split('@')[0];

    // 2. Extract Initials
    let initials = "";
    if (fullName) {
        // Split name by space and take first letter of first two words
        const nameParts = fullName.trim().split(/\s+/);
        if (nameParts.length > 1) {
            initials = nameParts[0][0] + nameParts[nameParts.length - 1][0];
        } else {
            initials = nameParts[0][0];
        }
    } else {
        // Fallback to first letter of email
        initials = name.charAt(0);
    }

    // 3. Update DOM
    document.getElementById('display-name').innerText = name.toUpperCase();
    document.getElementById('display-email').innerText = user.email;
    document.getElementById('user-initial').innerText = initials.toUpperCase();
}

// 3. Dropdown Toggle
function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

// 4. Logout Logic
async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (!error) {
        window.location.href = 'index.html';
    } else {
        alert("Logout failed: " + error.message);
    }
}

function toggleColumn(procId) {
    columnStates[procId] = !columnStates[procId];
    renderBoard(); // Re-render to apply the state
}

function toggleSpecificTask(taskId) {
    const task = taskDB.find(t => t.id === taskId);
    if (task) {
        task.isMinimized = !task.isMinimized;
        renderBoard(); // Re-render the board to update the view
    }
}

// Run the check as soon as the script loads
checkSession();

// Fetch Notifications from Supabase
async function loadNotifications(userId) {
    const { data, error } = await supabaseClient
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error || !data) return;

    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-count');
    const unreadNotifications = data.filter(n => !n.is_read);
    const unreadCount = unreadNotifications.length;

    // Update Badge
    if (unreadCount > 0) {
        badge.innerText = unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.innerText = ''; // Clear text
        badge.style.setProperty("display", "none", "important");
    }

    // Update List with improved "Look and Feel"
    if (data.length > 0) {
        list.innerHTML = data.map(n => `
            <div class="notif-item ${n.is_read ? 'read' : 'unread'}" onclick="markAsRead('${n.id}')">
                <div class="notif-status-dot"></div>
                <div class="notif-content">
                    <div class="notif-message">${n.message}</div>
                    <div class="notif-time">${formatDate(n.created_at)}</div>
                </div>
            </div>
        `).join('');
    } else {
        list.innerHTML = `
            <div class="notif-empty">
                <p>All caught up! 🎉</p>
            </div>`;
    }
}

// Helper for cleaner dates
function formatDate(dateString) {
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

async function sendInternalNotification(targetUserId, msg) {
    // Basic check to ensure we aren't notifying "null" users
    if (!targetUserId) {
        console.warn("Notification skipped: No target user ID provided.");
        return;
    }

    const { data, error } = await supabaseClient
        .from('notifications')
        .insert([{
            user_id: targetUserId,
            message: msg,
            is_read: false
        }]);

    if (error) {
        console.error("DATABASE ERROR on Notification:", error.message, error.details);
    } else {
        console.log("Notification successfully stored in DB for:", targetUserId);
    }
}

async function markAsRead(id) {
    console.log("Forcing read status for:", id);

    // 1. INSTANT UI FEEDBACK (The "Liar" Technique)
    // We manually hide the badge and update the list locally 
    // so the user sees success instantly.
    const badge = document.getElementById('notif-count');
    if (badge) {
        badge.style.setProperty("display", "none", "important");
        badge.innerText = "0"; // Reset text just in case
    }

    // 2. Background Database Update
    const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

    if (error) {
        console.error("DB Update failed:", error);
        return;
    }

    // 3. DELAYED REFRESH
    // We wait 300ms before refreshing the list to ensure 
    // Supabase has indexed the "read" status.
    setTimeout(async () => {
        if (currentUser) {
            await loadNotifications(currentUser.id);
        }
    }, 300);

    // 4. Navigation
    navigateToSection('tasks');
    
    const notifMenu = document.getElementById('notif-menu');
    if (notifMenu) notifMenu.classList.remove('active');
}

// Helper function to handle section switching reliably
function navigateToSection(targetId) {
    const sections = document.querySelectorAll('.content-section');
    const navItems = document.querySelectorAll('.nav-item');

    // Hide all sections
    sections.forEach(s => s.style.display = 'none');
    
    // Show target section
    const targetSection = document.getElementById(`content-${targetId}`);
    if (targetSection) {
        targetSection.style.display = 'block';
    }

    // Update Nav UI
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-target') === targetId) {
            item.classList.add('active');
        }
    });

    // Special: If going to tasks, re-render the board
    if (targetId === 'tasks') {
        renderBoard();
    }
    // ADD THIS: Trigger reports when moving to the reports section
    if (targetId === 'reports') {
        runProcessReport();
        runTeamReport();
    }
}

// Global click listener to close menus
window.addEventListener('click', function (e) {
    const notifMenu = document.getElementById('notif-menu');
    const profileMenu = document.getElementById('profile-menu');
    const notifBtn = document.getElementById('notif-btn');
    const profileBtn = document.getElementById('profile-btn');

    // If click is NOT on the notification button or menu, close it
    if (!notifBtn.contains(e.target) && !notifMenu.contains(e.target)) {
        notifMenu.classList.remove('active');
    }

    // If click is NOT on the profile button or menu, close it
    if (!profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
        profileMenu.classList.remove('active');
    }
});

// Update your toggle functions to prevent event bubbling
function toggleNotifMenu() {
    event.stopPropagation(); // Stops the global listener from closing it immediately
    document.getElementById('notif-menu').classList.toggle('active');
    document.getElementById('profile-menu').classList.remove('active');
}

// function toggleProfileMenu() {
//     event.stopPropagation(); // Stops the global listener from closing it immediately
//     document.getElementById('profile-menu').classList.toggle('active');
//     document.getElementById('notif-menu').classList.remove('active');
// }

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleIcon = document.getElementById('toggle-icon');
    const mainContent = document.getElementById('main-content');

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        toggleIcon.innerHTML = '&gt;';
        if (mainContent) mainContent.style.marginLeft = "60px";
    } else {
        toggleIcon.innerHTML = '&lt;';
        if (mainContent) mainContent.style.marginLeft = "240px";
    }
}

async function checkUserRole() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
        let { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile.role === 'admin') {
            // Show "Create User" button or redirect to admin panel
            document.getElementById('admin-section').style.display = 'block';
        } else {
            // Hide admin features
            console.log("Access denied: You are a " + profile.role);
        }
    }
}

async function initializeDashboard() {
    // 1. Get the current logged-in user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
        window.location.href = 'index.html'; // Redirect if not logged in
        return;
    }

    // 1. Fetch full profile details
    const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*') // Get everything
        .eq('id', user.id)
        .single();

    console.log("Raw Profile from DB:", profile);

    const role = profile?.role || 'employee';
    userRole = role; // Assign to the global variable
    const adminSection = document.getElementById('admin-section');

    if (profileError) {
        console.error("Error fetching profile:", profileError);
        return;
    }

    // // 2. Update the UI with all 4 details
    // document.getElementById('display-name').innerText = profile.full_name || "User";
    // document.getElementById('display-emp-id').innerText = profile.employee_id || "N/A";
    // document.getElementById('display-role').innerText = profile.role.toUpperCase();
    // document.getElementById('display-email').innerText = user.email;

    // // 3. Update Initials for the circle
    // updateInitials(profile.full_name || user.email);

    if (profile) {
        // Force the display to use the database name
        // We use || 'No Name Found' to see if the property itself is empty
        document.getElementById('display-name').innerText = profile.full_name || 'NAME MISSING';
        document.getElementById('display-emp-id').innerText = profile.employee_id || "ID MISSING";
        document.getElementById('display-role').innerText = (profile.role || 'employee').toUpperCase();
        document.getElementById('display-email').innerText = user.email;

        // Update initials using the name from the database
        updateInitials(profile.full_name || "??");
    }
    else {
        console.error("No profile record found in the database for this user!");
    }

    // UI Logic: Admin sees everything, Manager sees Create User, Employee sees neither
    if (role === 'admin' || role === 'manager') {
        adminSection.style.display = 'block';
        // Modify labels if manager
        if (role === 'manager') {
            adminSection.querySelector('.sidebar-label').innerText = "Manager Tools";
        }
    }

    loadUserInfo(user, profile?.full_name);
    // Fetch the data
    await loadKanban();

    // Set up sidebar listeners
    setupNavigation();

    setupRealtime();
}

function updateInitials(name) {
    const parts = name.trim().split(/\s+/);
    const initials = parts.length > 1
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0][0];
    document.getElementById('user-initial').innerText = initials.toUpperCase();
}

// Run on page load
window.onload = function () {
    initializeDashboard();
};

async function deleteUserRecord(targetUserId) {
    // This only deletes them from your 'profiles' table. 
    // To remove them from Auth entirely, you need an Edge Function.
    const { error } = await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', targetUserId);

    if (error) alert("Error: " + error.message);
    else alert("User removed from database.");
}


// Swtich tabs
// Function to switch content
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            if (target) {
                navigateToSection(target);
            }

            if (!target) return;

            // 1. Update Active Link UI
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // 2. Switch Visible Section
            sections.forEach(section => {
                section.style.display = 'none';
            });

            const activeSection = document.getElementById(`content-${target}`);
            if (activeSection) {
                activeSection.style.display = 'block';
            }
            // FIX: If the user clicks "Tasks", force the board to draw
            if (target === 'tasks') {
                renderBoard();
            }
        });
    });
}

// Call this function inside your window.onload or initializeDashboard
window.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
});

// Kanban Creation Logic
async function loadKanban() {
    // 1. Fetch ALL users
    await fetchUserList();

    // 2. Fetch Tasks
    const { data: tasks } = await supabaseClient.from('tasks').select('*');
    taskDB = tasks || [];

    // 3. Render
    renderBoard();
}

async function renderBoard() {
    const board = document.getElementById('board-ui');
    if (!board) return;
    board.innerHTML = ''; // Clear board

    PROCESSES.forEach(p => {
        const isVisible = columnStates[p.id];
        // 1. Create the Column Wrapper
        const column = document.createElement('div');
        column.className = `kanban-column ${isVisible ? '' : 'minimized'}`;
        column.innerHTML = `
            <div class="column-header" onclick="toggleColumn('${p.id}')" style="cursor:pointer">
            <h3>${p.name} ${isVisible ? '▾' : '▸'}</h3>
            ${(userRole === 'admin' || userRole === 'manager') ?
            `<button class="add-task-btn" onclick="event.stopPropagation(); addTask('${p.id}')">+</button>` : ''}
        </div>
        <div class="task-list" id="list-${p.id}" style="display: ${isVisible ? 'block' : 'none'}"></div>
        `;
        board.appendChild(column);

        const listContainer = document.getElementById(`list-${p.id}`);

        // --- STRICT FILTERING LOGIC ---
        let columnTasks = taskDB.filter(t => {
            const isMatchProcess = t.proc_id === p.id;
            // Access Logic:
            // 1. Admins see everything.
            // 2. Managers see tasks they created (manager_id).
            // 3. Employees see tasks assigned to them (assignee_id).
            const hasAccess = 
                userRole === 'admin' || 
                t.manager_id === currentUser.id || 
                t.assignee_id === currentUser.id;

            return isMatchProcess && hasAccess;
        });

        // 3. Render the filtered cards
        if (columnTasks.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">No accessible tasks</div>`;
        } else {
            columnTasks.forEach(task => {
                if (task.isMinimized === undefined) task.isMinimized = false;

                const card = createTaskCard(task, p.target);
                listContainer.appendChild(card);
            });
        }
    });
}

// Helper function to build the card HTML
// function createTaskCard(task, target) {
//     const card = document.createElement('div');
//     card.className = `card ${task.status}`;

//     // We build the assignee options separately so the template stays clean
//     const assigneeOptions = userList.map(u => {
//         const name = u.full_name || u.email || "Unknown";
//         return `<option value="${u.id}" ${task.assignee_id === u.id ? 'selected' : ''}>${name}</option>`;
//     }).join(''); // <--- VERY IMPORTANT

//     card.innerHTML = `
//         <div class="card-id-badge">ID: ${task.id.substring(0, 8)}...</div>

//         <div class="card-top">
//             <button class="delete-task-btn" onclick="deleteTask('${task.id}')">X</button>
//         </div>

//         <div class="label">Assignee Name</div>
//         <select onchange="updateTask('${task.id}', 'assignee_id', this.value)">
//             <option value="">Unassigned</option>
//             ${assigneeOptions}
//         </select>

//         <div class="label">Region</div>
//         <select onchange="updateTask('${task.id}', 'region', this.value)">
//             ${REGIONS.map(r => `
//                 <option value="${r}" ${task.region === r ? 'selected' : ''}>${r}</option>
//             `).join('')}
//         </select>

//         <div class="card-grid">
//             <div class="card-row">
//                 <div class="input-group">
//                     <div class="label">Files</div>
//                     <input type="number" value="${task.files || 0}" onchange="updateTask('${task.id}', 'files', this.value)">
//                 </div>
//                 <div class="input-group">
//                     <div class="label">Errors</div>
//                     <input type="number" value="${task.errors || 0}" onchange="updateTask('${task.id}', 'errors', this.value)">
//                 </div>
//             </div>

//             <div class="card-row">
//                 <div class="input-group">
//                     <div class="label">Start</div>
//                     <input type="date" value="${task.start_date || task.start || ''}" 
//                         onchange="updateTask('${task.id}', 'start_date', this.value)">
//                 </div>
//                 <div class="input-group">
//                     <div class="label">End</div>
//                     <input type="date" value="${task.end_date || task.end || ''}" 
//                         onchange="updateTask('${task.id}', 'end_date', this.value)">
//                 </div>
//             </div>

//             <div>
//                 <div class="label">Status</div>
//                 <select class="status-select" onchange="updateTask('${task.id}', 'status', this.value)">
//                     <option value="new" ${task.status === 'new' ? 'selected' : ''}>NEW</option>
//                     <option value="inprogress" ${task.status === 'inprogress' ? 'selected' : ''}>IN PROGRESS</option>
//                     <option value="onhold" ${task.status === 'onhold' ? 'selected' : ''}>ON HOLD</option>
//                     <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>COMPLETED</option>
//                     <option value="error" ${task.status === 'error' ? 'selected' : ''}>ERROR</option>
//                 </select>
//             </div>
//         </div>

//         <div class="est-pill">EST: ${target > 0 ? (task.files / target).toFixed(2) : 0} Hrs</div>
//     `;
//     return card;
// }
function createTaskCard(task, target) {
    const card = document.createElement('div');
    // Ensure the class reflects the status for CSS styling
    card.className = `card ${task.status || 'new'} ${task.isMinimized ? 'minimized-card' : ''}`;

    // Check if user is allowed to delete
    const canDelete = (userRole === 'admin' || userRole === 'manager');

    const assigneeOptions = userList.map(u => {
        const name = u.full_name || u.email || "Unknown";
        return `<option value="${u.id}" ${task.assignee_id === u.id ? 'selected' : ''}>${name}</option>`;
    }).join('');

    // Logic: If user is an employee, the assignee dropdown should be disabled
    const isEmployee = userRole === 'employee';

    card.innerHTML = `
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" 
             onclick="toggleSpecificTask('${task.id}')">
            <div>
                <span class="toggle-icon">${task.isMinimized ? '▶' : '▼'}</span>
                <strong>ID: ${task.id.substring(0, 8).toUpperCase()}</strong>
            </div>
            ${canDelete ? `<button class="delete-task-btn" onclick="event.stopPropagation(); deleteTask('${task.id}')">✕</button>` : ''}
        </div>

        <div class="card-body" style="display: ${task.isMinimized ? 'none' : 'block'}">
            <div class="label">Assignee</div>
            <select onchange="updateTask('${task.id}', 'assignee_id', this.value)" ${isEmployee ? 'disabled' : ''} style="${isEmployee ? 'background-color: #f1f5f9; cursor: not-allowed;' : ''}">
                <option value="">Unassigned</option>
                ${assigneeOptions}
            </select>

            <div class="card-grid">
                <div>
                    <div class="label">Files</div>
                    <input type="number" value="${task.files || 0}" onchange="updateTask('${task.id}', 'files', this.value)">
                </div>
                <div>
                    <div class="label">Errors</div>
                    <input type="number" value="${task.errors || 0}" onchange="updateTask('${task.id}', 'errors', this.value)">
                </div>
            </div>

            <div class="card-grid">
                <div>
                    <div class="label">Start Date</div>
                    <input type="date" value="${task.start_date || ''}" onchange="updateTask('${task.id}', 'start_date', this.value)">
                </div>
                <div>
                    <div class="label">End Date</div>
                    <input type="date" value="${task.end_date || ''}" onchange="updateTask('${task.id}', 'end_date', this.value)">
                </div>
            </div>

            <div class="label">Status</div>
            <select onchange="updateTask('${task.id}', 'status', this.value)" style="font-weight:bold;">
                <option value="new" ${task.status === 'new' ? 'selected' : ''}>NEW</option>
                <option value="inprogress" ${task.status === 'inprogress' ? 'selected' : ''}>IN PROGRESS</option>
                <option value="onhold" ${task.status === 'onhold' ? 'selected' : ''}>ON HOLD</option>
                <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>COMPLETED</option>
                <option value="error" ${task.status === 'error' ? 'selected' : ''}>ERROR</option>
            </select>

            <div class="est-pill">
                ⏱️ EST: ${target > 0 ? (task.files / target).toFixed(2) : 0} Hrs
            </div>
        </div>
    `;
    return card;
}

async function addTask(procId) {
    // const { data: { user } } = await supabaseClient.auth.getUser();
    const managerId = currentUser ? currentUser.id : null;
    console.log("Creating temporary task for:", procId);

    // 1. Create a local-only task object
    const newTask = {
        id: crypto.randomUUID(), // Temporary unique ID
        proc_id: procId,
        region: REGIONS[0],
        assignee_id: null,
        manager_id: currentUser.id, // CRITICAL: Marks who created the task
        files: 0,
        errors: 0,
        status: 'new',
        created_at: new Date().toISOString()
    };

    // 2. Add to your local array
    taskDB.push(newTask);

    // 3. Highlight the Save button
    const saveBtn = document.getElementById('save-kanban-btn');
    if (saveBtn) saveBtn.classList.add('pending-changes');

    // 4. Refresh the UI so the new card appears
    renderBoard();
}

// Ensure your fetch function looks exactly like this:
async function fetchUserList() {
    // Remove any .eq() filters here so you get the full list
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, email, full_name')
        .order('full_name', { ascending: true }); // Optional: Alphabetical order

    if (error) {
        console.error("Fetch error:", error);
        return;
    }

    userList = data || [];
    console.log("Total users fetched for dropdown:", userList.length);
}

async function deleteTask(id) { // Use 'id' as the parameter
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
        // 1. Remove from local array immediately for instant UI update
        taskDB = taskDB.filter(t => t.id !== id);
        renderBoard();

        // 2. Delete from Supabase (if it exists there)
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) console.warn("Note: Task was not in DB yet or delete failed:", error.message);

    } catch (err) {
        console.error("Error in deleteTask:", err.message);
    }
}

// async function updateTask(taskId, key, value) {
//     try {
//         // 1. Update Supabase
//         const { error } = await supabaseClient
//             .from('tasks')
//             .update({ [key]: value })
//             .eq('id', taskId);

//         if (error) throw error;

//         // 2. Update local taskDB array so the UI stays in sync
//         const taskIndex = taskDB.findIndex(t => t.id === taskId);
//         if (taskIndex !== -1) {
//             taskDB[taskIndex][key] = value;
//         }

//         console.log(`Updated ${key} to ${value} for task ${taskId}`);

//         // 3. Optional: Re-render if you want the "EST" or colors to update immediately
//         if (key === 'files' || key === 'status') {
//             renderBoard();
//         }

//     } catch (err) {
//         console.error("Update failed:", err.message);
//     }
// }

// 1. Modified updateTask (Local only)
function updateTask(taskId, key, value) {
    // Block employees from updating assignee_id via code/console
    if (userRole === 'employee' && key === 'assignee_id') {
        console.warn("Employees cannot change assignees.");
        return;
    }
    const task = taskDB.find(t => t.id === taskId);
    if (task) {
        task[key] = value;
        console.log(`Draft updated locally: ${key} = ${value}`);

        // Highlight the Save button to show pending changes
        const saveBtn = document.getElementById('save-kanban-btn');
        if (saveBtn) saveBtn.classList.add('pending-changes');

        // Re-render if necessary for UI logic (like EST or status colors)
        if (key === 'files' || key === 'status') renderBoard();
    }
}

// 2. The Save Function (The Backend Commit)
async function saveAllChanges() {
    const saveBtn = document.getElementById('save-kanban-btn');

    // SAFETY CHECK: If currentUser isn't loaded yet, try to fetch it again
    if (!currentUser) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            currentUser = user;
        } else {
            alert("Error: You must be logged in to save changes.");
            return;
        }
    }

    try {
        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        // 1. Commit the batch update to Supabase
        const { error } = await supabaseClient
            .from('tasks')
            .upsert(taskDB);

        if (error) throw error;

        // 2. Identify and Notify Assigned Employees
        for (const task of taskDB) {
            console.log("Checking task for notification:", task.id, "Assignee:", task.assignee_id);

            // Check if assignee exists AND is not the person saving the task
            if (task.assignee_id && task.assignee_id !== currentUser.id) {
                const message = `New task assigned: ${task.proc_id.toUpperCase()} - ID: ${task.id.substring(0, 8)}`;

                console.log("Attempting to send notification to:", task.assignee_id);
                await sendInternalNotification(task.assignee_id, message);
            }
        }

        alert("All changes saved successfully!");
        saveBtn.classList.remove('pending-changes');
        saveBtn.innerText = "Save Changes";

    } catch (err) {
        console.error("Save failed:", err.message);
        alert("Error: " + err.message);
    } finally {
        saveBtn.disabled = false;
    }
}

window.toggleProfileMenu = function () {
    const menu = document.getElementById('profile-menu');
    if (menu) menu.classList.toggle('active');
};

function setupRealtime() {
    supabaseClient
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tasks' },
            (payload) => {
                // console.log('Change received!', payload);
                // Refresh the local taskDB and re-render
                loadKanban();
            }
        )
        .subscribe();
}

// Report Creation
// 1. Process Report (Pie Chart & Summary Boxes)
function runProcessReport() {
    // Check if Chart library exists
    if (typeof Chart === 'undefined') {
        console.error("Chart.js library not loaded yet.");
        const ui = document.getElementById('report-ui');
        if (ui) ui.innerHTML = '<p style="color:red">Charts are currently unavailable. Please refresh.</p>';
        return;
    }
    const ui = document.getElementById('report-ui');
    if (!ui) return;
    ui.innerHTML = '';
    
    let chartLabels = [];
    let chartData = [];

    PROCESSES.forEach(p => {
        // Use taskDB (your Supabase local array) and check proc_id
        const tasks = taskDB.filter(t => t.proc_id === p.id);
        const sumFiles = tasks.reduce((acc, t) => acc + parseInt(t.files || 0), 0);
        const sumStatus = (status) => tasks.filter(t => t.status === status).reduce((acc, t) => acc + parseInt(t.files || 0), 0);
        
        chartLabels.push(p.name);
        chartData.push(sumFiles);

        ui.innerHTML += `
            <div class="report-box">
                <h4 style="margin:0 0 10px 0; color:#1e3a8a; font-size:12px; border-bottom:2px solid #3b82f6">${p.name}</h4>
                <div class="stat-row" style="display:flex; justify-content:space-between; font-size:13px; margin:4px 0;">
                    <span>Total Files</span> <b>${sumFiles}</b>
                </div>
                <div class="stat-row" style="display:flex; justify-content:space-between; font-size:13px; margin:4px 0;">
                    <span>Completed</span> <b style="color:#10b981">${sumStatus('completed')}</b>
                </div>
                <div class="stat-row" style="display:flex; justify-content:space-between; font-size:13px; margin:4px 0;">
                    <span>Pending</span> <b style="color:#3b82f6">${sumStatus('inprogress')}</b>
                </div>
                <div class="stat-row" style="display:flex; justify-content:space-between; font-size:13px; margin:4px 0;">
                    <span>On Hold</span> <b style="color:#94a3b8">${sumStatus('onhold')}</b>
                </div>
                <div class="stat-row" style="display:flex; justify-content:space-between; font-size:13px; margin:4px 0;">
                    <span>Errors</span> <b style="color:#ef4444">${tasks.reduce((a, b) => a + parseInt(b.errors || 0), 0)}</b>
                </div>
            </div>
        `;
    });

    // Pie Chart Logic
    const canvas = document.getElementById('processChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: chartLabels,
            datasets: [{
                data: chartData,
                backgroundColor: ['#1e3a8a', '#3b82f6', '#10b981', '#f59e0b']
            }]
        },
        options: { 
            responsive: true, 
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } 
        }
    });
}

// 2. Team Report (Performance Matrix Table)
function runTeamReport() {
    const ui = document.getElementById('team-ui');
    if (!ui) return;

    // Get unique assignee IDs from the tasks
    const uniqueAssigneeIds = [...new Set(taskDB.map(t => t.assignee_id))].filter(id => id);
    
    let tableHTML = `
        <h3 style="color:#1e3a8a; margin-top:20px;">Team Performance Matrix</h3>
        <table class="team-table" style="width:100%; border-collapse:collapse; margin-top:10px;">
            <thead>
                <tr style="background:#f8fafc; text-align:left;">
                    <th style="padding:10px; border-bottom:2px solid #e2e8f0;">User Name</th>
                    <th style="padding:10px; border-bottom:2px solid #e2e8f0;">Total Files Completed</th>
                </tr>
            </thead>
            <tbody>
    `;

    uniqueAssigneeIds.forEach(id => {
        // Find user name from our global userList
        const userObj = userList.find(u => u.id === id);
        const userName = userObj ? (userObj.full_name || userObj.email) : "Unknown User";
        
        const completedCount = taskDB
            .filter(t => t.assignee_id === id && t.status === 'completed')
            .reduce((a, b) => a + parseInt(b.files || 0), 0);

        tableHTML += `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:10px;">${userName}</td>
                <td style="padding:10px;"><b>${completedCount}</b></td>
            </tr>`;
    });

    tableHTML += `</tbody></table>`;
    ui.innerHTML = tableHTML;
}

// 3. Updated CSV Export
function exportToExcel() {
    let csv = "Task ID,Process,Assignee,Region,Files,Errors,Start,End,Status\n";
    taskDB.forEach(t => {
        const user = userList.find(u => u.id === t.assignee_id);
        const name = user ? (user.full_name || user.email) : 'Unassigned';
        
        csv += `${t.id},${t.proc_id},"${name}",${t.region},${t.files},${t.errors},${t.start_date || ''},${t.end_date || ''},${t.status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `Production_Report_${new Date().toLocaleDateString()}.csv`);
    a.click();
}