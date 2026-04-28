/**
 * Google Drive Service for Methmetica (Serverless)
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const WORKFLOW_APP_TYPE = 'methmetica-workflow';
const WORKFLOW_APP_VERSION = '0.7.1';
const DRIVE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
].join(',');

type TokenResponse = {
  access_token: string;
  error?: unknown;
};

type TokenClient = {
  callback: ((resp: TokenResponse) => void) | string;
  requestAccessToken: (options: { prompt: string }) => void;
};

type GapiRequestResult<T> = { result: T };
type GapiDriveFilesListResponse = { files?: WorkflowFile[] };
type GapiDriveFileIdResponse = { id: string };
type WorkflowDocument = { nodes?: AppNode[]; edges?: Edge[]; [key: string]: unknown };

type GapiClient = {
  init: (config: { apiKey: string; discoveryDocs: string[] }) => Promise<void>;
  getToken: () => { access_token?: string } | null;
  setToken?: (token: { access_token: string }) => void;
  request: (config: {
    path: string;
    method: 'PATCH' | 'POST';
    params: { uploadType: 'multipart' };
    headers: { 'Content-Type': string };
    body: string;
  }) => Promise<GapiRequestResult<GapiDriveFileIdResponse>>;
  drive: {
    files: {
      list: (config: {
        pageSize: number;
        fields: string;
        q: string;
        orderBy: string;
      }) => Promise<GapiRequestResult<GapiDriveFilesListResponse>>;
      get: (config: { fileId: string; alt: 'media' }) => Promise<GapiRequestResult<WorkflowDocument>>;
      delete: (config: { fileId: string }) => Promise<unknown>;
    };
  };
};

type GapiNamespace = {
  load: (name: 'client' | 'picker', callback: () => void | Promise<void>) => void;
  client: GapiClient;
};

type PickerDocument = {
  id?: string;
  name?: string;
  mimeType?: string;
  url?: string;
  thumbnails?: Array<{ url?: string }>;
};

type PickerData = {
  action?: string;
  docs?: PickerDocument[];
};

type PickerBuilder = {
  setDeveloperKey: (key: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  addView: (view: unknown) => PickerBuilder;
  setCallback: (callback: (data: PickerData) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};

type PickerView = {
  setMimeTypes: (mimeTypes: string) => PickerView;
};

type GoogleAccountsNamespace = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: string;
      login_hint?: string;
    }) => TokenClient;
  };
};

declare global {
  interface Window {
    gapi: GapiNamespace;
    google: {
      accounts: GoogleAccountsNamespace;
      picker?: {
        Action: { PICKED: string; CANCEL: string };
        DocsView: new (viewId: string) => PickerView;
        PickerBuilder: new () => PickerBuilder;
        ViewId: { DOCS_IMAGES: string };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let currentAccessToken: string | null = null;
let gapiInitPromise: Promise<void> | null = null;
let gisInitPromise: Promise<void> | null = null;
let pickerInitPromise: Promise<void> | null = null;

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

export type DriveImageSelection = {
  id: string;
  name: string;
  mimeType: string;
  webViewUrl?: string;
  thumbnailUrl?: string;
};

const loadScriptOnce = (src: string, id: string) => new Promise<void>((resolve, reject) => {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === 'true') {
    resolve();
    return;
  }

  if (existing) {
    existing.addEventListener('load', () => resolve(), { once: true });
    existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    return;
  }

  const script = document.createElement('script');
  script.id = id;
  script.src = src;
  script.onload = () => {
    script.dataset.loaded = 'true';
    resolve();
  };
  script.onerror = () => reject(new Error(`Failed to load ${src}`));
  document.body.appendChild(script);
});

// Initialize GAPI
export async function initGapi() {
  if (!API_KEY) {
    throw new Error('VITE_GOOGLE_DRIVE_API_KEY is missing.');
  }

  if (!gapiInitPromise) {
    gapiInitPromise = loadScriptOnce('https://apis.google.com/js/api.js', 'google-api-js')
      .then(() => new Promise<void>((resolve) => {
      window.gapi.load('client', async () => {
        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        });
        resolve();
      });
    }));
  }

  return gapiInitPromise;
}

// Initialize GIS (Google Identity Services)
export async function initGis(loginHint?: string) {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_DRIVE_CLIENT_ID is missing.');
  }

  if (!gisInitPromise) {
    gisInitPromise = loadScriptOnce('https://accounts.google.com/gsi/client', 'google-identity-services-js')
      .then(() => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined at request time
        ...(loginHint ? { login_hint: loginHint } : {}),
      });
    });
  }

  return gisInitPromise;
}

export async function initPicker() {
  await initGapi();

  if (!pickerInitPromise) {
    pickerInitPromise = new Promise<void>((resolve) => {
      window.gapi.load('picker', () => resolve());
    });
  }

  return pickerInitPromise;
}

export async function ensureDriveReady(loginHint?: string) {
  await Promise.all([initGapi(), initGis(loginHint)]);
}

// Request Access Token
export async function authenticate(silent = false) {
  return new Promise<string>((resolve, reject) => {
    try {
      if (!tokenClient) {
        reject(new Error('Google Identity Services not initialized.'));
        return;
      }
      tokenClient.callback = async (resp: TokenResponse) => {
        if (resp.error !== undefined) {
          reject(resp);
          return;
        }
        currentAccessToken = resp.access_token;
        window.gapi.client.setToken?.({ access_token: resp.access_token });
        resolve(resp.access_token);
      };

      if (silent) {
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        if (window.gapi.client.getToken() === null) {
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
      tokenClient.callback = (resp: TokenResponse) => {
        if (resp.error !== undefined) {
          resolve(null); // Fail gracefully, no popup
        } else {
          currentAccessToken = resp.access_token;
          window.gapi.client.setToken?.({ access_token: resp.access_token });
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

export async function getAccessToken(options: { silent?: boolean } = {}): Promise<string> {
  const existing = currentAccessToken || window.gapi?.client?.getToken?.()?.access_token;
  if (existing) return existing;

  if (options.silent) {
    const token = await trySilentAuth();
    if (!token) {
      throw new Error('Reconnect Google Drive to preview this image.');
    }
    return token;
  }

  return authenticate(false);
}

export async function pickDriveImage(): Promise<DriveImageSelection | null> {
  await ensureDriveReady();
  await initPicker();

  const token = await getAccessToken();

  return new Promise((resolve, reject) => {
    const picker = window.google.picker;
    const developerKey = API_KEY;
    if (!picker) {
      reject(new Error('Google Picker failed to initialize.'));
      return;
    }
    if (!developerKey) {
      reject(new Error('VITE_GOOGLE_DRIVE_API_KEY is missing.'));
      return;
    }

    const imageView = new picker.DocsView(picker.ViewId.DOCS_IMAGES)
      .setMimeTypes(DRIVE_IMAGE_MIME_TYPES);

    new picker.PickerBuilder()
      .setDeveloperKey(developerKey)
      .setOAuthToken(token)
      .addView(imageView)
      .setCallback((data: PickerData) => {
        if (data.action === picker.Action.CANCEL) {
          resolve(null);
          return;
        }

        if (data.action !== picker.Action.PICKED) return;

        const doc = data.docs?.[0];
        if (!doc?.id) {
          reject(new Error('No image file was selected.'));
          return;
        }

        resolve({
          id: doc.id,
          name: doc.name || 'Google Drive image',
          mimeType: doc.mimeType || 'image/*',
          webViewUrl: doc.url,
          thumbnailUrl: doc.thumbnails?.[0]?.url,
        });
      })
      .build()
      .setVisible(true);
  });
}

export async function loadDriveImageObjectUrl(fileId: string, options: { silent?: boolean } = {}): Promise<{ url: string; mimeType: string }> {
  await ensureDriveReady();
  const token = await getAccessToken({ silent: options.silent ?? true });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Drive image (${response.status}).`);
  }

  const blob = await response.blob();
  return {
    url: URL.createObjectURL(blob),
    mimeType: blob.type || 'image/*',
  };
}

// List Workflow Files (JSONs created by this app)
export async function listWorkflows(): Promise<WorkflowFile[]> {
  const response = await window.gapi.client.drive.files.list({
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

export async function saveWorkflow(name: string, data: unknown, fileId?: string): Promise<string> {
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
    request = window.gapi.client.request({
      path: `/upload/drive/v3/files/${fileId}`,
      method: 'PATCH',
      params: { uploadType: 'multipart' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: multipartRequestBody,
    });
  } else {
    // Create new file
    request = window.gapi.client.request({
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
export async function loadWorkflow(fileId: string): Promise<WorkflowDocument> {
    const response = await window.gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });
    return response.result;
}

// Delete Workflow File
export async function deleteWorkflow(fileId: string) {
    await window.gapi.client.drive.files.delete({
        fileId: fileId
    });
}
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../store/useStore';
