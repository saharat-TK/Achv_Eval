import 'server-only';
import { getAdminStorage } from '@/lib/firebase/admin';

/** Extract the storage bucket name embedded in a Firebase download URL. */
function bucketFromDownloadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/v0\/b\/([^/]+)\/o\//);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Best-effort deletion of a generated report PDF after a status reversal —
 * the signed document is voided, so the stored object is removed to prevent
 * direct token-URL access to a now-invalid official report. Storage is not
 * transactional, so this runs after the Firestore write commits and never
 * throws: the reversal stands even if the file is already gone.
 */
export async function deleteStoredPdf(pdf: { path: string; url: string | null }) {
  try {
    const bucketName =
      bucketFromDownloadUrl(pdf.url) ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
      undefined;
    if (!bucketName) return;
    await getAdminStorage()
      .bucket(bucketName)
      .file(pdf.path)
      .delete({ ignoreNotFound: true });
  } catch (err) {
    console.error('deleteStoredPdf: failed to delete PDF', pdf.path, err);
  }
}
