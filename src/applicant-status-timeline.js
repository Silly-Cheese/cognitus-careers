import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
let user = auth.currentUser;
let profile = null;
let ready = false;

const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const canStaff = () => profile && staffRoles.includes(profile.role);
const labels = {
  draft: 'Draft',
  submitted: 'Submitted',
  underReview: 'Under Review',
  pendingFinalDecision: 'Awaiting Final Decision',
  interviewRequested: 'Interview Requested',
  interviewCompleted: 'Interview Completed',
  accepted: 'Accepted',
  denied: 'Denied',
  archived: 'Archived'
};
const descriptions = {
  draft: 'Your application has been saved but not submitted.',
  submitted: 'Your application was successfully submitted.',
  underReview: 'A Cognitus reviewer has opened your application.',
  pendingFinalDecision: 'A recommendation has been submitted. Ownership will make the final decision.',
  interviewRequested: 'Cognitus leadership has requested an interview.',
  interviewCompleted: 'The interview step has been completed.',
  accepted: 'Your application has been accepted.',
  denied: 'Your application was not approved at this time.',
  archived: 'This application record has been archived.'
};
const order = ['submitted', 'underReview', 'pendingFinalDecision', 'interviewRequested', 'interviewCompleted'];

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  setTimeout(handleStatusRoute, 25);
});
window.addEventListener('hashchange', () => setTimeout(handleStatusRoute, 25));

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/notifications">Notifications</a><a href="#/profile">Profile</a>${canStaff() ? '<a href="#/review">Review</a>' : ''}${['executive','owner'].includes(profile?.role) ? '<a href="#/executive">Executive</a>' : ''}${profile?.role === 'owner' ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · Timeline v2</footer>`;
}

async function handleStatusRoute() {
  const [path, appId] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'status' || !appId) return;
  if (!ready || !user || !profile) return;
  try {
    const snap = await getDoc(doc(db, 'applications', appId));
    if (!snap.exists()) return;
    const app = { id: snap.id, ...snap.data() };
    if (app.applicantUid !== profile.uid && !canStaff()) return;
    renderStatus(app);
  } catch (error) {
    shell(`<section class="panel"><h1>Could not load status</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

function renderStatus(app) {
  shell(`<section class="panel wide"><p class="eyebrow">Application Status</p><div class="row"><h1>${esc(app.formTitle || 'Application')}</h1><span class="badge badge-${esc(app.status || 'unknown')}">${esc(labels[app.status] || app.status || 'Unknown')}</span></div><p class="muted">Department: ${esc(app.department || 'General')}</p>${timeline(app.status)}${interviewCard(app)}${app.decision ? `<div class="notice"><strong>Decision:</strong> ${esc(labels[app.decision] || app.decision)}</div>` : ''}${app.publicMessage ? `<div class="notice">${esc(app.publicMessage)}</div>` : ''}<h3>Your Responses</h3>${Object.entries(app.answers || {}).map(([k,v]) => `<div class="answer"><strong>${esc(k)}</strong><p>${esc(v)}</p></div>`).join('') || '<p class="muted">No responses recorded.</p>'}<h3>Conflict Disclosure</h3><div class="answer"><p>${esc(app.conflictDisclosure || 'None provided.')}</p></div></section>`);
}

function interviewCard(app) {
  const hasInterview = ['interviewRequested', 'interviewCompleted'].includes(app.status) || app.interviewTime || app.interviewMethod || app.interviewInstructions || app.interviewerName;
  if (!hasInterview) return '';
  return `<section class="notice"><h3>Interview Details</h3><div class="grid two"><div><strong>Date/Time</strong><p>${esc(app.interviewTime || 'Not provided yet.')}</p></div><div><strong>Method</strong><p>${esc(app.interviewMethod || 'Not provided yet.')}</p></div><div><strong>Interviewer</strong><p>${esc(app.interviewerName || app.interviewRequestedByUsername || 'Not provided yet.')}</p></div><div><strong>Status</strong><p>${esc(labels[app.status] || app.status || 'Interview Requested')}</p></div></div><div class="answer"><strong>Instructions</strong><p>${esc(app.interviewInstructions || 'No interview instructions were provided yet.')}</p></div></section>`;
}

function timeline(status) {
  const final = ['accepted', 'denied'].includes(status) ? status : null;
  const steps = final ? [...order.filter(step => step !== 'interviewCompleted' || status === 'accepted' || status === 'denied'), final] : order;
  const currentIndex = final ? steps.length - 1 : Math.max(0, order.indexOf(status));
  return `<section class="notice"><h3>Status Timeline</h3><div class="status-timeline">${steps.map((step, index) => `<div class="timeline-step ${index <= currentIndex ? 'done' : ''}"><strong>${esc(labels[step])}</strong><p>${esc(descriptions[step])}</p></div>`).join('')}</div></section>`;
}
