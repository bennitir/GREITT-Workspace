import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertReceiptContent,
  selectReceiptFiles,
  RECEIPT_CONTENT_MESSAGE,
} from './file-limits.ts';

const file = (name, type, bytes) => ({name, type, size: bytes.length});
const chars = (value) => new TextEncoder().encode(value);
const pdf = chars('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const png = new Uint8Array(24);
png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
png.set(chars('IHDR'), 12);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0, 0]);
const gif = chars('GIF89a1234567');
const webp = chars('RIFF1234WEBPVP8 ');
const bmp = new Uint8Array([66,77,1,0,0,0,0,0,0,0,0,0,14,0]);
const tiff = new Uint8Array([73,73,42,0,8,0,0,0]);
function ftyp(brand) {
  const bytes = new Uint8Array(24);
  bytes.set([0,0,0,24]);
  bytes.set(chars('ftyp'), 4);
  bytes.set(chars(brand), 8);
  bytes.set(chars(brand), 16);
  return bytes;
}
function accepted(name, type, bytes, expected) {
  assert.equal(assertReceiptContent(file(name,type,bytes),bytes),expected);
}
function denied(name, type, bytes) {
  assert.throws(() => assertReceiptContent(file(name,type,bytes),bytes),{
    message: RECEIPT_CONTENT_MESSAGE,
  });
}

test('valid real-signature PDF, JPEG and PNG pass, MIME is derived from bytes', () => {
  accepted('f.pdf','application/pdf',pdf,'application/pdf');
  accepted('f.jpeg','image/jpeg',jpeg,'image/jpeg');
  accepted('f.PNG','image/png',png,'image/png');
  accepted('f.PDF','',pdf,'application/pdf');
  accepted('f.pdf','application/octet-stream',pdf,'application/pdf');
});
test('common additional image signatures remain supported', () => {
  accepted('i.gif','image/gif',gif,'image/gif');
  accepted('i.webp','image/webp',webp,'image/webp');
  accepted('i.bmp','image/bmp',bmp,'image/bmp');
  accepted('i.tiff','image/tiff',tiff,'image/tiff');
  accepted('i.heic','image/heic',ftyp('heic'),'image/heic');
  accepted('i.heif','image/heif',ftyp('mif1'),'image/heif');
  accepted('i.avif','image/avif',ftyp('avif'),'image/avif');
});
test('renamed HTML, JavaScript and SVG are rejected', () => {
  denied('x.pdf','application/pdf',chars('<html><script>alert(1)</script></html>'));
  denied('x.png','image/png',chars('console.log("not an image")'));
  denied('x.svg','image/svg+xml',chars('<svg onload="alert(1)"></svg>'));
});
test('misleading MIME or file extension is rejected despite a valid signature', () => {
  denied('picture.pdf','application/pdf',png);
  denied('picture.png','application/pdf',png);
  denied('picture.png','image/svg+xml',png);
  denied('picture.jpg','image/jpeg',pdf);
});
test('empty file and metadata mismatch do not pass validation', () => {
  assert.throws(() => assertReceiptContent(file('x.pdf','application/pdf',new Uint8Array()),new Uint8Array()));
  assert.throws(() => assertReceiptContent({...file('x.pdf','application/pdf',pdf),size:100},pdf),{
    message:RECEIPT_CONTENT_MESSAGE,
  });
});
test('the 3 MiB limit remains enforced on both metadata and received bytes', () => {
  const tooBig = new Uint8Array(3*1024*1024+1);
  assert.throws(()=>assertReceiptContent(file('x.png','image/png',tooBig),tooBig));
});
test('client-side filter stops SVG and inconsistent type/extension early', () => {
  const svg = new File(['<svg/>'],'i.svg',{type:'image/svg+xml'});
  const fake = new File(['a'],'i.pdf',{type:'image/png'});
  const valid = new File([pdf],'i.pdf',{type:'application/pdf'});
  assert.deepEqual(selectReceiptFiles([svg,fake,valid]).acceptedFiles,[valid]);
});
test('unknown media signatures are rejected even with matching extension and MIME', () => {
  denied('f.jpg','image/jpeg',new Uint8Array([0xff,0xd8,0x00,0x00]));
  denied('f.pdf','application/pdf',chars('%PDF-abc\n'));
  denied('f.avif','image/avif',ftyp('xxxx'));
});
