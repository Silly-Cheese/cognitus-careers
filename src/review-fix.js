import './mobile-fix.css';
import './header-actions.js';
import { confirmAction } from './confirm-modal.js';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const finalDecisionRoles = ['executive', 'owner'];
let user = auth.currentUser;
let profile = null;
let ready = false;

const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const go = path => { location.hash = path; };
const staff = () => profile && staffRoles.includes(profile.role);
const owner = () => profile?.role === 'owner';
const canFinalDecision = () => profile && finalDecisionRoles.includes(profile.role);
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(v || 'Unknown')}</span>`;
const timeValue = value => value?.toMillis ? value.toMillis() : 0;
const hasRecommendation = app => !!String(app.reviewerRecommendation || '').trim();

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  handleReviewRoute();
});
window.addEventListener('hashchange', () => setTimeout(handleReviewRoute, 0));

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>${staff() ? '<a href="#/review">Review</a>' : ''}${canFinalDecision() ? '<a href="#/executive">Executive</a>' : ''}${profile?.role === 'owner' ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · ReviewFix v7</footer>`;
}

function routeParts() {
  return (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
}

async function handleReviewRoute() {
  const [path, id] = routeParts();
  if (path !== 'review') return;
  if (!ready) return shell('<section class="panel"><h1>Loading review tools...</h1></section>');
  if (!user || !profile) return go('#/signin');
  if (!staff()) {
    return shell(`<section class="panel wide"><h1>Access denied</h1><p class="muted">Your current role is <strong>${esc(profile.role || 'unknown')}</strong>. Review access requires reviewer, seniorReviewer, hiringLead, executive, or owner.</p></section>`);
  }
  if (id) return reviewOne(id);
  return reviewQueue();
}

async function reviewQueue() {
  shell('<section class="panel"><h1>Loading review queue...</h1><p class="muted">Fetching applications.</p></section>');
  try {
    const snap = await getDocs(collection(db, 'applications'));
    const apps = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
    const rows = apps.map(app => `<tr><td>${esc(app.formTitle || 'Untitled')}</td><td>${esc(app.applicantDiscordUsername || '')}<br><span class="muted">${esc(app.applicantDiscordId || '')}</span></td><td>${badge(app.status)}</td><td>${esc(app.reviewerRecommendation || 'None')}</td><td><div class="actions"><button class="button small" data-open-review="${app.id}">Open</button>${owner() ? `<button class="button small quiet" data-delete-response="${app.id}" data-applicant="${esc(app.applicantDiscordUsername || 'this applicant')}">Delete Response</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5">No applications have been submitted yet.</td></tr>';
    shell(`<section class="page-head"><div><p class="eyebrow">Reviewer Center</p><h1>Review Queue</h1><p class="muted">Review submitted applications and add internal notes.</p></div></section><section class="panel"><div id="reviewQueueMsg"></div><table><thead><tr><th>Application</th><th>Applicant</th><th>Status</th><th>Recommendation</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
    document.querySelectorAll('[data-open-review]').forEach(btn => btn.onclick = () => go(`#/review/${btn.dataset.openReview}`));
    document.querySelectorAll('[data-delete-response]').forEach(btn => btn.onclick = () => deleteApplicationResponse(btn.dataset.deleteResponse, btn.dataset.applicant, '#reviewQueueMsg'));
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load review queue</h1><p class="error">${esc(error.message)}</p><p class="muted">Signed in as ${esc(profile.discordUsername)} with role ${esc(profile.role)}.</p></section>`);
  }
}

function recommendationOptions(selected = '') {
  return ['','approve','deny','interview','executiveReview'].map(value => {
    const label = value ? ({ approve: 'Approve', deny: 'Deny', interview: 'Interview', executiveReview: 'Executive Review' }[value] || value) : 'None';
    return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function reviewerActionForm(app) {
  if (canFinalDecision()) {
    return `<h3>Reviewer Action</h3><form id="reviewForm" class="form split"><label>Status<select name="status"><option>submitted</option><option>underReview</option><option>interviewRequested</option><option>interviewCompleted</option><option>pendingFinalDecision</option><option>accepted</option><option>denied</option><option>archived</option></select></label><label>Recommendation<select name="recommendation">${recommendationOptions(app.reviewerRecommendation || '')}</select></label><label class="full">Private Note<textarea name="note" rows="4"></textarea></label><label class="full">Public Applicant Message<textarea name="publicMessage" rows="3">${esc(app.publicMessage || '')}</textarea></label><button class="button">Save Review</button></form>`;
  }

  if (hasRecommendation(app)) {
    return `<h3>Reviewer Action</h3><form id="reviewForm" class="form"><div class="notice"><strong>Recommendation locked.</strong><br>Recommendation: ${esc(app.reviewerRecommendation)}<br>Only executives or owners can change an existing recommendation or make a final decision.</div><label>Private Note<textarea name="note" rows="4"></textarea></label><button class="button">Save Note</button></form>`;
  }

  return `<h3>Reviewer Action</h3><form id="reviewForm" class="form"><label>Recommendation<select name="recommendation" required>${recommendationOptions('')}</select></label><label>Private Note<textarea name="note" rows="4"></textarea></label><button class="button">Submit Recommendation</button></form>`;
}

function applicantInfoCard(app, applicantProfile) {
  return `<section class="notice"><h3>Applicant Information</h3><div class="grid two"><div><strong>Discord Username</strong><p>${esc(app.applicantDiscordUsername || applicantProfile?.discordUsername || 'Not provided')}</p></div><div><strong>Discord ID</strong><p>${esc(app.applicantDiscordId || applicantProfile?.discordId || 'Not provided')}</p></div><div><strong>Roblox Username</strong><p>${esc(app.applicantRobloxUsername || applicantProfile?.robloxUsername || 'Not provided')}</p></div><div><strong>Applicant UID</strong><p>${esc(app.applicantUid || 'Unknown')}</p></div><div><strong>Application</strong><p>${esc(app.formTitle || 'Application')}</p></div><div><strong>Department</strong><p>${esc(app.department || 'General')}</p></div><div><strong>Application Status</strong><p>${badge(app.status)}</p></div><div><strong>Recommendation</strong><p>${esc(app.reviewerRecommendation || 'None')}</p></div></div></section>`;
}

function conflictDisclosureCard(app) {
  const disclosure = String(app.conflictDisclosure || '').trim();
  return `<h3>Conflict of Interest Disclosure</h3><div class="answer"><strong>Applicant Disclosure</strong><p>${disclosure ? esc(disclosure) : 'No conflict disclosure provided.'}</p></div>`;
}

function ownerDangerZone(app) {
  if (!owner()) return '';
  return `<section class="notice"><h3>Owner Danger Zone</h3><p class="muted">Delete this submitted application response. This removes the application record and attempts to remove related internal review notes.</p><button class="button quiet" id="deleteThisResponse">Delete Application Response</button></section>`;
}

async function deleteApplicationResponse(appId, applicantName = 'this applicant', messageSelector = '#reviewMsg') {
  if (!owner()) return;
  const confirmed = await confirmAction({
    title: 'Delete Application Response?',
    message: `This will permanently remove the response from ${applicantName}.`,
    details: 'Related internal review notes will also be removed when possible. This action cannot be undone.',
    confirmText: 'Delete Response',
    cancelText: 'Keep Response',
    danger: true
  });
  if (!confirmed) return;
  const msg = document.querySelector(messageSelector);
  if (msg) msg.innerHTML = '<p class="muted">Deleting application response...</p>';
  try {
    try {
      const notesSnap = await getDocs(query(collection(db, 'review_notes'), where('applicationId', '==', appId)));
      await Promise.all(notesSnap.docs.map(note => deleteDoc(doc(db, 'review_notes', note.id))));
    } catch (error) {
      console.warn('Could not delete related review notes. Continuing with response deletion.', error);
    }
    await deleteDoc(doc(db, 'applications', appId));
    if (msg) msg.innerHTML = '<p class="notice"><strong>Deleted.</strong> Application response removed.</p>';
    setTimeout(() => go('#/review'), 500);
  } catch (error) {
    if (msg) msg.innerHTML = `<p class="error">Could not delete response: ${esc(error.message)}</p>`;
  }
}

async function reviewOne(appId) {
  shell('<section class="panel"><h1>Opening review...</h1><p class="muted">Loading application details.</p></section>');
  try {
    const appSnap = await getDoc(doc(db, 'applications', appId));
    if (!appSnap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
    const app = { id: appSnap.id, ...appSnap.data() };
    let applicantProfile = null;
    if (app.applicantUid) {
      try { applicantProfile = await getProfile(app.applicantUid); } catch (error) { console.warn('Applicant profile failed to load.', error); }
    }
    let notes = [];
    try {
      const noteSnap = await getDocs(query(collection(db, 'review_notes'), where('applicationId', '==', appId)));
      notes = noteSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    } catch (error) {
      console.warn('Notes failed to load.', error);
    }
    shell(`<section class="panel wide"><p class="eyebrow">Reviewer Workspace</p><div class="row"><h1>${esc(app.formTitle || 'Application')}</h1>${badge(app.status)}</div>${applicantInfoCard(app, applicantProfile)}${conflictDisclosureCard(app)}<h3>Application Responses</h3>${Object.entries(app.answers || {}).map(([key, value]) => `<div class="answer"><strong>${esc(key)}</strong><p>${esc(value)}</p></div>`).join('') || '<p class="muted">No responses found.</p>'}${reviewerActionForm(app)}<h3>Internal Notes</h3>${notes.map(note => `<div class="note"><p>${esc(note.note || '')}</p><span>${esc(note.createdByUsername || '')}</span></div>`).join('') || '<p class="muted">No notes yet.</p>'}${ownerDangerZone(app)}<div id="reviewMsg"></div></section>`);
    if (canFinalDecision()) document.querySelector('[name="status"]').value = app.status || 'submitted';
    document.querySelector('#deleteThisResponse')?.addEventListener('click', () => deleteApplicationResponse(appId, app.applicantDiscordUsername || 'this applicant', '#reviewMsg'));
    document.querySelector('#reviewForm').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const msg = document.querySelector('#reviewMsg');
      msg.innerHTML = '<p class="muted">Saving review...</p>';
      try {
        const updates = {
          reviewedBy: profile.uid,
          reviewedByUsername: profile.discordUsername,
          updatedAt: serverTimestamp()
        };

        if (canFinalDecision()) {
          updates.status = form.get('status');
          updates.reviewerRecommendation = form.get('recommendation');
          updates.publicMessage = form.get('publicMessage') || '';
          if (['accepted', 'denied'].includes(updates.status)) updates.decision = updates.status;
        } else if (!hasRecommendation(app)) {
          updates.reviewerRecommendation = form.get('recommendation');
        }

        const shouldUpdateApplication = canFinalDecision() || (!hasRecommendation(app) && updates.reviewerRecommendation);
        if (shouldUpdateApplication) await updateDoc(doc(db, 'applications', appId), updates);

        const note = String(form.get('note') || '').trim();
        if (note) {
          await addDoc(collection(db, 'review_notes'), {
            applicationId: appId,
            note,
            createdBy: profile.uid,
            createdByUsername: profile.discordUsername,
            createdAt: serverTimestamp()
          });
        }
        go('#/review');
      } catch (error) {
        msg.innerHTML = `<p class="error">Could not save review: ${esc(error.message)}</p>`;
      }
    };
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not open review</h1><p class="error">${esc(error.message)}</p><p class="muted">Application ID: ${esc(appId)}</p></section>`);
  }
}
