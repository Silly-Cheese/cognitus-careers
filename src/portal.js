import './styles.css';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
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
  where
} from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const executiveRoles = ['executive', 'owner'];
const delegatedRoutes = new Set(['dashboard', 'review', 'executive', 'owner', 'notifications', 'profile']);
const COGNITUS_AUTH_BASE = 'https://auth.cognitus-solutions.org';
const COGNITUS_PORTAL_KEY = 'talent';

let user = null;
let profile = null;
let ready = false;
let renderToken = 0;

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
const timeValue = value => value?.toMillis?.() || (typeof value?.seconds === 'number' ? value.seconds * 1000 : 0);
const label = value => ({
  draft: 'Draft', submitted: 'Submitted', underReview: 'Under Review',
  pendingFinalDecision: 'Awaiting Final Decision', interviewRequested: 'Interview Requested',
  interviewCompleted: 'Interview Completed', accepted: 'Accepted', denied: 'Denied', archived: 'Archived',
  open: 'Open', closed: 'Closed'
}[value] || value || 'Unknown');
const badge = value => `<span class="badge badge-${String(value || 'unknown').toLowerCase()}">${esc(label(value))}</span>`;

const discordOAuthUrl = () => `${COGNITUS_AUTH_BASE}/discord/start?portal=${COGNITUS_PORTAL_KEY}`;

async function completeDiscordOAuthIfPresent() {
  const params = new URLSearchParams(location.search);
  if (params.get('cognitus_oauth') !== '1') return false;
  try {
    const response = await fetch(
      `${COGNITUS_AUTH_BASE}/session/exchange?portal=${COGNITUS_PORTAL_KEY}`,
      { credentials: 'include', headers: { Accept: 'application/json' } }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.customToken) {
      throw new Error(payload.error || 'Discord sign-in could not be completed.');
    }
    await signInWithCustomToken(auth, payload.customToken);
    sessionStorage.removeItem('cognitusDiscordOAuthError');
    history.replaceState(null, '', `${location.pathname}#/dashboard`);
    return true;
  } catch (error) {
    sessionStorage.setItem(
      'cognitusDiscordOAuthError',
      error?.message || 'Discord sign-in could not be completed.'
    );
    history.replaceState(null, '', `${location.pathname}#/signin`);
    return false;
  }
}

