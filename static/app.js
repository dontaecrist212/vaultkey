let allEntries = [], activeCategory = 'All', currentTab = 'login';
let breachCache = {};

// ===== LANDING =====
function showLanding() {
  document.getElementById('landing-screen').style.display = 'flex';
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'none';
}

function showAuthFromLanding(tab) {
  document.getElementById('landing-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  switchTab(tab);
}

// Spawn particles
(function spawnParticles() {
  const wrap = document.getElementById('particles');
  if (!wrap) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.bottom = '-10px';
    p.style.animationDelay = Math.random() * 8 + 's';
    p.style.animationDuration = (6 + Math.random() * 6) + 's';
    p.style.opacity = Math.random() * 0.5;
    wrap.appendChild(p);
  }
})();

// ===== SESSION CHECK =====
async function checkSession() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (data.logged_in) {
    document.getElementById('landing-screen').style.display = 'none';
    showApp(data.username);
  }
}

function showAuth() {
  document.getElementById('landing-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp(username) {
  document.getElementById('landing-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-badge').textContent = '▶ ' + username.toUpperCase();
  loadAll();
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register') || (i === 2 && tab === 'forgot'));
  });
  document.getElementById('login-fields').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-fields').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('forgot-fields').style.display = tab === 'forgot' ? 'block' : 'none';
  document.getElementById('auth-btn').style.display = tab === 'forgot' ? 'none' : 'block';
  document.getElementById('auth-btn').textContent = tab === 'login' ? 'ACCESS VAULT' : 'CREATE ACCOUNT';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-success').style.display = 'none';
}

async function lookupQuestion() {
  const username = document.getElementById('forgot-username').value.trim();
  if (!username) { showAuthError('Enter your username first'); return; }
  const res = await fetch('/api/get-security-question', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  const data = await res.json();
  if (!res.ok) { showAuthError(data.error); return; }
  document.getElementById('forgot-question-label').textContent = data.security_question;
  document.getElementById('forgot-question-wrap').style.display = 'block';
  document.getElementById('auth-btn').style.display = 'block';
  document.getElementById('auth-btn').textContent = 'RESET PASSWORD';
  currentTab = 'reset';
}

async function submitAuth() {
  const errEl = document.getElementById('auth-error');
  const sucEl = document.getElementById('auth-success');
  errEl.style.display = 'none'; sucEl.style.display = 'none';
  if (currentTab === 'login') {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!username || !password) { showAuthError('All fields required'); return; }
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
    if (data.mfa_required) {
      document.getElementById('mfa-verify-modal').classList.add('open');
      document.getElementById('mfa-verify-code').value = '';
      return;
    }
    showApp(data.username);
  } else if (currentTab === 'register') {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const security_question = document.getElementById('reg-question').value;
    const security_answer = document.getElementById('reg-answer').value.trim();
    if (!username || !password || !security_answer) { showAuthError('All fields required'); return; }
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, security_question, security_answer }) });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
    sucEl.textContent = 'Account created! Please log in.'; sucEl.style.display = 'block';
    switchTab('login');
  } else if (currentTab === 'reset') {
    const username = document.getElementById('forgot-username').value.trim();
    const security_answer = document.getElementById('forgot-answer').value.trim();
    const new_password = document.getElementById('forgot-newpass').value;
    if (!security_answer || !new_password) { showAuthError('All fields required'); return; }
    const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, security_answer, new_password }) });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
    sucEl.textContent = 'Password reset! Please log in.'; sucEl.style.display = 'block';
    switchTab('login');
  }
}

function showAuthError(msg) { const el = document.getElementById('auth-error'); el.textContent = msg; el.style.display = 'block'; }

async function logout() { await fetch('/api/logout', { method: 'POST' }); showLanding(); }

async function loadAll() {
  const res = await fetch('/api/passwords');
  if (res.status === 401) { showAuth(); return; }
  allEntries = await res.json();
  updateStats(); renderCatFilters(); filterEntries();
}

function updateStats() {
  document.getElementById('total-count').textContent = allEntries.length;
  document.getElementById('site-count').textContent = new Set(allEntries.map(d => d.site)).size;
  document.getElementById('cat-count').textContent = new Set(allEntries.map(d => d.category).filter(Boolean)).size;
}

