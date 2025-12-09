// ==================== CONFIGURACIÓN ====================
const CONFIG = {
    SUPER_USER_PASSWORD: 'Thanitosguapito',
    DRIVE_FOLDER_ID: '1e5ebZ1haq0AFua98XBSe9lmUfOwjyHLT',
    PASSWORD_FILE_NAME: 'maria_password.txt',
    DATABASE_FILE_NAME: 'tasks_database.json',
    PIGGY_BANK_FILE_NAME: 'piggy_bank.json',
    POINTS_PER_EURO: 10, // 10€ máximo
    BONUS_EUROS: 2 // Bonificación por semana completa
};

// Tareas por defecto para rellenar semana automáticamente
const DEFAULT_TASKS = {
    daily: [ // Lunes a Domingo
        { title: 'Poner y quitar la mesa (comida)', description: '' },
        { title: 'Poner y quitar la mesa (cena)', description: '' }
    ],
    weekdays: [ // Lunes a Viernes
        { title: 'Hacer deberes y/o estudiar', description: '' }
    ],
    saturday: [ // Solo Sábado
        { title: 'Limpiar habitación', description: '' }
    ]
};

// ==================== VARIABLES GLOBALES ====================
let currentUser = null; // 'maria' o 'super_usuario'
let currentWeekStart = null; // Fecha de inicio de la semana actual
let tasksDatabase = {}; // Base de datos de tareas por semana
let piggyBank = 0; // Dinero acumulado en la hucha
let gapi = null;
let gapiInited = false;
let mariaPassword = ''; // Contraseña de Maria desde Drive

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    // Cargar Google API
    loadGoogleAPI();
    
    // Establecer semana actual
    currentWeekStart = getWeekStart(new Date());
    
    // Inicializar base de datos local
    loadLocalDatabase();
    
    // Cargar hucha
    loadPiggyBank();
}

function setupEventListeners() {
    // Login
    document.getElementById('loginButton').addEventListener('click', handleLogin);
    document.getElementById('passwordInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleLogin();
    });
    
    // Switch de usuario
    document.getElementById('userTypeSwitch').addEventListener('change', function() {
        const mariaOption = document.querySelector('.maria-option');
        const superOption = document.querySelector('.super-option');
        
        if (this.checked) {
            mariaOption.classList.remove('active');
            superOption.classList.add('active');
        } else {
            mariaOption.classList.add('active');
            superOption.classList.remove('active');
        }
    });
    
    // Logout
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    
    // Navegación de semanas
    document.getElementById('prevWeek').addEventListener('click', () => navigateWeek(-1));
    document.getElementById('nextWeek').addEventListener('click', () => navigateWeek(1));
    
    // Botones de administración
    document.getElementById('addBonusBtn').addEventListener('click', addBonus);
    document.getElementById('removeBonusBtn').addEventListener('click', removeBonus);
    document.getElementById('clearWeekBtn').addEventListener('click', clearWeek);
    document.getElementById('fillWeekBtn').addEventListener('click', fillWeekAutomatically);
    document.getElementById('editPiggyBank').addEventListener('click', editPiggyBankAmount);
    
    // Modal
    document.querySelector('.close').addEventListener('click', closeModal);
    document.getElementById('cancelTaskBtn').addEventListener('click', closeModal);
    document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
}

// ==================== GOOGLE DRIVE API ====================
async function handleDriveConnect() {
    const btn = document.getElementById('driveConnectBtn');
    
    if (typeof driveSignIn !== 'function') {
        alert('Google Drive no está disponible. Verifica la configuración.');
        return;
    }
    
    try {
        btn.textContent = '☁️ Conectando...';
        btn.disabled = true;
        
        await driveSignIn();
        
        btn.textContent = '✅ Conectado a Drive';
        btn.style.background = '#10b981';
        
        alert('¡Conectado a Google Drive! Tus datos se sincronizarán automáticamente.');
    } catch (error) {
        console.error('Error conectando con Drive:', error);
        btn.textContent = '☁️ Conectar Google Drive';
        btn.disabled = false;
        alert('No se pudo conectar con Google Drive: ' + error.message);
    }
}

