// ==================== CONFIGURACIÓN DE GOOGLE DRIVE ====================
// Este archivo contiene las credenciales para conectar con Google Drive
// INSTRUCCIONES: Completa estos valores con tus credenciales de Google Cloud

const GOOGLE_CONFIG = {
    // Tu Client ID de Google Cloud Console
    // Ejemplo: '123456789-abc123.apps.googleusercontent.com'
    CLIENT_ID: '375166697768-8rlhv12c3vuppu2m1tlk55kqdctatft5.apps.googleusercontent.com',
    
    // Tu API Key de Google Cloud Console
    API_KEY: 'AIzaSyC1pl_XhhbES5JRy-mBWQVKLUbLVmJOUxQ',
    
    // No modificar estos valores
    DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    SCOPES: 'https://www.googleapis.com/auth/drive.file'
};

// ==================== FUNCIONES DE INICIALIZACIÓN ====================

function initGoogleDriveAPI() {
    gapi.load('client:auth2', initClient);
}

function initClient() {
    gapi.client.init({
        apiKey: GOOGLE_CONFIG.API_KEY,
        clientId: GOOGLE_CONFIG.CLIENT_ID,
        discoveryDocs: GOOGLE_CONFIG.DISCOVERY_DOCS,
        scope: GOOGLE_CONFIG.SCOPES
    }).then(() => {
        console.log('Google Drive API inicializada correctamente');
        gapiInited = true;
        
        // Escuchar cambios en el estado de autenticación
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        
        // Manejar el estado inicial de inicio de sesión
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
    }).catch((error) => {
        console.error('Error al inicializar Google Drive API:', error);
        alert('Error al conectar con Google Drive. Usando modo local.');
    });
}

function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        console.log('Usuario autenticado en Google Drive');
    } else {
        // Iniciar sesión automáticamente
        gapi.auth2.getAuthInstance().signIn();
    }
}

// ==================== FUNCIONES DE DRIVE COMPLETAS ====================

