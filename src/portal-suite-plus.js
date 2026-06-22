import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { confirmAction } from './confirm-modal.js';

const root = document.querySelector('#app');
let user = auth.currentUser;
let profile = null;
let ready = false;

const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const finalRoles = ['executive', 'owner'];
const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const roleLabel = v => ({ seniorReviewer: 'Senior Reviewer', hiringLead: 'Hiring Lead' }[v] || v || 'Unknown');
const statusLabel = v => ({ submitted: 'Submitted', underReview: 'Under Review', pendingFinalDecision: 'Awaiting Final Decision', interviewRequested: 'Interview Requested', interviewCompleted: 'Interview Completed', accepted: 'Accepted', denied: 'Denied', archived: 'Archived', draft: 'Draft' }[v] || v || 'Unknown');
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(statusLabel(v))}</span>`;
const go = path => { location.hash = path; };
const staff = () => profile && staffRoles.includes(profile.role);
const finalDecision = () => profile && finalRoles.includes(profile.role);
const owner = () => profile?.role === 'owner';
const timeValue = value => value?.toMillis ? value.toMillis() : 0;
const dateText = value => value?.toDate ? value.toDate().toLocaleString() : 'Unknown';

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  setTimeout(handleSuiteRoutes, 80);
  setTimeout(enhanceReviewDetail, 450);
  setTimeout(enhanceHeaderNotifications, 500);
});
window.addEventListener('hashchange', () => {
  setTimeout(handleSuiteRoutes, 80);
  setTimeout(enhanceReviewDetail, 450);
  setTimeout(enhanceHeaderNotifications, 500);
});

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content, footer = 'PortalSuitePlus v1') {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>${profile ? '<a href="#/notifications">Notifications</a><a href="#/profile">Profile</a>' : ''}${staff() ? '<a href="#/review">Review</a>' : ''}${finalDecision() ? '<a href="#/executive">Executive</a>' : ''}${owner() ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · ${esc(footer)}</footer>`;
}

