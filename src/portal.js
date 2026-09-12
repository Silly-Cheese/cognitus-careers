import './styles.css';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const BOOTSTRAP_KEY = 'CognitusOwnerSetup2026';
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const executiveRoles = ['executive', 'owner'];
const delegatedRoutes = new Set(['review', 'executive', 'owner', 'notifications', 'profile']);

let user = null;
let profile = null;
let ready = false;

const esc = (value = '') => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const cleanId = value => {
  const id = String(value || '').trim();
  if (!/^\d{10,25}$/.test(id)) throw new Error('Enter a valid numeric Discord User ID.');
  return id;
};

const authEmail = id => `discord-${cleanId(id)}@cognitus.internal`;
const go = path => { location.hash = path; };
const canStaff = () => profile && staffRoles.includes(profile.role);
const canExecutive = () => profile && executiveRoles.includes(profile.role);
const badge = value => `<span class="badge badge-${String(value || 'unknown').toLowerCase()}">${esc(value || 'Unknown')}</span>`;
const timeValue = value => value?.toMillis?.() || (typeof value?.seconds === 'number' ? value.seconds * 1000 : 0);

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  render();
});

window.addEventListener('hashchange', render);

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function navMarkup() {
  if (!profile) {
    return '<a href="#/">Home</a><a href="#/signin">Sign In</a><a href="#/register">Create Account</a>';
  }
  return `<a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>${canStaff() ? '<a href="#/review">Review</a>' : ''}${canExecutive() ? '<a href="#/executive">Executive</a>' : ''}${profile.role === 'owner' ? '<a href="#/owner">Owner</a>' : ''}<span class="muted">${esc(profile.discordUsername)}</span><button class="ghost" id="signOutBtn">Sign Out</button>`;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav>${navMarkup()}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal</footer>`;
  document.querySelector('#signOutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    go('#/');
  });
}

function loading() {
  shell('<section class="panel"><h1>Loading…</h1></section>');
}

function needLogin() {
  if (!ready) {
    loading();
    return false;
  }
  if (!profile) {
    go('#/signin');
    return false;
  }
  return true;
}

function home() {
  shell(`<section class="hero"><div><p class="eyebrow">Cognitus Solutions Careers</p><h1>Find your place at Cognitus.</h1><p class="lead">Apply for open roles, check your status, and keep your application history in one place.</p><div class="actions"><a class="button" href="#/signin">Sign In</a><a class="button secondary" href="#/register">Create Account</a></div></div><div class="hero-card"><h3>For applicants</h3><p>Use your Discord User ID and password to access your account from any device.</p></div></section>`);
}

function signin() {
  if (profile) return go('#/dashboard');
  shell(`<section class="panel narrow"><p class="eyebrow">Sign In</p><h1>Welcome back.</h1><p class="muted">Enter your Discord User ID and password.</p><form id="loginForm" class="form"><label>Discord User ID<input name="discordId" inputmode="numeric" required></label><label>Password<input name="password" type="password" required></label><button class="button">Sign In</button></form><p class="muted">Need an account? <a href="#/register">Create one here.</a></p><div id="msg"></div></section>`);
  document.querySelector('#loginForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const msg = document.querySelector('#msg');
    msg.innerHTML = '<p class="muted">Signing in…</p>';
    try {
      await signInWithEmailAndPassword(auth, authEmail(form.get('discordId')), String(form.get('password') || ''));
      go('#/dashboard');
    } catch (error) {
      msg.innerHTML = `<p class="error">Sign in failed: ${esc(error.message)}</p>`;
    }
  };
}

function register() {
  if (profile) return go('#/dashboard');
  shell(`<section class="panel narrow"><p class="eyebrow">Applicant Registration</p><h1>Create your account</h1><p class="muted">No real email is collected. Your Discord ID is your login.</p><form id="registerForm" class="form"><label>Discord Username<input name="discordUsername" required></label><label>Discord User ID<input name="discordId" inputmode="numeric" required></label><label>Roblox Username, optional<input name="robloxUsername"></label><label>Password<input name="password" type="password" minlength="8" required></label><button class="button">Create Account</button></form><p class="muted">Already have an account? <a href="#/signin">Sign in here.</a></p><div id="msg"></div></section>`);
  document.querySelector('#registerForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const msg = document.querySelector('#msg');
    msg.innerHTML = '<p class="muted">Creating account…</p>';
    try {
      const id = cleanId(form.get('discordId'));
      const name = String(form.get('discordUsername') || '').trim();
      const cred = await createUserWithEmailAndPassword(auth, authEmail(id), String(form.get('password') || ''));
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        discordUsername: name,
        discordId: id,
        robloxUsername: String(form.get('robloxUsername') || '').trim(),
        role: 'applicant',
        accountStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, 'discord_ids', id), { uid: cred.user.uid, createdAt: serverTimestamp() });
      profile = await getProfile(cred.user.uid);
      go('#/dashboard');
    } catch (error) {
      msg.innerHTML = `<p class="error">Account was not created: ${esc(error.message)}</p>`;
    }
  };
}

function bootstrap() {
  shell(`<section class="panel narrow"><p class="eyebrow">Owner Bootstrap</p><h1>Create first owner</h1><form id="bootForm" class="form"><label>Bootstrap Key<input name="key" required></label><label>Discord Username<input name="discordUsername" value="Executive_Eagle" required></label><label>Discord User ID<input name="discordId" inputmode="numeric" required></label><label>Roblox Username<input name="robloxUsername" value="Executive_Eagle"></label><label>Password<input name="password" type="password" minlength="8" required></label><button class="button">Create Owner</button></form><div id="msg"></div></section>`);
  document.querySelector('#bootForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const msg = document.querySelector('#msg');
    msg.innerHTML = '<p class="muted">Creating owner…</p>';
    try {
      if (String(form.get('key')) !== BOOTSTRAP_KEY) throw new Error('Invalid bootstrap key.');
      const id = cleanId(form.get('discordId'));
      const name = String(form.get('discordUsername') || '').trim();
      const cred = await createUserWithEmailAndPassword(auth, authEmail(id), String(form.get('password') || ''));
      await updateProfile(cred.user, { displayName: name });
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        discordUsername: name,
        discordId: id,
        robloxUsername: String(form.get('robloxUsername') || '').trim(),
        role: 'owner',
        accountStatus: 'active',
        permissions: ['*'],
        bootstrapOwner: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      batch.set(doc(db, 'discord_ids', id), { uid: cred.user.uid, createdAt: serverTimestamp() });
      batch.set(doc(db, 'system', 'ownerBootstrap'), { createdBy: cred.user.uid, createdAt: serverTimestamp(), locked: true });
      batch.set(doc(collection(db, 'audit_logs')), { action: 'OWNER_BOOTSTRAPPED', performedBy: cred.user.uid, targetId: cred.user.uid, timestamp: serverTimestamp() });
      await batch.commit();
      profile = await getProfile(cred.user.uid);
      go('#/owner');
    } catch (error) {
      msg.innerHTML = `<p class="error">Owner was not created: ${esc(error.message)}</p>`;
    }
  };
}

function dashboard() {
  if (!needLogin()) return;
  shell(`<section class="page-head"><div><p class="eyebrow">${esc(profile.role)}</p><h1>Welcome, ${esc(profile.discordUsername)}</h1><p class="muted">Discord ID: ${esc(profile.discordId)}</p></div></section><section class="grid cards"><a class="card" href="#/applications"><h3>Applications</h3><p>Apply for open positions or view submissions.</p></a>${canStaff() ? '<a class="card" href="#/review"><h3>Review Queue</h3><p>Review submitted applications.</p></a>' : ''}${canExecutive() ? '<a class="card" href="#/executive"><h3>Executive Controls</h3><p>Create, open, close, and archive forms.</p></a>' : ''}${profile.role === 'owner' ? '<a class="card" href="#/owner"><h3>Owner Console</h3><p>Manage user roles.</p></a>' : ''}</section>`);
}

async function applications() {
  if (!needLogin()) return;
  try {
    const [formsSnap, mineSnap] = await Promise.all([
      getDocs(collection(db, 'application_forms')),
      getDocs(query(collection(db, 'applications'), where('applicantUid', '==', profile.uid)))
    ]);
    const forms = formsSnap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    const existingByForm = new Map(mineSnap.docs.map(item => [item.data().formId, { id: item.id, ...item.data() }]));
    const cards = forms.map(form => {
      const existing = existingByForm.get(form.id);
      let action = `<button class="button" data-apply="${form.id}" ${form.status === 'open' && !existing ? '' : 'disabled'}>Apply Now</button>`;
      if (existing?.status === 'draft') action = `<button class="button" data-apply="${form.id}">Continue Draft</button>`;
      if (existing && existing.status !== 'draft') action = `<button class="button secondary" data-status="${existing.id}">View Status</button>`;
      return `<article class="card"><div class="row"><h3>${esc(form.title)}</h3>${badge(form.status)}</div><p class="muted">${esc(form.department || 'General')} · ${(form.questions || []).length} question(s)</p><p>${esc(form.description || '')}</p>${existing ? `<p>Your status: ${badge(existing.status)}</p>` : ''}${action}</article>`;
    }).join('') || '<p class="muted">No applications are available yet.</p>';
    shell(`<section class="page-head"><h1>Applications</h1><p class="muted">View current opportunities and track your submissions.</p></section><section class="grid cards">${cards}</section>`);
    document.querySelectorAll('[data-apply]').forEach(button => { button.onclick = () => go(`#/apply/${button.dataset.apply}`); });
    document.querySelectorAll('[data-status]').forEach(button => { button.onclick = () => go(`#/status/${button.dataset.status}`); });
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load applications</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

async function apply(formId) {
  if (!needLogin()) return;
  if (!formId) return shell('<section class="panel"><h1>Application not found</h1></section>');
  try {
    const formSnap = await getDoc(doc(db, 'application_forms', formId));
    if (!formSnap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
    const form = { id: formSnap.id, ...formSnap.data() };
    const appId = `${profile.uid}_${formId}`;
    const oldSnap = await getDoc(doc(db, 'applications', appId));
    const old = oldSnap.exists() ? oldSnap.data() : null;
    if (old && old.status !== 'draft') return go(`#/status/${appId}`);
    if (form.status !== 'open' && !old) return shell('<section class="panel"><h1>This application is closed.</h1></section>');
    const questions = Array.isArray(form.questions) ? form.questions : [];
    shell(`<section class="panel wide"><p class="eyebrow">${esc(form.department || 'Cognitus')}</p><h1>${esc(form.title)}</h1><p>${esc(form.description || '')}</p>${(form.requirements || []).length ? `<h3>Requirements</h3><ul>${form.requirements.map(requirement => `<li>${esc(requirement)}</li>`).join('')}</ul>` : ''}<form id="applicationForm" class="form">${questions.map((question, index) => { const qid = question.id || `q${index + 1}`; return `<label>${esc(question.question || qid)}<textarea name="${esc(qid)}" rows="5" required>${esc(old?.answers?.[qid] || '')}</textarea></label>`; }).join('')}<label>Conflict of Interest Disclosure<textarea name="conflictDisclosure" rows="4">${esc(old?.conflictDisclosure || '')}</textarea></label><label class="check"><input type="checkbox" name="agreement" required ${old?.agreement ? 'checked' : ''}> I certify this is truthful and understand I may only submit once for this application.</label><div class="actions"><button class="button secondary" name="intent" value="draft" formnovalidate>Save Draft</button><button class="button" name="intent" value="submit">Submit Application</button></div></form><div id="msg"></div></section>`);
    document.querySelector('#applicationForm').onsubmit = async event => {
      event.preventDefault();
      const intent = event.submitter?.value || 'draft';
      const data = new FormData(event.currentTarget);
      const answers = {};
      questions.forEach((question, index) => {
        const qid = question.id || `q${index + 1}`;
        answers[qid] = data.get(qid) || '';
      });
      try {
        await setDoc(doc(db, 'applications', appId), {
          applicationId: appId,
          applicantUid: profile.uid,
          applicantDiscordUsername: profile.discordUsername,
          applicantDiscordId: profile.discordId,
          applicantRobloxUsername: profile.robloxUsername || '',
          formId,
          formTitle: form.title,
          department: form.department || 'General',
          answers,
          conflictDisclosure: data.get('conflictDisclosure') || '',
          agreement: data.get('agreement') === 'on',
          status: intent === 'submit' ? 'submitted' : 'draft',
          updatedAt: serverTimestamp(),
          submittedAt: intent === 'submit' ? serverTimestamp() : old?.submittedAt || null
        }, { merge: true });
        go(intent === 'submit' ? `#/status/${appId}` : '#/applications');
      } catch (error) {
        document.querySelector('#msg').innerHTML = `<p class="error">Could not save application: ${esc(error.message)}</p>`;
      }
    };
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not open application</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

async function status(appId) {
  if (!needLogin()) return;
  try {
    const snap = await getDoc(doc(db, 'applications', appId));
    if (!snap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
    const app = { id: snap.id, ...snap.data() };
    if (app.applicantUid !== profile.uid && !canStaff()) return shell('<section class="panel"><h1>Access denied</h1></section>');
    shell(`<section class="panel wide"><p class="eyebrow">Application Status</p><div class="row"><h1>${esc(app.formTitle)}</h1>${badge(app.status)}</div><p class="muted">Department: ${esc(app.department || 'General')}</p>${app.decision ? `<div class="notice"><strong>Decision:</strong> ${esc(app.decision)}</div>` : ''}${app.publicMessage ? `<div class="notice">${esc(app.publicMessage)}</div>` : ''}<h3>Responses</h3>${Object.entries(app.answers || {}).map(([key, value]) => `<div class="answer"><strong>${esc(key)}</strong><p>${esc(value)}</p></div>`).join('') || '<p class="muted">No responses recorded.</p>'}</section>`);
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load application status</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

function render() {
  if (!ready) return loading();
  const [path, param] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (!path) return home();
  if (delegatedRoutes.has(path)) return;
  if (path === 'signin') return signin();
  if (path === 'register') return register();
  if (path === 'bootstrap') return bootstrap();
  if (path === 'dashboard') return dashboard();
  if (path === 'applications') return applications();
  if (path === 'apply') return apply(param);
  if (path === 'status') return status(param);
  return home();
}

loading();
