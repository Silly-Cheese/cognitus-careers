import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
let profile = null;
let ready = false;
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const finalRoles = ['executive', 'owner'];
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const staff = () => profile && staffRoles.includes(profile.role);
const finalDecision = () => profile && finalRoles.includes(profile.role);
const owner = () => profile?.role === 'owner';
const timeValue = value => value?.toMillis ? value.toMillis() : 0;
const statusLabel = value => ({ submitted: 'Submitted', underReview: 'Under Review', pendingFinalDecision: 'Awaiting Final Decision', interviewRequested: 'Interview Requested', interviewCompleted: 'Interview Completed', accepted: 'Accepted', denied: 'Denied', archived: 'Archived', draft: 'Draft' }[value] || value || 'Unknown');
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(statusLabel(v))}</span>`;
const go = path => { location.hash = path; };

onAuthStateChanged(auth, async user => {
  profile = user ? await getProfile(user.uid) : null;
  ready = true;
  setTimeout(handleReviewQueue, 500);
  setTimeout(enforceAssignmentTools, 700);
});

window.addEventListener('hashchange', () => {
  setTimeout(handleReviewQueue, 500);
  setTimeout(enforceAssignmentTools, 700);
});

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/notifications">Notifications</a><a href="#/profile">Profile</a>${staff() ? '<a href="#/review">Review</a>' : ''}${finalDecision() ? '<a href="#/executive">Executive</a>' : ''}${owner() ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · AssignedReviewPolicy v1</footer>`;
}

async function handleReviewQueue() {
  const [path, appId] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'review' || appId || !ready || !profile || !staff()) return;
  await renderPolicyQueue();
}

async function renderPolicyQueue() {
  shell('<section class="panel"><h1>Loading review queue...</h1><p class="muted">Checking your review permissions.</p></section>');
  try {
    const appsSnap = finalDecision()
      ? await getDocs(collection(db, 'applications'))
      : await getDocs(query(collection(db, 'applications'), where('assignedReviewerUid', '==', profile.uid)));
    const apps = appsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
    const rows = apps.map(app => `<tr><td>${esc(app.formTitle || 'Untitled')}<br><span class="muted">${esc(app.department || 'General')}</span></td><td>${esc(app.applicantDiscordUsername || '')}<br><span class="muted">${esc(app.applicantDiscordId || '')}</span></td><td>${badge(app.status)}</td><td>${esc(app.assignedReviewerUsername || 'Unassigned')}</td><td>${esc(app.reviewerRecommendation || 'None')}</td><td><button class="button small" data-open-review="${app.id}">Open</button></td></tr>`).join('') || `<tr><td colspan="6">${finalDecision() ? 'No applications have been submitted yet.' : 'No applications are currently assigned to you.'}</td></tr>`;
    const subtitle = finalDecision()
      ? 'Executives and owners can see all applications and assign reviewers.'
      : 'You only see applications assigned to you. Open one to submit a recommendation.';
    shell(`<section class="page-head"><div><p class="eyebrow">Reviewer Center</p><h1>${finalDecision() ? 'All Applications' : 'Assigned Reviews'}</h1><p class="muted">${subtitle}</p></div></section><section class="panel"><div id="reviewQueueMsg"></div><table><thead><tr><th>Application</th><th>Applicant</th><th>Status</th><th>Assigned Reviewer</th><th>Recommendation</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
    document.querySelectorAll('[data-open-review]').forEach(btn => btn.onclick = () => go(`#/review/${btn.dataset.openReview}`));
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load review queue</h1><p class="error">${esc(error.message)}</p><div class="notice"><strong>Rules may need deployment.</strong><br>Deploy Firestore rules, then refresh.</div></section>`);
  }
}

function enforceAssignmentTools() {
  const [path, appId] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'review' || !appId || !profile) return;
  const tools = document.querySelector('#reviewSuiteTools');
  if (!tools) return;

  const assignLabel = tools.querySelector('#assignReviewer')?.closest('label');
  const saveAssignment = tools.querySelector('#saveAssignment');
  if (!finalDecision()) {
    assignLabel?.remove();
    saveAssignment?.remove();
    if (!tools.querySelector('#assignmentPolicyNotice')) {
      tools.insertAdjacentHTML('afterbegin', '<div class="notice" id="assignmentPolicyNotice"><strong>Assigned Review Access</strong><br>You can review and recommend this application because it was assigned to you. Only executives and owners can assign reviewers.</div>');
    }
  }
}
