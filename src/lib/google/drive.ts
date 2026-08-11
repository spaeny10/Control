import { drive as driveApi } from "@googleapis/drive";
import { Readable } from "node:stream";
import {
  GOOGLE_SCOPES,
  getGoogleClient,
  isGoogleConfigured,
  tryGoogle,
} from "./client";
import { PRIMARY_DOMAIN } from "./identity";

/* Delivery/pickup media in Google Drive.

   Scope is drive.file, so the app can only touch files it created itself —
   it cannot read the rest of anyone's Drive. Files are always served back
   through our own authenticated routes rather than by Drive link, so access
   control stays in the app. */

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

// Impersonate a service mailbox so uploads have a stable owner rather than
// belonging to whichever tech happened to take the photo.
function driveOwner(): string {
  return (
    process.env.GOOGLE_DRIVE_OWNER ?? `admin@${PRIMARY_DOMAIN}`
  );
}

export function isDriveConfigured(): boolean {
  return isGoogleConfigured() && !!ROOT_FOLDER_ID;
}

function client() {
  const auth = getGoogleClient(driveOwner(), GOOGLE_SCOPES.drive);
  if (!auth) return null;
  return driveApi({ version: "v3", auth });
}

const folderCache = new Map<string, string>();

/** Find-or-create a subfolder under the configured root, by name. */
async function ensureFolder(name: string): Promise<string | null> {
  if (!ROOT_FOLDER_ID) return null;
  const cached = folderCache.get(name);
  if (cached) return cached;

  const api = client();
  if (!api) return null;

  const escaped = name.replace(/'/g, "\\'");
  const found = await api.files.list({
    q: `name = '${escaped}' and '${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  let id = found.data.files?.[0]?.id ?? null;
  if (!id) {
    const created = await api.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [ROOT_FOLDER_ID],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    id = created.data.id ?? null;
  }
  if (id) folderCache.set(name, id);
  return id;
}

/**
 * Upload deployment media. Returns the Drive file id, or null when Drive
 * isn't configured or the call fails — callers then fall back to storing
 * bytes in Postgres, so a Drive outage never loses a photo.
 */
export async function uploadDeploymentFile(opts: {
  folderName: string;
  fileName: string;
  mimeType: string;
  body: Buffer;
}): Promise<string | null> {
  if (!isDriveConfigured()) return null;

  return tryGoogle("drive.upload", async () => {
    const api = client();
    if (!api) return null;
    const folderId = await ensureFolder(opts.folderName);

    const created = await api.files.create({
      requestBody: {
        name: opts.fileName,
        parents: folderId ? [folderId] : undefined,
      },
      media: {
        mimeType: opts.mimeType,
        body: Readable.from(opts.body),
      },
      fields: "id",
      supportsAllDrives: true,
    });
    return created.data.id ?? null;
  });
}

/** Fetch a Drive file's bytes for serving through our own route. */
export async function downloadDriveFile(
  fileId: string
): Promise<Buffer | null> {
  if (!isGoogleConfigured()) return null;

  return tryGoogle("drive.download", async () => {
    const api = client();
    if (!api) return null;
    const res = await api.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data as unknown as ArrayBuffer);
  });
}
