let allEntries = [], activeCategory = 'All', currentTab = 'login';
let breachCache = {};

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function isVisible(id) { return !document.getElementById(id).classList.contains('hidden'); }

// ===== LANDING =====
function showLanding() {
  const el = document.getElementById('landing-screen');
  el.classList.remove('hidden');
  el.style.display = 'flex';
  hide('auth-screen');
  hide('app-screen');
}
function showAuthFromLanding(tab) {
  hide('landing-screen');
  const el = document.getElementById('auth-screen');
  el.classList.remove('hidden');
  el.style.display = 'flex';
  switchTab(tab);
}

// Particles
(function() {
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

// ===== SESSION =====
async function checkSession() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (data.logged_in) {
    hide('landing-screen');
    showApp(data.username);
  } else {
    show('landing-screen');
  }
}

function showAuth() {
  hide('landing-screen');
  show('auth-screen');
  hide('app-screen');
}

function showApp(username) {
  hide('landing-screen');
  hide('auth-screen');
  const appEl = document.getElementById('app-screen');
  appEl.classList.remove('hidden');
  appEl.style.display = 'block';
  document.getElementById('user-badge').textContent = '▶ ' + username.toUpperCase();
  loadAll();
}

// ===== AUTH TABS =====
function switchTab(tab) {
  currentTab = tab;
  ['login','register','forgot'].forEach((t,i) => {
    document.getElementById('tab-'+t).classList.toggle('active', t === tab);
  });
  document.getElementById('login-fields').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-fields').classList.toggle('hidden', tab !== 'register');
  document.getElementById('forgot-fields').classList.toggle('hidden', tab !== 'forgot');
  document.getElementById('auth-btn').classList.toggle('hidden', tab === 'forgot');
  document.getElementById('auth-btn').textContent = tab === 'login' ? 'ACCESS VAULT' : 'CREATE ACCOUNT';
  hide('auth-error'); hide('auth-success');
}

async function lookupQuestion() {
  const username = document.getElementById('forgot-username').value.trim();
  if (!username) { showAuthError('Enter your username first'); return; }
  const res = await fetch('/api/get-security-question', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  const data = await res.json();
  if (!res.ok) { showAuthError(data.error); return; }
  document.getElementById('forgot-question-label').textContent = data.security_question;
  show('forgot-question-wrap'); show('auth-btn');
  document.getElementById('auth-btn').textContent = 'RESET PASSWORD';
  currentTab = 'reset';
}

async function submitAuth() {
  hide('auth-error'); hide('auth-success');
  if (currentTab === 'login') {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!username || !password) { showAuthError('All fields required'); return; }
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
    if (data.mfa_required) { document.getElementById('mfa-verify-modal').classList.add('open'); document.getElementById('mfa-verify-code').value = ''; return; }
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
    const sucEl = document.getElementById('auth-success');
    sucEl.textContent = 'Account created! Please log in.'; show('auth-success'); switchTab('login');
  } else if (currentTab === 'reset') {
    const username = document.getElementById('forgot-username').value.trim();
    const security_answer = document.getElementById('forgot-answer').value.trim();
    const new_password = document.getElementById('forgot-newpass').value;
    if (!security_answer || !new_password) { showAuthError('All fields required'); return; }
    const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, security_answer, new_password }) });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); return; }
    const sucEl = document.getElementById('auth-success');
    sucEl.textContent = 'Password reset! Please log in.'; show('auth-success'); switchTab('login');
  }
}

function showAuthError(msg) { const el = document.getElementById('auth-error'); el.textContent = msg; show('auth-error'); }
async function logout() { await fetch('/api/logout', { method: 'POST' }); showLanding(); }

