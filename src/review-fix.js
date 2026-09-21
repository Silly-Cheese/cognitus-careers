import './mobile-fix.css';
import './header-actions.js';
import { confirmAction } from './confirm-modal.js';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { TALENT_PERMISSIONS, hasTalentPermission, talentRoleLabel } from './access-control.js?v=access-model-1';

const root = document.querySelector('#app');
const activeStatuses = ['submitted', 'underReview', 'pendingFinalDecision', 'interviewRequested', 'interviewCompleted'];
const completedStatuses = ['accepted', 'denied', 'archived'];

let user = auth.currentUser;
let profile = null;
let ready = false;
let routeToken = 0;

const esc = (value = '') => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const routeParts = () => (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
const go = path => { location.hash = path; };
const staff = () => hasTalentPermission(profile, TALENT_PERMISSIONS.REVIEW_QUEUE);
const owner = () => hasTalentPermission(profile, TALENT_PERMISSIONS.ACCOUNTS_MANAGE);
const canFinalDecision = () => hasTalentPermission(profile, TALENT_PERMISSIONS.REVIEW_ALL);
const canAssignReviewer = () => hasTalentPermission(profile, TALENT_PERMISSIONS.REVIEW_ASSIGN);
const canManageInterviews = () => hasTalentPermission(profile, TALENT_PERMISSIONS.INTERVIEW_MANAGE);
const timeValue = value => value?.toMillis?.() || (typeof value?.seconds === 'number' ? value.seconds * 1000 : 0);
const hasRecommendation = app => !!String(app.reviewerRecommendation || '').trim();
const statusLabel = value => ({
  submitted: 'Submitted',
  underReview: 'Under Review',
  pendingFinalDecision: 'Awaiting Final Decision',
  interviewRequested: 'Interview Requested',
  interviewCompleted: 'Interview Completed',
  accepted: 'Accepted',
  denied: 'Denied',
  archived: 'Archived',
  draft: 'Draft'
}[value] || value || 'Unknown');
const recommendationLabel = value => ({
  approve: 'Approve',
  deny: 'Deny',
  interview: 'Interview',
  executiveReview: 'Executive Review'
}[value] || value || 'None');
const badge = value => `<span class="badge badge-${String(value || 'unknown').toLowerCase()}">${esc(statusLabel(value))}</span>`;

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  handleReviewRoute();
});

