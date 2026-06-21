import './styles.css';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
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
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from './firebase.js';

const appEl = document.querySelector('#app');
const BOOTSTRAP_KEY = 'CognitusOwnerSetup2026';
const roles = ['applicant', 'reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const executiveRoles = ['executive', 'owner'];

const state = { firebaseUser: null, profile: null, authReady: false, authError: null, draftQuestions: [] };

window.addEventListener('hashchange', render);

onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        state.authError = error;
        state.authReady = true;
        render();
      }
      return;
    }
    state.firebaseUser = user;
    state.profile = await loadProfile(user.uid);
    state.authReady = true;
    state.authError = null;
    render();
  } catch (error) {
    state.authError = error;
    state.authReady = true;
    render();
  }
});

function routeTo(path) { window.location.hash = path; }
function html(strings, ...values) { return strings.map((s, i) => s + (values[i] ?? '')).join(''); }
function escapeHtml(value = '') { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function normalizeDiscordId(value) {
  const id = String(value || '').trim();
  if (!/^\d{10,25}$/.test(id)) throw new Error('Enter a valid numeric Discord user ID.');
  return id;
}
async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}
async function refreshProfile() {
  state.profile = state.firebaseUser ? await loadProfile(state.firebaseUser.uid) : null;
}
function badge(value) { return `<span class="badge badge-${String(value || 'unknown').replaceAll(' ', '-').toLowerCase()}">${escapeHtml(value || 'Unknown')}</span>`; }
function canStaff() { return state.profile && staffRoles.includes(state.profile.role); }
function canExecutive() { return state.profile && executiveRoles.includes(state.profile.role); }
function registered() { return !!state.profile; }

function layout(content) {
  const role = state.profile?.role;
  appEl.innerHTML = html`
    <header class="topbar">
      <div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div>
      <nav>
        ${registered() ? `<a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>` : `<a href="#/">Home</a><a href="#/signin">Sign In</a>`}
        ${canStaff() ? `<a href="#/review">Review</a>` : ''}
        ${canExecutive() ? `<a href="#/executive">Executive</a>` : ''}
        ${role === 'owner' ? `<a href="#/owner">Owner</a>` : ''}
        ${registered() ? `<span class="muted">${escapeHtml(state.profile.discordUsername)}</span>` : `<a class="nav-cta" href="#/register">Create Account</a>`}
      </nav>
    </header>
    <main>${content}</main>
    <footer>© Cognitus Solutions · Careers Portal</footer>
  `;
}

function authSetupScreen() {
  layout(html`
    <section class="panel wide setup-panel">
      <p class="eyebrow">Firebase Setup Needed</p>
      <h1>Anonymous Auth is disabled.</h1>
      <p class="lead">Turn on Anonymous sign-in in Firebase so the portal can create browser-based accounts without collecting emails.</p>
      <div class="notice"><strong>Error:</strong> ${escapeHtml(state.authError?.code || state.authError?.message || 'Unknown Firebase Auth error')}</div>
      <div class="setup-steps">
        <div><strong>1</strong><span>Open Firebase Console</span></div>
        <div><strong>2</strong><span>Go to Build → Authentication</span></div>
        <div><strong>3</strong><span>Open Sign-in method</span></div>
        <div><strong>4</strong><span>Enable Anonymous</span></div>
      </div>
      <p class="muted">Anonymous Auth only gives Firestore a secure session ID. It does not ask for or store email addresses.</p>
    </section>
  `);
}

function hero() {
  layout(html`
    <section class="hero">
      <div>
        <p class="eyebrow">Cognitus Solutions Careers</p>
        <h1>Find your place at Cognitus.</h1>
        <p class="lead">Apply for open roles, check your status, and keep your application history in one place.</p>
        <div class="actions"><a class="button" href="#/signin">Sign In</a><a class="button secondary" href="#/register">Create Account</a></div>
      </div>
      <div class="hero-card"><h3>For applicants</h3><p>Create an account, apply once per role, and return later to see where your application stands.</p></div>
    </section>
  `);
}