// ===== VAULT =====
async function loadAll() {
  // Show skeleton while loading
  const grid = document.getElementById('cards-grid');
  hide('empty-state');
  grid.innerHTML = `<div class="vault-loading">
    ${[1,2,3].map(() => '<div class="skeleton skeleton-card"></div>').join('')}
  </div>`;
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
  document.getElementById('cat-filters').innerHTML = used.map(c =>
    `<button class="cat-filter ${c === activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  document.querySelectorAll('.cat-filter').forEach(btn => {
    btn.addEventListener('click', () => { activeCategory = btn.dataset.cat; renderCatFilters(); filterEntries(); });
  });
}

function filterEntries() {
  const q = document.getElementById('search').value.toLowerCase();
  let f = allEntries;
  if (activeCategory !== 'All') f = f.filter(e => e.category === activeCategory);
  if (q) f = f.filter(e => e.site.toLowerCase().includes(q) || e.username.toLowerCase().includes(q));
  renderCards(f);
  document.getElementById('result-count').textContent = `${f.length} RECORDS`;
}

// Favicon color based on site name
function getFaviconColor(site) {
  const colors = [0,1,2,3,4,5];
  let hash = 0;
  for (let i = 0; i < site.length; i++) hash = site.charCodeAt(i) + ((hash << 5) - hash);
  return `favicon-color-${Math.abs(hash) % 6}`;
}

// Get site initial for favicon fallback
function getSiteInitial(site) {
  return site.replace(/https?:\/\//, '').replace(/www\./, '').charAt(0).toUpperCase();
}

function renderCards(entries) {
  const grid = document.getElementById('cards-grid');
  if (!entries.length) {
    grid.innerHTML = '';
    const empty = document.getElementById('empty-state');
    empty.innerHTML = `
      <span class="empty-vault-icon">🔐</span>
      <h3>VAULT IS EMPTY</h3>
      <p>Your vault is clean and ready. Add your first encrypted entry to get started.</p>
      <div class="empty-hint">PRESS + NEW ENTRY TO BEGIN</div>`;
    show('empty-state');
    return;
  }
  hide('empty-state');
  grid.innerHTML = entries.map(e => {
    const cached = breachCache[e.id];
    const breachHtml = cached === true ? '<div class="breach-badge compromised">⚠ BREACHED</div>' : cached === false ? '<div class="breach-badge safe">✓ SECURE</div>' : '';
    const faviconColor = getFaviconColor(e.site);
    const siteInitial = getSiteInitial(e.site);
    const daysOld = Math.floor((new Date() - new Date(e.created_at)) / (1000*60*60*24));
    const ageLabel = daysOld === 0 ? 'TODAY' : daysOld === 1 ? '1D AGO' : daysOld < 30 ? `${daysOld}D AGO` : daysOld < 365 ? `${Math.floor(daysOld/30)}MO AGO` : `${Math.floor(daysOld/365)}Y AGO`;
    return `<div class="card" id="card-${e.id}">
      <div class="card-corner"></div><div class="card-corner-bl"></div>
      <div class="card-header-row">
        <div class="card-favicon ${faviconColor}">
          <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(e.site)}&sz=32" 
               onerror="this.style.display='none';this.nextSibling.style.display='block'"
               style="width:20px;height:20px;" />
          <span class="card-favicon-fallback" style="display:none">${esc(siteInitial)}</span>
        </div>
        <div class="card-site-wrap">
          <div class="card-site">${esc(e.site)}</div>
        </div>
        <span class="cat-tag ${esc(e.category||'General')}">${esc(e.category||'General')}</span>
      </div>
      <div class="card-user">${esc(e.username)}</div>
      <div class="card-pass">
        <span class="card-pass-text" id="pw-${e.id}">● ● ● ● ● ● ● ●</span>
        <button class="eye-btn" data-id="${e.id}">👁</button>
        <button class="copy-btn" data-id="${e.id}">📋</button>
      </div>
      ${breachHtml}
      <div class="card-quick-actions">
        <button class="card-quick-btn quick-copy-btn" data-id="${e.id}">⚡ COPY PASSWORD</button>
        <button class="card-quick-btn quick-copy-user-btn" data-id="${e.id}" data-user="${esc(e.username)}">👤 COPY USER</button>
      </div>
      ${e.notes ? `<div class="card-notes">${esc(e.notes)}</div>` : ''}
      <div class="card-meta-row">
        <div class="card-date">${esc(ageLabel)}</div>
      </div>
      <div class="card-actions-row">
        <button class="btn btn-sm btn-edit edit-btn" data-id="${e.id}">EDIT</button>
        <button class="btn btn-sm btn-danger delete-btn" data-id="${e.id}">DELETE</button>
        <button class="btn-fav ${e.favorite ? 'active' : ''} fav-btn" data-id="${e.id}" title="Favorite">${e.favorite ? '⭐' : '☆'}</button>
        <button class="btn btn-sm btn-edit share-btn" data-id="${e.id}" title="Share">🔗</button>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.eye-btn').forEach(btn => btn.addEventListener('click', () => togglePass(btn.dataset.id)));
  grid.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', () => copyPass(btn.dataset.id)));
  grid.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.id)));
  grid.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deleteEntry(btn.dataset.id)));
  grid.querySelectorAll('.fav-btn').forEach(btn => btn.addEventListener('click', () => toggleFavorite(btn.dataset.id)));
  grid.querySelectorAll('.share-btn').forEach(btn => btn.addEventListener('click', () => openShare(btn.dataset.id)));
  grid.querySelectorAll('.quick-copy-btn').forEach(btn => btn.addEventListener('click', async () => {
    const data = await (await fetch(`/api/passwords/${btn.dataset.id}`)).json();
    navigator.clipboard.writeText(data.password).then(() => {
      btn.textContent = '✓ COPIED!';
      btn.classList.add('copy-success');
      setTimeout(() => { btn.textContent = '⚡ COPY PASSWORD'; btn.classList.remove('copy-success'); }, 1500);
    });
  }));
  grid.querySelectorAll('.quick-copy-user-btn').forEach(btn => btn.addEventListener('click', () => {
    navigator.clipboard.writeText(btn.dataset.user).then(() => {
      btn.textContent = '✓ COPIED!';
      btn.classList.add('copy-success');
      setTimeout(() => { btn.textContent = '👤 COPY USER'; btn.classList.remove('copy-success'); }, 1500);
    });
  }));
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function togglePass(id) {
  const el = document.getElementById(`pw-${id}`);
  if (el.classList.contains('revealed')) { el.textContent = '● ● ● ● ● ● ● ●'; el.classList.remove('revealed'); return; }
  const data = await (await fetch(`/api/passwords/${id}`)).json();
  el.textContent = data.password; el.classList.add('revealed');
}