function renderCatFilters() {
  const used = ['All', ...new Set(allEntries.map(d => d.category).filter(Boolean))];
  const wrap = document.getElementById('cat-filters');
  wrap.innerHTML = used.map(c => `<button class="cat-filter ${c === activeCategory ? 'active' : ''}" onclick="setCategory('${c}')">${c}</button>`).join('');
}

function setCategory(cat) { activeCategory = cat; renderCatFilters(); filterEntries(); }

function filterEntries() {
  const q = document.getElementById('search').value.toLowerCase();
  let f = allEntries;
  if (activeCategory !== 'All') f = f.filter(e => e.category === activeCategory);
  if (q) f = f.filter(e => e.site.toLowerCase().includes(q) || e.username.toLowerCase().includes(q));
  renderCards(f);
  document.getElementById('result-count').textContent = `${f.length} RECORDS`;
}

function renderCards(entries) {
  const grid = document.getElementById('cards-grid');
  const empty = document.getElementById('empty-state');
  if (!entries.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = entries.map(e => {
    const cached = breachCache[e.id];
    let breachHtml = '';
    if (cached === true) breachHtml = '<div class="breach-badge compromised">⚠ BREACHED</div>';
    else if (cached === false) breachHtml = '<div class="breach-badge safe">✓ SECURE</div>';
    return `
    <div class="card" id="card-${e.id}">
      <div class="card-corner"></div><div class="card-corner-bl"></div>
      <div class="card-header">
        <div class="card-site">${esc(e.site)}</div>
        <span class="cat-tag ${esc(e.category || 'General')}">${esc(e.category || 'General')}</span>
      </div>
      <div class="card-user">${esc(e.username)}</div>
      <div class="card-pass">
        <span class="card-pass-text" id="pw-${e.id}">● ● ● ● ● ● ● ●</span>
        <button class="eye-btn" onclick="togglePass(${e.id})">👁</button>
        <button class="copy-btn" onclick="copyPass(${e.id})">📋</button>
      </div>
      ${breachHtml}
      ${e.notes ? `<div class="card-notes">${esc(e.notes)}</div>` : ''}
      <div class="card-actions">
        <button class="btn btn-sm btn-edit" onclick="openEdit(${e.id})">EDIT</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEntry(${e.id})">DELETE</button>
      </div>
      <div class="card-date">LOGGED: ${new Date(e.created_at).toLocaleDateString()}</div>
    </div>`;
  }).join('');
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function togglePass(id) {
  const el = document.getElementById(`pw-${id}`);
  if (el.classList.contains('revealed')) { el.textContent = '● ● ● ● ● ● ● ●'; el.classList.remove('revealed'); return; }
  const data = await (await fetch(`/api/passwords/${id}`)).json();
  el.textContent = data.password; el.classList.add('revealed');
}

async function copyPass(id) {
  const data = await (await fetch(`/api/passwords/${id}`)).json();
  navigator.clipboard.writeText(data.password).then(() => showToast('KEY COPIED TO CLIPBOARD'));
}

function openAdd() {
  document.getElementById('modal-title').textContent = '// NEW ENTRY';
  document.getElementById('edit-id').value = '';
  ['f-site', 'f-user', 'f-pass', 'f-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-category').value = 'General';
  document.getElementById('entry-modal').classList.add('open');
}

async function openEdit(id) {
  const d = await (await fetch(`/api/passwords/${id}`)).json();
  document.getElementById('modal-title').textContent = '// MODIFY ENTRY';
  document.getElementById('edit-id').value = id;
  document.getElementById('f-site').value = d.site;
  document.getElementById('f-user').value = d.username;
  document.getElementById('f-pass').value = d.password;
  document.getElementById('f-notes').value = d.notes || '';
  document.getElementById('f-category').value = d.category || 'General';
  document.getElementById('entry-modal').classList.add('open');
}

function closeModal() { document.getElementById('entry-modal').classList.remove('open'); }

async function saveEntry() {
  const id = document.getElementById('edit-id').value;
  const body = { site: document.getElementById('f-site').value.trim(), username: document.getElementById('f-user').value.trim(), password: document.getElementById('f-pass').value, notes: document.getElementById('f-notes').value.trim(), category: document.getElementById('f-category').value };
  if (!body.site || !body.username || !body.password) { showToast('ALL FIELDS REQUIRED', true); return; }
  await fetch(id ? `/api/passwords/${id}` : '/api/passwords', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  closeModal(); showToast(id ? 'ENTRY UPDATED' : 'ENTRY ENCRYPTED & SAVED'); loadAll();
}

async function deleteEntry(id) {
  if (!confirm('CONFIRM DELETE — This cannot be undone.')) return;
  await fetch(`/api/passwords/${id}`, { method: 'DELETE' });
  showToast('ENTRY PURGED FROM VAULT'); loadAll();
}

function toggleFieldPass(fieldId) { const f = document.getElementById(fieldId); f.type = f.type === 'password' ? 'text' : 'password'; }

let lastGen = '';
function openGenerator() { document.getElementById('gen-modal').classList.add('open'); generatePassword(); }
function generatePassword() {
  const upper = document.getElementById('g-upper').checked, lower = document.getElementById('g-lower').checked, nums = document.getElementById('g-nums').checked, syms = document.getElementById('g-syms').checked;
  const len = parseInt(document.getElementById('g-len').value);
  let chars = '';
  if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lower) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (nums) chars += '0123456789';
  if (syms) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  if (!chars) { document.getElementById('gen-output').textContent = 'SELECT OPTIONS'; return; }
  let pw = ''; for (let i = 0; i < len; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  lastGen = pw; document.getElementById('gen-output').textContent = pw; updateStrength(pw);
}
function updateStrength(pw) {
  let s = 0;
  if (pw.length >= 12) s++; if (pw.length >= 16) s++;
  if (/[A-Z]/.test(pw)) s++; if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  const colors = ['#ff2020', '#ff4500', '#ff8c00', '#ffb347', '#00ff88'], widths = ['20%', '40%', '60%', '80%', '100%'];
  const bar = document.getElementById('strength-bar');
  bar.style.background = colors[Math.min(s, 4)]; bar.style.width = widths[Math.min(s, 4)];
}
function copyGenerated() { if (!lastGen) return; navigator.clipboard.writeText(lastGen).then(() => showToast('KEY COPIED TO CLIPBOARD')); }
function quickFillGen() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let pw = ''; for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('f-pass').value = pw; document.getElementById('f-pass').type = 'text';
  showToast('ACCESS KEY GENERATED');
}
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderColor = isError ? 'var(--danger)' : 'var(--accent)';
  t.style.color = isError ? 'var(--danger)' : 'var(--accent2)';
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500);
}