function registerScreen() {
  if (!state.authReady) return loading();
  if (state.authError) return authSetupScreen();
  if (state.profile) return routeTo('#/dashboard');
  layout(html`
    <section class="panel narrow">
      <p class="eyebrow">Applicant Registration</p>
      <h1>Create your account</h1>
      <p class="muted">No email is required. Your account is connected to this browser session.</p>
      <form id="registerForm" class="form">
        <label>Discord Username<input name="discordUsername" placeholder="Executive_Eagle" required /></label>
        <label>Discord User ID<input name="discordId" placeholder="123456789012345678" required /></label>
        <label>Roblox Username, optional<input name="robloxUsername" placeholder="Executive_Eagle" /></label>
        <button class="button" type="submit">Create Account</button>
      </form>
      <div id="formMessage"></div>
    </section>
  `);
  document.querySelector('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = document.querySelector('#formMessage');
    try {
      const uid = state.firebaseUser.uid;
      const discordId = normalizeDiscordId(form.get('discordId'));
      await setDoc(doc(db, 'users', uid), {
        uid,
        discordUsername: String(form.get('discordUsername') || '').trim(),
        discordId,
        robloxUsername: String(form.get('robloxUsername') || '').trim(),
        role: 'applicant',
        accountStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await refreshProfile();
      routeTo('#/dashboard');
    } catch (error) {
      message.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    }
  });
}

function bootstrapScreen() {
  if (!state.authReady) return loading();
  if (state.authError) return authSetupScreen();
  layout(html`
    <section class="panel narrow">
      <p class="eyebrow">Owner Bootstrap</p>
      <h1>Create the first owner account</h1>
      <p class="muted">Bootstrap key: <strong>${BOOTSTRAP_KEY}</strong>. Firestore rules only allow this before the owner lock is created.</p>
      <form id="bootstrapForm" class="form">
        <label>Bootstrap Key<input name="setupKey" required /></label>
        <label>Discord Username<input name="discordUsername" value="Executive_Eagle" required /></label>
        <label>Discord User ID<input name="discordId" required /></label>
        <label>Roblox Username<input name="robloxUsername" value="Executive_Eagle" /></label>
        <button class="button" type="submit">Bootstrap Owner</button>
      </form>
      <div id="formMessage"></div>
    </section>
  `);
  document.querySelector('#bootstrapForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = document.querySelector('#formMessage');
    try {
      if (String(form.get('setupKey')) !== BOOTSTRAP_KEY) throw new Error('Invalid bootstrap key.');
      const uid = state.firebaseUser.uid;
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        uid,
        discordUsername: String(form.get('discordUsername') || '').trim(),
        discordId: normalizeDiscordId(form.get('discordId')),
        robloxUsername: String(form.get('robloxUsername') || '').trim(),
        role: 'owner',
        accountStatus: 'active',
        permissions: ['*'],
        bootstrapOwner: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      batch.set(doc(db, 'system', 'ownerBootstrap'), { createdBy: uid, createdAt: serverTimestamp(), locked: true });
      batch.set(doc(collection(db, 'audit_logs')), { action: 'OWNER_BOOTSTRAPPED', performedBy: uid, targetId: uid, timestamp: serverTimestamp() });
      await batch.commit();
      await refreshProfile();
      routeTo('#/owner');
    } catch (error) {
      message.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    }
  });
}

function requireProfile() {
  if (!state.authReady) { loading(); return false; }
  if (state.authError) { authSetupScreen(); return false; }
  if (!state.profile) { routeTo('#/register'); return false; }
  return true;
}
function loading() { layout('<section class="panel"><h1>Loading...</h1></section>'); }

async function dashboard() {
  if (!requireProfile()) return;
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
  if (!requireProfile()) return;
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
  if (!requireProfile()) return;
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
  if (!requireProfile()) return;
  const snap = await getDoc(doc(db, 'applications', appId));
  if (!snap.exists()) return layout('<section class="panel"><h1>Application not found</h1></section>');
  const app = { id: snap.id, ...snap.data() };
  if (app.applicantUid !== state.profile.uid && !canStaff()) return layout('<section class="panel"><h1>Access denied</h1></section>');
  layout(`<section class="panel wide"><p class="eyebrow">Application Status</p><div class="row"><h1>${escapeHtml(app.formTitle)}</h1>${badge(app.status)}</div><p class="muted">Department: ${escapeHtml(app.department || 'General')}</p>${app.decision ? `<div class="notice"><strong>Decision:</strong> ${escapeHtml(app.decision)}</div>` : ''}${app.publicMessage ? `<div class="notice">${escapeHtml(app.publicMessage)}</div>` : ''}<h3>Your Responses</h3>${Object.entries(app.answers || {}).map(([k, v]) => `<div class="answer"><strong>${escapeHtml(k)}</strong><p>${escapeHtml(v)}</p></div>`).join('')}</section>`);
}

