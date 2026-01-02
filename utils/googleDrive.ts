import type { GoogleFile } from '../types';

// Declare gapi and google on the window object to resolve TypeScript errors.
declare global {
    interface Window {
        gapi: any;
        google: any;
    }
}

// Hardcode the API Key and Client ID directly into the application.
// This is the most reliable method for the current deployment platform.
const API_KEY = "AIzaSyBiJQ81BmeHY_ILhbEWwGKX3XvdCDWekFk";
const CLIENT_ID = "274384850395-g8lrb97175q9co2ia4e6c0rf6o3ucjcd.apps.googleusercontent.com";


const SCOPES = 'https://www.googleapis.com/auth/drive.file profile email';
const APP_FOLDER_NAME = 'YangyuDashboardBackups';
const BACKUP_FILE_PREFIX = 'yangyu_dashboard_backup_';

let gapi: any;
let google: any;
let tokenClient: any;
let appFolderId: string | null = null;

export const areGoogleServicesConfigured = (): boolean => {
    // Check if the keys are present and not empty.
    return !!API_KEY && !!CLIENT_ID;
};

export const loadGapiAndGis = (): Promise<{ gapi: any; google: any }> => {
    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (window.gapi && window.google) {
                clearInterval(checkInterval);
                gapi = window.gapi;
                google = window.google;
                resolve({ gapi, google });
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error("Failed to load Google API scripts."));
        }, 10000);
    });
};

export const initGapiClient = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!API_KEY) {
            return reject(new Error("Google API Key is not configured."));
        }
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
};

export const initGisClient = (onAuthChange: (isSignedIn: boolean) => void): Promise<void> => {
     return new Promise((resolve, reject) => {
        if (!CLIENT_ID) {
            return reject(new Error("Google Client ID is not configured."));
        }
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse: any) => {
                if (tokenResponse.error) {
                  console.error('GIS Token Error:', tokenResponse);
                  onAuthChange(false);
                  return;
                }
                gapi.client.setToken(tokenResponse);
                onAuthChange(true);
            },
        });
        resolve();
    });
};

export const handleSignIn = () => {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
};

export const handleSignOut = (onAuthChange: (isSignedIn: boolean) => void) => {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(null);
            appFolderId = null; // Reset cached folder ID
            onAuthChange(false);
        });
    } else {
        appFolderId = null;
        onAuthChange(false);
    }
};

export const getAppFolderId = async (): Promise<string> => {
    if (appFolderId) return appFolderId;

    const response = await gapi.client.drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${APP_FOLDER_NAME}' and trashed=false`,
        fields: 'files(id, name)',
    });

    if (response.result.files && response.result.files.length > 0) {
        appFolderId = response.result.files[0].id;
        return appFolderId!;
    } else {
        const fileMetadata = {
            name: APP_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
        };
        const createResponse = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id',
        });
        appFolderId = createResponse.result.id;
        return appFolderId!;
    }
};

export const listBackupFiles = async (): Promise<GoogleFile[]> => {
    const folderId = await getAppFolderId();
    const response = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and name contains '${BACKUP_FILE_PREFIX}' and trashed=false`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 20,
    });
    return response.result.files;
};


export const getBackupFileContent = async (fileId: string): Promise<string> => {
    const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
    });
    return response.body;
};


export const uploadBackupFile = async (content: string): Promise<void> => {
    const folderId = await getAppFolderId();
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
    const fileName = `${BACKUP_FILE_PREFIX}${formattedDate}.json`;

    const metadata = {
        name: fileName,
        mimeType: 'application/json',
        parents: [folderId],
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        close_delim;
    
    await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartRequestBody,
    });
};