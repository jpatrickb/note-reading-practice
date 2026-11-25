// The Save screen's QR code and the link it opens (kept out of the UI so tests can build them).
//
// The link is `<app url>#import32=<CODE>`, where CODE is the progress code as uppercase base32. A QR
// code stores that in two segments: the app URL as plain bytes, and CODE in "alphanumeric" mode
// (5.5 bits a character; base64 would need 8 bits a character in byte mode), about 17% smaller for
// the same data. (A fully uppercase URL can't do better: `#` and `=` aren't alphanumeric characters.)
// The text code and a `#import=<base64 code>` link stay valid and are what people copy and paste.

import qrcode from 'qrcode-generator';
import { codeFromBase32, codeToBase32 } from './codec';

/** Link-fragment keys: `import` carries the base64url code, `import32` the base32 one. */
const IMPORT_HASH = /^#(import|import32)=([A-Za-z0-9_-]+)$/i;

/** The QR code for `appUrl` (origin and path, no fragment) opening with this progress code. */
export function progressQr(appUrl: string, code: string): ReturnType<typeof qrcode> {
  const qr = qrcode(0, 'L');
  qr.addData(`${appUrl}#import32=`, 'Byte');
  qr.addData(codeToBase32(code), 'Alphanumeric');
  qr.make();
  return qr;
}

/** The progress code (base64url text) in a link fragment such as `#import32=ABC…`, or null if none. */
export function codeFromHash(hash: string): string | null {
  const m = IMPORT_HASH.exec(hash);
  if (!m) return null;
  if (m[1]!.toLowerCase() !== 'import32') return m[2]!;
  try {
    return codeFromBase32(m[2]!);
  } catch {
    return m[2]!; // Not base32 after all: let the import screen explain what is wrong with it.
  }
}
