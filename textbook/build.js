/* Rend textbook/manuel.html en PDF via Chrome headless (protocole DevTools).
   Usage : node build.js                                                     */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

if (!CHROME) { console.error('Chrome introuvable.'); process.exit(1); }

const HTML = path.resolve(__dirname, 'manuel.html');
const OUT = path.resolve(__dirname, 'Le-francais-avec-Alban.pdf');
const PORT = 9333;
const PROFILE = path.join(os.tmpdir(), 'fwa-chrome-profile');

const FOOTER = `
<div style="width:100%;font-family:Georgia,serif;font-size:8px;color:#8a97a6;
            padding:0 16mm;display:flex;justify-content:center;">
  <span class="pageNumber"></span>
</div>`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // attendre que le port réponde
  let version = null;
  for (let i = 0; i < 60; i++) {
    try { version = await getJSON(`http://127.0.0.1:${PORT}/json/version`); break; }
    catch { await sleep(250); }
  }
  if (!version) { chrome.kill(); throw new Error('Chrome n a pas ouvert le port de debug.'); }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) {
      events.push(m);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

  // ouvrir un onglet sur le fichier
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);

  const fileUrl = 'file:///' + HTML.replace(/\\/g, '/');
  await send('Page.navigate', { url: fileUrl }, sessionId);

  // attendre le chargement complet + les polices
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    const r = await send('Runtime.evaluate', {
      expression: `(document.readyState === 'complete') && document.fonts.status === 'loaded'
                   && [...document.images].every(i => i.complete)`,
      returnByValue: true,
    }, sessionId).catch(() => null);
    if (r && r.result && r.result.value === true) break;
  }
  await sleep(1200); // marge pour le rendu des polices web

  const stats = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      imgs: document.images.length,
      broken: [...document.images].filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
      fonts: document.fonts.status,
      fraunces: document.fonts.check('600 20pt Fraunces'),
    })`,
    returnByValue: true,
  }, sessionId);
  console.log('rendu :', stats.result.value);

  const opts = {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: FOOTER,
    transferMode: 'ReturnAsStream',
  };

  let pdf;
  try {
    pdf = await send('Page.printToPDF', { ...opts, generateDocumentOutline: true }, sessionId);
  } catch (e) {
    console.log('outline non supporté, nouvel essai sans :', String(e).slice(0, 90));
    pdf = await send('Page.printToPDF', opts, sessionId);
  }

  // lecture par blocs : le PDF est trop gros pour transiter en une seule réponse
  const chunks = [];
  for (;;) {
    const r = await send('IO.read', { handle: pdf.stream, size: 512 * 1024 }, sessionId);
    if (r.data) chunks.push(Buffer.from(r.data, r.base64Encoded ? 'base64' : 'utf8'));
    if (r.eof) break;
  }
  await send('IO.close', { handle: pdf.stream }, sessionId);
  fs.writeFileSync(OUT, Buffer.concat(chunks));
  console.log('PDF écrit :', OUT, (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), 'Mo');

  ws.close();
  chrome.kill();
}

main().catch(e => { console.error(e); process.exit(1); });