function loadGoogleAPI() {
    // Drive se prepara automáticamente en segundo plano
    // Solo cargamos password local por ahora
    loadPasswordFromLocalStorage();
    
    // Verificar si ya hay sesión activa (para reconexión automática)
    setTimeout(() => {
        if (typeof driveState !== 'undefined' && driveState.signedIn) {
            console.log('Sesión de Drive activa');
            const btn = document.getElementById('driveConnectBtn');
            if (btn) {
                btn.textContent = '✅ Conectado a Drive';
                btn.style.background = '#10b981';
            }
        }
    }, 2000);
}

function loadPasswordFromLocalStorage() {
    // Temporalmente usar localStorage hasta configurar Drive
    const stored = localStorage.getItem('mariaPassword');
    mariaPassword = stored || 'maria'; // Password por defecto
    
    if (!stored) {
        localStorage.setItem('mariaPassword', mariaPassword);
    }
}

async function loadPasswordFromDrive() {
    // Ya no se usa, la carga se hace desde drive-config.js
    return mariaPassword;
}

async function savePasswordToDrive(password) {
    if (typeof savePasswordToDriveReal === 'function') {
        await savePasswordToDriveReal(password);
    } else {
        localStorage.setItem('mariaPassword', password);
        mariaPassword = password;
    }
}

async function loadDatabaseFromDrive() {
    // Ya no se usa, la carga se hace desde drive-config.js
}

async function saveDatabaseToDrive() {
    if (typeof saveDatabaseToDriveReal === 'function') {
        await saveDatabaseToDriveReal();
    } else {
        localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
    }
}

function loadLocalDatabase() {
    const stored = localStorage.getItem('tasksDatabase');
    if (stored) {
        tasksDatabase = JSON.parse(stored);
    }
}

function saveLocalDatabase() {
    localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
    saveDatabaseToDrive();
}

// ==================== AUTENTICACIÓN ====================
async function handleLogin() {
    const passwordInput = document.getElementById('passwordInput');
    const password = passwordInput.value.trim();
    const isSuperUser = document.getElementById('userTypeSwitch').checked;
    const errorMsg = document.getElementById('loginError');
    
    errorMsg.textContent = '';
    
    if (!password) {
        errorMsg.textContent = 'Por favor, introduce una contraseña';
        return;
    }
    
    let isValid = false;
    
    if (isSuperUser) {
        // Super Usuario
        if (password === CONFIG.SUPER_USER_PASSWORD) {
            currentUser = 'super_usuario';
            isValid = true;
        }
    } else {
        // Maria
        await loadPasswordFromDrive();
        if (password === mariaPassword) {
            currentUser = 'maria';
            isValid = true;
        }
    }
    
    if (isValid) {
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('mainScreen').classList.add('active');
        
        // Actualizar UI
        updateWelcomeMessage();
        
        // Conectar con Google Drive automáticamente
        try {
            if (typeof driveSignIn === 'function' && !driveState.signedIn) {
                await driveSignIn();
                console.log('Datos cargados desde Drive');
            } else {
                // Si ya está conectado o Drive no disponible, cargar de localStorage
                await loadDatabaseFromDrive();
            }
        } catch (error) {
            console.error('Error conectando con Drive, usando localStorage:', error);
            await loadDatabaseFromDrive();
        }
        
        renderCalendar();
        
        // Mostrar controles de admin si es super usuario
        if (currentUser === 'super_usuario') {
            document.getElementById('adminControls').style.display = 'flex';
        }
    } else {
        errorMsg.textContent = '❌ Contraseña incorrecta';
        passwordInput.value = '';
    }
}

