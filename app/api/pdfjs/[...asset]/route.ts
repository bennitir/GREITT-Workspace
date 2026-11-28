import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { version } from 'pdfjs-dist/package.json';

// Public decoder/font assets only. Receipt bytes still use the authorized route.
export const runtime = 'nodejs';

const assetTypes: Record<string, Record<string, string>> = {
  wasm: { wasm: 'application/wasm', js: 'text/javascript' },
  cmaps: { bcmap: 'application/octet-stream' },
  standard_fonts: { pfb: 'application/octet-stream', ttf: 'font/ttf' },
  iccs: { icc: 'application/vnd.iccprofile' },
};

export async function GET(_request: Request, { params }: {
  params: Promise<{ asset: string[] }>;
}) {
  const { asset } = await params;
  const [requestedVersion, directory, filename] = asset;
  const match = filename?.match(/^[A-Za-z0-9_-]+\.(wasm|js|bcmap|pfb|ttf|icc)$/);
  const contentType = Object.hasOwn(assetTypes, directory ?? '') && match
    ? assetTypes[directory][match[1]] : undefined;
  if (asset.length !== 3 || requestedVersion !== version || !contentType) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const bytes = await readFile(path.join(process.cwd(), 'node_modules/pdfjs-dist', directory, filename));
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
