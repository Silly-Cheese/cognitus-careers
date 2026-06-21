import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const executiveRoles = ['executive', 'owner'];
let user = auth.currentUser;
let profile = null;
let ready = false;

const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const go = path => { location.hash = path; };
const staff = () => profile && staffRoles.includes(profile.role);
const executive = () => profile && executiveRoles.includes(profile.role);
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(v || 'Unknown')}</span>`;
const timeValue = value => value?.toMillis ? value.toMillis() : 0;

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
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>${staff() ? '<a href="#/review">Review</a>' : ''}${executive() ? '<a href="#/executive">Executive</a>' : ''}${profile?.role === 'owner' ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · ReviewFix v1</footer>`;
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
    const rows = apps.map(app => `<tr><td>${esc(app.formTitle || 'Untitled')}</td><td>${esc(app.applicantDiscordUsername || '')}</td><td>${badge(app.status)}</td><td><button class="button small" data-open-review="${app.id}">Open</button></td></tr>`).join('') || '<tr><td colspan="4">No applications have been submitted yet.</td></tr>';
    shell(`<section class="page-head"><div><p class="eyebrow">Reviewer Center</p><h1>Review Queue</h1><p class="muted">Review submitted applications and add internal notes.</p></div></section><section class="panel"><table><thead><tr><th>Application</th><th>Applicant</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
    document.querySelectorAll('[data-open-review]').forEach(btn => btn.onclick = () => go(`#/review/${btn.dataset.openReview}`));
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load review queue</h1><p class="error">${esc(error.message)}</p><p class="muted">Signed in as ${esc(profile.discordUsername)} with role ${esc(profile.role)}.</p></section>`);
  }
}

async function reviewOne(appId) {
  shell('<section class="panel"><h1>Opening review...</h1><p class="muted">Loading application details.</p></section>');
  try {
    const appSnap = await getDoc(doc(db, 'applications', appId));
    if (!appSnap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
    const app = { id: appSnap.id, ...appSnap.data() };
    let notes = [];
    try {
      const noteSnap = await getDocs(query(collection(db, 'review_notes'), where('applicationId', '==', appId)));
      notes = noteSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    } catch (error) {
      console.warn('Notes failed to load.', error);
    }
    shell(`<section class="panel wide"><p class="eyebrow">Reviewer Workspace</p><div class="row"><h1>${esc(app.formTitle || 'Application')}</h1>${badge(app.status)}</div><p><strong>Applicant:</strong> ${esc(app.applicantDiscordUsername || '')} · ${esc(app.applicantDiscordId || '')}</p><h3>Responses</h3>${Object.entries(app.answers || {}).map(([key, value]) => `<div class="answer"><strong>${esc(key)}</strong><p>${esc(value)}</p></div>`).join('') || '<p class="muted">No responses found.</p>'}<h3>Reviewer Action</h3><form id="reviewForm" class="form split"><label>Status<select name="status"><option>submitted</option><option>underReview</option><option>interviewRequested</option><option>interviewCompleted</option><option>pendingFinalDecision</option><option>accepted</option><option>denied</option><option>archived</option></select></label><label>Recommendation<select name="recommendation"><option value="">None</option><option>approve</option><option>deny</option><option>interview</option><option>executiveReview</option></select></label><label class="full">Private Note<textarea name="note" rows="4"></textarea></label>${executive() ? `<label class="full">Public Applicant Message<textarea name="publicMessage" rows="3">${esc(app.publicMessage || '')}</textarea></label>` : ''}<button class="button">Save Review</button></form><h3>Internal Notes</h3>${notes.map(note => `<div class="note"><p>${esc(note.note || '')}</p><span>${esc(note.createdByUsername || '')}</span></div>`).join('') || '<p class="muted">No notes yet.</p>'}<div id="reviewMsg"></div></section>`);
    document.querySelector('[name="status"]').value = app.status || 'submitted';
    document.querySelector('#reviewForm').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const msg = document.querySelector('#reviewMsg');
      msg.innerHTML = '<p class="muted">Saving review...</p>';
      try {
        const updates = {
          status: form.get('status'),
          reviewerRecommendation: form.get('recommendation'),
          reviewedBy: profile.uid,
          reviewedByUsername: profile.discordUsername,
          updatedAt: serverTimestamp()
        };
        if (executive()) {
          updates.publicMessage = form.get('publicMessage') || '';
          if (['accepted', 'denied'].includes(updates.status)) updates.decision = updates.status;
        }
        await updateDoc(doc(db, 'applications', appId), updates);
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
