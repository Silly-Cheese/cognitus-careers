import './styles.css';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from './firebase.js';

const appEl = document.querySelector('#app');
const SESSION_KEY = 'ctg_session_uid';
const BOOTSTRAP_KEY = 'CognitusOwnerSetup2026';
const roles = ['applicant', 'reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const executiveRoles = ['executive', 'owner'];

const state = { profile: null };

window.addEventListener('hashchange', render);

function routeTo(path) {
  window.location.hash = path;
}

function html(strings, ...values) {
  return strings.map((s, i) => s + (values[i] ?? '')).join('');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeDiscordId(value) {
  const id = String(value || '').trim();
  if (!/^\d{10,25}$/.test(id)) throw new Error('Enter a valid numeric Discord user ID.');
  return id;
}

function uidFromDiscordId(discordId) {
  return `discord_${normalizeDiscordId(discordId)}`;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(discordId, password) {
  return sha256(`ctg:${discordId}:${password}`);
}

async function loadSession() {
  const uid = localStorage.getItem(SESSION_KEY);
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  state.profile = { uid, ...snap.data() };
  return state.profile;
}

function setSession(uid) {
  localStorage.setItem(SESSION_KEY, uid);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  state.profile = null;
}

function badge(value) {
  return `<span class="badge badge-${String(value || 'unknown').replaceAll(' ', '-').toLowerCase()}">${escapeHtml(value || 'Unknown')}</span>`;
}

function canStaff() {
  return state.profile && staffRoles.includes(state.profile.role);
}

function canExecutive() {
  return state.profile && executiveRoles.includes(state.profile.role);
}

function layout(content) {
  const signedIn = !!state.profile;
  const role = state.profile?.role;
  appEl.innerHTML = html`
    <header class="topbar">
      <div class="brand" onclick="location.hash='#/'">
        <div class="brand-mark">C</div>
        <div><strong>Cognitus Talent Gateway</strong><span>Career Application & Review Portal</span></div>
      </div>
      <nav>
        ${signedIn ? `<a href="#/dashboard">Dashboard</a>` : `<a href="#/">Home</a>`}
        ${signedIn ? `<a href="#/applications">Applications</a>` : ''}
        ${canStaff() ? `<a href="#/review">Review</a>` : ''}
        ${canExecutive() ? `<a href="#/executive">Executive</a>` : ''}
        ${role === 'owner' ? `<a href="#/owner">Owner</a>` : ''}
        ${signedIn ? `<button class="ghost" id="logoutBtn">Sign Out</button>` : `<a href="#/signin">Sign In</a>`}
      </nav>
    </header>
    <main>${content}</main>
    <footer>© Cognitus Solutions · Free-plan Firestore version · No emails collected.</footer>
  `;
  document.querySelector('#logoutBtn')?.addEventListener('click', () => {
    clearSession();
    routeTo('#/');
    render();
  });
}

function hero() {
  layout(html`
    <section class="hero">
      <div>
        <p class="eyebrow">Official Cognitus Solutions Careers Portal</p>
        <h1>Apply, track, review, and manage Cognitus hiring.</h1>
        <p class="lead">This version works on the Firebase free plan. Applicants use Discord ID + password. No emails are collected.</p>
        <div class="actions"><a class="button" href="#/register">Create Applicant Account</a><a class="button secondary" href="#/signin">Sign In</a><a class="button quiet" href="#/bootstrap">Owner Bootstrap</a></div>
      </div>
      <div class="hero-card"><h3>Flow</h3><ol><li>Owner bootstraps the first owner account.</li><li>Executive creates and opens applications.</li><li>Applicants submit once per application.</li><li>Reviewers process applications.</li><li>Applicants track status.</li></ol></div>
    </section>
  `);
}

function authScreen(mode = 'signin') {
  const isRegister = mode === 'register';
  layout(html`
    <section class="panel narrow">
      <p class="eyebrow">${isRegister ? 'Applicant Registration' : 'Portal Sign In'}</p>
      <h1>${isRegister ? 'Create your Cognitus account' : 'Welcome back'}</h1>
      <p class="muted">No emails are collected. Use your Discord User ID and password.</p>
      <form id="authForm" class="form">
        ${isRegister ? `<label>Discord Username<input name="discordUsername" placeholder="Executive_Eagle" required /></label>` : ''}
        <label>Discord User ID<input name="discordId" placeholder="123456789012345678" required /></label>
        ${isRegister ? `<label>Roblox Username, optional<input name="robloxUsername" placeholder="Executive_Eagle" /></label>` : ''}
        <label>Password<input name="password" type="password" required minlength="8" /></label>
        <button class="button" type="submit">${isRegister ? 'Create Account' : 'Sign In'}</button>
      </form>
      <p class="muted">${isRegister ? 'Already have an account?' : 'Need an account?'} <a href="${isRegister ? '#/signin' : '#/register'}">${isRegister ? 'Sign in' : 'Register here'}</a>.</p>
      <div id="formMessage"></div>
    </section>
  `);
  document.querySelector('#authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = document.querySelector('#formMessage');
    message.innerHTML = '<p class="muted">Processing...</p>';
    try {
      const discordId = normalizeDiscordId(form.get('discordId'));
      const uid = uidFromDiscordId(discordId);
      const password = String(form.get('password') || '');
      const credRef = doc(db, 'credentials', uid);
      const credSnap = await getDoc(credRef);
      if (isRegister) {
        if (credSnap.exists()) throw new Error('An account already exists for that Discord ID. Please sign in.');
        const discordUsername = String(form.get('discordUsername') || '').trim();
        if (discordUsername.length < 2) throw new Error('Enter a valid Discord username.');
        await setDoc(doc(db, 'users', uid), {
          uid,
          discordUsername,
          discordId,
          robloxUsername: String(form.get('robloxUsername') || '').trim(),
          role: 'applicant',
          accountStatus: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await setDoc(credRef, { uid, discordId, passwordHash: await passwordHash(discordId, password), createdAt: serverTimestamp() });
      } else {
        if (!credSnap.exists()) throw new Error('No account exists for that Discord ID.');
        const expected = credSnap.data().passwordHash;
        const actual = await passwordHash(discordId, password);
        if (expected !== actual) throw new Error('Incorrect Discord ID or password.');
      }
      setSession(uid);
      await loadSession();
      routeTo('#/dashboard');
    } catch (error) {
      message.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    }
  });
}

function bootstrapScreen() {
  layout(html`
    <section class="panel narrow">
      <p class="eyebrow">Owner Bootstrap</p>
      <h1>Create the first owner account</h1>
      <p class="muted">Free-plan version: enter the bootstrap key <strong>${BOOTSTRAP_KEY}</strong>. Bootstrap only works while no owner exists.</p>
      <form id="bootstrapForm" class="form">
        <label>Bootstrap Key<input name="setupKey" required /></label>
        <label>Discord Username<input name="discordUsername" value="Executive_Eagle" required /></label>
        <label>Discord User ID<input name="discordId" required /></label>
        <label>Roblox Username<input name="robloxUsername" value="Executive_Eagle" /></label>
        <label>Password<input name="password" type="password" required minlength="8" /></label>
        <button class="button" type="submit">Bootstrap Owner</button>
      </form>
      <div id="formMessage"></div>
    </section>
  `);
  document.querySelector('#bootstrapForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = document.querySelector('#formMessage');
    message.innerHTML = '<p class="muted">Creating owner...</p>';
    try {
      if (String(form.get('setupKey')) !== BOOTSTRAP_KEY) throw new Error('Invalid bootstrap key.');
      const owners = await getDocs(query(collection(db, 'users'), where('role', '==', 'owner'), limit(1)));
      if (!owners.empty) throw new Error('An owner already exists. Bootstrap is locked.');
      const discordId = normalizeDiscordId(form.get('discordId'));
      const uid = uidFromDiscordId(discordId);
      const password = String(form.get('password') || '');
      await setDoc(doc(db, 'users', uid), {
        uid,
        discordUsername: String(form.get('discordUsername') || '').trim(),
        discordId,
        robloxUsername: String(form.get('robloxUsername') || '').trim(),
        role: 'owner',
        accountStatus: 'active',
        permissions: ['*'],
        bootstrapOwner: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, 'credentials', uid), { uid, discordId, passwordHash: await passwordHash(discordId, password), createdAt: serverTimestamp() });
      await addDoc(collection(db, 'audit_logs'), { action: 'OWNER_BOOTSTRAPPED', performedBy: uid, targetId: uid, timestamp: serverTimestamp() });
      setSession(uid);
      await loadSession();
      routeTo('#/owner');
    } catch (error) {
      message.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    }
  });
}

function requireLogin() {
  if (!state.profile) {
    routeTo('#/signin');
    return false;
  }
  return true;
}

async function dashboard() {
  if (!requireLogin()) return;
  const p = state.profile;
  layout(html`
    <section class="page-head"><div><p class="eyebrow">${escapeHtml(p.role)}</p><h1>Welcome, ${escapeHtml(p.discordUsername)}</h1><p class="muted">Discord ID: ${escapeHtml(p.discordId)}</p></div></section>
    <section class="grid cards">
      <a class="card" href="#/applications"><h3>Applications</h3><p>Apply for open positions or view submissions.</p></a>
      ${canStaff() ? `<a class="card" href="#/review"><h3>Review Queue</h3><p>Review submitted applications.</p></a>` : ''}
      ${canExecutive() ? `<a class="card" href="#/executive"><h3>Executive Controls</h3><p>Create, open, close, and archive forms.</p></a>` : ''}
      ${p.role === 'owner' ? `<a class="card" href="#/owner"><h3>Owner Console</h3><p>Manage user roles.</p></a>` : ''}
    </section>
  `);
}

async function applicantApplications() {
  if (!requireLogin()) return;
  const formsSnap = await getDocs(query(collection(db, 'application_forms'), orderBy('createdAt', 'desc')));
  const mySnap = await getDocs(query(collection(db, 'applications'), where('applicantUid', '==', state.profile.uid)));
  const myApps = new Map(mySnap.docs.map((d) => [d.data().formId, { id: d.id, ...d.data() }]));
  const cards = formsSnap.docs.map((d) => {
    const form = { id: d.id, ...d.data() };
    const existing = myApps.get(form.id);
    const isOpen = form.status === 'open';
    let action = `<button class="button" data-apply="${form.id}" ${isOpen && !existing ? '' : 'disabled'}>Apply Now</button>`;
    if (existing?.status === 'draft') action = `<button class="button" data-apply="${form.id}">Continue Draft</button>`;
    if (existing && existing.status !== 'draft') action = `<button class="button secondary" data-view="${existing.id}">View Status</button>`;
    if (!isOpen && !existing) action = `<button class="button" disabled>Closed</button>`;
    return `<article class="card"><div class="row"><h3>${escapeHtml(form.title)}</h3>${badge(form.status)}</div><p class="muted">${escapeHtml(form.department || 'General')}</p><p>${escapeHtml(form.description || '')}</p>${existing ? `<p>Your status: ${badge(existing.status)}</p>` : ''}${action}</article>`;
  }).join('') || '<p class="muted">No application forms exist yet.</p>';
  layout(`<section class="page-head"><h1>Applications</h1><p class="muted">You may submit one application per application form.</p></section><section class="grid cards">${cards}</section>`);
  document.querySelectorAll('[data-apply]').forEach((btn) => btn.addEventListener('click', () => routeTo(`#/apply/${btn.dataset.apply}`)));
  document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => routeTo(`#/status/${btn.dataset.view}`)));
}

async function applyScreen(formId) {
  if (!requireLogin()) return;
  const formSnap = await getDoc(doc(db, 'application_forms', formId));
  if (!formSnap.exists()) return layout('<section class="panel"><h1>Application not found</h1></section>');
  const form = { id: formSnap.id, ...formSnap.data() };
  const appId = `${state.profile.uid}_${formId}`;
  const existingSnap = await getDoc(doc(db, 'applications', appId));
  const existing = existingSnap.exists() ? existingSnap.data() : null;
  if (existing && existing.status !== 'draft') return routeTo(`#/status/${appId}`);
  if (form.status !== 'open' && !existing) return layout('<section class="panel"><h1>This application is closed.</h1></section>');
  const questions = Array.isArray(form.questions) ? form.questions : [];
  layout(html`
    <section class="panel wide"><p class="eyebrow">${escapeHtml(form.department || 'Cognitus')}</p><h1>${escapeHtml(form.title)}</h1><p>${escapeHtml(form.description || '')}</p>
      <form id="applicationForm" class="form">
        ${questions.map((q, i) => { const id = q.id || `q${i + 1}`; return `<label>${escapeHtml(q.question || id)}<textarea name="${escapeHtml(id)}" rows="5" required>${escapeHtml(existing?.answers?.[id] || '')}</textarea></label>`; }).join('')}
        <label>Conflict of Interest Disclosure<textarea name="conflictDisclosure" rows="4">${escapeHtml(existing?.conflictDisclosure || '')}</textarea></label>
        <label class="check"><input type="checkbox" name="agreement" required ${existing?.agreement ? 'checked' : ''}/> I certify this is truthful and understand I may only submit once for this application.</label>
        <div class="actions"><button class="button secondary" name="intent" value="draft">Save Draft</button><button class="button" name="intent" value="submit">Submit Application</button></div>
      </form>
    </section>
  `);
  document.querySelector('#applicationForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter?.value || 'draft';
    const data = new FormData(event.currentTarget);
    const answers = {};
    questions.forEach((q, i) => { const id = q.id || `q${i + 1}`; answers[id] = data.get(id) || ''; });
    await setDoc(doc(db, 'applications', appId), {
      applicationId: appId,
      applicantUid: state.profile.uid,
      applicantDiscordUsername: state.profile.discordUsername,
      applicantDiscordId: state.profile.discordId,
      applicantRobloxUsername: state.profile.robloxUsername || '',
      formId,
      formTitle: form.title,
      department: form.department || 'General',
      answers,
      conflictDisclosure: data.get('conflictDisclosure') || '',
      agreement: data.get('agreement') === 'on',
      status: submitter === 'submit' ? 'submitted' : 'draft',
      updatedAt: serverTimestamp(),
      submittedAt: submitter === 'submit' ? serverTimestamp() : existing?.submittedAt || null
    }, { merge: true });
    routeTo(submitter === 'submit' ? `#/status/${appId}` : '#/applications');
  });
}