async function loadPasswordFromDriveReal() {
    if (!gapiInited) {
        console.log('Drive API no iniciada, usando localStorage');
        return loadPasswordFromLocalStorage();
    }
    
    try {
        // Buscar archivo de contraseña
        const response = await gapi.client.drive.files.list({
            q: `name='${CONFIG.PASSWORD_FILE_NAME}' and '${CONFIG.DRIVE_FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });
        
        if (response.result.files && response.result.files.length > 0) {
            const fileId = response.result.files[0].id;
            
            // Descargar contenido del archivo
            const fileContent = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            
            const password = fileContent.body.trim();
            console.log('Contraseña cargada desde Drive');
            
            // Guardar también en localStorage como backup
            localStorage.setItem('mariaPassword', password);
            
            return password;
        } else {
            console.log('Archivo de contraseña no encontrado en Drive, creando uno nuevo...');
            
            // Crear archivo con contraseña por defecto
            const defaultPassword = 'maria';
            await savePasswordToDriveReal(defaultPassword);
            return defaultPassword;
        }
    } catch (error) {
        console.error('Error al cargar contraseña desde Drive:', error);
        console.log('Usando contraseña de localStorage');
        return loadPasswordFromLocalStorage();
    }
}

async function savePasswordToDriveReal(password) {
    if (!gapiInited) {
        console.log('Drive API no iniciada, usando localStorage');
        localStorage.setItem('mariaPassword', password);
        return;
    }
    
    try {
        const fileMetadata = {
            name: CONFIG.PASSWORD_FILE_NAME,
            mimeType: 'text/plain',
            parents: [CONFIG.DRIVE_FOLDER_ID]
        };
        
        const media = {
            mimeType: 'text/plain',
            body: password
        };
        
        // Buscar si ya existe el archivo
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='${CONFIG.PASSWORD_FILE_NAME}' and '${CONFIG.DRIVE_FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id)',
            spaces: 'drive'
        });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            // Actualizar archivo existente
            const fileId = searchResponse.result.files[0].id;
            
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: password
            });
            
            console.log('Contraseña actualizada en Drive');
        } else {
            // Crear nuevo archivo
            const file = new Blob([password], { type: 'text/plain' });
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
            form.append('file', file);
            
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token }),
                body: form
            });
            
            console.log('Contraseña creada en Drive');
        }
        
        // Guardar también en localStorage
        localStorage.setItem('mariaPassword', password);
        
    } catch (error) {
        console.error('Error al guardar contraseña en Drive:', error);
        localStorage.setItem('mariaPassword', password);
    }
}

async function loadDatabaseFromDriveReal() {
    if (!gapiInited) {
        console.log('Drive API no iniciada, usando localStorage');
        loadLocalDatabase();
        return;
    }
    
    try {
        // Buscar archivo de base de datos
        const response = await gapi.client.drive.files.list({
            q: `name='${CONFIG.DATABASE_FILE_NAME}' and '${CONFIG.DRIVE_FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });
        
        if (response.result.files && response.result.files.length > 0) {
            const fileId = response.result.files[0].id;
            
            // Descargar contenido del archivo
            const fileContent = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            
            tasksDatabase = JSON.parse(fileContent.body);
            console.log('Base de datos cargada desde Drive');
            
            // Guardar también en localStorage como backup
            localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
        } else {
            console.log('Base de datos no encontrada en Drive, iniciando nueva');
            tasksDatabase = {};
            await saveDatabaseToDriveReal();
        }
    } catch (error) {
        console.error('Error al cargar base de datos desde Drive:', error);
        console.log('Usando base de datos de localStorage');
        loadLocalDatabase();
    }
}

async function saveDatabaseToDriveReal() {
    if (!gapiInited) {
        console.log('Drive API no iniciada, usando localStorage');
        saveLocalDatabase();
        return;
    }
    
    try {
        const content = JSON.stringify(tasksDatabase, null, 2);
        
        const fileMetadata = {
            name: CONFIG.DATABASE_FILE_NAME,
            mimeType: 'application/json',
            parents: [CONFIG.DRIVE_FOLDER_ID]
        };
        
        // Buscar si ya existe el archivo
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='${CONFIG.DATABASE_FILE_NAME}' and '${CONFIG.DRIVE_FOLDER_ID}' in parents and trashed=false`,
            fields: 'files(id)',
            spaces: 'drive'
        });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            // Actualizar archivo existente
            const fileId = searchResponse.result.files[0].id;
            
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                headers: { 'Content-Type': 'application/json' },
                body: content
            });
            
            console.log('Base de datos actualizada en Drive');
        } else {
            // Crear nuevo archivo
            const file = new Blob([content], { type: 'application/json' });
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
            form.append('file', file);
            
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token }),
                body: form
            });
            
            console.log('Base de datos creada en Drive');
        }
        
        // Guardar también en localStorage
        localStorage.setItem('tasksDatabase', JSON.stringify(tasksDatabase));
        
    } catch (error) {
        console.error('Error al guardar base de datos en Drive:', error);
        saveLocalDatabase();
    }
}

// ==================== INSTRUCCIONES DE USO ====================
/*
PARA ACTIVAR GOOGLE DRIVE:

1. Descomenta las siguientes líneas en index.html (antes de app.js):
   <script src="drive-config.js"></script>

2. Reemplaza las credenciales en la parte superior de este archivo

3. En app.js, reemplaza las funciones simuladas por las reales:
   - loadPasswordFromDrive() -> loadPasswordFromDriveReal()
   - savePasswordToDrive() -> savePasswordToDriveReal()
   - loadDatabaseFromDrive() -> loadDatabaseFromDriveReal()
   - saveDatabaseToDrive() -> saveDatabaseToDriveReal()

4. En app.js, en la función loadGoogleAPI(), reemplaza:
   gapiInited = true;
   loadPasswordFromLocalStorage();
   
   Por:
   initGoogleDriveAPI();

5. Sube la aplicación a un servidor HTTPS (GitHub Pages, Netlify, etc.)
   Google OAuth NO funciona con file:// o http://

6. Asegúrate de que la URL del servidor esté en los "Orígenes autorizados"
   en Google Cloud Console
*/