async function reviewQueue() {
  if (!requireProfile()) return;
  if (!canStaff()) return layout('<section class="panel"><h1>Access denied</h1></section>');
  const snap = await getDocs(query(collection(db, 'applications'), orderBy('updatedAt', 'desc'), limit(100)));
  const rows = snap.docs.map((d) => { const app = { id: d.id, ...d.data() }; return `<tr><td>${escapeHtml(app.formTitle)}</td><td>${escapeHtml(app.applicantDiscordUsername)}</td><td>${badge(app.status)}</td><td><button class="button small" data-review="${app.id}">Open</button></td></tr>`; }).join('') || '<tr><td colspan="4">No applications yet.</td></tr>';
  layout(`<section class="page-head"><h1>Review Queue</h1><p class="muted">Review submitted applications and add internal notes.</p></section><section class="panel"><table><thead><tr><th>Application</th><th>Applicant</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
  document.querySelectorAll('[data-review]').forEach((btn) => btn.addEventListener('click', () => routeTo(`#/review/${btn.dataset.review}`)));
}

async function reviewApplication(appId) {
  if (!requireProfile()) return;
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

function renderQuestionList() {
  const list = document.querySelector('#questionList');
  if (!list) return;
  list.innerHTML = state.draftQuestions.length
    ? state.draftQuestions.map((q, index) => `<div class="question-row"><span><strong>Q${index + 1}.</strong> ${escapeHtml(q)}</span><button class="button small quiet" type="button" data-remove-question="${index}">Remove</button></div>`).join('')
    : '<p class="muted">No questions added yet. Click Add Question to add one.</p>';
  document.querySelectorAll('[data-remove-question]').forEach((btn) => btn.addEventListener('click', () => {
    state.draftQuestions.splice(Number(btn.dataset.removeQuestion), 1);
    renderQuestionList();
  }));
}

function openApplicationModal() {
  state.draftQuestions = [];
  document.body.insertAdjacentHTML('beforeend', html`
    <div class="modal-backdrop" id="applicationModal">
      <div class="modal-card">
        <div class="row"><div><p class="eyebrow">Executive Tool</p><h2>Create Application</h2></div><button class="button small quiet" type="button" id="closeApplicationModal">Close</button></div>
        <form id="formCreator" class="form">
          <label>Position Title<input name="title" required placeholder="Hiring Specialist" /></label>
          <label>Department<input name="department" placeholder="Human Resources" /></label>
          <label>Description<textarea name="description" rows="4" required placeholder="Describe the position and what this person will do."></textarea></label>
          <label>Requirements, one per line<textarea name="requirements" rows="4" placeholder="Professional communication\nAble to follow policy\nAvailable weekly"></textarea></label>
          <div class="question-builder">
            <div class="row"><h3>Application Questions</h3><button class="button secondary small" type="button" id="addQuestionBtn">Add Question</button></div>
            <div id="questionList"></div>
          </div>
          <label>Max Openings<input name="maxOpenings" type="number" min="0" placeholder="0 for unlimited / unknown" /></label>
          <label>Status<select name="status"><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></label>
          <div class="actions"><button class="button" type="submit">Create Application</button><button class="button secondary" type="button" id="cancelApplicationModal">Cancel</button></div>
        </form>
        <div id="createMessage"></div>
      </div>
    </div>
  `);
  renderQuestionList();
  const closeModal = () => document.querySelector('#applicationModal')?.remove();
  document.querySelector('#closeApplicationModal').addEventListener('click', closeModal);
  document.querySelector('#cancelApplicationModal').addEventListener('click', closeModal);
  document.querySelector('#addQuestionBtn').addEventListener('click', () => {
    const question = prompt('Enter the application question:');
    if (question && question.trim()) {
      state.draftQuestions.push(question.trim());
      renderQuestionList();
    }
  });
  document.querySelector('#formCreator').addEventListener('submit', createApplicationForm);
}

async function createApplicationForm(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const message = document.querySelector('#createMessage');
  message.innerHTML = '<p class="muted">Creating application...</p>';
  try {
    if (!canExecutive()) throw new Error('You must be an executive or owner to create applications.');
    const title = String(data.get('title') || '').trim();
    if (!title) throw new Error('Position title is required.');
    if (state.draftQuestions.length === 0) throw new Error('Add at least one application question.');
    const payload = {
      title,
      department: String(data.get('department') || 'General').trim() || 'General',
      description: String(data.get('description') || '').trim(),
      requirements: String(data.get('requirements') || '').split('\n').map((x) => x.trim()).filter(Boolean),
      questions: state.draftQuestions.map((question, index) => ({ id: `q${index + 1}`, type: 'longText', question })),
      maxOpenings: Number(data.get('maxOpenings') || 0),
      status: data.get('status') || 'draft',
      visibility: 'public',
      finalApprovalRequired: true,
      createdBy: state.profile.uid,
      createdByUsername: state.profile.discordUsername,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await addDoc(collection(db, 'application_forms'), payload);
    message.innerHTML = '<p class="notice"><strong>Created.</strong> The application has been saved.</p>';
    setTimeout(() => routeTo('#/executive'), 350);
  } catch (error) {
    message.innerHTML = `<p class="error"><strong>Application was not created.</strong><br>${escapeHtml(error.message)}</p>`;
  }
}

async function executiveConsole() {
  if (!requireProfile()) return;
  if (!canExecutive()) return layout('<section class="panel"><h1>Access denied</h1></section>');
  const formsSnap = await getDocs(query(collection(db, 'application_forms'), orderBy('createdAt', 'desc')));
  const forms = formsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  layout(html`
    <section class="page-head">
      <div><h1>Executive Application Controls</h1><p class="muted">Create, open, close, and archive Cognitus applications.</p></div>
      <button class="button" id="openApplicationModal">Create Application</button>
    </section>
    <section class="panel">
      <h2>Manage Forms</h2>
      <div id="executiveMessage"></div>
      ${forms.map((form) => `<div class="mini-card"><div><strong>${escapeHtml(form.title)}</strong><p>${escapeHtml(form.department || 'General')} · ${badge(form.status)}</p><p class="muted">${escapeHtml((form.questions || []).length)} question(s)</p></div><div class="actions"><button class="button small" data-status="open" data-form="${form.id}">Open</button><button class="button small secondary" data-status="closed" data-form="${form.id}">Close</button><button class="button small quiet" data-status="archived" data-form="${form.id}">Archive</button></div></div>`).join('') || '<p class="muted">No forms created yet.</p>'}
    </section>
  `);
  document.querySelector('#openApplicationModal').addEventListener('click', openApplicationModal);
  document.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', async () => {
    const msg = document.querySelector('#executiveMessage');
    try {
      await updateDoc(doc(db, 'application_forms', btn.dataset.form), { status: btn.dataset.status, updatedAt: serverTimestamp() });
      routeTo('#/executive');
    } catch (error) {
      msg.innerHTML = `<p class="error">Could not update application status: ${escapeHtml(error.message)}</p>`;
    }
  }));
}