async function statusScreen(appId) {
  if (!requireLogin()) return;
  const snap = await getDoc(doc(db, 'applications', appId));
  if (!snap.exists()) return layout('<section class="panel"><h1>Application not found</h1></section>');
  const app = { id: snap.id, ...snap.data() };
  if (app.applicantUid !== state.profile.uid && !canStaff()) return layout('<section class="panel"><h1>Access denied</h1></section>');
  layout(`<section class="panel wide"><p class="eyebrow">Application Status</p><div class="row"><h1>${escapeHtml(app.formTitle)}</h1>${badge(app.status)}</div><p class="muted">Department: ${escapeHtml(app.department || 'General')}</p>${app.decision ? `<div class="notice"><strong>Decision:</strong> ${escapeHtml(app.decision)}</div>` : ''}${app.publicMessage ? `<div class="notice">${escapeHtml(app.publicMessage)}</div>` : ''}<h3>Your Responses</h3>${Object.entries(app.answers || {}).map(([k, v]) => `<div class="answer"><strong>${escapeHtml(k)}</strong><p>${escapeHtml(v)}</p></div>`).join('')}</section>`);
}

async function reviewQueue() {
  if (!requireLogin()) return;
  if (!canStaff()) return layout('<section class="panel"><h1>Access denied</h1></section>');
  const snap = await getDocs(query(collection(db, 'applications'), orderBy('updatedAt', 'desc'), limit(100)));
  const rows = snap.docs.map((d) => { const app = { id: d.id, ...d.data() }; return `<tr><td>${escapeHtml(app.formTitle)}</td><td>${escapeHtml(app.applicantDiscordUsername)}</td><td>${badge(app.status)}</td><td><button class="button small" data-review="${app.id}">Open</button></td></tr>`; }).join('') || '<tr><td colspan="4">No applications yet.</td></tr>';
  layout(`<section class="page-head"><h1>Review Queue</h1><p class="muted">Review submitted applications and add internal notes.</p></section><section class="panel"><table><thead><tr><th>Application</th><th>Applicant</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
  document.querySelectorAll('[data-review]').forEach((btn) => btn.addEventListener('click', () => routeTo(`#/review/${btn.dataset.review}`)));
}

async function reviewApplication(appId) {
  if (!requireLogin()) return;
  if (!canStaff()) return layout('<section class="panel"><h1>Access denied</h1></section>');
  const snap = await getDoc(doc(db, 'applications', appId));
  if (!snap.exists()) return layout('<section class="panel"><h1>Application not found</h1></section>');
  const app = { id: snap.id, ...snap.data() };
  const notesSnap = await getDocs(query(collection(db, 'review_notes'), where('applicationId', '==', appId), orderBy('createdAt', 'desc')));
  layout(html`
    <section class="panel wide"><p class="eyebrow">Reviewer Workspace</p><div class="row"><h1>${escapeHtml(app.formTitle)}</h1>${badge(app.status)}</div><p><strong>Applicant:</strong> ${escapeHtml(app.applicantDiscordUsername)} · ${escapeHtml(app.applicantDiscordId)}</p><h3>Responses</h3>${Object.entries(app.answers || {}).map(([k, v]) => `<div class="answer"><strong>${escapeHtml(k)}</strong><p>${escapeHtml(v)}</p></div>`).join('')}<h3>Reviewer Action</h3>
      <form id="reviewForm" class="form split"><label>Status<select name="status"><option>underReview</option><option>interviewRequested</option><option>interviewCompleted</option><option>pendingFinalDecision</option><option>accepted</option><option>denied</option><option>archived</option></select></label><label>Recommendation<select name="recommendation"><option value="">None</option><option>approve</option><option>deny</option><option>interview</option><option>executiveReview</option></select></label><label class="full">Private Note<textarea name="note" rows="4"></textarea></label>${canExecutive() ? `<label class="full">Public Applicant Message<textarea name="publicMessage" rows="3">${escapeHtml(app.publicMessage || '')}</textarea></label>` : ''}<button class="button">Save Review</button></form><h3>Internal Notes</h3>${notesSnap.docs.map((d) => `<div class="note"><p>${escapeHtml(d.data().note)}</p><span>${escapeHtml(d.data().createdByUsername || '')}</span></div>`).join('') || '<p class="muted">No notes yet.</p>'}</section>`);
  document.querySelector('[name="status"]').value = app.status || 'underReview';
  document.querySelector('#reviewForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const updates = { status: data.get('status'), reviewerRecommendation: data.get('recommendation'), reviewedBy: state.profile.uid, reviewedByUsername: state.profile.discordUsername, updatedAt: serverTimestamp() };
    if (canExecutive()) { updates.publicMessage = data.get('publicMessage') || ''; if (['accepted', 'denied'].includes(updates.status)) updates.decision = updates.status; }
    await updateDoc(doc(db, 'applications', appId), updates);
    const note = String(data.get('note') || '').trim();
    if (note) await addDoc(collection(db, 'review_notes'), { applicationId: appId, note, createdBy: state.profile.uid, createdByUsername: state.profile.discordUsername, createdAt: serverTimestamp() });
    routeTo('#/review');
  });
}

