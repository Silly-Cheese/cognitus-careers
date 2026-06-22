import './applicant-status-timeline.js';
import './review-queue-tools.js';
import './review-final-tools.js';
import './executive-workflow-plus.js';
import './account-notes.js';
import './portal-suite-plus.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const executiveRoles = ['executive', 'owner'];
let user = auth.currentUser;
let profile = null;
let ready = false;

const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const canStaff = () => profile && staffRoles.includes(profile.role);
const canExecutive = () => profile && executiveRoles.includes(profile.role);
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(v || 'Unknown')}</span>`;
const go = path => { window.location.hash = path; };

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  setTimeout(handleApplicantApplications, 50);
});

window.addEventListener('hashchange', () => setTimeout(handleApplicantApplications, 50));

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>${canStaff() ? '<a href="#/review">Review</a>' : ''}${canExecutive() ? '<a href="#/executive">Executive</a>' : ''}${profile?.role === 'owner' ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span><button class="ghost" id="signOutBtn">Sign Out</button>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · ApplicantVisibility v4</footer>`;
  document.querySelector('#signOutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    go('#/');
  });
}

async function handleApplicantApplications() {
  const [path] = (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
  if (path !== 'applications') return;
  if (!ready || !user || !profile || profile.role !== 'applicant') return;
  await renderApplicantApplications();
}

async function renderApplicantApplications() {
  shell('<section class="panel"><h1>Loading applications...</h1><p class="muted">Checking open Cognitus applications.</p></section>');
  try {
    const forms = await getDocs(query(collection(db, 'application_forms'), orderBy('createdAt', 'desc')));
    const mine = await getDocs(query(collection(db, 'applications'), where('applicantUid', '==', profile.uid)));
    const existingByForm = new Map(mine.docs.map(d => [d.data().formId, { id: d.id, ...d.data() }]));

    const openForms = forms.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(form => form.status === 'open');

    const cards = openForms.map(form => {
      const existing = existingByForm.get(form.id);
      let action = `<button class="button" data-apply="${form.id}" ${!existing ? '' : 'disabled'}>Apply Now</button>`;
      if (existing?.status === 'draft') action = `<button class="button" data-apply="${form.id}">Continue Draft</button>`;
      if (existing && existing.status !== 'draft') action = `<button class="button secondary" data-status="${existing.id}">View Status</button>`;
      return `<article class="card"><div class="row"><h3>${esc(form.title)}</h3>${badge(form.status)}</div><p class="muted">${esc(form.department || 'General')} · ${(form.questions || []).length} question(s)</p><p>${esc(form.description || '')}</p>${existing ? `<p>Your status: ${badge(existing.status)}</p>` : ''}${action}</article>`;
    }).join('') || '<p class="muted">No applications are open yet.</p>';

    shell(`<section class="page-head"><h1>Applications</h1><p class="muted">Only currently open applications are shown here.</p></section><section class="grid cards">${cards}</section>`);
    document.querySelectorAll('[data-apply]').forEach(btn => btn.onclick = () => go(`#/apply/${btn.dataset.apply}`));
    document.querySelectorAll('[data-status]').forEach(btn => btn.onclick = () => go(`#/status/${btn.dataset.status}`));
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load applications</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}
