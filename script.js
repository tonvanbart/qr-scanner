const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const statusEl = document.getElementById('status');
const reticle = document.getElementById('reticle');
const resultsEl = document.getElementById('results');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let stream = null;
let rafId = null;
let lastValue = null;
let lastTime = 0;
const seen = [];

/**
 * Shows the user what the scanner is currently doing (idle, live, stopped, or an error).
 * @param {string} text - Status message to display.
 * @param {string} [cls] - Optional status modifier ('live' or 'error') controlling its color.
 */
function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

/**
 * Makes arbitrary scanned text safe to drop into the results list as HTML.
 * @param {string} str - Raw text to escape.
 * @returns {string} HTML-escaped text.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Turns scanned content into something openable as a link, assuming https when no scheme was given.
 * @param {string} value - Raw text decoded from the QR code.
 * @returns {string} A URL suitable for window.open.
 */
function toUrl(value) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value) ? value : 'https://' + value;
}

/**
 * Draws the log of past scans, each with its own Copy and Open actions.
 */
function renderResults() {
  if (seen.length === 0) {
    resultsEl.innerHTML = '<div class="empty">Nothing scanned yet.</div>';
    return;
  }
  resultsEl.innerHTML = seen.map((item, index) => `
    <div class="result">
      <div class="result-meta">${item.time}</div>
      <div class="result-value">${escapeHtml(item.value)}</div>
      <div class="result-actions">
        <button type="button" class="copy-btn" data-index="${index}">Copy</button>
        <button type="button" class="open-btn" data-index="${index}">Open</button>
      </div>
    </div>
  `).join('');
}

/**
 * Lets the user act on a past scan: copy its raw text, or open it as a URL in a new tab.
 * @param {MouseEvent} e - Click event, delegated from the results list.
 */
resultsEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const item = seen[Number(btn.dataset.index)];
  if (!item) return;

  if (btn.classList.contains('copy-btn')) {
    try {
      await navigator.clipboard.writeText(item.value);
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1200);
    } catch (err) {
      setStatus('copy failed: ' + err.message, 'error');
    }
  } else if (btn.classList.contains('open-btn')) {
    window.open(toUrl(item.value), '_blank', 'noopener,noreferrer');
  }
});

/**
 * Requests camera access and puts the scanner into a live, scanning state.
 * @returns {Promise<void>}
 */
async function start() {
  try {
    setStatus('requesting camera…');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await video.play();
    setStatus('live — point at a QR code', 'live');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    tick();
  } catch (err) {
    setStatus('camera error: ' + err.message, 'error');
  }
}

/**
 * Releases the camera and returns the scanner to an idle state.
 */
function stop() {
  if (rafId) cancelAnimationFrame(rafId);
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.srcObject = null;
  reticle.classList.remove('found');
  setStatus('stopped');
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

/**
 * Continuously inspects the camera feed for a QR code and records each new one that's found.
 * Reschedules itself via requestAnimationFrame to run every frame while the camera is live.
 */
function tick() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      reticle.classList.add('found');
      const now = Date.now();
      if (code.data !== lastValue || now - lastTime > 2000) {
        lastValue = code.data;
        lastTime = now;
        seen.unshift({ value: code.data, time: new Date().toLocaleTimeString() });
        if (seen.length > 8) seen.pop();
        renderResults();
      }
    } else {
      reticle.classList.remove('found');
    }
  }
  rafId = requestAnimationFrame(tick);
}

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
window.addEventListener('beforeunload', stop);