async function executiveConsole() {
  if (!requireLogin()) return;
  if (!canExecutive()) return layout('<section class="panel"><h1>Access denied</h1></section>');
  const formsSnap = await getDocs(query(collection(db, 'application_forms'), orderBy('createdAt', 'desc')));
  const forms = formsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  layout(html`<section class="page-head"><h1>Executive Application Controls</h1><p class="muted">Create, open, close, and archive Cognitus applications.</p></section><section class="grid two"><div class="panel"><h2>Create Application</h2><form id="formCreator" class="form"><label>Position Title<input name="title" required /></label><label>Department<input name="department" placeholder="Human Resources" /></label><label>Description<textarea name="description" rows="4" required></textarea></label><label>Requirements, one per line<textarea name="requirements" rows="4"></textarea></label><label>Questions, one per line<textarea name="questions" rows="6" required></textarea></label><label>Max Openings<input name="maxOpenings" type="number" min="1" /></label><label>Status<select name="status"><option>draft</option><option>open</option><option>closed</option></select></label><button class="button">Create Application</button></form></div><div class="panel"><h2>Manage Forms</h2>${forms.map((form) => `<div class="mini-card"><div><strong>${escapeHtml(form.title)}</strong><p>${escapeHtml(form.department || 'General')} · ${badge(form.status)}</p></div><div class="actions"><button class="button small" data-status="open" data-form="${form.id}">Open</button><button class="button small secondary" data-status="closed" data-form="${form.id}">Close</button><button class="button small quiet" data-status="archived" data-form="${form.id}">Archive</button></div></div>`).join('') || '<p class="muted">No forms created yet.</p>'}</div></section>`);
  document.querySelector('#formCreator').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title')).trim();
    const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;
    await setDoc(doc(db, 'application_forms', id), { title, department: data.get('department') || 'General', description: data.get('description') || '', requirements: String(data.get('requirements') || '').split('\n').map((x) => x.trim()).filter(Boolean), questions: String(data.get('questions') || '').split('\n').map((question, index) => ({ id: `q${index + 1}`, type: 'longText', question: question.trim() })).filter((q) => q.question), maxOpenings: Number(data.get('maxOpenings') || 0), status: data.get('status') || 'draft', visibility: 'public', finalApprovalRequired: true, createdBy: state.profile.uid, createdByUsername: state.profile.discordUsername, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    routeTo('#/executive');
  });
  document.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', async () => { await updateDoc(doc(db, 'application_forms', btn.dataset.form), { status: btn.dataset.status, updatedAt: serverTimestamp() }); routeTo('#/executive'); }));
}