async function bootAuth() {
  await completeDiscordOAuthIfPresent();
  onAuthStateChanged(auth, async current => {
    user = current;
    profile = current ? await getProfile(current.uid) : null;
    ready = true;
    render();
  });
}
bootAuth();
window.addEventListener('hashchange', render);

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function navMarkup() {
  if (!profile) return '<a href="#/">Home</a><a href="#/signin">Sign In</a><a href="#/register">Create Account</a>';
  return `<a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/notifications">Notifications</a><a href="#/profile">Profile</a>${canStaff() ? '<a href="#/review">Review</a>' : ''}${canExecutive() ? '<a href="#/executive">Executive</a>' : ''}${profile.role === 'owner' ? '<a href="#/owner">Owner</a>' : ''}<span class="muted">${esc(profile.discordUsername || '')}</span><button class="ghost" id="signOutBtn">Sign Out</button>`;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav>${navMarkup()}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Talent Gateway</footer>`;
  document.querySelector('#signOutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    go('#/');
  });
}

function loading() {
  shell('<section class="panel"><h1>Loading…</h1></section>');
}

function needLogin() {
  if (!ready) { loading(); return false; }
  if (!profile) { go('#/signin'); return false; }
  return true;
}

function home() {
  shell(`<section class="hero"><div><p class="eyebrow">Cognitus Solutions Careers</p><h1>Find your place at Cognitus.</h1><p class="lead">Apply for open roles, check your status, and keep your application history in one place.</p><div class="actions"><a class="button" href="#/signin">Sign In</a><a class="button secondary" href="#/register">Create Account</a></div></div><div class="hero-card"><h3>For applicants</h3><p>Use your Discord User ID and password to access your account from any device.</p></div></section>`);
}

function signin() {
  if (profile) return go('#/dashboard');
  shell(`<section class="panel narrow"><p class="eyebrow">Discord Sign In</p><h1>Welcome back.</h1><p class="muted">The Talent Gateway now uses verified Discord authentication for sign-in.</p><div class="actions"><a class="button" href="${esc(discordOAuthUrl())}">Continue with Discord</a></div><p class="muted" style="margin-top:18px">Your existing applications, role, and account history remain attached to the same Talent Gateway identity.</p><p class="muted">Need an account? <a href="#/register">Create one with Discord.</a></p><div id="msg"></div></section>`);
  const oauthError = sessionStorage.getItem('cognitusDiscordOAuthError');
  if (oauthError) {
    sessionStorage.removeItem('cognitusDiscordOAuthError');
    const msg = document.querySelector('#msg');
    if (msg) msg.innerHTML = `<p class="error">${esc(oauthError)}</p>`;
  }
}

function register() {
  if (profile) return go('#/dashboard');
  shell(`<section class="panel narrow"><p class="eyebrow">Verified Discord Registration</p><h1>Create your Talent Gateway account.</h1><p class="muted">Account creation begins with Discord. Cognitus will verify your Discord identity, detect any existing Main or Talent records, and create only what is missing.</p><div class="actions"><a class="button" href="${esc(discordOAuthUrl())}">Create Account with Discord</a></div><p class="muted" style="margin-top:18px">Already have an account? <a href="#/signin">Sign in with Discord.</a></p><div id="msg"></div></section>`);
}

async function applications(token) {
  if (!needLogin()) return;
  shell('<section class="panel"><h1>Loading applications…</h1><p class="muted">Checking opportunities and your application history.</p></section>');
  try {
    const [formsSnap, mineSnap] = await Promise.all([
      getDocs(collection(db, 'application_forms')),
      getDocs(query(collection(db, 'applications'), where('applicantUid', '==', profile.uid)))
    ]);
    if (token !== renderToken) return;
    const existingByForm = new Map(mineSnap.docs.map(item => [item.data().formId, { id: item.id, ...item.data() }]));
    const forms = formsSnap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(form => profile.role !== 'applicant' || form.status === 'open' || existingByForm.has(form.id))
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));

    const cards = forms.map(form => {
      const existing = existingByForm.get(form.id);
      let action = `<button class="button" data-apply="${esc(form.id)}" ${form.status === 'open' && !existing ? '' : 'disabled'}>Apply Now</button>`;
      if (existing?.status === 'draft') action = `<button class="button" data-apply="${esc(form.id)}">Continue Draft</button>`;
      if (existing && existing.status !== 'draft') action = `<button class="button secondary" data-status="${esc(existing.id)}">View Status</button>`;
      return `<article class="card"><div class="row"><h3>${esc(form.title || 'Opportunity')}</h3>${badge(form.status)}</div><p class="muted">${esc(form.department || 'General')} · ${(form.questions || []).length} question(s)</p><p>${esc(form.description || '')}</p>${existing ? `<p>Your status: ${badge(existing.status)}</p>` : ''}${action}</article>`;
    }).join('') || '<p class="muted">No applications are available right now.</p>';

    shell(`<section class="page-head"><h1>Applications</h1><p class="muted">${profile.role === 'applicant' ? 'Open opportunities and your existing applications appear here.' : 'View application forms and your own submissions.'}</p></section><section class="grid cards">${cards}</section>`);
    document.querySelectorAll('[data-apply]').forEach(button => { button.onclick = () => go(`#/apply/${button.dataset.apply}`); });
    document.querySelectorAll('[data-status]').forEach(button => { button.onclick = () => go(`#/status/${button.dataset.status}`); });
  } catch (error) {
    if (token !== renderToken) return;
    shell(`<section class="panel wide"><h1>Could not load applications</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

async function apply(formId, token) {
  if (!needLogin()) return;
  if (!formId) return shell('<section class="panel"><h1>Application not found</h1></section>');
  shell('<section class="panel"><h1>Opening application…</h1></section>');
  try {
    const formSnap = await getDoc(doc(db, 'application_forms', formId));
    if (token !== renderToken) return;
    if (!formSnap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
    const form = { id: formSnap.id, ...formSnap.data() };
    const appId = `${profile.uid}_${formId}`;
    const oldSnap = await getDoc(doc(db, 'applications', appId));
    if (token !== renderToken) return;
    const old = oldSnap.exists() ? oldSnap.data() : null;
    if (old && old.status !== 'draft') return go(`#/status/${appId}`);
    if (form.status !== 'open' && !old) return shell('<section class="panel"><h1>This application is closed.</h1><p class="muted">This opportunity is no longer accepting new responses.</p></section>');
    const questions = Array.isArray(form.questions) ? form.questions : [];
    shell(`<section class="panel wide"><p class="eyebrow">${esc(form.department || 'Cognitus')}</p><h1>${esc(form.title || 'Application')}</h1><p>${esc(form.description || '')}</p>${(form.requirements || []).length ? `<h3>Requirements</h3><ul>${form.requirements.map(requirement => `<li>${esc(requirement)}</li>`).join('')}</ul>` : ''}<form id="applicationForm" class="form">${questions.map((question, index) => { const qid = question.id || `q${index + 1}`; return `<label>${esc(question.question || qid)}<textarea name="${esc(qid)}" rows="5" required>${esc(old?.answers?.[qid] || '')}</textarea></label>`; }).join('')}<label>Conflict of Interest Disclosure<textarea name="conflictDisclosure" rows="4">${esc(old?.conflictDisclosure || '')}</textarea></label><label class="check"><input type="checkbox" name="agreement" required ${old?.agreement ? 'checked' : ''}> I certify this is truthful and understand I may only submit once for this application.</label><div class="actions"><button class="button secondary" name="intent" value="draft" formnovalidate>Save Draft</button><button class="button" name="intent" value="submit">Submit Application</button></div></form><div id="msg"></div></section>`);
    document.querySelector('#applicationForm').onsubmit = async event => {
      event.preventDefault();
      const intent = event.submitter?.value || 'draft';
      const data = new FormData(event.currentTarget);
      const answers = {};
      questions.forEach((question, index) => {
        const qid = question.id || `q${index + 1}`;
        answers[qid] = data.get(qid) || '';
      });
      const msg = document.querySelector('#msg');
      if (msg) msg.innerHTML = `<p class="muted">${intent === 'submit' ? 'Submitting application…' : 'Saving draft…'}</p>`;
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
        if (msg) msg.innerHTML = `<p class="error">Could not save application: ${esc(error.message)}</p>`;
      }
    };
  } catch (error) {
    if (token !== renderToken) return;
    shell(`<section class="panel wide"><h1>Could not open application</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

async function status(appId, token) {
  if (!needLogin()) return;
  if (!appId) return shell('<section class="panel"><h1>Application not found</h1></section>');
  try {
    const snap = await getDoc(doc(db, 'applications', appId));
    if (token !== renderToken) return;
    if (!snap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
    const app = { id: snap.id, ...snap.data() };
    if (app.applicantUid !== profile.uid && !canStaff()) return shell('<section class="panel"><h1>Access denied</h1></section>');
    shell(`<section class="panel wide"><p class="eyebrow">Application Status</p><div class="row"><h1>${esc(app.formTitle || 'Application')}</h1>${badge(app.status)}</div><p class="muted">Department: ${esc(app.department || 'General')}</p>${app.decision ? `<div class="notice"><strong>Decision:</strong> ${esc(label(app.decision))}</div>` : ''}${app.publicMessage ? `<div class="notice">${esc(app.publicMessage)}</div>` : ''}<h3>Responses</h3>${Object.entries(app.answers || {}).map(([key, value]) => `<div class="answer"><strong>${esc(key)}</strong><p>${esc(value)}</p></div>`).join('') || '<p class="muted">No responses recorded.</p>'}</section>`);
  } catch (error) {
    if (token !== renderToken) return;
    shell(`<section class="panel wide"><h1>Could not load application status</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

function render() {
  const token = ++renderToken;
  if (!ready) return loading();
  const [path, param] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (!path) return home();
  if (delegatedRoutes.has(path)) return;
  if (path === 'signin') return signin();
  if (path === 'register') return register();
  if (path === 'applications') return applications(token);
  if (path === 'apply') return apply(param, token);
  if (path === 'status') return status(param, token);
  return home();
}

loading();
