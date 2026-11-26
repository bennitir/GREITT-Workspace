'use strict';

// Focused, synthetic browser smoke test. Starts only an isolated Next fixture;
// never imports the application layout, actions, database or environment files.
// Usage: node scripts/visual-document-preview.browser.cjs [checkout] [port]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const port = Number(process.argv[3] || 3127);
const origin = `http://127.0.0.1:${port}`;
const remoteOrigin = `http://127.0.0.1:${port + 1}`;
const out = path.join(root, '.scratch', 'visual-document-preview-browser');
const fixture = path.join(out, 'fixture');
const requireRoot = createRequire(path.join(root, 'package.json'));

function syntheticPdf(colors) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${colors.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${colors.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  colors.forEach((color, index) => {
    const content = `${color} rg 60 630 480 100 re f\n0 0 0 rg BT /F1 28 Tf 60 580 Td (SYNTHETIC DOCUMENT - PAGE ${index + 1}) Tj ET\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function syntheticScannedPdf() {
  // A self-generated 64x64 two-bar image encoded by local Pillow/libtiff G4.
  // Embedded bytes make this test independent of Python or external fixtures.
  const fax = Buffer.from('JqB4b//8ihf/////////+P////+RQv//////////H//gAgAg', 'base64');
  const content = 'q 480 0 0 480 60 220 cm /Scan Do Q\n';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 64 /Rows 64 /BlackIs1 true >> /Length ${fax.length} >>\nstream\n`),
      fax,
      Buffer.from('\nendstream'),
    ]),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(chunks.reduce((length, chunk) => length + chunk.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`), objects[index], Buffer.from('\nendobj\n'));
  }
  const xref = chunks.reduce((length, chunk) => length + chunk.length, 0);
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

function write(relative, text) {
  const target = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

async function waitForServer(child, getLog) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next fixture exited (${child.exitCode}):\n${getLog()}`);
    try {
      const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Next fixture startup timed out:\n${getLog()}`);
}

async function main() {
  const componentFile = process.env.GLOGGT_PDF_COMPONENT || path.join(root, 'app/banki/[id]/afstemming/VisualDocumentPreview.tsx');
  const assetRouteFile = process.env.GLOGGT_PDF_ASSET_ROUTE || path.join(root, 'app/api/pdfjs/[...asset]/route.ts');
  assert.ok(fs.existsSync(componentFile), `Missing viewer: ${componentFile}`);
  assert.ok(fs.existsSync(assetRouteFile), `Missing decoder asset route: ${assetRouteFile}`);
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65534);
  const component = fs.readFileSync(componentFile, 'utf8');
  assert.doesNotMatch(component, /from\s+['"](?:@\/lib\/(?:prisma|supabase)|.*actions)/, 'fixture must contain only the read-only viewer');
  fs.mkdirSync(fixture, { recursive: true });
  const dependencyLink = path.join(fixture, 'node_modules');
  if (!fs.existsSync(dependencyLink)) fs.symlinkSync(path.join(root, 'node_modules'), dependencyLink, 'junction');
  assert.equal(fs.realpathSync(dependencyLink), fs.realpathSync(path.join(root, 'node_modules')), 'fixture dependencies belong to the target checkout');
  const pdf = syntheticPdf(['0.8 0.1 0.1', '0.1 0.7 0.1']);
  const alternatePdf = syntheticPdf(['0.1 0.1 0.8']);
  const scannedPdf = syntheticScannedPdf();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=';
  write('package.json', JSON.stringify({ name: 'synthetic-pdf-viewer-smoke', private: true }));
  write('next.config.mjs', `export default { turbopack: { root: ${JSON.stringify(root)} }, devIndicators: false };\n`);
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2020', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', plugins: [{ name: 'next' }] }, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'] }, null, 2));
  write('app/VisualDocumentPreview.tsx', component);
  write('app/api/pdfjs/[...asset]/route.ts', fs.readFileSync(assetRouteFile, 'utf8'));
  write('app/layout.tsx', `import './styles.css';\nexport default function Layout({children}: {children: React.ReactNode}) { return <html lang="is"><body>{children}</body></html>; }\n`);
  write('app/page.tsx', `'use client';
import { useState } from 'react';
import Viewer from './VisualDocumentPreview';
export default function Page() {
  const [kind, setKind] = useState('pdf');
  const [visible, setVisible] = useState(true);
  return <main><h1>Tilbúið PDF-próf · engin raungögn</h1>
    <nav>{[['pdf','PDF'],['alternate','Nýtt PDF'],['scan','Skannað PDF'],['image','Mynd'],['forbidden','Bannað'],['invalid','Bilað PDF'],['slow','Seint PDF'],['redirect','Annar uppruni']].map(([value,label]) =>
      <button key={value} type="button" onClick={() => { setKind(value); setVisible(true); }}>{label}</button>)}
      <button type="button" onClick={() => setVisible(value => !value)}>Fela/sýna</button></nav>
    <div id="viewer-holder">{visible && <Viewer key={kind} url={'/file/' + kind} title="Tilbúið fylgiskjal" language="is" />}</div>
  </main>;
}\n`);
  write('app/health/route.ts', `export async function GET() { return new Response('isolated fixture'); }\n`);
  write('app/file/[kind]/route.ts', `const pdf = ${JSON.stringify(pdf.toString('base64'))};
const alternate = ${JSON.stringify(alternatePdf.toString('base64'))};
const scanned = ${JSON.stringify(scannedPdf.toString('base64'))};
const png = ${JSON.stringify(png)};
export async function GET(request: Request, {params}: {params: Promise<{kind: string}>}) {
  const {kind} = await params;
  const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
  if (kind === 'forbidden') return new Response('Forbidden', {status: 403, headers});
  if (kind === 'invalid') return new Response('This is not a PDF', {headers: {...headers, 'Content-Type': 'application/pdf'}});
  if (kind === 'redirect') return new Response(null, {status: 302, headers: {...headers, Location: ${JSON.stringify(remoteOrigin + '/signed-document.pdf')}}});
  if (kind === 'slow') await new Promise(resolve => setTimeout(resolve, 900));
  return new Response(Buffer.from(kind === 'image' ? png : kind === 'alternate' ? alternate : kind === 'scan' ? scanned : pdf, 'base64'), {headers: {...headers, 'Content-Type': kind === 'image' ? 'image/png' : 'application/pdf'}});
}\n`);
  const css = await requireRoot('postcss')([requireRoot('@tailwindcss/postcss')({ base: root })]).process(
    `@import "tailwindcss" source(none);\n@source "${path.join(fixture, 'app/VisualDocumentPreview.tsx').replaceAll('\\', '/')}";\n`,
    { from: path.join(root, 'pdf-smoke-styles.css') },
  );
  write('app/styles.css', css.css + '\nbody{margin:0;background:#f1f5f9;font-family:Arial,sans-serif} main{padding:20px} h1{margin:0 0 12px}nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}nav button{border:1px solid #777;padding:5px 10px;background:white}#viewer-holder{width:720px;max-width:100%}');

  const crossOriginRequests = [];
  const remote = http.createServer((request, response) => {
    crossOriginRequests.push({ method: request.method, path: request.url, origin: request.headers.origin || null, cookie: request.headers.cookie || null });
    response.writeHead(request.method === 'GET' ? 200 : 405, {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, no-store',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': pdf.length,
    });
    response.end(pdf);
  });
  await new Promise((resolve, reject) => remote.once('error', reject).listen(port + 1, '127.0.0.1', resolve));
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'ComSpec', 'PATHEXT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' });
  const child = spawn(process.execPath, [requireRoot.resolve('next/dist/bin/next'), 'dev', fixture, '--hostname', '127.0.0.1', '--port', String(port)], { cwd: fixture, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', data => { log += data.toString(); });
  child.stderr.on('data', data => { log += data.toString(); });
  child.on('error', error => { log += error.stack; });
  let browser;
  const checks = [], errors = [], denied = [], requests = [], workerUrls = [];
  try {
    await waitForServer(child, () => log);
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/benni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
    const context = await browser.newContext({ viewport: { width: 1150, height: 1000 }, serviceWorkers: 'block' });
    await context.addCookies([{ name: 'syntheticSession', value: 'synthetic-only', url: origin }]);
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({ method: request.method(), pathname: url.pathname, origin: url.origin, referer: request.headers().referer || null });
      if (request.method() !== 'GET' || ![origin, remoteOrigin].includes(url.origin)) {
        denied.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('worker', worker => workerUrls.push(worker.url()));
    const assetBase = `${origin}/api/pdfjs/${requireRoot('pdfjs-dist/package.json').version}`;
    const wasmResponse = await context.request.get(`${assetBase}/wasm/jbig2.wasm`);
    assert.equal(wasmResponse.status(), 200);
    assert.equal(wasmResponse.headers()['content-type'], 'application/wasm');
    assert.match(wasmResponse.headers()['cache-control'], /immutable/);
    assert.equal((await wasmResponse.body()).subarray(0, 4).toString('hex'), '0061736d', 'asset response is real wasm');
    for (const pathname of [
      '/api/pdfjs/not-the-installed-version/wasm/jbig2.wasm',
      `/api/pdfjs/${requireRoot('pdfjs-dist/package.json').version}/wasm/not-an-asset.wasm`,
      `/api/pdfjs/${requireRoot('pdfjs-dist/package.json').version}/build/pdf.mjs`,
      `/api/pdfjs/${requireRoot('pdfjs-dist/package.json').version}/wasm/nested/jbig2.wasm`,
      `/api/pdfjs/${requireRoot('pdfjs-dist/package.json').version}/__proto__/jbig2.wasm`,
    ]) {
      const rejected = await context.request.get(origin + pathname);
      assert.equal(rejected.status(), 404, `reject asset path: ${pathname}`);
    }
    checks.push({ name: 'actual package wasm asset served with correct MIME; wrong version and arbitrary paths rejected' });
    const canvas = page.getByTestId('document-preview-canvas');
    const viewport = page.getByTestId('document-preview-viewport');
    async function marker(expected) {
      await page.waitForFunction(({ expected }) => {
        const canvas = document.querySelector('[data-testid="document-preview-canvas"]');
        if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) return false;
        const context = canvas.getContext('2d');
        const p = context?.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.15), 1, 1).data;
        return p && p[expected] > 140 && p[(expected + 1) % 3] < 90 && p[(expected + 2) % 3] < 90;
      }, { expected });
    }
    async function width() { return canvas.evaluate(element => element.getBoundingClientRect().width); }
    async function assertFits() {
      const [canvasWidth, viewportWidth] = await Promise.all([width(), viewport.evaluate(element => element.clientWidth)]);
      assert.ok(Math.abs(canvasWidth - (viewportWidth - 16)) < 2, `canvas fits viewport minus padding: ${canvasWidth}/${viewportWidth}`);
      return { canvasWidth, viewportWidth };
    }

    const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 90000 });
    assert.equal(response.status(), 200);
    await marker(0);
    await page.getByText('Síða 1 / 2', { exact: true }).waitFor();
    assert.equal(await page.locator('iframe, object, embed').count(), 0, 'no browser PDF viewer');
    assert.ok(await page.getByRole('button', { name: 'Fyrri síða', exact: true }).isDisabled());
    checks.push({ name: 'first page rendered automatically at available width', ...await assertFits() });
    await page.screenshot({ path: path.join(out, 'initial-fit-width.png'), fullPage: true });

    await page.getByRole('button', { name: 'Næsta síða', exact: true }).click();
    await marker(1);
    await page.getByText('Síða 2 / 2', { exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Næsta síða', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Fyrri síða', exact: true }).click();
    await marker(0);
    checks.push({ name: 'both pages render and navigation boundaries work' });

    const initialWidth = await width();
    await page.getByRole('button', { name: 'Stækka', exact: true }).click();
    await page.waitForFunction(initial => document.querySelector('[data-testid="document-preview-canvas"]').getBoundingClientRect().width > initial * 1.05, initialWidth);
    await marker(0);
    const zoomedWidth = await width();
    await page.getByRole('button', { name: 'Minnka', exact: true }).click();
    await page.waitForFunction(initial => Math.abs(document.querySelector('[data-testid="document-preview-canvas"]').getBoundingClientRect().width - initial) < 3, initialWidth);
    await page.getByRole('button', { name: 'Stækka', exact: true }).click();
    await page.getByRole('button', { name: 'Passa breidd', exact: true }).click();
    await marker(0);
    checks.push({ name: 'zoom in, zoom out and fit width', initialWidth, zoomedWidth, ...await assertFits() });

    for (const label of ['Næsta síða', 'Stækka', 'Fyrri síða', 'Stækka', 'Minnka', 'Næsta síða', 'Fyrri síða', 'Passa breidd']) {
      await page.getByRole('button', { name: label, exact: true }).click();
    }
    await marker(0);
    await page.getByText('Síða 1 / 2', { exact: true }).waitFor();
    checks.push({ name: 'rapid page and zoom churn redraws correct page without shared-canvas failure', ...await assertFits() });

    await page.setViewportSize({ width: 480, height: 850 });
    await page.waitForFunction(() => document.querySelector('[data-testid="document-preview-canvas"]').getBoundingClientRect().width < 480);
    await marker(0);
    checks.push({ name: 'fit follows narrow viewport', ...await assertFits() });
    await page.screenshot({ path: path.join(out, 'narrow-fit-width.png'), fullPage: true });
    await page.setViewportSize({ width: 1150, height: 1000 });

    await page.getByRole('button', { name: 'Annar uppruni', exact: true }).click();
    await marker(0);
    assert.ok(crossOriginRequests.some(request => request.path === '/signed-document.pdf'));
    assert.ok(crossOriginRequests.every(request => request.method === 'GET' && !request.cookie), 'no session cookie sent to redirected origin');
    checks.push({ name: 'authorized URL shape redirects to CORS-enabled second origin', crossOriginRequests });

    await page.getByRole('button', { name: 'Mynd', exact: true }).click();
    await page.getByRole('img', { name: 'Tilbúið fylgiskjal', exact: true }).waitFor();
    await page.waitForFunction(() => { const image = document.querySelector('img[alt="Tilbúið fylgiskjal"]'); return image?.complete && image.naturalWidth > 0; });
    assert.equal(await canvas.count(), 0);
    checks.push({ name: 'image attachment remains viewable' });

    await page.getByRole('button', { name: 'Skannað PDF', exact: true }).click();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-testid="document-preview-canvas"]');
      if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) return false;
      const context = canvas.getContext('2d');
      if (!context) return false;
      const dark = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.25), 1, 1).data;
      const light = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.425), 1, 1).data;
      return dark[0] < 40 && dark[1] < 40 && dark[2] < 40 && dark[3] === 255 &&
        light[0] > 230 && light[1] > 230 && light[2] > 230 && light[3] === 255;
    });
    await page.getByText('Síða 1 / 1', { exact: true }).waitFor();
    assert.ok(requests.some(request => request.pathname.includes('.wasm')), 'scan decoding loads a local wasm asset');
    await page.screenshot({ path: path.join(out, 'scanned-ccitt.png'), fullPage: true });
    checks.push({ name: 'CCITT Group4 scanned PDF displays actual dark bars and white gaps using local wasm' });

    await page.getByRole('button', { name: 'Bannað', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await canvas.count(), 0);
    await page.getByRole('button', { name: 'Bilað PDF', exact: true }).click();
    await page.getByRole('alert').waitFor();
    checks.push({ name: '403 and invalid PDF show explicit failure' });

    await Promise.all([
      page.waitForRequest(request => request.url() === origin + '/file/slow'),
      page.getByRole('button', { name: 'Seint PDF', exact: true }).click(),
    ]);
    await page.getByRole('button', { name: 'Nýtt PDF', exact: true }).click();
    await marker(2);
    await page.getByText('Síða 1 / 1', { exact: true }).waitFor();
    await page.waitForTimeout(1200);
    await marker(2);
    await page.getByRole('button', { name: 'Fela/sýna', exact: true }).click();
    assert.equal(await page.getByTestId('document-file-preview').count(), 0);
    await page.getByRole('button', { name: 'Fela/sýna', exact: true }).click();
    await marker(2);
    checks.push({ name: 'rapid document switch and unmount do not restore stale page' });

    assert.ok(workerUrls.length > 0, 'real PDF worker started');
    assert.ok(workerUrls.every(url => new URL(url).origin === origin), 'worker bundled by local Next server');
    assert.deepEqual(errors, [], 'no uncaught browser runtime errors');
    assert.deepEqual(denied, [], 'no mutation or external network requests');
    assert.ok(requests.filter(request => request.pathname.startsWith('/file/')).every(request => request.referer === null), 'document fetches omit referrer');
    const result = { status: 'PASS', scope: 'isolated Next/Turbopack, real PDF.js worker, synthetic attachments only', checks, workerUrls, errors, denied, requests, output: out };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.writeFileSync(path.join(out, 'next-fixture.log'), log);
    if (browser) await browser.close();
    if (child.pid && child.exitCode === null) {
      if (process.platform === 'win32') {
        try { execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }); } catch { child.kill(); }
      } else child.kill('SIGTERM');
    }
    await new Promise(resolve => remote.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