async function ownerConsole() {
  if (!requireLogin()) return;
  if (state.profile.role !== 'owner') return layout('<section class="panel"><h1>Access denied</h1></section>');
  const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100)));
  const rows = usersSnap.docs.map((d) => { const user = { id: d.id, ...d.data() }; return `<tr><td>${escapeHtml(user.discordUsername)}</td><td>${escapeHtml(user.discordId)}</td><td>${badge(user.role)}</td><td><select data-role-select="${user.id}">${roles.map((r) => `<option ${r === user.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><button class="button small" data-save-role="${user.id}">Save</button></td></tr>`; }).join('') || '<tr><td colspan="5">No users yet.</td></tr>';
  layout(`<section class="page-head"><h1>Owner Console</h1><p class="muted">Manage portal users and roles.</p></section><section class="panel"><table><thead><tr><th>User</th><th>Discord ID</th><th>Current Role</th><th>New Role</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
  document.querySelectorAll('[data-save-role]').forEach((btn) => btn.addEventListener('click', async () => { const uid = btn.dataset.saveRole; const role = document.querySelector(`[data-role-select="${uid}"]`).value; await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp() }); if (uid === state.profile.uid) await loadSession(); routeTo('#/owner'); }));
}

async function render() {
  if (!state.profile) await loadSession();
  const [path, param] = (window.location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (!path) return hero();
  if (path === 'signin') return authScreen('signin');
  if (path === 'register') return authScreen('register');
  if (path === 'bootstrap') return bootstrapScreen();
  if (path === 'dashboard') return dashboard();
  if (path === 'applications') return applicantApplications();
  if (path === 'apply') return applyScreen(param);
  if (path === 'status') return statusScreen(param);
  if (path === 'review' && param) return reviewApplication(param);
  if (path === 'review') return reviewQueue();
  if (path === 'executive') return executiveConsole();
  if (path === 'owner') return ownerConsole();
  return hero();
}

render();