window.addEventListener('hashchange', handleReviewRoute);

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function navMarkup() {
  if (!profile) return '';
  return `<a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/notifications">Notifications</a><a href="#/profile">Profile</a>${staff() ? '<a href="#/review">Review</a>' : ''}${canFinalDecision() ? '<a href="#/executive">Executive</a>' : ''}${owner() ? '<a href="#/owner">Owner</a>' : ''}<span class="muted">${esc(profile.discordUsername || '')}</span>`;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav>${navMarkup()}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Talent Gateway · Review Center</footer>`;
}

async function handleReviewRoute() {
  const token = ++routeToken;
  const [path, id] = routeParts();
  if (path !== 'review') return;
  if (!ready) return shell('<section class="panel"><h1>Loading review center…</h1></section>');
  if (!user || !profile) return go('#/signin');
  if (!staff()) return shell('<section class="panel wide"><h1>Access denied</h1><p class="muted">Your account does not have review permissions.</p></section>');
  if (id) return reviewOne(id, token);
  return reviewQueue(token);
}

async function loadQueueApplications() {
  if (canFinalDecision()) {
    const snap = await getDocs(collection(db, 'applications'));
    return snap.docs.map(item => ({ id: item.id, ...item.data() }));
  }
  const snap = await getDocs(query(collection(db, 'applications'), where('assignedReviewerUid', '==', profile.uid)));
  return snap.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function reviewQueue(token) {
  shell('<section class="panel"><h1>Loading review queue…</h1><p class="muted">Fetching applications and assignments.</p></section>');
  try {
    let apps = await loadQueueApplications();
    if (token !== routeToken) return;
    apps = apps
      .filter(app => app.status !== 'draft' && app.deleted !== true && app.status !== 'deleted')
      .sort((a, b) => timeValue(b.updatedAt || b.submittedAt) - timeValue(a.updatedAt || a.submittedAt));

    const stats = {
      total: apps.length,
      active: apps.filter(app => activeStatuses.includes(app.status)).length,
      waiting: apps.filter(app => app.status === 'pendingFinalDecision').length,
      interview: apps.filter(app => app.status === 'interviewRequested').length,
      complete: apps.filter(app => completedStatuses.includes(app.status)).length
    };

    const rows = apps.map(app => {
      const search = [
        app.formTitle,
        app.department,
        app.applicantDiscordUsername,
        app.applicantDiscordId,
        app.assignedReviewerUsername,
        recommendationLabel(app.reviewerRecommendation),
        statusLabel(app.status)
      ].filter(Boolean).join(' ').toLowerCase();
      return `<tr data-review-row data-search="${esc(search)}" data-status="${esc(app.status || '')}" data-recommendation="${esc(app.reviewerRecommendation || '')}">
        <td><strong>${esc(app.formTitle || 'Untitled')}</strong><span class="tg-review-sub">${esc(app.department || 'General')}</span></td>
        <td><strong>${esc(app.applicantDiscordUsername || 'Unknown')}</strong><span class="tg-review-sub">${esc(app.applicantDiscordId || '')}</span></td>
        <td>${badge(app.status)}</td>
        <td>${esc(app.assignedReviewerUsername || 'Unassigned')}</td>
        <td>${esc(recommendationLabel(app.reviewerRecommendation))}</td>
        <td class="tg-review-actions"><button class="button small" data-open-review="${esc(app.id)}">Open</button>${owner() ? `<button class="button small quiet" data-delete-response="${esc(app.id)}" data-applicant="${esc(app.applicantDiscordUsername || 'this applicant')}">Delete</button>` : ''}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6"><div class="tg-review-empty">No submitted applications are available in your review queue.</div></td></tr>';

    const title = canFinalDecision() ? 'All Applications' : 'Assigned Reviews';
    const subtitle = canFinalDecision()
      ? 'Review the hiring pipeline, assign reviewers, request interviews, and move applications toward a decision.'
      : 'Only applications assigned to you appear here. Open an application to review it and submit your recommendation.';

    shell(`<section class="page-head tg-review-head"><div><p class="eyebrow">Reviewer Center</p><h1>${title}</h1><p class="muted">${subtitle}</p></div></section>
      <section class="tg-review-stats" aria-label="Review queue summary">
        <div><span>Total</span><strong>${stats.total}</strong></div>
        <div><span>Active</span><strong>${stats.active}</strong></div>
        <div><span>Awaiting Decision</span><strong>${stats.waiting}</strong></div>
        <div><span>Interviews</span><strong>${stats.interview}</strong></div>
        <div><span>Completed</span><strong>${stats.complete}</strong></div>
      </section>
      <section class="panel tg-review-panel">
        <div class="tg-review-toolbar">
          <label class="tg-review-search"><span>Search</span><input id="reviewSearch" type="search" placeholder="Applicant, role, department, reviewer…"></label>
          <label><span>Status</span><select id="reviewStatusFilter"><option value="">All statuses</option><option value="submitted">Submitted</option><option value="underReview">Under Review</option><option value="pendingFinalDecision">Awaiting Final Decision</option><option value="interviewRequested">Interview Requested</option><option value="interviewCompleted">Interview Completed</option><option value="accepted">Accepted</option><option value="denied">Denied</option><option value="archived">Archived</option></select></label>
          <label><span>Recommendation</span><select id="reviewRecommendationFilter"><option value="">All recommendations</option><option value="none">None</option><option value="approve">Approve</option><option value="deny">Deny</option><option value="interview">Interview</option><option value="executiveReview">Executive Review</option></select></label>
          <div class="tg-review-count" id="reviewVisibleCount"></div>
        </div>
        <div id="reviewQueueMsg"></div>
        <div class="tg-table-wrap"><table class="tg-review-table"><thead><tr><th>Application</th><th>Applicant</th><th>Status</th><th>Assigned Reviewer</th><th>Recommendation</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`);

    document.querySelectorAll('[data-open-review]').forEach(button => {
      button.onclick = () => go(`#/review/${button.dataset.openReview}`);
    });
    document.querySelectorAll('[data-delete-response]').forEach(button => {
      button.onclick = () => deleteApplicationResponse(button.dataset.deleteResponse, button.dataset.applicant, '#reviewQueueMsg');
    });
    ['reviewSearch', 'reviewStatusFilter', 'reviewRecommendationFilter'].forEach(id => {
      document.querySelector(`#${id}`)?.addEventListener('input', filterQueue, { passive: true });
    });
    filterQueue();
  } catch (error) {
    if (token !== routeToken) return;
    shell(`<section class="panel wide"><h1>Could not load review queue</h1><p class="error">${esc(error.message)}</p><p class="muted">No composite Firestore index is required by this Review Center.</p></section>`);
  }
}