document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

// AUTO LOCK
let lockTimer;
function resetLockTimer() {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    if (document.getElementById('app-screen').style.display === 'block') {
      showToast('VAULT LOCKED DUE TO INACTIVITY');
      setTimeout(() => { fetch('/api/logout', { method: 'POST' }); showLanding(); }, 2000);
    }
  }, 5 * 60 * 1000);
}
document.addEventListener('mousemove', resetLockTimer);
document.addEventListener('keypress', resetLockTimer);
document.addEventListener('click', resetLockTimer);
resetLockTimer();

// MFA
async function openMFASetup() {
  const res = await fetch('/api/setup-mfa', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, true); return; }
  document.getElementById('mfa-qr').src = 'data:image/png;base64,' + data.qr_code;
  document.getElementById('mfa-secret-text').textContent = data.secret;
  document.getElementById('mfa-modal').classList.add('open');
}
async function confirmMFA() {
  const code = document.getElementById('mfa-code').value.trim();
  if (!code) { showToast('ENTER THE 6 DIGIT CODE', true); return; }
  const res = await fetch('/api/confirm-mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, true); return; }
  showToast('MFA ENABLED SUCCESSFULLY!');
  document.getElementById('mfa-modal').classList.remove('open');
  document.getElementById('mfa-code').value = '';
}
async function verifyMFA() {
  const code = document.getElementById('mfa-verify-code').value.trim();
  if (!code) { showAuthError('ENTER THE 6 DIGIT CODE'); return; }
  const res = await fetch('/api/verify-mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await res.json();
  if (!res.ok) { showAuthError(data.error); return; }
  showApp(data.username);
  document.getElementById('mfa-verify-modal').classList.remove('open');
}

// BREACH CHECKER
async function sha1(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
async function checkPasswordBreach(password) {
  const hash = await sha1(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' } });
    if (!res.ok) return { breached: false, count: 0, error: 'API unavailable' };
    const text = await res.text();
    for (const line of text.split('\n')) {
      const [h, c] = line.trim().split(':');
      if (h === suffix) return { breached: true, count: parseInt(c) };
    }
    return { breached: false, count: 0 };
  } catch (e) { return { breached: false, count: 0, error: 'Network error' }; }
}
function openBreachChecker() {
  document.getElementById('breach-modal').classList.add('open');
  document.getElementById('breach-input').value = '';
  document.getElementById('breach-result').style.display = 'none';
  document.getElementById('breach-loading').style.display = 'none';
  document.getElementById('scan-all-progress').style.display = 'none';
}
async function checkBreach() {
  const pw = document.getElementById('breach-input').value;
  if (!pw) { showToast('ENTER A PASSWORD TO CHECK', true); return; }
  const loadEl = document.getElementById('breach-loading');
  const resEl = document.getElementById('breach-result');
  loadEl.style.display = 'block'; resEl.style.display = 'none';
  const result = await checkPasswordBreach(pw);
  loadEl.style.display = 'none'; resEl.style.display = 'block';
  if (result.error) {
    resEl.className = 'breach-result compromised';
    resEl.innerHTML = `<div class="breach-result-title">⚠ CHECK FAILED</div><div class="breach-result-detail">${result.error}. Try again later.</div>`;
  } else if (result.breached) {
    resEl.className = 'breach-result compromised';
    resEl.innerHTML = `<div class="breach-result-title">⚠ PASSWORD COMPROMISED</div><div class="breach-result-detail">This password has appeared <strong style="color:var(--danger)">${result.count.toLocaleString()} times</strong> in known data breaches. Change it immediately.</div>`;
  } else {
    resEl.className = 'breach-result safe';
    resEl.innerHTML = '<div class="breach-result-title">✓ PASSWORD SECURE</div><div class="breach-result-detail">This password has not been found in any known data breaches.</div>';
  }
}
async function checkAllBreaches() {
  if (!allEntries.length) { showToast('NO ENTRIES TO SCAN', true); return; }
  const btn = document.getElementById('scan-all-btn');
  const prog = document.getElementById('scan-all-progress');
  btn.disabled = true; btn.textContent = 'SCANNING...';
  prog.style.display = 'block';
  let compromised = 0;
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    prog.textContent = `SCANNING ${i + 1}/${allEntries.length}: ${entry.site.toUpperCase()}`;
    const fullData = await (await fetch(`/api/passwords/${entry.id}`)).json();
    const result = await checkPasswordBreach(fullData.password);
    breachCache[entry.id] = result.breached;
    if (result.breached) compromised++;
    await new Promise(r => setTimeout(r, 150));
  }
  btn.disabled = false; btn.textContent = '⚡ SCAN ENTIRE VAULT';
  prog.textContent = `SCAN COMPLETE — ${compromised} COMPROMISED / ${allEntries.length} TOTAL`;
  filterEntries();
  if (compromised > 0) showToast(`⚠ ${compromised} BREACHED PASSWORDS FOUND`, true);
  else showToast('ALL PASSWORDS SECURE ✓');
}

// HEALTH DASHBOARD
function openHealthDashboard() { document.getElementById('health-modal').classList.add('open'); runHealthCheck(); }
async function runHealthCheck() {
  const content = document.getElementById('health-content');
  content.innerHTML = '<div style="text-align:center;padding:2rem;font-family:Orbitron,monospace;font-size:11px;letter-spacing:3px;color:var(--muted);">ANALYZING VAULT...</div>';
  const decrypted = [];
  for (const entry of allEntries) {
    const d = await (await fetch(`/api/passwords/${entry.id}`)).json();
    decrypted.push({ ...entry, plainPassword: d.password });
  }
  if (!decrypted.length) { content.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-family:Orbitron,monospace;font-size:11px;letter-spacing:3px;">NO ENTRIES TO ANALYZE</div>'; return; }
  function scorePassword(pw) {
    let s = 0;
    if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (pw.length >= 16) s++;
    if (/[A-Z]/.test(pw)) s++; if (/[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }
  const weak = decrypted.filter(e => scorePassword(e.plainPassword) < 4);
  const pwGroups = {};
  decrypted.forEach(e => { const k = e.plainPassword; if (!pwGroups[k]) pwGroups[k] = []; pwGroups[k].push(e); });
  const reused = decrypted.filter(e => pwGroups[e.plainPassword].length > 1);
  const now = new Date();
  const old = decrypted.filter(e => (now - new Date(e.created_at)) / (1000 * 60 * 60 * 24) > 90);
  const issues = new Set([...weak.map(e => e.id), ...reused.map(e => e.id), ...old.map(e => e.id)]);
  const score = Math.round(((decrypted.length - issues.size) / decrypted.length) * 100);
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--danger)';
  const scoreLabel = score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'FAIR' : 'CRITICAL';
  let html = `
  <div class="overall-score-wrap">
    <div class="overall-score-num" style="color:${scoreColor}">${score}</div>
    <div class="overall-score-details">
      <div class="overall-score-title" style="color:${scoreColor}">VAULT HEALTH: ${scoreLabel}</div>
      <div class="health-score-bar"><div class="health-score-fill" style="width:${score}%;background:${scoreColor}"></div></div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px;">${issues.size} of ${decrypted.length} passwords need attention</div>
    </div>
  </div>
  <div class="health-summary">
    <div class="health-stat ${weak.length > 0 ? 'danger' : 'good'}"><div class="health-stat-num">${weak.length}</div><div class="health-stat-label">Weak</div></div>
    <div class="health-stat ${reused.length > 0 ? 'warn' : 'good'}"><div class="health-stat-num">${reused.length}</div><div class="health-stat-label">Reused</div></div>
    <div class="health-stat ${old.length > 0 ? 'warn' : 'good'}"><div class="health-stat-num">${old.length}</div><div class="health-stat-label">Outdated</div></div>
  </div>`;
  if (weak.length) {
    html += `<div class="health-section"><div class="health-section-title red">⚠ WEAK PASSWORDS (${weak.length})</div>${weak.map(e => `<div class="health-item"><div><div class="health-item-site">${esc(e.site)}</div><div class="health-item-detail">${esc(e.username)}</div></div><span class="health-item-badge red">WEAK</span></div>`).join('')}</div>`;
  }
  if (reused.length) {
    const reusedGroups = Object.values(pwGroups).filter(g => g.length > 1);
    html += `<div class="health-section"><div class="health-section-title yellow">⚡ REUSED PASSWORDS (${reused.length} entries)</div>${reusedGroups.map(group => `<div class="health-item" style="flex-direction:column;align-items:flex-start;gap:6px;"><div style="display:flex;align-items:center;justify-content:space-between;width:100%;"><div style="font-family:Orbitron,monospace;font-size:10px;color:var(--yellow);">SAME PASSWORD ON ${group.length} SITES:</div><span class="health-item-badge yellow">REUSED</span></div><div style="display:flex;flex-wrap:wrap;gap:6px;">${group.map(e => `<span style="font-family:Orbitron,monospace;font-size:9px;padding:2px 8px;border:1px solid rgba(255,204,0,0.3);border-radius:2px;color:var(--accent2);">${esc(e.site)}</span>`).join('')}</div></div>`).join('')}</div>`;
  }
  if (old.length) {
    html += `<div class="health-section"><div class="health-section-title yellow">🕒 OUTDATED PASSWORDS (${old.length})</div>${old.map(e => { const days = Math.floor((now - new Date(e.created_at)) / (1000 * 60 * 60 * 24)); return `<div class="health-item"><div><div class="health-item-site">${esc(e.site)}</div><div class="health-item-detail">${esc(e.username)}</div></div><span class="health-item-badge yellow">${days}D OLD</span></div>`; }).join('')}</div>`;
  }
  if (!issues.size) {
    html += `<div style="text-align:center;padding:1.5rem;background:rgba(0,255,136,0.04);border:1px solid rgba(0,255,136,0.2);border-radius:2px;"><div style="font-size:2rem;margin-bottom:8px;">✓</div><div style="font-family:Orbitron,monospace;font-size:12px;letter-spacing:3px;color:var(--green);">ALL PASSWORDS HEALTHY</div></div>`;
  }
  content.innerHTML = html;
}

checkSession();