const $ = (id) => document.getElementById(id);
const base = location.origin;

async function json(path) { const response = await fetch(base + path); if (!response.ok) throw new Error(`${response.status}`); return response.json(); }
async function load() {
  try {
    const [health, tools, skills, plugins, sessions] = await Promise.all([json('/health'), json('/tools'), json('/skills'), json('/plugins'), json('/sessions')]);
    $('connection').textContent = `서버 연결됨 · ${health.cwd}`;
    $('tools').innerHTML = tools.tools.map((tool) => `<span class="chip">${tool.name}</span>`).join('');
    $('skills').textContent = skills.skills.map((skill) => `@${skill.name} · ${skill.description}`).join('\n');
    $('plugins').textContent = plugins.plugins.map((plugin) => `@${plugin.name} · ${plugin.description || ''}`).join('\n');
    $('sessions').textContent = JSON.stringify(sessions.sessions, null, 2);
  } catch (error) { $('connection').textContent = `연결 실패: ${error.message}`; $('connection').style.color = '#ff7b72'; }
}
$('refresh').onclick = load;
load();
setInterval(load, 5000);
