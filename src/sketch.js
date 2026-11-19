// Building from your own drawing (Omer, 2026-11-19): a player uploads a PDF or
// a picture of a sketch, and it opens as the structure folder (תיק מבנה) of a
// free-build plaza. The game does not read the drawing: the player builds by
// looking at it, and the inspection only says whether the structure stands.
//
// PDF pages are drawn into pictures with pdf.js (pdfjs-dist, bundled into the
// single-file build). It runs on the page itself, with no worker, and with
// isEvalSupported off (the fix for CVE-2024-4367 in this version).

const MAX_PAGES = 8;
const PAGE_WIDTH = 1600; // px each page is drawn at

const readAs = (file, how) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(r.result); r.onerror = () => fail(r.error);
  how === 'url' ? r.readAsDataURL(file) : r.readAsArrayBuffer(file);
});

let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  // the worker's code runs on the page ("fake worker"): one file, no extra download
  globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.js');
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  return pdfjs;
}

// file -> { name, pages: [{ url, w, h }] }
export async function loadSketch(file) {
  const name = file.name.replace(/\.[^.]+$/, '');
  if (file.type.startsWith('image/')) {
    const url = await readAs(file, 'url');
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    return { name, pages: [{ url, w: img.naturalWidth, h: img.naturalHeight }] };
  }
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('not-a-drawing');
  const lib = await loadPdfjs();
  const data = new Uint8Array(await readAs(file, 'buffer'));
  const doc = await lib.getDocument({ data, isEvalSupported: false, disableFontFace: false }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: PAGE_WIDTH / vp1.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    pages.push({ url: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height });
  }
  doc.destroy();
  return { name, pages, more: doc.numPages > MAX_PAGES };
}