function parts() {
  return (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
}

async function handleSuiteRoutes() {
  const [path, action] = parts();
  if (!['dashboard', 'notifications', 'profile', 'owner', 'review'].includes(path)) return;
  if (!ready || !user || !profile) return;
  if (path === 'dashboard') return enhancedDashboard();
  if (path === 'notifications') return notificationsPage();
  if (path === 'profile') return profilePage();
  if (path === 'owner' && action === 'recovery') return recoveryPage();
  if (path === 'owner' && action === 'settings') return settingsPage();
  if (path === 'owner' && action === 'exports') return exportsPage();
}

async function enhancedDashboard() {
  try {
    const [formsSnap, appsSnap, notificationsSnap] = await Promise.all([
      getDocs(collection(db, 'application_forms')),
      getDocs(query(collection(db, 'applications'), where('applicantUid', '==', profile.uid))),
      getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', profile.uid)))
    ]);
    const forms = formsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.status === 'open');
    const apps = appsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
    const notes = notificationsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    const latest = apps[0];
    const unread = notes.filter(n => !n.read).length;
    const applicantCards = profile.role === 'applicant' ? `<section class="grid cards"><a class="card" href="#/applications"><h3>${forms.length}</h3><p class="muted">Open Applications</p></a><a class="card" href="#/notifications"><h3>${unread}</h3><p class="muted">Unread Notifications</p></a><a class="card" href="#/profile"><h3>Profile</h3><p class="muted">Update availability and experience.</p></a></section><section class="panel"><h2>My Applications</h2>${apps.map(app => `<div class="mini-card"><div><strong>${esc(app.formTitle || 'Application')}</strong><p>${badge(app.status)} · ${esc(app.department || 'General')}</p></div><a class="button small secondary" href="#/status/${app.id}">View Status</a></div>`).join('') || '<p class="muted">You have not submitted an application yet.</p>'}</section><section class="panel"><h2>Next Steps</h2><p>${latest ? esc(nextStepText(latest.status)) : 'Apply for an open Cognitus position when you are ready.'}</p></section>` : '';
    const staffCards = staff() ? `<section class="grid cards"><a class="card" href="#/review"><h3>Review Queue</h3><p class="muted">Review submitted applications.</p></a>${finalDecision() ? '<a class="card" href="#/executive"><h3>Executive</h3><p class="muted">Manage forms and interviews.</p></a>' : ''}${owner() ? '<a class="card" href="#/owner"><h3>Owner Console</h3><p class="muted">Manage users, exports, recovery, settings.</p></a>' : ''}</section>` : '';
    shell(`<section class="page-head"><div><p class="eyebrow">${esc(roleLabel(profile.role))}</p><h1>Welcome, ${esc(profile.discordUsername)}</h1><p class="muted">Discord ID: ${esc(profile.discordId || '')}</p></div></section>${applicantCards}${staffCards}`);
  } catch (error) {
    shell(`<section class="panel"><h1>Dashboard could not load</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

function nextStepText(status) {
  return ({ draft: 'Finish and submit your draft application.', submitted: 'Your application is submitted and waiting for a reviewer.', underReview: 'A reviewer has opened your application. Watch for updates.', pendingFinalDecision: 'A recommendation was submitted. Ownership will make the final decision.', interviewRequested: 'An interview has been requested. Review the instructions on your status page.', accepted: 'Your application has been accepted. Watch for onboarding instructions.', denied: 'This application was not approved at this time.' }[status] || 'Watch your status page for updates.');
}

async function notificationsPage() {
  const snap = await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', profile.uid)));
  const notes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
  shell(`<section class="page-head"><div><p class="eyebrow">Notification Center</p><h1>Notifications</h1><p class="muted">Important portal updates and hiring actions.</p></div></section><section class="panel">${notes.map(n => `<div class="note"><strong>${esc(n.title || 'Notification')}</strong><p>${esc(n.message || '')}</p><span>${esc(dateText(n.createdAt))} · ${n.read ? 'Read' : 'Unread'}</span><div class="actions"><button class="button small secondary" data-read-note="${n.id}">Mark Read</button></div></div>`).join('') || '<p class="muted">No notifications yet.</p>'}</section>`, 'Notifications');
  document.querySelectorAll('[data-read-note]').forEach(btn => btn.onclick = async () => { await updateDoc(doc(db, 'notifications', btn.dataset.readNote), { read: true, readAt: serverTimestamp() }); notificationsPage(); });
}

async function notify(recipientUid, title, message, type = 'system') {
  if (!recipientUid) return;
  try {
    await addDoc(collection(db, 'notifications'), { recipientUid, title, message, type, read: false, createdAt: serverTimestamp(), createdBy: profile?.uid || 'system', createdByUsername: profile?.discordUsername || 'System' });
  } catch (error) {
    console.warn('Notification failed.', error);
  }
}

async function enhanceHeaderNotifications() {
  if (!profile) return;
  try {
    const snap = await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', profile.uid)));
    const unread = snap.docs.filter(d => !d.data().read).length;
    const link = [...document.querySelectorAll('nav a')].find(a => a.getAttribute('href') === '#/notifications');
    if (link && unread) link.textContent = `Notifications (${unread})`;
  } catch {}
}

async function profilePage() {
  shell(`<section class="page-head"><div><p class="eyebrow">Applicant Profile</p><h1>My Profile</h1><p class="muted">Keep your basic applicant information current.</p></div></section><section class="panel wide"><form id="profileForm" class="form split"><label>Discord Username<input name="discordUsername" value="${esc(profile.discordUsername || '')}" required></label><label>Roblox Username<input name="robloxUsername" value="${esc(profile.robloxUsername || '')}"></label><label>Timezone<input name="timezone" value="${esc(profile.timezone || '')}" placeholder="Central Time"></label><label>Preferred Department<input name="preferredDepartment" value="${esc(profile.preferredDepartment || '')}" placeholder="Human Resources"></label><label class="full">Availability<textarea name="availability" rows="4">${esc(profile.availability || '')}</textarea></label><label class="full">Past Experience<textarea name="pastExperience" rows="5">${esc(profile.pastExperience || '')}</textarea></label><button class="button">Save Profile</button></form><div id="profileMsg"></div></section>`, 'Profile');
  document.querySelector('#profileForm').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const msg = document.querySelector('#profileMsg');
    msg.innerHTML = '<p class="muted">Saving profile...</p>';
    try {
      await updateDoc(doc(db, 'users', profile.uid), { discordUsername: String(data.get('discordUsername') || '').trim(), robloxUsername: String(data.get('robloxUsername') || '').trim(), timezone: String(data.get('timezone') || '').trim(), preferredDepartment: String(data.get('preferredDepartment') || '').trim(), availability: String(data.get('availability') || '').trim(), pastExperience: String(data.get('pastExperience') || '').trim(), updatedAt: serverTimestamp() });
      profile = await getProfile(profile.uid);
      msg.innerHTML = '<p class="notice"><strong>Saved.</strong> Profile updated.</p>';
    } catch (error) { msg.innerHTML = `<p class="error">Could not save profile: ${esc(error.message)}</p>`; }
  };
}

async function enhanceReviewDetail() {
  const [path, appId] = parts();
  if (path !== 'review' || !appId || !staff()) return;
  const panel = document.querySelector('main .panel.wide');
  if (!panel || document.querySelector('#reviewSuiteTools')) return;
  const appSnap = await getDoc(doc(db, 'applications', appId));
  if (!appSnap.exists()) return;
  const app = { id: appSnap.id, ...appSnap.data() };
  const usersSnap = await getDocs(collection(db, 'users'));
  const reviewers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => staffRoles.includes(u.role));
  const tools = document.createElement('section');
  tools.className = 'notice';
  tools.id = 'reviewSuiteTools';
  tools.innerHTML = `<h3>Review Tools</h3><div class="grid two"><label>Assign Reviewer<select id="assignReviewer"><option value="">Unassigned</option>${reviewers.map(r => `<option value="${r.id}" ${r.id === app.assignedReviewerUid ? 'selected' : ''}>${esc(r.discordUsername || r.id)} — ${esc(roleLabel(r.role))}</option>`).join('')}</select></label><label>Interview Date/Time<input id="interviewTime" placeholder="Example: Saturday 3:00 PM CST" value="${esc(app.interviewTime || '')}"></label><label>Interview Method<input id="interviewMethod" placeholder="Discord VC / Chat / Roblox" value="${esc(app.interviewMethod || '')}"></label><label>Interviewer<input id="interviewerName" placeholder="Interviewer name" value="${esc(app.interviewerName || profile.discordUsername || '')}"></label><label class="full">Interview Instructions<textarea id="interviewInstructions" rows="3">${esc(app.interviewInstructions || '')}</textarea></label><div class="full"><h3>Rubric Score</h3><div class="grid two"><label>Professionalism<input type="number" min="1" max="5" id="scoreProfessionalism" value="${esc(app.scoreProfessionalism || '')}"></label><label>Experience<input type="number" min="1" max="5" id="scoreExperience" value="${esc(app.scoreExperience || '')}"></label><label>Communication<input type="number" min="1" max="5" id="scoreCommunication" value="${esc(app.scoreCommunication || '')}"></label><label>Fit for Role<input type="number" min="1" max="5" id="scoreFit" value="${esc(app.scoreFit || '')}"></label></div></div></div><div class="actions"><button class="button secondary" id="saveAssignment">Save Assignment</button><button class="button secondary" id="requestInterview">Request Interview</button><button class="button" id="saveRubric">Save Rubric</button></div><div id="suiteReviewMsg"></div>`;
  const actionForm = document.querySelector('#reviewForm');
  actionForm?.before(tools);
  document.querySelector('#saveAssignment').onclick = () => saveAssignment(app, reviewers);
  document.querySelector('#requestInterview').onclick = () => requestInterview(app);
  document.querySelector('#saveRubric').onclick = () => saveRubric(app);
}

async function saveAssignment(app, reviewers) {
  const uid = document.querySelector('#assignReviewer').value;
  const reviewer = reviewers.find(r => r.id === uid);
  await updateDoc(doc(db, 'applications', app.id), { assignedReviewerUid: uid || '', assignedReviewerUsername: reviewer?.discordUsername || '', assignedAt: serverTimestamp(), assignedBy: profile.uid, assignedByUsername: profile.discordUsername, updatedAt: serverTimestamp() });
  await audit('APPLICATION_ASSIGNED', { applicationId: app.id, targetUid: uid || '', details: reviewer?.discordUsername || 'Unassigned' });
  if (uid) await notify(uid, 'Application Assigned', `You were assigned to review ${app.formTitle || 'an application'}.`, 'assignment');
  document.querySelector('#suiteReviewMsg').innerHTML = '<p class="notice"><strong>Saved.</strong> Assignment updated.</p>';
}

async function requestInterview(app) {
  const payload = { status: 'interviewRequested', interviewTime: document.querySelector('#interviewTime').value.trim(), interviewMethod: document.querySelector('#interviewMethod').value.trim(), interviewerName: document.querySelector('#interviewerName').value.trim(), interviewInstructions: document.querySelector('#interviewInstructions').value.trim(), interviewRequestedAt: serverTimestamp(), interviewRequestedBy: profile.uid, interviewRequestedByUsername: profile.discordUsername, updatedAt: serverTimestamp() };
  await updateDoc(doc(db, 'applications', app.id), payload);
  await addDoc(collection(db, 'interviews'), { applicationId: app.id, applicantUid: app.applicantUid, formTitle: app.formTitle || '', ...payload });
  await notify(app.applicantUid, 'Interview Requested', `An interview has been requested for ${app.formTitle || 'your application'}.`, 'interview');
  await audit('INTERVIEW_REQUESTED', { applicationId: app.id, targetUid: app.applicantUid, details: payload.interviewTime });
  document.querySelector('#suiteReviewMsg').innerHTML = '<p class="notice"><strong>Saved.</strong> Interview requested.</p>';
}

async function saveRubric(app) {
  const scores = ['Professionalism', 'Experience', 'Communication', 'Fit'].map(name => Number(document.querySelector(`#score${name}`).value || 0));
  const total = scores.reduce((a, b) => a + b, 0);
  await updateDoc(doc(db, 'applications', app.id), { scoreProfessionalism: scores[0], scoreExperience: scores[1], scoreCommunication: scores[2], scoreFit: scores[3], scoreTotal: total, scorePercent: Math.round((total / 20) * 100), scoredAt: serverTimestamp(), scoredBy: profile.uid, scoredByUsername: profile.discordUsername, updatedAt: serverTimestamp() });
  await audit('RUBRIC_SCORED', { applicationId: app.id, details: `${total}/20` });
  document.querySelector('#suiteReviewMsg').innerHTML = `<p class="notice"><strong>Saved.</strong> Rubric score: ${total}/20.</p>`;
}

async function exportsPage() {
  if (!owner()) return;
  shell(`<section class="page-head"><div><p class="eyebrow">Owner Console</p><h1>Exports</h1><p class="muted">Download portal records as CSV files.</p></div><a class="button secondary" href="#/owner">Back</a></section><section class="panel"><div class="actions"><button class="button" data-export="applications">Applications CSV</button><button class="button" data-export="users">Users CSV</button><button class="button" data-export="audit_logs">Audit Logs CSV</button><button class="button" data-export="review_notes">Review Notes CSV</button></div></section>`, 'Exports');
  document.querySelectorAll('[data-export]').forEach(btn => btn.onclick = () => exportCollection(btn.dataset.export));
}

async function exportCollection(name) {
  const snap = await getDocs(collection(db, name));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const csv = [keys.join(','), ...rows.map(row => keys.map(k => csvCell(row[k])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  if (value?.toDate) value = value.toDate().toISOString();
  if (typeof value === 'object' && value !== null) value = JSON.stringify(value);
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

async function recoveryPage() {
  if (!owner()) return;
  const [appsSnap, formsSnap, usersSnap] = await Promise.all([getDocs(collection(db, 'applications')), getDocs(collection(db, 'application_forms')), getDocs(collection(db, 'users'))]);
  const deletedApps = appsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.deleted || a.status === 'deleted');
  const archivedForms = formsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.status === 'archived' || f.status === 'closed');
  const disabledUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.accountStatus === 'disabled');
  shell(`<section class="page-head"><div><p class="eyebrow">Owner Console</p><h1>Recovery</h1><p class="muted">Restore archived and disabled records.</p></div><a class="button secondary" href="#/owner">Back</a></section><section class="panel"><h2>Deleted Applications</h2>${deletedApps.map(a => `<div class="mini-card"><div><strong>${esc(a.formTitle || 'Application')}</strong><p>${esc(a.applicantDiscordUsername || '')}</p></div><button class="button small" data-recover-app="${a.id}">Restore</button></div>`).join('') || '<p class="muted">No deleted applications.</p>'}<h2>Closed/Archived Forms</h2>${archivedForms.map(f => `<div class="mini-card"><div><strong>${esc(f.title || 'Form')}</strong><p>${badge(f.status)} · ${esc(f.statusReason || '')}</p></div><button class="button small" data-reopen-form="${f.id}">Reopen</button></div>`).join('') || '<p class="muted">No closed or archived forms.</p>'}<h2>Disabled Accounts</h2>${disabledUsers.map(u => `<div class="mini-card"><div><strong>${esc(u.discordUsername || 'User')}</strong><p>${esc(u.discordId || '')}</p></div><button class="button small" data-enable-user="${u.id}">Enable</button></div>`).join('') || '<p class="muted">No disabled accounts.</p>'}</section>`, 'Recovery');
  document.querySelectorAll('[data-recover-app]').forEach(btn => btn.onclick = () => updateDoc(doc(db, 'applications', btn.dataset.recoverApp), { deleted: false, status: 'archived', restoredAt: serverTimestamp(), restoredBy: profile.uid, updatedAt: serverTimestamp() }).then(recoveryPage));
  document.querySelectorAll('[data-reopen-form]').forEach(btn => btn.onclick = () => updateDoc(doc(db, 'application_forms', btn.dataset.reopenForm), { status: 'open', updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername }).then(recoveryPage));
  document.querySelectorAll('[data-enable-user]').forEach(btn => btn.onclick = () => updateDoc(doc(db, 'users', btn.dataset.enableUser), { accountStatus: 'active', updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername }).then(recoveryPage));
}

async function settingsPage() {
  if (!owner()) return;
  const snap = await getDoc(doc(db, 'system', 'settings'));
  const settings = snap.exists() ? snap.data() : {};
  shell(`<section class="page-head"><div><p class="eyebrow">Owner Console</p><h1>System Settings</h1><p class="muted">Control portal-wide settings.</p></div><a class="button secondary" href="#/owner">Back</a></section><section class="panel wide"><form id="settingsForm" class="form split"><label>Portal Name<input name="portalName" value="${esc(settings.portalName || 'Cognitus Talent Gateway')}"></label><label>Registration<select name="registrationEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label>Applications<select name="applicationsEnabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label>Maintenance Mode<select name="maintenanceMode"><option value="false">Off</option><option value="true">On</option></select></label><label class="full">Default Acceptance Message<textarea name="acceptanceMessage" rows="3">${esc(settings.acceptanceMessage || '')}</textarea></label><label class="full">Default Denial Message<textarea name="denialMessage" rows="3">${esc(settings.denialMessage || '')}</textarea></label><button class="button">Save Settings</button></form><div id="settingsMsg"></div></section>`, 'Settings');
  document.querySelector('[name="registrationEnabled"]').value = String(settings.registrationEnabled ?? true);
  document.querySelector('[name="applicationsEnabled"]').value = String(settings.applicationsEnabled ?? true);
  document.querySelector('[name="maintenanceMode"]').value = String(settings.maintenanceMode ?? false);
  document.querySelector('#settingsForm').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await setDoc(doc(db, 'system', 'settings'), { portalName: data.get('portalName'), registrationEnabled: data.get('registrationEnabled') === 'true', applicationsEnabled: data.get('applicationsEnabled') === 'true', maintenanceMode: data.get('maintenanceMode') === 'true', acceptanceMessage: data.get('acceptanceMessage'), denialMessage: data.get('denialMessage'), updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername }, { merge: true });
    document.querySelector('#settingsMsg').innerHTML = '<p class="notice"><strong>Saved.</strong> Settings updated.</p>';
  };
}

async function audit(action, data = {}) {
  try { await addDoc(collection(db, 'audit_logs'), { action, performedBy: profile.uid, performedByUsername: profile.discordUsername, timestamp: serverTimestamp(), ...data }); } catch {}
}
