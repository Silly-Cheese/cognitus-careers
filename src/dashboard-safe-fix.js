import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
let profile = null;
let ready = false;

const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const finalRoles = ['executive', 'owner'];
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const roleLabel = v => ({ seniorReviewer: 'Senior Reviewer', hiringLead: 'Hiring Lead' }[v] || v || 'Unknown');
const statusLabel = v => ({ submitted: 'Submitted', underReview: 'Under Review', pendingFinalDecision: 'Awaiting Final Decision', interviewRequested: 'Interview Requested', interviewCompleted: 'Interview Completed', accepted: 'Accepted', denied: 'Denied', archived: 'Archived', draft: 'Draft' }[v] || v || 'Unknown');
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(statusLabel(v))}</span>`;
const staff = () => profile && staffRoles.includes(profile.role);
const finalDecision = () => profile && finalRoles.includes(profile.role);
const owner = () => profile?.role === 'owner';
const timeValue = value => value?.toMillis ? value.toMillis() : 0;

onAuthStateChanged(auth, async user => {
  profile = user ? await getProfile(user.uid) : null;
  ready = true;
  setTimeout(handleDashboard, 650);
});

window.addEventListener('hashchange', () => setTimeout(handleDashboard, 650));

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>${profile ? '<a href="#/notifications">Notifications</a><a href="#/profile">Profile</a>' : ''}${staff() ? '<a href="#/review">Review</a>' : ''}${finalDecision() ? '<a href="#/executive">Executive</a>' : ''}${owner() ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · DashboardSafeFix v1</footer>`;
}

async function safeGet(label, loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.warn(`${label} dashboard section failed.`, error);
    return fallback;
  }
}

async function handleDashboard() {
  const [path] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'dashboard' || !ready || !profile) return;
  const hasError = document.querySelector('main .error')?.textContent?.includes('Missing or insufficient permissions');
  if (!hasError && !document.querySelector('footer')?.textContent?.includes('PortalSuitePlus')) return;
  await renderSafeDashboard();
}

async function renderSafeDashboard() {
  const forms = await safeGet('forms', async () => {
    const snap = await getDocs(collection(db, 'application_forms'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.status === 'open');
  }, []);

  const apps = await safeGet('applications', async () => {
    const snap = await getDocs(query(collection(db, 'applications'), where('applicantUid', '==', profile.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
  }, []);

  const notes = await safeGet('notifications', async () => {
    const snap = await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', profile.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }, []);

  const latest = apps[0];
  const unread = notes.filter(n => !n.read).length;

  const applicantCards = profile.role === 'applicant' ? `<section class="grid cards"><a class="card" href="#/applications"><h3>${forms.length}</h3><p class="muted">Open Applications</p></a><a class="card" href="#/notifications"><h3>${unread}</h3><p class="muted">Unread Notifications</p></a><a class="card" href="#/profile"><h3>Profile</h3><p class="muted">Update availability and experience.</p></a></section><section class="panel"><h2>My Applications</h2>${apps.map(app => `<div class="mini-card"><div><strong>${esc(app.formTitle || 'Application')}</strong><p>${badge(app.status)} · ${esc(app.department || 'General')}</p></div><a class="button small secondary" href="#/status/${app.id}">View Status</a></div>`).join('') || '<p class="muted">You have not submitted an application yet.</p>'}</section><section class="panel"><h2>Next Steps</h2><p>${latest ? esc(nextStepText(latest.status)) : 'Apply for an open Cognitus position when you are ready.'}</p></section>` : '';
  const staffCards = staff() ? `<section class="grid cards"><a class="card" href="#/review"><h3>Review Queue</h3><p class="muted">Review submitted applications.</p></a>${finalDecision() ? '<a class="card" href="#/executive"><h3>Executive</h3><p class="muted">Manage forms and interviews.</p></a>' : ''}${owner() ? '<a class="card" href="#/owner"><h3>Owner Console</h3><p class="muted">Manage users, exports, recovery, settings.</p></a>' : ''}</section>` : '';
  const permissionNotice = '<section class="notice"><strong>Dashboard safety mode:</strong> If a section is blank, deploy the latest Firestore rules and refresh.</section>';

  shell(`<section class="page-head"><div><p class="eyebrow">${esc(roleLabel(profile.role))}</p><h1>Welcome, ${esc(profile.discordUsername)}</h1><p class="muted">Discord ID: ${esc(profile.discordId || '')}</p></div></section>${permissionNotice}${applicantCards}${staffCards}`);
}

function nextStepText(status) {
  return ({ draft: 'Finish and submit your draft application.', submitted: 'Your application is submitted and waiting for a reviewer.', underReview: 'A reviewer has opened your application. Watch for updates.', pendingFinalDecision: 'A recommendation was submitted. Ownership will make the final decision.', interviewRequested: 'An interview has been requested. Review the instructions on your status page.', accepted: 'Your application has been accepted. Watch for onboarding instructions.', denied: 'This application was not approved at this time.' }[status] || 'Watch your status page for updates.');
}
