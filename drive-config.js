// Configuración Google Drive con GIS (Google Identity Services)
const GOOGLE_CONFIG = {
    CLIENT_ID: '375166697768-8rlhv12c3vuppu2m1tlk55kqdctatft5.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/drive.file',
    FOLDER_ID: '1e5ebZ1haq0AFua98XBSe9lmUfOwjyHLT',
    PASSWORD_FILE: 'maria_password.txt',
    DATABASE_FILE: 'tasks_database.json',
    PIGGYBANK_FILE: 'piggy_bank.json'
};

const driveState = {
    gapiLoaded: false,
    gisLoaded: false,
    clientInitialized: false,
    signedIn: false,
    passwordFileId: null,
    databaseFileId: null,
    piggybankFileId: null,
    tokenClient: null
};

// Esperar a que GIS se cargue
async function waitForGIS(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        (function loop() {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                return resolve(true);
            }
            if (Date.now() - start > timeoutMs) {
                return reject(new Error('GIS no cargó'));
            }
            setTimeout(loop, 100);
        })();
    });
}

// Esperar a que GAPI se cargue
async function waitForGAPI(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        (function loop() {
            if (window.gapi && window.gapi.load) {
                return resolve(true);
            }
            if (Date.now() - start > timeoutMs) {
                return reject(new Error('GAPI no cargó'));
            }
            setTimeout(loop, 100);
        })();
    });
}

// Inicializar cliente de Google API
async function initGapiClient() {
    if (driveState.clientInitialized) return true;
    
    await waitForGAPI();
    
    return new Promise((resolve, reject) => {
        window.gapi.load('client', async () => {
            try {
                await window.gapi.client.init({
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                });
                driveState.clientInitialized = true;
                console.log('GAPI client inicializado');
                resolve(true);
            } catch (e) {
                console.error('Error init gapi client', e);
                reject(e);
            }
        });
    });
}

// Preparar Drive en segundo plano
async function prepareDrive() {
    try {
        await initGapiClient();
        await waitForGIS();
        
        if (!driveState.tokenClient) {
            driveState.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CONFIG.CLIENT_ID,
                scope: GOOGLE_CONFIG.SCOPES,
                callback: '',
            });
        }
        console.log('Drive preparado correctamente');
    } catch (e) {
        console.error('Error preparando Drive:', e);
    }
}

// Iniciar sesión (muestra popup)
function driveSignIn() {
    if (!driveState.tokenClient) {
        alert('Cargando Google Drive... espera un momento y vuelve a intentarlo');
        return Promise.reject(new Error('Token client no listo'));
    }
    
    return new Promise((resolve, reject) => {
        driveState.tokenClient.callback = async (resp) => {
            try {
                if (resp && resp.access_token) {
                    await initGapiClient();
                    window.gapi.client.setToken({ access_token: resp.access_token });
                    driveState.signedIn = true;
                    console.log('Sesión iniciada en Drive');
                    
                    // Cargar datos desde Drive
                    await loadAllFromDrive();
                    
                    resolve(true);
                } else {
                    reject(new Error('No se obtuvo access_token'));
                }
            } catch (e) {
                reject(e);
            }
        };
        
        try {
            driveState.tokenClient.requestAccessToken({ prompt: 'consent' });
        } catch (e) {
            reject(e);
        }
    });
}

// Buscar o crear archivo en Drive
async function findOrCreateFile(fileName, mimeType, content = '') {
    try {
        // Buscar archivo existente
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='${fileName}' and '${GOOGLE_CONFIG.FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            return searchResponse.result.files[0].id;
        }
        
        // Crear nuevo archivo
        const fileMetadata = {
            name: fileName,
            mimeType: mimeType,
            parents: [GOOGLE_CONFIG.FOLDER_ID]
        };
        
        const file = new Blob([content], { type: mimeType });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
        form.append('file', file);
        
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }),
            body: form
        });
        
        const result = await response.json();
        return result.id;
    } catch (error) {
        console.error('Error con archivo en Drive:', error);
        throw error;
    }
}

// Leer contenido de archivo
async function readFile(fileId) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        return response.body;
    } catch (error) {
        console.error('Error leyendo archivo:', error);
        throw error;
    }
}