async function copyPass(id) {
  const data = await (await fetch(`/api/passwords/${id}`)).json();
  navigator.clipboard.writeText(data.password).then(() => showToast('KEY COPIED TO CLIPBOARD', 'success'));
}

function openAdd() {
  document.getElementById('modal-title').textContent = '// NEW ENTRY';
  document.getElementById('edit-id').value = '';
  ['f-site','f-user','f-pass','f-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-category').value = 'General';
  document.getElementById('f-pass').type = 'password';
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

async function saveEntry() {
  const id = document.getElementById('edit-id').value;
  const body = { site: document.getElementById('f-site').value.trim(), username: document.getElementById('f-user').value.trim(), password: document.getElementById('f-pass').value, notes: document.getElementById('f-notes').value.trim(), category: document.getElementById('f-category').value };
  if (!body.site || !body.username || !body.password) { showToast('ALL FIELDS REQUIRED', true); return; }
  await fetch(id ? `/api/passwords/${id}` : '/api/passwords', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  document.getElementById('entry-modal').classList.remove('open');
  showToast(id ? 'ENTRY UPDATED' : 'ENTRY ENCRYPTED & SAVED'); loadAll();
}

async function deleteEntry(id) {
  if (!confirm('CONFIRM DELETE — This cannot be undone.')) return;
  await fetch(`/api/passwords/${id}`, { method: 'DELETE' });
  showToast('ENTRY PURGED FROM VAULT', 'warning'); loadAll();
}

// ===== GENERATOR =====
let lastGen = '';
function openGenerator() { document.getElementById('gen-modal').classList.add('open'); generatePassword(); }
function generatePassword() {
  const upper = document.getElementById('g-upper').checked, lower = document.getElementById('g-lower').checked;
  const nums = document.getElementById('g-nums').checked, syms = document.getElementById('g-syms').checked;
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
  if (pw.length>=12) s++; if (pw.length>=16) s++;
  if (/[A-Z]/.test(pw)) s++; if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  const colors = ['#ff2020','#ff4500','#ff8c00','#ffb347','#00ff88'], widths = ['20%','40%','60%','80%','100%'];
  document.getElementById('strength-bar').style.background = colors[Math.min(s,4)];
  document.getElementById('strength-bar').style.width = widths[Math.min(s,4)];
}

function updateEntryStrength(pw) {
  const wrap = document.getElementById('entry-strength-wrap');
  if (!wrap) return;
  if (!pw) { wrap.style.opacity = '0'; return; }
  wrap.style.opacity = '1';
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const level = s <= 1 ? 0 : s <= 2 ? 1 : s <= 3 ? 2 : s <= 4 ? 3 : 4;
  const labels = ['VERY WEAK', 'WEAK', 'FAIR', 'STRONG', 'VERY STRONG'];
  const types = ['weak', 'weak', 'fair', 'good', 'strong'];
  const segs = wrap.querySelectorAll('.strength-bar-seg');
  segs.forEach((seg, i) => {
    seg.className = 'strength-bar-seg';
    if (i <= level) seg.classList.add('active', types[level]);
  });
  const label = wrap.querySelector('.strength-meter-label');
  const labelColors = { weak:'var(--danger)', fair:'var(--yellow)', good:'var(--accent2)', strong:'var(--green)' };
  label.textContent = labels[level];
  label.style.color = labelColors[types[level]];
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const icons = { success: '✓', error: '⚠', info: '◈', warning: '⚡' };
  const toastType = type === true ? 'error' : type === false ? 'success' : type;
  t.className = `toast toast-${toastType}`;
  t.innerHTML = `<span class="toast-icon">${icons[toastType] || '◈'}</span><span class="toast-msg">${msg}</span>`;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== MFA =====
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
  showToast('MFA ENABLED!', 'success'); document.getElementById('mfa-modal').classList.remove('open');
}
async function verifyMFA() {
  const code = document.getElementById('mfa-verify-code').value.trim();
  if (!code) { showAuthError('ENTER THE 6 DIGIT CODE'); return; }
  const res = await fetch('/api/verify-mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await res.json();
  if (!res.ok) { showAuthError(data.error); return; }
  showApp(data.username); document.getElementById('mfa-verify-modal').classList.remove('open');
}

// ===== BREACH =====
async function sha1(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
async function checkPasswordBreach(password) {
  const hash = await sha1(password), prefix = hash.slice(0,5), suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' } });
    if (!res.ok) return { breached: false, count: 0, error: 'API unavailable' };
    for (const line of (await res.text()).split('\n')) {
      const [h,c] = line.trim().split(':');
      if (h === suffix) return { breached: true, count: parseInt(c) };
    }
    return { breached: false, count: 0 };
  } catch(e) { return { breached: false, count: 0, error: 'Network error' }; }
}
function openBreachChecker() {
  document.getElementById('breach-modal').classList.add('open');
  document.getElementById('breach-input').value = '';
  hide('breach-result'); hide('breach-loading'); hide('scan-all-progress');
}
async function checkBreach() {
  const pw = document.getElementById('breach-input').value;
  if (!pw) { showToast('ENTER A PASSWORD TO CHECK', true); return; }
  show('breach-loading'); hide('breach-result');
  const result = await checkPasswordBreach(pw);
  hide('breach-loading'); show('breach-result');
  const resEl = document.getElementById('breach-result');
  if (result.error) {
    resEl.className = 'breach-result compromised';
    resEl.innerHTML = `<div class="breach-result-title">⚠ CHECK FAILED</div><div class="breach-result-detail">${result.error}</div>`;
  } else if (result.breached) {
    resEl.className = 'breach-result compromised';
    resEl.innerHTML = `<div class="breach-result-title">⚠ PASSWORD COMPROMISED</div><div class="breach-result-detail">Found <strong>${result.count.toLocaleString()} times</strong> in known data breaches. Change it immediately.</div>`;
  } else {
    resEl.className = 'breach-result safe';
    resEl.innerHTML = '<div class="breach-result-title">✓ PASSWORD SECURE</div><div class="breach-result-detail">Not found in any known data breaches.</div>';
  }
}
async function checkAllBreaches() {
  if (!allEntries.length) { showToast('NO ENTRIES TO SCAN', true); return; }
  const btn = document.getElementById('scan-all-btn');
  const prog = document.getElementById('scan-all-progress');
  btn.disabled = true; btn.textContent = 'SCANNING...'; show('scan-all-progress');
  let compromised = 0;
  for (let i = 0; i < allEntries.length; i++) {
    prog.textContent = `SCANNING ${i+1}/${allEntries.length}: ${allEntries[i].site.toUpperCase()}`;
    const fullData = await (await fetch(`/api/passwords/${allEntries[i].id}`)).json();
    const result = await checkPasswordBreach(fullData.password);
    breachCache[allEntries[i].id] = result.breached;
    if (result.breached) compromised++;
    await new Promise(r => setTimeout(r, 150));
  }
  btn.disabled = false; btn.textContent = '⚡ SCAN ENTIRE VAULT';
  prog.textContent = `COMPLETE — ${compromised} COMPROMISED / ${allEntries.length} TOTAL`;
  filterEntries();
  if (compromised > 0) showToast(`⚠ ${compromised} BREACHED FOUND`, true);
  else showToast('ALL PASSWORDS SECURE ✓', 'success');
}

// ===== HEALTH =====
function openHealthDashboard() { document.getElementById('health-modal').classList.add('open'); runHealthCheck(); }
async function runHealthCheck() {
  const content = document.getElementById('health-content');
  content.innerHTML = '<div class="health-loading">ANALYZING VAULT...</div>';
  const decrypted = [];
  for (const entry of allEntries) {
    const d = await (await fetch(`/api/passwords/${entry.id}`)).json();
    decrypted.push({ ...entry, plainPassword: d.password });
  }
  if (!decrypted.length) { content.innerHTML = '<div class="health-loading">NO ENTRIES TO ANALYZE</div>'; return; }
  function scorePassword(pw) {
    let s = 0;
    if (pw.length>=8) s++; if (pw.length>=12) s++; if (pw.length>=16) s++;
    if (/[A-Z]/.test(pw)) s++; if (/[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }
  const weak = decrypted.filter(e => scorePassword(e.plainPassword) < 4);
  const pwGroups = {};
  decrypted.forEach(e => { if (!pwGroups[e.plainPassword]) pwGroups[e.plainPassword] = []; pwGroups[e.plainPassword].push(e); });
  const reused = decrypted.filter(e => pwGroups[e.plainPassword].length > 1);
  const now = new Date();
  const old = decrypted.filter(e => (now - new Date(e.created_at)) / (1000*60*60*24) > 90);
  const issues = new Set([...weak.map(e=>e.id), ...reused.map(e=>e.id), ...old.map(e=>e.id)]);
  const score = Math.round(((decrypted.length - issues.size) / decrypted.length) * 100);
  const scoreColor = score>=80?'var(--green)':score>=50?'var(--yellow)':'var(--danger)';
  const scoreLabel = score>=80?'EXCELLENT':score>=60?'GOOD':score>=40?'FAIR':'CRITICAL';
  let html = `<div class="overall-score-wrap">
    <div class="overall-score-num" style="color:${scoreColor}">${score}</div>
    <div class="overall-score-details">
      <div class="overall-score-title" style="color:${scoreColor}">VAULT HEALTH: ${scoreLabel}</div>
      <div class="health-score-bar"><div class="health-score-fill" style="width:${score}%;background:${scoreColor}"></div></div>
      <div class="health-score-detail">${issues.size} of ${decrypted.length} passwords need attention</div>
    </div>
  </div>
  <div class="health-summary">
    <div class="health-stat ${weak.length>0?'danger':'good'}"><div class="health-stat-num">${weak.length}</div><div class="health-stat-label">Weak</div></div>
    <div class="health-stat ${reused.length>0?'warn':'good'}"><div class="health-stat-num">${reused.length}</div><div class="health-stat-label">Reused</div></div>
    <div class="health-stat ${old.length>0?'warn':'good'}"><div class="health-stat-num">${old.length}</div><div class="health-stat-label">Outdated</div></div>
  </div>`;
  if (weak.length) html += `<div class="health-section"><div class="health-section-title red">⚠ WEAK PASSWORDS (${weak.length})</div>${weak.map(e=>`<div class="health-item"><div><div class="health-item-site">${esc(e.site)}</div><div class="health-item-detail">${esc(e.username)}</div></div><span class="health-item-badge red">WEAK</span></div>`).join('')}</div>`;
  if (reused.length) {
    const groups = Object.values(pwGroups).filter(g=>g.length>1);
    html += `<div class="health-section"><div class="health-section-title yellow">⚡ REUSED (${reused.length} entries)</div>${groups.map(g=>`<div class="health-item health-item-col"><div class="health-item-row"><div class="health-item-reused-label">SAME PASSWORD ON ${g.length} SITES:</div><span class="health-item-badge yellow">REUSED</span></div><div class="health-item-chips">${g.map(e=>`<span class="health-chip">${esc(e.site)}</span>`).join('')}</div></div>`).join('')}</div>`;
  }
  if (old.length) html += `<div class="health-section"><div class="health-section-title yellow">🕒 OUTDATED (${old.length})</div>${old.map(e=>{const days=Math.floor((now-new Date(e.created_at))/(1000*60*60*24));return`<div class="health-item"><div><div class="health-item-site">${esc(e.site)}</div><div class="health-item-detail">${esc(e.username)}</div></div><span class="health-item-badge yellow">${days}D OLD</span></div>`;}).join('')}</div>`;
  if (!issues.size) html += `<div class="health-all-clear"><div class="health-all-clear-icon">✓</div><div class="health-all-clear-title">ALL PASSWORDS HEALTHY</div></div>`;
  content.innerHTML = html;
}

// AUTO LOCK
let lockTimer;
function resetLockTimer() {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    if (isVisible('app-screen')) {
      showToast('VAULT LOCKED DUE TO INACTIVITY');
      setTimeout(() => { fetch('/api/logout', { method: 'POST' }); showLanding(); }, 2000);
    }
  }, 5 * 60 * 1000);
}
document.addEventListener('mousemove', resetLockTimer);
document.addEventListener('keypress', resetLockTimer);
document.addEventListener('click', resetLockTimer);
resetLockTimer();

// ===== WIRE UP ALL EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  // Landing
  document.getElementById('nav-login-btn').addEventListener('click', () => showAuthFromLanding('login'));
  document.getElementById('nav-register-btn').addEventListener('click', () => showAuthFromLanding('register'));
  document.getElementById('cta-login-btn').addEventListener('click', () => showAuthFromLanding('login'));
  document.getElementById('cta-register-btn').addEventListener('click', () => showAuthFromLanding('register'));

  // Auth tabs
  document.getElementById('tab-login').addEventListener('click', () => switchTab('login'));
  document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));
  document.getElementById('tab-forgot').addEventListener('click', () => switchTab('forgot'));
  document.getElementById('auth-btn').addEventListener('click', submitAuth);
  document.getElementById('lookup-btn').addEventListener('click', lookupQuestion);
  document.getElementById('back-to-landing-link').addEventListener('click', showLanding);
  document.getElementById('auth-username').addEventListener('keydown', e => { if (e.key==='Enter') submitAuth(); });
  document.getElementById('auth-password').addEventListener('keydown', e => { if (e.key==='Enter') submitAuth(); });

  // App header
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('health-btn').addEventListener('click', openHealthDashboard);
  document.getElementById('dashboard-btn').addEventListener('click', openDashboard);
  document.getElementById('activity-btn').addEventListener('click', openActivity);
  document.getElementById('import-btn').addEventListener('click', openImport);
  document.getElementById('breach-btn').addEventListener('click', openBreachChecker);
  document.getElementById('mfa-setup-btn').addEventListener('click', openMFASetup);
  document.getElementById('security-info-btn').addEventListener('click', () => document.getElementById('security-info-wrap').classList.add('open'));
  document.getElementById('generator-btn').addEventListener('click', openGenerator);
  document.getElementById('new-entry-btn').addEventListener('click', openAdd);
  document.getElementById('close-security-btn').addEventListener('click', () => document.getElementById('security-info-wrap').classList.remove('open'));

  // Dashboard modal
  document.getElementById('close-dashboard-btn').addEventListener('click', () => hide('dashboard-modal'));
  document.getElementById('refresh-dashboard-btn').addEventListener('click', loadDashboard);

  // Activity modal
  document.getElementById('close-activity-btn').addEventListener('click', () => hide('activity-modal'));

  // Import modal
  document.getElementById('close-import-btn').addEventListener('click', () => hide('import-modal'));
  document.getElementById('confirm-import-btn').addEventListener('click', confirmImport);
  setupCSVDrop();

  // Confirm delete modal
  document.getElementById('cancel-delete-btn').addEventListener('click', () => hide('confirm-delete-modal'));
  document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);

  // Account deletion modal
  document.getElementById('cancel-delete-account-btn').addEventListener('click', () => hide('delete-account-modal'));
  document.getElementById('confirm-delete-account-btn').addEventListener('click', deleteAccount);

  // Search
  document.getElementById('search').addEventListener('input', filterEntries);

  // Entry modal
  document.getElementById('close-modal-btn').addEventListener('click', () => document.getElementById('entry-modal').classList.remove('open'));
  document.getElementById('save-entry-btn').addEventListener('click', saveEntry);
  document.getElementById('toggle-pass-btn').addEventListener('click', () => { const f = document.getElementById('f-pass'); f.type = f.type==='password'?'text':'password'; });
  document.getElementById('quick-gen-btn').addEventListener('click', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pw = ''; for (let i=0;i<16;i++) pw+=chars[Math.floor(Math.random()*chars.length)];
    document.getElementById('f-pass').value = pw;
    document.getElementById('f-pass').type = 'text';
    updateEntryStrength(pw);
    showToast('ACCESS KEY GENERATED', 'info');
  });

  // Live password strength meter in entry form
  document.getElementById('f-pass').addEventListener('input', () => {
    updateEntryStrength(document.getElementById('f-pass').value);
  });

  // Generator modal
  document.getElementById('close-gen-btn').addEventListener('click', () => document.getElementById('gen-modal').classList.remove('open'));
  document.getElementById('regen-btn').addEventListener('click', generatePassword);
  document.getElementById('copy-gen-btn').addEventListener('click', () => { if (lastGen) navigator.clipboard.writeText(lastGen).then(() => showToast('KEY COPIED', 'success')); });
  document.getElementById('g-len').addEventListener('input', () => { document.getElementById('g-len-val').textContent = document.getElementById('g-len').value; generatePassword(); });
  ['g-upper','g-lower','g-nums','g-syms'].forEach(id => document.getElementById(id).addEventListener('change', generatePassword));

  // Breach modal
  document.getElementById('close-breach-btn').addEventListener('click', () => document.getElementById('breach-modal').classList.remove('open'));
  document.getElementById('breach-scan-btn').addEventListener('click', checkBreach);
  document.getElementById('breach-input').addEventListener('keydown', e => { if (e.key==='Enter') checkBreach(); });
  document.getElementById('scan-all-btn').addEventListener('click', checkAllBreaches);

  // Health modal
  document.getElementById('close-health-btn').addEventListener('click', () => document.getElementById('health-modal').classList.remove('open'));
  document.getElementById('refresh-health-btn').addEventListener('click', runHealthCheck);

  // MFA modals
  document.getElementById('close-mfa-btn').addEventListener('click', () => document.getElementById('mfa-modal').classList.remove('open'));
  document.getElementById('confirm-mfa-btn').addEventListener('click', confirmMFA);
  document.getElementById('verify-mfa-btn').addEventListener('click', verifyMFA);
  document.getElementById('mfa-verify-code').addEventListener('keydown', e => { if (e.key==='Enter') verifyMFA(); });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target===m) m.classList.remove('open'); }));

  checkSession();
});