async function handleLogout() {
    // Guardar datos en Drive antes de cerrar sesión
    try {
        if (typeof saveDatabaseToDriveReal === 'function' && driveState.signedIn) {
            await saveDatabaseToDriveReal();
            if (typeof savePiggyBankToDrive === 'function') {
                await savePiggyBankToDrive();
            }
            console.log('Datos guardados en Drive al cerrar sesión');
        }
    } catch (error) {
        console.error('Error guardando en Drive al cerrar sesión:', error);
    }
    
    currentUser = null;
    document.getElementById('mainScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('passwordInput').value = '';
    document.getElementById('adminControls').style.display = 'none';
}

function updateWelcomeMessage() {
    const welcomeMsg = document.getElementById('welcomeMessage');
    const giveMoneyBtn = document.getElementById('giveMoney');
    const editPiggyBtn = document.getElementById('editPiggyBank');
    
    if (currentUser === 'super_usuario') {
        welcomeMsg.textContent = 'Panel de Administración 👑';
        if (giveMoneyBtn) {
            giveMoneyBtn.style.display = 'block';
        }
        if (editPiggyBtn) {
            editPiggyBtn.style.display = 'block';
        }
    } else {
        welcomeMsg.textContent = 'Bienvenida, Maria! 🌺';
        if (giveMoneyBtn) {
            giveMoneyBtn.style.display = 'none';
        }
        if (editPiggyBtn) {
            editPiggyBtn.style.display = 'none';
        }
    }
}

// ==================== GESTIÓN DE FECHAS ====================
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunes como primer día
    return new Date(d.setDate(diff));
}

function getWeekKey(weekStart) {
    return weekStart.toISOString().split('T')[0];
}

function formatDate(date) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
                    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
}

function getDayName(dayIndex) {
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    return days[dayIndex];
}

function navigateWeek(direction) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (direction * 7));
    renderCalendar();
}

// ==================== RENDERIZADO ====================
function renderCalendar() {
    updateWeekDisplay();
    updateProgressBar();
    
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    
    const weekKey = getWeekKey(currentWeekStart);
    const weekData = tasksDatabase[weekKey] || { tasks: [], bonus: 0 };
    
    // Crear columnas para cada día
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + i);
        
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        
        // Header del día
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        
        const dayInfo = document.createElement('div');
        const dayName = document.createElement('div');
        dayName.className = 'day-name';
        dayName.textContent = getDayName(i);
        
        const dateDisplay = document.createElement('div');
        dateDisplay.className = 'day-date';
        dateDisplay.textContent = formatDate(dayDate);
        
        dayInfo.appendChild(dayName);
        dayInfo.appendChild(dateDisplay);
        
        // Botón añadir tarea
        const addBtn = document.createElement('button');
        addBtn.className = 'add-task-btn';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', () => openTaskModal(i));
        
        dayHeader.appendChild(dayInfo);
        dayHeader.appendChild(addBtn);
        
        // Lista de tareas
        const taskList = document.createElement('div');
        taskList.className = 'task-list';
        taskList.id = `taskList-${i}`;
        
        // Filtrar tareas del día
        const dayTasks = weekData.tasks.filter(task => task.day === i);
        dayTasks.forEach(task => {
            const taskElement = createTaskElement(task, weekKey);
            taskList.appendChild(taskElement);
        });
        
        dayColumn.appendChild(dayHeader);
        dayColumn.appendChild(taskList);
        calendar.appendChild(dayColumn);
    }
}