// Actualizar contenido de archivo
async function updateFile(fileId, content, mimeType) {
    try {
        await gapi.client.request({
            path: `/upload/drive/v3/files/${fileId}`,
            method: 'PATCH',
            params: { uploadType: 'media' },
            headers: { 'Content-Type': mimeType },
            body: content
        });
    } catch (error) {
        console.error('Error actualizando archivo:', error);
        throw error;
    }
}

// Cargar todos los datos desde Drive
async function loadAllFromDrive() {
    if (!driveState.signedIn) return;
    
    try {
        // Contraseña
        driveState.passwordFileId = await findOrCreateFile(GOOGLE_CONFIG.PASSWORD_FILE, 'text/plain', 'maria');
        const password = await readFile(driveState.passwordFileId);
        mariaPassword = password.trim();
        localStorage.setItem('mariaPassword', mariaPassword);
        
        // Base de datos
        driveState.databaseFileId = await findOrCreateFile(GOOGLE_CONFIG.DATABASE_FILE, 'application/json', '{}');
        const dbContent = await readFile(driveState.databaseFileId);
        tasksDatabase = JSON.parse(dbContent);
        localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
        
        // Hucha
        driveState.piggybankFileId = await findOrCreateFile(GOOGLE_CONFIG.PIGGYBANK_FILE, 'application/json', '0');
        const piggyContent = await readFile(driveState.piggybankFileId);
        piggyBankBalance = parseFloat(piggyContent);
        localStorage.setItem('piggyBankBalance', piggyBankBalance.toString());
        
        console.log('Datos cargados desde Drive');
        updatePiggyBankDisplay();
        renderCalendar();
    } catch (error) {
        console.error('Error cargando datos desde Drive:', error);
    }
}

// Guardar contraseña en Drive
async function savePasswordToDriveReal(password) {
    if (!driveState.signedIn) {
        localStorage.setItem('mariaPassword', password);
        return;
    }
    
    try {
        if (!driveState.passwordFileId) {
            driveState.passwordFileId = await findOrCreateFile(GOOGLE_CONFIG.PASSWORD_FILE, 'text/plain', password);
        } else {
            await updateFile(driveState.passwordFileId, password, 'text/plain');
        }
        localStorage.setItem('mariaPassword', password);
        console.log('Contraseña guardada en Drive');
    } catch (error) {
        console.error('Error guardando contraseña:', error);
        localStorage.setItem('mariaPassword', password);
    }
}

// Guardar base de datos en Drive
async function saveDatabaseToDriveReal() {
    if (!driveState.signedIn) {
        saveLocalDatabase();
        return;
    }
    
    try {
        const content = JSON.stringify(tasksDatabase, null, 2);
        
        if (!driveState.databaseFileId) {
            driveState.databaseFileId = await findOrCreateFile(GOOGLE_CONFIG.DATABASE_FILE, 'application/json', content);
        } else {
            await updateFile(driveState.databaseFileId, content, 'application/json');
        }
        localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
        console.log('Base de datos guardada en Drive');
    } catch (error) {
        console.error('Error guardando base de datos:', error);
        saveLocalDatabase();
    }
}

// Guardar hucha en Drive
async function savePiggyBankToDrive() {
    if (!driveState.signedIn) {
        localStorage.setItem('piggyBankBalance', piggyBankBalance.toString());
        return;
    }
    
    try {
        const content = piggyBankBalance.toString();
        
        if (!driveState.piggybankFileId) {
            driveState.piggybankFileId = await findOrCreateFile(GOOGLE_CONFIG.PIGGYBANK_FILE, 'application/json', content);
        } else {
            await updateFile(driveState.piggybankFileId, content, 'application/json');
        }
        localStorage.setItem('piggyBankBalance', piggyBankBalance.toString());
        console.log('Hucha guardada en Drive');
    } catch (error) {
        console.error('Error guardando hucha:', error);
        localStorage.setItem('piggyBankBalance', piggyBankBalance.toString());
    }
}

// Inicializar Drive automáticamente al cargar
window.addEventListener('load', () => {
    prepareDrive();
});
