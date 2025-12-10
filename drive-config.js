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
    signedIn: false,
    passwordFileId: null,
    databaseFileId: null,
    piggybankFileId: null,
    tokenClient: null,
    accessToken: null,
    tokenObtainedAt: 0,
    accountHint: 'ismaelfernandezsaez2@gmail.com'
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

// Eliminado soporte de GAPI: usaremos solo GIS + fetch

// Preparar Drive en segundo plano
async function prepareDrive() {
    try {
        await waitForGIS();
        
        if (!driveState.tokenClient) {
            driveState.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CONFIG.CLIENT_ID,
                scope: GOOGLE_CONFIG.SCOPES,
                callback: '',
                use_fedcm_for_prompt: true
            });
        }
        console.log('Drive preparado correctamente');
    } catch (e) {
        console.error('Error preparando Drive:', e);
    }
}

// Iniciar sesión (muestra popup)
async function driveSignIn() {
    // Si no está listo, intentar preparar ahora
    if (!driveState.tokenClient) {
        try {
            await prepareDrive();
        } catch (e) {
            console.error('Error preparando Drive:', e);
        }
    }
    
    // Si aún no está listo, crear directamente
    if (!driveState.tokenClient) {
        try {
            await waitForGIS();
            driveState.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CONFIG.CLIENT_ID,
                scope: GOOGLE_CONFIG.SCOPES,
                callback: '',
                use_fedcm_for_prompt: true
            });
        } catch (e) {
            return Promise.reject(new Error('No se pudo inicializar Google Drive: ' + e.message));
        }
    }

    // Si ya tenemos un token reciente, reutilizarlo sin pedir uno nuevo
    const now = Date.now();
    const tokenIsFresh = driveState.accessToken && (now - driveState.tokenObtainedAt) < (50 * 60 * 1000); // ~50 min
    if (tokenIsFresh) {
        driveState.signedIn = true;
        console.log('Reutilizando token de Drive (silencioso)');
        try {
            await loadAllFromDrive();
        } catch (e) {
            console.warn('Fallo al cargar con token reutilizado, se solicitará nuevo token:', e);
        }
        return true;
    }
    
    return new Promise((resolve, reject) => {
        driveState.tokenClient.callback = async (resp) => {
            try {
                if (resp && resp.access_token) {
                    driveState.accessToken = resp.access_token;
                    driveState.tokenObtainedAt = Date.now();
                    driveState.signedIn = true;
                    try { localStorage.setItem('driveConsentGiven', 'true'); } catch {}
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
            // Solicitar token (primer uso: consent; luego silencioso)
            let prompt = '';
            try {
                const hasConsent = localStorage.getItem('driveConsentGiven') === 'true';
                prompt = hasConsent ? '' : 'consent';
            } catch { prompt = 'consent'; }
            const params = { prompt };
            if (driveState.accountHint) params.hint = driveState.accountHint;
            driveState.tokenClient.requestAccessToken(params);
        } catch (e) {
            reject(e);
        }
    });
}

// Intento silencioso al cargar la página si ya se dio consentimiento
async function driveTrySilentSignIn() {
    try {
        await waitForGIS();
        if (!driveState.tokenClient) {
            driveState.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CONFIG.CLIENT_ID,
                scope: GOOGLE_CONFIG.SCOPES,
                callback: '',
                use_fedcm_for_prompt: true
            });
        }
        return await new Promise((resolve) => {
            driveState.tokenClient.callback = async (resp) => {
                if (resp && resp.access_token) {
                    driveState.accessToken = resp.access_token;
                    driveState.tokenObtainedAt = Date.now();
                    driveState.signedIn = true;
                    try { await loadAllFromDrive(); } catch {}
                    resolve(true);
                } else {
                    resolve(false);
                }
            };
            try {
                const hasConsent = localStorage.getItem('driveConsentGiven') === 'true';
                if (!hasConsent) return resolve(false);
                const params = { prompt: 'none' };
                if (driveState.accountHint) params.hint = driveState.accountHint;
                driveState.tokenClient.requestAccessToken(params);
            } catch (e) {
                resolve(false);
            }
        });
    } catch {
        return false;
    }
}

// Buscar o crear archivo en Drive
async function findOrCreateFile(fileName, mimeType, content = '') {
    try {
        // Buscar archivo existente (REST)
        const listResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='"+fileName+"' and '"+GOOGLE_CONFIG.FOLDER_ID+"' in parents and trashed=false")}&fields=files(id,name)&spaces=drive`, {
            headers: { Authorization: `Bearer ${driveState.accessToken}` }
        });
        const listJson = await listResp.json();
        if (listJson.files && listJson.files.length > 0) {
            return listJson.files[0].id;
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
            headers: new Headers({ 'Authorization': 'Bearer ' + driveState.accessToken }),
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
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${driveState.accessToken}` }
        });
        return await response.text();
    } catch (error) {
        console.error('Error leyendo archivo:', error);
        throw error;
    }
}

// Actualizar contenido de archivo
async function updateFile(fileId, content, mimeType) {
    try {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${driveState.accessToken}`,
                'Content-Type': mimeType
            },
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
        tasksDatabase = JSON.parse(dbContent || '{}');
        localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
        
        // Hucha
        driveState.piggybankFileId = await findOrCreateFile(GOOGLE_CONFIG.PIGGYBANK_FILE, 'application/json', '0');
        const piggyContent = await readFile(driveState.piggybankFileId);
        piggyBankBalance = parseFloat(piggyContent || '0');
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
        localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
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
        localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
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
    // Cargar gapi primero y luego GIS, como en PROGRAMA_WEB_ISMAEL
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = () => {
        console.log('GAPI script cargado');
        const gsiScript = document.createElement('script');
        gsiScript.src = 'https://accounts.google.com/gsi/client';
        gsiScript.onload = () => {
            console.log('GSI script cargado');
            setTimeout(() => {
                prepareDrive().then(() => {
                    console.log('Drive listo para usar');
                    // Intentar conexión silenciosa
                    driveTrySilentSignIn().then((ok) => {
                        if (ok) {
                            console.log('Conectado a Drive en silencio');
                        } else {
                            // Sin consentimiento previo: abrir popup automáticamente
                            try {
                                const hasConsent = localStorage.getItem('driveConsentGiven') === 'true';
                                if (!hasConsent) driveSignIn().catch(()=>{});
                            } catch {}
                        }
                    });
                }).catch(err => {
                    console.log('Drive no disponible:', err);
                });
            }, 300);
        };
        document.head.appendChild(gsiScript);
    };
    document.head.appendChild(gapiScript);
});