async function ownerConsole() {
  if (!requireProfile()) return;
  if (state.profile.role !== 'owner') return layout('<section class="panel"><h1>Access denied</h1></section>');
  const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100)));
  const rows = usersSnap.docs.map((d) => { const user = { id: d.id, ...d.data() }; return `<tr><td>${escapeHtml(user.discordUsername)}</td><td>${escapeHtml(user.discordId)}</td><td>${badge(user.role)}</td><td><select data-role-select="${user.id}">${roles.map((r) => `<option ${r === user.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><button class="button small" data-save-role="${user.id}">Save</button></td></tr>`; }).join('') || '<tr><td colspan="5">No users yet.</td></tr>';
  layout(`<section class="page-head"><h1>Owner Console</h1><p class="muted">Manage portal users and roles.</p></section><section class="panel"><table><thead><tr><th>User</th><th>Discord ID</th><th>Current Role</th><th>New Role</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
  document.querySelectorAll('[data-save-role]').forEach((btn) => btn.addEventListener('click', async () => { const uid = btn.dataset.saveRole; const role = document.querySelector(`[data-role-select="${uid}"]`).value; await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp() }); if (uid === state.profile.uid) await refreshProfile(); routeTo('#/owner'); }));
}

async function render() {
  if (!state.authReady) return loading();
  if (state.authError) return authSetupScreen();
  const [path, param] = (window.location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (!path) return hero();
  if (path === 'signin' || path === 'register') return registerScreen();
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

loading();