function createTaskElement(task, weekKey) {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-item';
    
    // Estado de la tarea
    const statusCircle = document.createElement('div');
    statusCircle.className = `task-status ${task.status}`;
    
    if (task.status === 'pending') {
        statusCircle.textContent = '○';
    } else if (task.status === 'done') {
        statusCircle.textContent = '◐';
    } else {
        statusCircle.textContent = '●';
    }
    
    // Click en el círculo para cambiar estado
    statusCircle.addEventListener('click', (e) => {
        e.stopPropagation();
        changeTaskStatus(task, weekKey);
    });
    
    // Contenido de la tarea
    const taskContent = document.createElement('div');
    taskContent.className = 'task-content';
    
    const taskTitle = document.createElement('div');
    taskTitle.className = 'task-title';
    taskTitle.textContent = task.title;
    
    taskContent.appendChild(taskTitle);
    
    if (task.description) {
        const taskDesc = document.createElement('div');
        taskDesc.className = 'task-description';
        taskDesc.textContent = task.description;
        taskContent.appendChild(taskDesc);
    }
    
    const taskCreator = document.createElement('div');
    taskCreator.className = 'task-creator';
    taskCreator.textContent = task.creator === 'super_usuario' ? '👑 Super Usuario' : '🌸 Maria';
    taskContent.appendChild(taskCreator);
    
    // Acciones
    const taskActions = document.createElement('div');
    taskActions.className = 'task-actions';
    
    // Solo se puede borrar si:
    // - Es super_usuario
    // - Es maria y la tarea es suya
    const canDelete = currentUser === 'super_usuario' || 
                     (currentUser === 'maria' && task.creator === 'maria');
    
    if (canDelete) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.textContent = '🗑️';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTask(task, weekKey);
        });
        taskActions.appendChild(deleteBtn);
    }
    
    taskItem.appendChild(statusCircle);
    taskItem.appendChild(taskContent);
    taskItem.appendChild(taskActions);
    
    return taskItem;
}

function updateWeekDisplay() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    
    const weekDisplay = document.getElementById('weekDisplay');
    weekDisplay.textContent = `Semana del ${formatDate(currentWeekStart)} - ${formatDate(weekEnd)} ${currentWeekStart.getFullYear()}`;
}

function updateProgressBar() {
    const weekKey = getWeekKey(currentWeekStart);
    const weekData = tasksDatabase[weekKey] || { tasks: [], bonus: 0 };
    
    // Filtrar solo tareas de super_usuario
    const superUserTasks = weekData.tasks.filter(t => t.creator === 'super_usuario');
    const completedTasks = superUserTasks.filter(t => t.status === 'completed');
    
    let totalEuros = 0;
    
    if (superUserTasks.length > 0) {
        const eurosPerTask = CONFIG.POINTS_PER_EURO / superUserTasks.length;
        totalEuros = completedTasks.length * eurosPerTask;
    }
    
    // Añadir bonificación
    totalEuros += weekData.bonus || 0;
    
    // Calcular el máximo dinámico (10€ base + bonificación otorgada)
    const maxEuros = CONFIG.POINTS_PER_EURO + (weekData.bonus || 0);
    
    const percentage = (totalEuros / maxEuros) * 100;
    
    document.getElementById('progressFill').style.width = `${percentage}%`;
    document.getElementById('pointsDisplay').textContent = 
        `${totalEuros.toFixed(2)}€ / ${maxEuros.toFixed(2)}€`;
    
    // Actualizar mensaje de bonus
    const allCompleted = superUserTasks.length > 0 && 
                        superUserTasks.every(t => t.status === 'completed');
    
    const bonusText = document.getElementById('bonusText');
    if (allCompleted && weekData.bonus === 0 && currentUser === 'super_usuario') {
        bonusText.textContent = '🎉 ¡Todas las tareas completadas! Puedes otorgar bonificación';
        bonusText.style.color = '#10b981';
    } else if (allCompleted && weekData.bonus > 0) {
        bonusText.textContent = `✨ ¡Bonificación de ${weekData.bonus}€ otorgada!`;
        bonusText.style.color = '#10b981';
    } else {
        bonusText.textContent = '🌺 Completa todas las tareas y obtendrás euritos extras!';
        bonusText.style.color = '#0ea5e9';
    }
}

// ==================== GESTIÓN DE TAREAS ====================
let currentEditingTask = null;
let currentEditingDay = null;