function filterQueue() {
  const search = document.querySelector('#reviewSearch')?.value.toLowerCase().trim() || '';
  const status = document.querySelector('#reviewStatusFilter')?.value || '';
  const recommendation = document.querySelector('#reviewRecommendationFilter')?.value || '';
  const rows = [...document.querySelectorAll('[data-review-row]')];
  let visible = 0;
  rows.forEach(row => {
    const rec = row.dataset.recommendation || '';
    const match = (!search || (row.dataset.search || '').includes(search))
      && (!status || row.dataset.status === status)
      && (!recommendation || (recommendation === 'none' ? !rec : rec === recommendation));
    row.hidden = !match;
    if (match) visible += 1;
  });
  const count = document.querySelector('#reviewVisibleCount');
  if (count) count.textContent = `${visible} shown`;
}

function recommendationOptions(selected = '') {
  return ['', 'approve', 'deny', 'interview', 'executiveReview'].map(value => {
    const label = value ? recommendationLabel(value) : 'None';
    return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function statusOptions(selected = '') {
  return ['submitted', 'underReview', 'pendingFinalDecision', 'interviewRequested', 'interviewCompleted', 'accepted', 'denied', 'archived']
    .map(value => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(statusLabel(value))}</option>`)
    .join('');
}

async function reviewOne(appId, token) {
  shell('<section class="panel"><h1>Opening application…</h1><p class="muted">Loading applicant, responses, notes, and review tools.</p></section>');
  try {
    const appSnap = await getDoc(doc(db, 'applications', appId));
    if (token !== routeToken) return;
    if (!appSnap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
    let app = { id: appSnap.id, ...appSnap.data() };

    if (!canFinalDecision() && app.assignedReviewerUid !== profile.uid) {
      return shell('<section class="panel wide"><p class="eyebrow">Reviewer Center</p><h1>Not assigned to you</h1><p class="muted">This application is not currently assigned to your reviewer account.</p><a class="button secondary" href="#/review">Back to Review Queue</a></section>');
    }

    app = await autoMarkUnderReview(appId, app);
    const [applicantProfile, notes, form, reviewers] = await Promise.all([
      app.applicantUid ? getProfile(app.applicantUid).catch(() => null) : Promise.resolve(null),
      loadReviewNotes(appId),
      loadForm(app.formId),
      canFinalDecision() ? loadReviewers() : Promise.resolve([])
    ]);
    if (token !== routeToken) return;

    const questionMap = new Map((form?.questions || []).map((question, index) => [question.id || `q${index + 1}`, question.question || `Question ${index + 1}`]));
    const responses = Object.entries(app.answers || {}).map(([key, value], index) => `<article class="tg-response"><span>Question ${index + 1}</span><strong>${esc(questionMap.get(key) || key)}</strong><p>${esc(value || 'No response')}</p></article>`).join('') || '<p class="muted">No application responses were recorded.</p>';

    shell(`<section class="panel wide tg-review-detail">
      <div class="tg-detail-top"><a class="tg-back-link" href="#/review">← Review Queue</a><div class="tg-detail-heading"><div><p class="eyebrow">Reviewer Workspace</p><h1>${esc(app.formTitle || 'Application')}</h1><p class="muted">${esc(app.department || 'General')} · ${esc(app.applicantDiscordUsername || 'Unknown applicant')}</p></div>${badge(app.status)}</div></div>
      ${applicantInfoCard(app, applicantProfile)}
      ${conflictDisclosureCard(app)}
      <section class="tg-detail-section"><div class="tg-section-title"><div><p class="eyebrow">Application</p><h2>Responses</h2></div><span>${Object.keys(app.answers || {}).length} answer${Object.keys(app.answers || {}).length === 1 ? '' : 's'}</span></div><div class="tg-response-list">${responses}</div></section>
      ${reviewTools(app, reviewers)}
      ${reviewerActionForm(app)}
      <section class="tg-detail-section"><div class="tg-section-title"><div><p class="eyebrow">Internal</p><h2>Review Notes</h2></div><span>${notes.length}</span></div><div class="tg-note-list">${notes.map(note => `<article class="note"><p>${esc(note.note || '')}</p><span>${esc(note.createdByUsername || 'Reviewer')} · ${esc(dateText(note.createdAt))}</span></article>`).join('') || '<p class="muted">No internal notes yet.</p>'}</div></section>
      ${ownerDangerZone(app)}
      <div id="reviewMsg"></div>
    </section>`);

    wireReviewTools(app, reviewers);
    wireReviewForm(app);
    document.querySelector('#deleteThisResponse')?.addEventListener('click', () => deleteApplicationResponse(appId, app.applicantDiscordUsername || 'this applicant', '#reviewMsg'));
  } catch (error) {
    if (token !== routeToken) return;
    shell(`<section class="panel wide"><h1>Could not open application</h1><p class="error">${esc(error.message)}</p><a class="button secondary" href="#/review">Back to Review Queue</a></section>`);
  }
}

function applicantInfoCard(app, applicantProfile) {
  return `<section class="tg-applicant-card"><div class="tg-section-title"><div><p class="eyebrow">Applicant</p><h2>Applicant Information</h2></div></div><div class="tg-info-grid">
    <div><span>Discord Username</span><strong>${esc(app.applicantDiscordUsername || applicantProfile?.discordUsername || 'Not provided')}</strong></div>
    <div><span>Discord ID</span><strong>${esc(app.applicantDiscordId || applicantProfile?.discordId || 'Not provided')}</strong></div>
    <div><span>Roblox Username</span><strong>${esc(app.applicantRobloxUsername || applicantProfile?.robloxUsername || 'Not provided')}</strong></div>
    <div><span>Assigned Reviewer</span><strong>${esc(app.assignedReviewerUsername || 'Unassigned')}</strong></div>
    <div><span>Application Status</span><strong>${esc(statusLabel(app.status))}</strong></div>
    <div><span>Recommendation</span><strong>${esc(recommendationLabel(app.reviewerRecommendation))}</strong></div>
  </div></section>`;
}

function conflictDisclosureCard(app) {
  const disclosure = String(app.conflictDisclosure || '').trim();
  return `<section class="tg-detail-section"><div class="tg-section-title"><div><p class="eyebrow">Disclosure</p><h2>Conflict of Interest</h2></div></div><div class="tg-disclosure ${disclosure ? '' : 'is-empty'}">${disclosure ? esc(disclosure) : 'No conflict of interest was disclosed.'}</div></section>`;
}

function reviewTools(app, reviewers) {
  const assignment = canAssignReviewer() ? `<label><span>Assign Reviewer</span><select id="assignReviewer"><option value="">Unassigned</option>${reviewers.map(reviewer => `<option value="${esc(reviewer.id)}" ${reviewer.id === app.assignedReviewerUid ? 'selected' : ''}>${esc(reviewer.discordUsername || reviewer.id)} — ${esc(roleLabel(reviewer.role))}</option>`).join('')}</select></label>` : '';
  return `<section class="tg-detail-section tg-review-tools" id="reviewSuiteTools"><div class="tg-section-title"><div><p class="eyebrow">Workflow</p><h2>Review Tools</h2></div><span>Score: <strong id="rubricTotal">${rubricTotal(app)}</strong>/20</span></div>
    <div class="tg-tool-grid">
      ${assignment}
      <label><span>Interview Date / Time</span><input id="interviewTime" value="${esc(app.interviewTime || '')}" placeholder="Saturday 3:00 PM CST"></label>
      <label><span>Interview Method</span><input id="interviewMethod" value="${esc(app.interviewMethod || '')}" placeholder="Discord VC / Chat / Roblox"></label>
      <label><span>Interviewer</span><input id="interviewerName" value="${esc(app.interviewerName || profile.discordUsername || '')}" placeholder="Interviewer name"></label>
      <label class="full"><span>Interview Instructions</span><textarea id="interviewInstructions" rows="3" placeholder="Add details the applicant should receive…">${esc(app.interviewInstructions || '')}</textarea></label>
    </div>
    <div class="tg-rubric"><div><h3>Rubric Score</h3><p>Use a 1–5 score for each category.</p></div><div class="tg-rubric-grid">
      ${rubricInput('Professionalism', 'scoreProfessionalism', app.scoreProfessionalism)}
      ${rubricInput('Experience', 'scoreExperience', app.scoreExperience)}
      ${rubricInput('Communication', 'scoreCommunication', app.scoreCommunication)}
      ${rubricInput('Fit for Role', 'scoreFit', app.scoreFit)}
    </div></div>
    <div class="actions tg-tool-actions">${canFinalDecision() ? '<button class="button secondary" type="button" id="saveAssignment">Save Assignment</button>' : ''}<button class="button secondary" type="button" id="requestInterview">Request Interview</button><button class="button" type="button" id="saveRubric">Save Rubric</button></div>
    <div id="suiteReviewMsg"></div>
  </section>`;
}

function rubricInput(label, id, value) {
  return `<label><span>${esc(label)}</span><input type="number" min="1" max="5" id="${id}" value="${esc(value || '')}" inputmode="numeric"></label>`;
}

function rubricTotal(app) {
  return ['scoreProfessionalism', 'scoreExperience', 'scoreCommunication', 'scoreFit']
    .reduce((sum, key) => sum + (Number(app[key]) || 0), 0);
}

function roleLabel(value) {
  return talentRoleLabel(value);
}

function reviewerActionForm(app) {
  if (owner()) {
    return `<section class="tg-detail-section tg-decision-card"><div class="tg-section-title"><div><p class="eyebrow">Decision</p><h2>Owner Review Action</h2></div></div><form id="reviewForm" class="form split">
      <label><span>Status</span><select name="status">${statusOptions(app.status || 'submitted')}</select></label>
      <label><span>Recommendation</span><select name="recommendation">${recommendationOptions(app.reviewerRecommendation || '')}</select></label>
      <label class="full"><span>Decision Message Template</span><select id="decisionTemplate"><option value="">Choose a template</option><option value="accepted">Accepted — Welcome message</option><option value="denied">Denied — Basic message</option><option value="reapplyLater">Denied — Reapply later</option><option value="interviewRequested">Interview requested</option></select></label>
      <label class="full"><span>Private Note</span><textarea name="note" rows="4" placeholder="Internal note for reviewers only"></textarea></label>
      <label class="full"><span>Public Applicant Message</span><textarea name="publicMessage" rows="4" placeholder="Message visible to the applicant">${esc(app.publicMessage || '')}</textarea></label>
      <button class="button" type="submit">Save Owner Review</button>
    </form></section>`;
  }

  if (canFinalDecision()) {
    return `<section class="tg-detail-section tg-decision-card"><div class="tg-section-title"><div><p class="eyebrow">Recommendation</p><h2>Executive Review Action</h2></div></div><form id="reviewForm" class="form">
      <div class="notice"><strong>Status is automatic.</strong><br>A recommendation moves the application to Awaiting Final Decision. Owners make the final status change.</div>
      <label><span>Recommendation</span><select name="recommendation">${recommendationOptions(app.reviewerRecommendation || '')}</select></label>
      <label><span>Private Note</span><textarea name="note" rows="4"></textarea></label>
      <label><span>Public Applicant Message</span><textarea name="publicMessage" rows="4">${esc(app.publicMessage || '')}</textarea></label>
      <button class="button" type="submit">Save Review</button>
    </form></section>`;
  }

  if (hasRecommendation(app)) {
    return `<section class="tg-detail-section tg-decision-card"><div class="tg-section-title"><div><p class="eyebrow">Recommendation</p><h2>Reviewer Action</h2></div></div><form id="reviewForm" class="form"><div class="notice"><strong>Recommendation submitted:</strong> ${esc(recommendationLabel(app.reviewerRecommendation))}<br>Only an executive or owner can change an existing recommendation.</div><label><span>Private Note</span><textarea name="note" rows="4"></textarea></label><button class="button" type="submit">Save Note</button></form></section>`;
  }

  return `<section class="tg-detail-section tg-decision-card"><div class="tg-section-title"><div><p class="eyebrow">Recommendation</p><h2>Reviewer Action</h2></div></div><form id="reviewForm" class="form"><div class="notice"><strong>Status is automatic.</strong><br>Submitting a recommendation moves this application to Awaiting Final Decision.</div><label><span>Recommendation</span><select name="recommendation" required>${recommendationOptions('')}</select></label><label><span>Private Note</span><textarea name="note" rows="4"></textarea></label><button class="button" type="submit">Submit Recommendation</button></form></section>`;
}

function ownerDangerZone(app) {
  if (!owner()) return '';
  return `<section class="tg-detail-section tg-danger-zone"><div><p class="eyebrow">Owner only</p><h2>Danger Zone</h2><p class="muted">Permanently delete this application response and its related internal review notes.</p></div><button class="button quiet" id="deleteThisResponse" type="button">Delete Application Response</button></section>`;
}

function wireReviewTools(app, reviewers) {
  const scoreInputs = ['scoreProfessionalism', 'scoreExperience', 'scoreCommunication', 'scoreFit'];
  scoreInputs.forEach(id => document.querySelector(`#${id}`)?.addEventListener('input', updateRubricTotal, { passive: true }));

  document.querySelector('#saveAssignment')?.addEventListener('click', async () => {
    const msg = document.querySelector('#suiteReviewMsg');
    const uid = document.querySelector('#assignReviewer')?.value || '';
    const reviewer = reviewers.find(item => item.id === uid);
    setBusy(msg, 'Saving assignment…');
    try {
      await updateDoc(doc(db, 'applications', app.id), {
        assignedReviewerUid: uid,
        assignedReviewerUsername: reviewer?.discordUsername || '',
        assignedAt: serverTimestamp(),
        assignedBy: profile.uid,
        assignedByUsername: profile.discordUsername,
        updatedAt: serverTimestamp()
      });
      await Promise.allSettled([
        audit('APPLICATION_ASSIGNED', { applicationId: app.id, targetUid: uid, details: reviewer?.discordUsername || 'Unassigned' }),
        uid ? notify(uid, 'Application Assigned', `You were assigned to review ${app.formTitle || 'an application'}.`, 'assignment') : Promise.resolve()
      ]);
      success(msg, 'Assignment updated.');
    } catch (error) {
      fail(msg, error);
    }
  });

  document.querySelector('#requestInterview')?.addEventListener('click', async () => {
    const msg = document.querySelector('#suiteReviewMsg');
    const interviewTime = document.querySelector('#interviewTime')?.value.trim() || '';
    const interviewMethod = document.querySelector('#interviewMethod')?.value.trim() || '';
    const interviewerName = document.querySelector('#interviewerName')?.value.trim() || '';
    const interviewInstructions = document.querySelector('#interviewInstructions')?.value.trim() || '';
    if (!interviewTime || !interviewMethod) {
      if (msg) msg.innerHTML = '<p class="error">Add an interview date/time and method before requesting an interview.</p>';
      return;
    }
    setBusy(msg, 'Requesting interview…');
    try {
      await updateDoc(doc(db, 'applications', app.id), {
        status: 'interviewRequested',
        interviewTime,
        interviewMethod,
        interviewerName,
        interviewInstructions,
        interviewRequestedAt: serverTimestamp(),
        interviewRequestedBy: profile.uid,
        interviewRequestedByUsername: profile.discordUsername,
        updatedAt: serverTimestamp()
      });
      await Promise.allSettled([
        audit('INTERVIEW_REQUESTED', { applicationId: app.id, details: `${interviewTime} · ${interviewMethod}` }),
        notify(app.applicantUid, 'Interview Requested', `An interview has been requested for ${app.formTitle || 'your application'}. Open your application status for details.`, 'interview')
      ]);
      success(msg, 'Interview requested.');
      setTimeout(() => handleReviewRoute(), 500);
    } catch (error) {
      fail(msg, error);
    }
  });

  document.querySelector('#saveRubric')?.addEventListener('click', async () => {
    const msg = document.querySelector('#suiteReviewMsg');
    const payload = {};
    for (const id of scoreInputs) {
      const raw = document.querySelector(`#${id}`)?.value || '';
      if (raw) {
        const score = Number(raw);
        if (score < 1 || score > 5) {
          if (msg) msg.innerHTML = '<p class="error">Rubric scores must be between 1 and 5.</p>';
          return;
        }
        payload[id] = score;
      } else payload[id] = null;
    }
    setBusy(msg, 'Saving rubric…');
    try {
      await updateDoc(doc(db, 'applications', app.id), { ...payload, rubricUpdatedAt: serverTimestamp(), rubricUpdatedBy: profile.uid, rubricUpdatedByUsername: profile.discordUsername, updatedAt: serverTimestamp() });
      await audit('RUBRIC_UPDATED', { applicationId: app.id, details: `Score ${Object.values(payload).reduce((sum, value) => sum + (Number(value) || 0), 0)}/20` });
      success(msg, 'Rubric saved.');
    } catch (error) {
      fail(msg, error);
    }
  });

  const template = document.querySelector('#decisionTemplate');
  if (template) {
    const messages = {
      accepted: 'Congratulations. Your application has been accepted by Cognitus Solutions leadership. Please watch for follow-up instructions from the appropriate team.',
      denied: 'Thank you for applying. After review, Cognitus Solutions leadership has decided not to move forward with this application at this time.',
      reapplyLater: 'Thank you for applying. We are not moving forward at this time, but you may reapply when another opportunity opens.',
      interviewRequested: 'Cognitus Solutions leadership would like to schedule an interview before making a final decision.'
    };
    template.onchange = () => {
      const area = document.querySelector('#reviewForm [name="publicMessage"]');
      if (area && messages[template.value]) area.value = messages[template.value];
    };
  }
}

function updateRubricTotal() {
  const total = ['scoreProfessionalism', 'scoreExperience', 'scoreCommunication', 'scoreFit']
    .reduce((sum, id) => sum + (Number(document.querySelector(`#${id}`)?.value) || 0), 0);
  const box = document.querySelector('#rubricTotal');
  if (box) box.textContent = String(total);
}

function wireReviewForm(app) {
  const formEl = document.querySelector('#reviewForm');
  if (!formEl) return;
  formEl.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(formEl);
    const msg = document.querySelector('#reviewMsg');
    const updates = {
      reviewedBy: profile.uid,
      reviewedByUsername: profile.discordUsername,
      updatedAt: serverTimestamp()
    };

    if (owner()) {
      const status = String(data.get('status') || app.status || 'underReview');
      const recommendation = String(data.get('recommendation') || '');
      const publicMessage = String(data.get('publicMessage') || '');
      if (['accepted', 'denied'].includes(status)) {
        const confirmed = await confirmAction({
          title: status === 'accepted' ? 'Confirm Acceptance?' : 'Confirm Denial?',
          message: `This will mark ${app.applicantDiscordUsername || 'this applicant'} as ${status}.`,
          details: publicMessage || 'No public applicant message has been entered.',
          confirmText: status === 'accepted' ? 'Accept Applicant' : 'Deny Applicant',
          cancelText: 'Cancel',
          danger: status === 'denied'
        });
        if (!confirmed) return;
      }
      updates.status = status;
      updates.reviewerRecommendation = recommendation;
      updates.publicMessage = publicMessage;
      if (['accepted', 'denied'].includes(status)) {
        updates.decision = status;
        updates.finalizedAt = serverTimestamp();
        updates.finalizedBy = profile.uid;
        updates.finalizedByUsername = profile.discordUsername;
      }
    } else if (canFinalDecision()) {
      const recommendation = String(data.get('recommendation') || '');
      updates.reviewerRecommendation = recommendation;
      updates.publicMessage = String(data.get('publicMessage') || '');
      if (recommendation) updates.status = 'pendingFinalDecision';
    } else if (!hasRecommendation(app)) {
      const recommendation = String(data.get('recommendation') || '');
      updates.reviewerRecommendation = recommendation;
      if (recommendation) updates.status = 'pendingFinalDecision';
    }

    setBusy(msg, 'Saving review…');
    try {
      await updateDoc(doc(db, 'applications', app.id), updates);
      const note = String(data.get('note') || '').trim();
      if (note) {
        await addDoc(collection(db, 'review_notes'), {
          applicationId: app.id,
          note,
          createdBy: profile.uid,
          createdByUsername: profile.discordUsername,
          createdAt: serverTimestamp()
        });
      }
      const changedStatus = updates.status;
      const noticeTasks = [audit('REVIEW_UPDATED', { applicationId: app.id, details: changedStatus || updates.reviewerRecommendation || 'note' })];
      if (app.applicantUid && changedStatus && changedStatus !== app.status) {
        noticeTasks.push(notify(app.applicantUid, 'Application Updated', `${app.formTitle || 'Your application'} is now ${statusLabel(changedStatus)}.`, 'status'));
      }
      await Promise.allSettled(noticeTasks);
      success(msg, 'Review saved.');
      setTimeout(() => handleReviewRoute(), 450);
    } catch (error) {
      fail(msg, error);
    }
  };
}

async function loadReviewNotes(appId) {
  try {
    const snap = await getDocs(query(collection(db, 'review_notes'), where('applicationId', '==', appId)));
    return snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
  } catch (error) {
    console.warn('Review notes could not be loaded.', error);
    return [];
  }
}

async function loadForm(formId) {
  if (!formId) return null;
  try {
    const snap = await getDoc(doc(db, 'application_forms', formId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch {
    return null;
  }
}

async function loadReviewers() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => hasTalentPermission(item, TALENT_PERMISSIONS.REVIEW_QUEUE) && (item.accountStatus || 'active') === 'active')
      .sort((a, b) => String(a.discordUsername || '').localeCompare(String(b.discordUsername || '')));
  } catch (error) {
    console.warn('Reviewer directory could not be loaded.', error);
    return [];
  }
}

async function autoMarkUnderReview(appId, app) {
  if (app.status !== 'submitted') return app;
  try {
    await updateDoc(doc(db, 'applications', appId), {
      status: 'underReview',
      reviewedBy: profile.uid,
      reviewedByUsername: profile.discordUsername,
      updatedAt: serverTimestamp()
    });
    return { ...app, status: 'underReview' };
  } catch (error) {
    console.warn('Automatic Under Review update failed.', error);
    return app;
  }
}

async function deleteApplicationResponse(appId, applicantName = 'this applicant', messageSelector = '#reviewMsg') {
  if (!owner()) return;
  const confirmed = await confirmAction({
    title: 'Delete Application Response?',
    message: `Permanently delete the application response from ${applicantName}?`,
    details: 'Related internal review notes will also be removed when permissions allow. This cannot be undone.',
    confirmText: 'Delete Response',
    cancelText: 'Keep Response',
    danger: true
  });
  if (!confirmed) return;
  const msg = document.querySelector(messageSelector);
  setBusy(msg, 'Deleting application response…');
  try {
    try {
      const notesSnap = await getDocs(query(collection(db, 'review_notes'), where('applicationId', '==', appId)));
      await Promise.all(notesSnap.docs.map(note => deleteDoc(doc(db, 'review_notes', note.id))));
    } catch (error) {
      console.warn('Related notes could not all be deleted.', error);
    }
    await deleteDoc(doc(db, 'applications', appId));
    await audit('APPLICATION_RESPONSE_DELETED', { applicationId: appId, details: applicantName });
    success(msg, 'Application response deleted.');
    setTimeout(() => go('#/review'), 450);
  } catch (error) {
    fail(msg, error);
  }
}

async function notify(recipientUid, title, message, type = 'system') {
  if (!recipientUid) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      recipientUid,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
      createdBy: profile?.uid || 'system',
      createdByUsername: profile?.discordUsername || 'System'
    });
  } catch (error) {
    console.warn('Notification write skipped.', error);
  }
}

async function audit(action, data = {}) {
  try {
    await setDoc(doc(collection(db, 'audit_logs')), {
      action,
      performedBy: profile.uid,
      performedByUsername: profile.discordUsername,
      timestamp: serverTimestamp(),
      ...data
    });
  } catch (error) {
    console.warn('Audit log write skipped.', error);
  }
}

function dateText(value) {
  try {
    return value?.toDate ? value.toDate().toLocaleString() : 'Unknown time';
  } catch {
    return 'Unknown time';
  }
}

function setBusy(node, text) {
  if (node) node.innerHTML = `<p class="muted">${esc(text)}</p>`;
}
function success(node, text) {
  if (node) node.innerHTML = `<p class="notice"><strong>Saved.</strong> ${esc(text)}</p>`;
}
function fail(node, error) {
  if (node) node.innerHTML = `<p class="error">${esc(error?.message || error || 'Something went wrong.')}</p>`;
}
