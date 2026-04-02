/**
 * Google Drive Service for Methmetica (Serverless)
 */

const CLIENT_ID = '139958721937-dlb3a6j0m5rcenpia9ctdtuhsqbmp4lr.apps.googleusercontent.com';
const API_KEY = 'AIzaSyD4tWbKvE3BuIjYpcKuEIJUWbBRRldxpps';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const WORKFLOW_APP_TYPE = 'methmetica-workflow';
const WORKFLOW_APP_VERSION = '0.7.1';

let tokenClient: any = null;

export type GoogleUser = {
  name: string;
  email: string;
  picture: string;
  accessToken: string;
};

export type WorkflowFile = {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  appProperties?: Record<string, string>;
};

// Initialize GAPI
export async function initGapi() {
  return new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      (window as any).gapi.load('client', async () => {
        await (window as any).gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        });
        resolve();
      });
    };
    document.body.appendChild(script);
  });
}

// Initialize GIS (Google Identity Services)
export async function initGis(loginHint?: string) {
  return new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined at request time
        ...(loginHint ? { login_hint: loginHint } : {}),
      });
      resolve();
    };
    document.body.appendChild(script);
  });
}

// Request Access Token
export async function authenticate(silent = false) {
  return new Promise<string>((resolve, reject) => {
    try {
      tokenClient.callback = async (resp: any) => {
        if (resp.error !== undefined) {
          reject(resp);
        }
        resolve(resp.access_token);
      };

      if (silent) {
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        if ((window as any).gapi.client.getToken() === null) {
          tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          tokenClient.requestAccessToken({ prompt: '' });
        }
      }
    } catch (err) {
      reject(err);
    }
  });
}

// Request Access Token Silently (no popup, fails gracefully)
export async function trySilentAuth(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!tokenClient) { resolve(null); return; }
    try {
      tokenClient.callback = (resp: any) => {
        if (resp.error !== undefined) {
          resolve(null); // Fail gracefully, no popup
        } else {
          resolve(resp.access_token);
        }
      };
      // prompt: 'none' = never show any UI; if no valid session, just return error
      tokenClient.requestAccessToken({ prompt: 'none' });
    } catch {
      resolve(null);
    }
  });
}

// List Workflow Files (JSONs created by this app)
export async function listWorkflows(): Promise<WorkflowFile[]> {
  const response = await (window as any).gapi.client.drive.files.list({
    pageSize: 20,
    fields: 'nextPageToken, files(id, name, modifiedTime, size, appProperties)',
    q: [
      "mimeType = 'application/json'",
      "trashed = false",
      `appProperties has { key='type' and value='${WORKFLOW_APP_TYPE}' }`,
    ].join(' and '),
    orderBy: 'modifiedTime desc'
  });
  return response.result.files || [];
}

// Create or Update a Workflow File
export async function saveWorkflow(name: string, data: any, fileId?: string): Promise<string> {
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const metadata = {
    name: name.endsWith('.json') ? name : `${name}.json`,
    mimeType: 'application/json',
    appProperties: {
      type: WORKFLOW_APP_TYPE,
      version: WORKFLOW_APP_VERSION
    }
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(data) +
    close_delim;

  let request;
  if (fileId) {
    // Update existing file
    request = (window as any).gapi.client.request({
      path: `/upload/drive/v3/files/${fileId}`,
      method: 'PATCH',
      params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: multipartRequestBody,
    });
  } else {
    // Create new file
    request = (window as any).gapi.client.request({
      path: '/upload/drive/v3/files',
      method: 'POST',
      params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: multipartRequestBody,
    });
  }

  const response = await request;
  return response.result.id;
}

// Load Workflow Content
export async function loadWorkflow(fileId: string): Promise<any> {
    const response = await (window as any).gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });
    return response.result;
}

// Delete Workflow File
export async function deleteWorkflow(fileId: string) {
    await (window as any).gapi.client.drive.files.delete({
        fileId: fileId
    });
}