function openTaskModal(dayIndex) {
    currentEditingDay = dayIndex;
    currentEditingTask = null;
    
    document.getElementById('modalTitle').textContent = 'Nueva Tarea';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskDay').value = dayIndex;
    
    // Mostrar/ocultar descripción según usuario
    const descriptionField = document.getElementById('taskDescription');
    const descriptionContainer = descriptionField.parentElement;
    
    if (currentUser === 'super_usuario') {
        descriptionField.style.display = 'none';
        descriptionField.required = false;
    } else {
        descriptionField.style.display = 'block';
        descriptionField.required = false;
    }
    
    document.getElementById('taskModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('taskModal').style.display = 'none';
    currentEditingTask = null;
    currentEditingDay = null;
}

function handleTaskSubmit(e) {
    e.preventDefault();
    
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const day = parseInt(document.getElementById('taskDay').value);
    
    if (!title) return;
    
    const weekKey = getWeekKey(currentWeekStart);
    
    if (!tasksDatabase[weekKey]) {
        tasksDatabase[weekKey] = { tasks: [], bonus: 0 };
    }
    
    const newTask = {
        id: Date.now(),
        title,
        description,
        day,
        status: 'pending',
        creator: currentUser,
        createdAt: new Date().toISOString()
    };
    
    tasksDatabase[weekKey].tasks.push(newTask);
    saveLocalDatabase();
    
    closeModal();
    renderCalendar();
}

function changeTaskStatus(task, weekKey) {
    const weekData = tasksDatabase[weekKey];
    const taskIndex = weekData.tasks.findIndex(t => t.id === task.id);
    
    if (taskIndex === -1) return;
    
    const currentTask = weekData.tasks[taskIndex];
    const previousStatus = currentTask.status;
    
    // Lógica de cambio de estado
    if (currentUser === 'super_usuario') {
        // Super usuario puede cambiar cualquier estado
        if (currentTask.status === 'pending') {
            currentTask.status = 'done';
        } else if (currentTask.status === 'done') {
            currentTask.status = 'completed';
            
            // Si es una tarea del super_usuario que se completa, añadir dinero a la hucha
            if (currentTask.creator === 'super_usuario') {
                const superUserTasks = weekData.tasks.filter(t => t.creator === 'super_usuario');
                const eurosPerTask = CONFIG.POINTS_PER_EURO / superUserTasks.length;
                addMoneyToPiggyBank(eurosPerTask);
            }
        } else {
            currentTask.status = 'pending';
            
            // Si se pasa de completed a pending, restar dinero de la hucha
            if (previousStatus === 'completed' && currentTask.creator === 'super_usuario') {
                const superUserTasks = weekData.tasks.filter(t => t.creator === 'super_usuario');
                const eurosPerTask = CONFIG.POINTS_PER_EURO / superUserTasks.length;
                addMoneyToPiggyBank(-eurosPerTask);
            }
        }
    } else {
        // Maria solo puede cambiar sus tareas o marcar como "done" las del super_usuario
        if (currentTask.creator === 'maria') {
            // Sus propias tareas
            if (currentTask.status === 'pending') {
                currentTask.status = 'completed'; // Maria pasa directo a completed
            } else {
                currentTask.status = 'pending';
            }
        } else if (currentTask.creator === 'super_usuario') {
            // Tareas del super_usuario: puede marcar como "done" o volver a "pending"
            if (currentTask.status === 'pending') {
                currentTask.status = 'done';
            } else if (currentTask.status === 'done') {
                // Puede volver de amarillo (done) a naranja (pending)
                currentTask.status = 'pending';
            }
            // NO puede cambiar "completed" (solo Super_usuario puede)
        }
    }
    
    saveLocalDatabase();
    renderCalendar();
}

function deleteTask(task, weekKey) {
    if (!confirm('¿Seguro que quieres eliminar esta tarea?')) return;
    
    const weekData = tasksDatabase[weekKey];
    weekData.tasks = weekData.tasks.filter(t => t.id !== task.id);
    
    saveLocalDatabase();
    renderCalendar();
}

// ==================== BONIFICACIONES ====================
function addBonus() {
    const weekKey = getWeekKey(currentWeekStart);
    const weekData = tasksDatabase[weekKey] || { tasks: [], bonus: 0 };
    
    const superUserTasks = weekData.tasks.filter(t => t.creator === 'super_usuario');
    const allCompleted = superUserTasks.length > 0 && 
                        superUserTasks.every(t => t.status === 'completed');
    
    if (!allCompleted) {
        alert('⚠️ No se puede otorgar bonificación. Aún hay tareas pendientes o sin completar.');
        return;
    }
    
    // Solicitar el monto de la bonificación
    const bonusAmountStr = prompt('¿Cuántos euros de bonificación quieres añadir?', '2');
    
    if (bonusAmountStr === null) {
        // Usuario canceló el prompt
        return;
    }
    
    const bonusAmount = parseFloat(bonusAmountStr);
    
    if (isNaN(bonusAmount) || bonusAmount <= 0) {
        alert('Por favor, introduce un número válido mayor que 0');
        return;
    }
    
    weekData.bonus = (weekData.bonus || 0) + bonusAmount;
    tasksDatabase[weekKey] = weekData;
    
    // Añadir bonus a la hucha
    addMoneyToPiggyBank(bonusAmount);
    
    saveLocalDatabase();
    renderCalendar();
    
    alert(`✅ ¡Bonificación de ${bonusAmount.toFixed(2)}€ otorgada y añadida a la hucha!`);
}

function removeBonus() {
    if (!confirm('¿Seguro que quieres quitar la bonificación de esta semana?')) return;
    
    const weekKey = getWeekKey(currentWeekStart);
    const weekData = tasksDatabase[weekKey] || { tasks: [], bonus: 0 };
    
    const previousBonus = weekData.bonus;
    weekData.bonus = 0;
    tasksDatabase[weekKey] = weekData;
    
    // Restar bonus de la hucha
    if (previousBonus > 0) {
        addMoneyToPiggyBank(-previousBonus);
    }
    
    saveLocalDatabase();
    renderCalendar();
    
    alert('✅ Bonificación eliminada y restada de la hucha');
}

function clearWeek() {
    if (!confirm('¿SEGURO que quieres eliminar TODAS las tareas de esta semana? Esta acción no se puede deshacer.')) return;
    
    const weekKey = getWeekKey(currentWeekStart);
    delete tasksDatabase[weekKey];
    
    saveLocalDatabase();
    renderCalendar();
    
    alert('✅ Semana limpiada');
}

// ==================== CERRAR MODAL AL HACER CLICK FUERA ====================
window.onclick = function(event) {
    const modal = document.getElementById('taskModal');
    if (event.target === modal) {
        closeModal();
    }
};

// ==================== SISTEMA DE HUCHA ====================
function loadPiggyBank() {
    const stored = localStorage.getItem('piggyBank');
    if (stored) {
        piggyBank = parseFloat(stored);
    } else {
        piggyBank = 0;
    }
    updatePiggyBankDisplay();
}

function savePiggyBank() {
    localStorage.setItem('piggyBank', piggyBank.toString());
    // Guardar también en Drive si está disponible
    if (typeof savePiggyBankToDrive === 'function') {
        piggyBankBalance = piggyBank; // Sincronizar variable global
        savePiggyBankToDrive();
    }
    updatePiggyBankDisplay();
}

function updatePiggyBankDisplay() {
    const display = document.getElementById('piggyBankAmount');
    if (display) {
        display.textContent = `${piggyBank.toFixed(2)}€`;
    }
}

function addMoneyToPiggyBank(amount) {
    piggyBank += amount;
    savePiggyBank();
}

function giveMoneyFromPiggyBank() {
    if (currentUser !== 'super_usuario') return;
    
    const amount = prompt(`💰 La hucha tiene ${piggyBank.toFixed(2)}€\n\n¿Cuánto dinero quieres dar a Maria?\n(Se restará de la hucha)`);
    
    if (amount === null) return; // Cancelado
    
    const euros = parseFloat(amount);
    
    if (isNaN(euros) || euros <= 0) {
        alert('⚠️ Por favor, introduce una cantidad válida mayor que 0');
        return;
    }
    
    if (euros > piggyBank) {
        alert(`⚠️ No hay suficiente dinero en la hucha.\nDisponible: ${piggyBank.toFixed(2)}€`);
        return;
    }
    
    if (confirm(`¿Seguro que quieres dar ${euros.toFixed(2)}€ a Maria?\n\nSe restará de la hucha.`)) {
        piggyBank -= euros;
        savePiggyBank();
        alert(`✅ Has dado ${euros.toFixed(2)}€ a Maria\n\n💰 Queda en la hucha: ${piggyBank.toFixed(2)}€`);
    }
}

function editPiggyBankAmount() {
    if (currentUser !== 'super_usuario') return;
    
    const newAmount = prompt(`✏️ Editar cantidad de la hucha\n\nActual: ${piggyBank.toFixed(2)}€\n\n¿Cuánto dinero quieres que tenga la hucha?`);
    
    if (newAmount === null) return; // Cancelado
    
    const euros = parseFloat(newAmount);
    
    if (isNaN(euros) || euros < 0) {
        alert('⚠️ Por favor, introduce una cantidad válida (0 o mayor)');
        return;
    }
    
    if (confirm(`¿Seguro que quieres cambiar la hucha de ${piggyBank.toFixed(2)}€ a ${euros.toFixed(2)}€?`)) {
        piggyBank = euros;
        savePiggyBank();
        alert(`✅ Hucha actualizada: ${piggyBank.toFixed(2)}€`);
    }
}

// ==================== RELLENAR SEMANA AUTOMÁTICAMENTE ====================
function fillWeekAutomatically() {
    if (currentUser !== 'super_usuario') return;
    
    if (!confirm('¿Quieres rellenar la semana con las tareas por defecto?\n\n⚠️ NO se borrarán las tareas existentes, solo se añadirán las que falten.')) {
        return;
    }
    
    const weekKey = getWeekKey(currentWeekStart);
    
    if (!tasksDatabase[weekKey]) {
        tasksDatabase[weekKey] = { tasks: [], bonus: 0 };
    }
    
    let addedCount = 0;
    
    // Función auxiliar para verificar si una tarea ya existe
    function taskExists(day, title) {
        return tasksDatabase[weekKey].tasks.some(task => 
            task.day === day && task.title === title
        );
    }
    
    // Añadir tareas diarias (Lunes a Domingo)
    for (let day = 0; day < 7; day++) {
        DEFAULT_TASKS.daily.forEach(task => {
            if (!taskExists(day, task.title)) {
                tasksDatabase[weekKey].tasks.push({
                    id: Date.now() + addedCount,
                    title: task.title,
                    description: task.description,
                    day: day,
                    status: 'pending',
                    creator: 'super_usuario',
                    createdAt: new Date().toISOString()
                });
                addedCount++;
            }
        });
    }
    
    // Añadir tareas de lunes a viernes (días 0-4)
    for (let day = 0; day < 5; day++) {
        DEFAULT_TASKS.weekdays.forEach(task => {
            if (!taskExists(day, task.title)) {
                tasksDatabase[weekKey].tasks.push({
                    id: Date.now() + addedCount,
                    title: task.title,
                    description: task.description,
                    day: day,
                    status: 'pending',
                    creator: 'super_usuario',
                    createdAt: new Date().toISOString()
                });
                addedCount++;
            }
        });
    }
    
    // Añadir tarea del sábado (día 5)
    DEFAULT_TASKS.saturday.forEach(task => {
        if (!taskExists(5, task.title)) {
            tasksDatabase[weekKey].tasks.push({
                id: Date.now() + addedCount,
                title: task.title,
                description: task.description,
                day: 5,
                status: 'pending',
                creator: 'super_usuario',
                createdAt: new Date().toISOString()
            });
            addedCount++;
        }
    });
    
    saveLocalDatabase();
    renderCalendar();
    
    if (addedCount > 0) {
        alert(`✅ Se han añadido ${addedCount} tareas a la semana`);
    } else {
        alert('ℹ️ Todas las tareas por defecto ya estaban en la semana');
    }
}
