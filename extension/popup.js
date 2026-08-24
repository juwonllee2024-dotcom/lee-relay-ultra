const $ = (id) => document.getElementById(id);

chrome.storage.local.get(['autoEnabled', 'cwd'], (r) => {
  $('auto').checked = r.autoEnabled !== false;
  $('cwd').value = r.cwd || '';
});

$('save').addEventListener('click', () => {
  chrome.storage.local.set({
    autoEnabled: $('auto').checked,
    cwd: $('cwd').value.trim(),
  }, () => show('Saved', 'ok'));
});

$('check').addEventListener('click', async () => {
  try {
    const r = await fetch('http://localhost:5747/health');
    const j = await r.json();
    show(`Server OK. cwd: ${j.cwd}`, 'ok');
  } catch (e) {
    show('Server not reachable. Run `npm start` in server/.', 'err');
  }
});

function show(text, cls) {
  const s = $('status');
  s.textContent = text;
  s.className = 'status ' + cls;
  s.style.display = 'block';
}