// ===== FAVORITES =====
async function toggleFavorite(id) {
  const res = await fetch(`/api/passwords/${id}/favorite`, { method: 'POST' });
  const data = await res.json();
  showToast(data.favorite ? '⭐ ADDED TO FAVORITES' : 'REMOVED FROM FAVORITES', data.favorite ? 'success' : 'info');
  loadAll();
}

// ===== DASHBOARD =====
async function openDashboard() {
  show('dashboard-modal');
  await loadDashboard();
}

async function loadDashboard() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = '<div class="health-loading">LOADING STATS...</div>';
  const [stats, decrypted] = await Promise.all([
    fetch('/api/stats').then(r => r.json()),
    Promise.all(allEntries.map(e => fetch(`/api/passwords/${e.id}`).then(r => r.json())))
  ]);

  // Calculate security score
  function scorePass(pw) {
    let s = 0;
    if (pw.length>=8) s++; if (pw.length>=12) s++; if (pw.length>=16) s++;
    if (/[A-Z]/.test(pw)) s++; if (/[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }
  const pwGroups = {};
  decrypted.forEach(d => { if (!pwGroups[d.password]) pwGroups[d.password] = 0; pwGroups[d.password]++; });
  const weakCount = decrypted.filter(d => scorePass(d.password) < 4).length;
  const reusedCount = decrypted.filter(d => pwGroups[d.password] > 1).length;
  const oldCount = stats.old_passwords || 0;
  const total = stats.total || 1;
  const issues = new Set([
    ...decrypted.filter(d => scorePass(d.password) < 4).map(d => d.id),
    ...decrypted.filter(d => pwGroups[d.password] > 1).map(d => d.id)
  ]);
  const score = Math.max(0, Math.round(((total - issues.size - oldCount * 0.5) / total) * 100));
  const scoreColor = score >= 80 ? '#00ff88' : score >= 60 ? '#ffcc00' : '#ff4500';
  const circumference = 2 * Math.PI * 46;
  const dashOffset = circumference - (score / 100) * circumference;

  // Category colors
  const catColors = { Social:'#c084fc', Work:'#34d399', Banking:'#60a5fa', Shopping:'#fb923c', Gaming:'#f472b6', Email:'#fbbf24', General:'#94a3b8', Other:'#94a3b8' };
  const maxCat = Math.max(...stats.categories.map(c => c.count), 1);

  content.innerHTML = `
    <div class="dash-layout">
      <div class="security-score-wrap">
        <div class="security-score-ring">
          <svg viewBox="0 0 100 100" width="100" height="100">
            <circle class="score-ring-bg" cx="50" cy="50" r="46"/>
            <circle class="score-ring-fill ${score>=80?'score-green':score>=60?'score-yellow':'score-red'}" cx="50" cy="50" r="46"
              stroke="${scoreColor}"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashOffset}"/>
          </svg>
          <div class="security-score-num ${score>=80?'score-green':score>=60?'score-yellow':'score-red'}">${score}</div>
        </div>
        <div class="security-score-label">SECURITY SCORE</div>
      </div>
      <div class="dash-stats-block">
        <div class="dashboard-grid">
          <div class="dash-stat accent"><div class="dash-stat-num">${stats.total}</div><div class="dash-stat-label">Total Entries</div></div>
          <div class="dash-stat purple"><div class="dash-stat-num">${stats.favorites}</div><div class="dash-stat-label">Favorites</div></div>
          <div class="dash-stat green"><div class="dash-stat-num">${stats.added_week}</div><div class="dash-stat-label">Added This Week</div></div>
          <div class="dash-stat yellow"><div class="dash-stat-num">${oldCount}</div><div class="dash-stat-label">Outdated (90d+)</div></div>
          <div class="dash-stat"><div class="dash-stat-num dash-weak-num">${weakCount}</div><div class="dash-stat-label">Weak Passwords</div></div>
          <div class="dash-stat blue"><div class="dash-stat-num">${stats.added_month}</div><div class="dash-stat-label">Added This Month</div></div>
        </div>
      </div>
    </div>
    ${stats.categories.length ? `
    <div class="cat-chart">
      <div class="cat-chart-title">ENTRIES BY CATEGORY</div>
      ${stats.categories.map(c => `
        <div class="cat-bar-row">
          <div class="cat-bar-label">${esc(c.category||'General')}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.round((c.count/maxCat)*100)}%;background:${catColors[c.category]||'#94a3b8'}"></div></div>
          <div class="cat-bar-count">${c.count}</div>
        </div>`).join('')}
    </div>` : ''}
    <div class="dash-danger-zone">
      <button class="btn btn-danger btn-sm" id="open-delete-account-btn">🗑 DELETE ACCOUNT</button>
    </div>`;

  document.getElementById('open-delete-account-btn').addEventListener('click', () => {
    hide('dashboard-modal');
    show('delete-account-modal');
  });
}

// ===== LOGIN ACTIVITY =====
async function openActivity() {
  show('activity-modal');
  const content = document.getElementById('activity-content');
  content.innerHTML = '<div class="health-loading">LOADING...</div>';
  const logs = await fetch('/api/login-log').then(r => r.json());
  if (!logs.length) {
    content.innerHTML = '<div class="health-loading">NO ACTIVITY YET</div>';
    return;
  }
  content.innerHTML = logs.map(l => {
    const d = new Date(l.created_at);
    const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    return `<div class="login-log-item">
      <div class="login-log-icon">${l.success ? '✅' : '❌'}</div>
      <div class="login-log-info">
        <div class="login-log-time">${timeStr}</div>
        <div class="login-log-ip">${l.ip_address || 'Unknown IP'}</div>
      </div>
      <span class="login-log-badge success">${l.success ? 'SUCCESS' : 'FAILED'}</span>
    </div>`;
  }).join('');
}

// ===== SHARE PASSWORD =====
let sharePasswordId = null;
function openShare(id) {
  sharePasswordId = id;
  const content = document.getElementById('share-content');
  content.innerHTML = `
    <p class="modal-desc">Generate a one-time encrypted link. Expires after 24 hours or first view.</p>
    <div class="modal-footer" style="margin-top:0;">
      <button class="btn btn-cancel" id="cancel-share-btn">CANCEL</button>
      <button class="btn btn-primary" id="generate-share-btn">GENERATE LINK</button>
    </div>`;
  document.getElementById('cancel-share-btn').addEventListener('click', () => hide('share-modal'));
  document.getElementById('generate-share-btn').addEventListener('click', generateShareLink);
  show('share-modal');
}

async function generateShareLink() {
  if (!sharePasswordId) return;
  const res = await fetch(`/api/passwords/${sharePasswordId}/share`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  const link = `${window.location.origin}/api/share/${data.token}`;
  const content = document.getElementById('share-content');
  content.innerHTML = `
    <div class="share-link-box" id="share-link-text" title="Click to copy">${link}</div>
    <div class="share-warning">⚠ This link can only be viewed ONCE and expires in 24 hours.</div>
    <div class="share-expiry">EXPIRES: ${new Date(data.expires_at).toLocaleString()}</div>
    <div class="modal-footer">
      <button class="btn btn-cancel" id="close-share-done">CLOSE</button>
      <button class="btn btn-primary" id="copy-share-link">📋 COPY LINK</button>
    </div>`;
  document.getElementById('copy-share-link').addEventListener('click', () => {
    navigator.clipboard.writeText(link).then(() => showToast('SHARE LINK COPIED!', 'success'));
  });
  document.getElementById('share-link-text').addEventListener('click', () => {
    navigator.clipboard.writeText(link).then(() => showToast('LINK COPIED!', 'success'));
  });
  document.getElementById('close-share-done').addEventListener('click', () => hide('share-modal'));
}

// ===== CSV IMPORT =====
let csvEntries = [];

function openImport() {
  csvEntries = [];
  show('import-modal');
  hide('csv-preview');
  hide('confirm-import-btn');
  document.getElementById('csv-file-input').value = '';
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const entries = [];
  // Detect header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('url') || firstLine.includes('site') || firstLine.includes('name') || firstLine.includes('username');
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;
    let site = '', username = '', password = '', notes = '';
    if (cols.length >= 4) {
      // LastPass/Chrome: name, url, username, password
      site = cols[1] || cols[0];
      username = cols[2];
      password = cols[3];
      notes = cols[4] || '';
    } else if (cols.length === 3) {
      site = cols[0]; username = cols[1]; password = cols[2];
    } else if (cols.length === 2) {
      site = cols[0]; password = cols[1];
    }
    if (site && password) entries.push({ site, username, password, notes });
  }
  return entries;
}

function setupCSVDrop() {
  const zone = document.getElementById('csv-drop-zone');
  const input = document.getElementById('csv-file-input');
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processCSVFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) processCSVFile(input.files[0]);
  });
}

function processCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    csvEntries = parseCSV(e.target.result);
    const preview = document.getElementById('csv-preview');
    const confirmBtn = document.getElementById('confirm-import-btn');
    if (!csvEntries.length) {
      showToast('No valid entries found in CSV', 'error');
      return;
    }
    preview.innerHTML = `<div style="font-family:'Orbitron',monospace;font-size:10px;color:var(--accent2);letter-spacing:2px;margin-bottom:8px;">${csvEntries.length} ENTRIES FOUND</div>` +
      csvEntries.slice(0, 5).map(e => `
        <div class="csv-preview-row">
          <span>${esc(e.site)}</span>
          <span>${esc(e.username)}</span>
          <span>${'●'.repeat(Math.min(e.password.length, 8))}</span>
        </div>`).join('') +
      (csvEntries.length > 5 ? `<div style="font-size:11px;color:var(--muted);padding:6px 0;">...and ${csvEntries.length - 5} more</div>` : '');
    show('csv-preview');
    show('confirm-import-btn');
    confirmBtn.textContent = `IMPORT ${csvEntries.length} PASSWORDS`;
  };
  reader.readAsText(file);
}

async function confirmImport() {
  if (!csvEntries.length) return;
  const btn = document.getElementById('confirm-import-btn');
  btn.disabled = true;
  btn.textContent = 'IMPORTING...';
  const res = await fetch('/api/import/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: csvEntries })
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); btn.disabled = false; return; }
  document.getElementById('import-modal').querySelector('.modal').innerHTML = `
    <div class="import-success">
      <div class="import-success-num">${data.count}</div>
      <div class="import-success-label">PASSWORDS IMPORTED</div>
      <div style="margin-top:1.5rem;">
        <button class="btn btn-primary" id="close-import-success">CLOSE</button>
      </div>
    </div>`;
  document.getElementById('close-import-success').addEventListener('click', () => {
    hide('import-modal');
    loadAll();
  });
  showToast(`${data.count} PASSWORDS IMPORTED!`, 'success');
}

// ===== CONFIRM DELETE (no browser confirm) =====
let pendingDeleteId = null;
function deleteEntry(id) {
  pendingDeleteId = id;
  show('confirm-delete-modal');
}
async function confirmDelete() {
  if (!pendingDeleteId) return;
  await fetch(`/api/passwords/${pendingDeleteId}`, { method: 'DELETE' });
  hide('confirm-delete-modal');
  showToast('ENTRY PURGED FROM VAULT', 'warning');
  loadAll();
  pendingDeleteId = null;
}

// ===== ACCOUNT DELETION =====
async function deleteAccount() {
  const pass = document.getElementById('delete-account-pass').value;
  if (!pass) { showToast('ENTER YOUR PASSWORD', 'error'); return; }
  const res = await fetch('/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass })
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast('ACCOUNT DELETED', 'warning');
  setTimeout(() => showLanding(), 1500);
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (!isVisible('app-screen')) return;
  if (e.key === 'n' || e.key === 'N') openAdd();
  if (e.key === '/') { e.preventDefault(); document.getElementById('search').focus(); }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});