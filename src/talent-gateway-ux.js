import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const PENDING_APPLY_KEY = 'cognitus:pending-apply';
const DRAFT_PREFIX = 'cognitus:local-application:';
const PENDING_TTL = 60 * 60 * 1000;
const DRAFT_TTL = 14 * 24 * 60 * 60 * 1000;

let currentUser = auth.currentUser;
let scheduled = false;
let openingsPromise = null;
let lastApplyDraftKey = null;
let lastRoute = route();

const statusLabels = {
  draft: 'Draft',
  submitted: 'Submitted',
  underReview: 'Under review',
  pendingFinalDecision: 'Awaiting final decision',
  interviewRequested: 'Interview requested',
  interviewCompleted: 'Interview completed',
  accepted: 'Accepted',
  denied: 'Denied',
  archived: 'Archived'
};

const nextStepCopy = {
  draft: 'Finish the remaining questions and submit when you are ready.',
  submitted: 'Your application is in the queue. No action is needed from you right now.',
  underReview: 'A reviewer is actively evaluating your application. Watch this page for the next update.',
  pendingFinalDecision: 'The review is complete and your application is waiting on a final decision.',
  interviewRequested: 'Your next step is the interview. Review any interview details shown on this page.',
  interviewCompleted: 'Your interview is complete. The hiring team will post the next decision here.',
  accepted: 'Your application was accepted. Follow any instructions or messages attached to your decision.',
  denied: 'This application is complete. You can return to Applications to view other opportunities.',
  archived: 'This application has been archived and no longer needs action.'
};

if (root) {
  onAuthStateChanged(auth, user => {
    currentUser = user;
    scheduleEnhance();
  });

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeRoleModal();
  });
  root.addEventListener('click', handleDelegatedClick);
  scheduleEnhance();
}

function route() {
  return (location.hash || '#/').split('?')[0];
}

function esc(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance().catch(error => console.warn('Talent Gateway UX enhancement skipped:', error));
  });
}

async function enhance() {
  const main = root.querySelector('main');
  if (!main) return;
  const current = route();

  if (current === '#/' || current === '#') await enhanceHome(main);
  if (current === '#/dashboard') await enhanceDashboard(main);
  if (current === '#/applications') enhanceApplications(main);
  if (current.startsWith('#/apply/')) enhanceApplication(main, current.split('/')[2]);
  if (current.startsWith('#/status/')) await enhanceStatus(main, current.split('/')[2]);
  if (current === '#/signin' || current === '#/register') enhanceAuth(main, current);
}

async function enhanceHome(main) {
  const home = main.querySelector('.tg-home') || main.querySelector('.hero');
  if (!home || home.querySelector('[data-tg-live-openings]')) return;

  const section = document.createElement('section');
  section.className = 'tg-live-openings tg-animate';
  section.dataset.tgLiveOpenings = 'true';
  section.innerHTML = `
    <div class="tg-section-head">
      <div>
        <p class="eyebrow">Open opportunities</p>
        <h2>See the role before you create an account.</h2>
      </div>
      <p>Browse current Cognitus openings first. You will only be asked to sign in when you are ready to apply.</p>
    </div>
    <div class="tg-live-openings-state" aria-live="polite">Loading current opportunities…</div>
  `;

  const finalCta = home.querySelector('.tg-final-cta');
  if (finalCta) finalCta.insertAdjacentElement('beforebegin', section);
  else home.appendChild(section);

  const state = section.querySelector('.tg-live-openings-state');
  try {
    const openings = await loadOpenings();
    if (!openings.length) {
      state.innerHTML = `<div class="tg-empty-state"><strong>No openings are accepting applications right now.</strong><span>Check back later. New Cognitus opportunities will appear here when they open.</span></div>`;
      return;
    }

    state.innerHTML = `
      <div class="tg-live-openings-grid">
        ${openings.map(openingCard).join('')}
      </div>
      <div class="tg-openings-foot"><span>${openings.length} ${openings.length === 1 ? 'opening' : 'openings'} accepting applications</span><span>Account required only when applying</span></div>
    `;
  } catch (error) {
    state.innerHTML = `<div class="tg-empty-state"><strong>Opportunities could not be loaded.</strong><span>You can still create an account and try again from the Applications area.</span></div>`;
  }
}

function loadOpenings() {
  if (!openingsPromise) {
    openingsPromise = getDocs(collection(db, 'application_forms')).then(snapshot => {
      return snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => item.status === 'open')
        .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
    }).catch(error => {
      openingsPromise = null;
      throw error;
    });
  }
  return openingsPromise;
}

function openingCard(opening) {
  const requirements = Array.isArray(opening.requirements) ? opening.requirements : [];
  const questions = Array.isArray(opening.questions) ? opening.questions : [];
  return `
    <article class="tg-opening-card">
      <div class="tg-opening-top">
        <span class="tg-opening-department">${esc(opening.department || 'General')}</span>
        <span class="tg-opening-status"><span></span>Open</span>
      </div>
      <h3>${esc(opening.title || 'Cognitus Opportunity')}</h3>
      <p>${esc(opening.description || 'View the opportunity for full details and application requirements.')}</p>
      <div class="tg-opening-meta">
        <span>${questions.length} ${questions.length === 1 ? 'question' : 'questions'}</span>
        <span>${requirements.length} ${requirements.length === 1 ? 'requirement' : 'requirements'}</span>
      </div>
      <div class="tg-opening-actions">
        <button type="button" class="button secondary" data-tg-view-role="${esc(opening.id)}">View details</button>
        <button type="button" class="button" data-tg-apply-role="${esc(opening.id)}">Apply</button>
      </div>
    </article>
  `;
}

async function openRoleModal(formId) {
  closeRoleModal();
  const openings = await loadOpenings();
  const opening = openings.find(item => item.id === formId);
  if (!opening) return;

  const requirements = Array.isArray(opening.requirements) ? opening.requirements : [];
  const questions = Array.isArray(opening.questions) ? opening.questions : [];
  const modal = document.createElement('div');
  modal.className = 'tg-role-modal-backdrop';
  modal.dataset.tgRoleModal = 'true';
  modal.innerHTML = `
    <section class="tg-role-modal" role="dialog" aria-modal="true" aria-labelledby="tgRoleTitle">
      <div class="tg-role-modal-head">
        <div><p class="eyebrow">${esc(opening.department || 'Cognitus')}</p><h2 id="tgRoleTitle">${esc(opening.title || 'Opportunity')}</h2></div>
        <button type="button" class="tg-modal-close" data-tg-close-role aria-label="Close role details">×</button>
      </div>
      <p class="tg-role-description">${esc(opening.description || 'No additional description has been provided.')}</p>
      <div class="tg-role-facts">
        <div><span>Application</span><strong>${questions.length} ${questions.length === 1 ? 'question' : 'questions'}</strong></div>
        <div><span>Requirements</span><strong>${requirements.length || 'None listed'}</strong></div>
        <div><span>Status</span><strong>Accepting applications</strong></div>
      </div>
      ${requirements.length ? `<div class="tg-role-requirements"><h3>Requirements</h3><ul>${requirements.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
      <div class="tg-role-modal-actions">
        <button type="button" class="button secondary" data-tg-close-role>Keep browsing</button>
        <button type="button" class="button" data-tg-apply-role="${esc(opening.id)}">Start application</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeRoleModal();
  });
  modal.querySelector('.tg-modal-close')?.focus();
}

function closeRoleModal() {
  document.querySelector('[data-tg-role-modal]')?.remove();
}

function startApplication(formId) {
  closeRoleModal();
  const target = `#/apply/${formId}`;
  sessionStorage.setItem(PENDING_APPLY_KEY, JSON.stringify({ route: target, createdAt: Date.now() }));
  location.hash = target;
}

async function enhanceDashboard(main) {
  if (resumePendingApplication()) return;
  if (!currentUser || main.querySelector('[data-tg-application-overview]')) return;

  const anchor = main.querySelector('.tg-dashboard-banner') || main.querySelector('.page-head');
  if (!anchor) return;

  const section = document.createElement('section');
  section.className = 'tg-application-overview tg-animate';
  section.dataset.tgApplicationOverview = 'true';
  section.innerHTML = `<div class="tg-overview-loading">Loading your application activity…</div>`;
  anchor.insertAdjacentElement('afterend', section);

  try {
    const snapshot = await getDocs(query(collection(db, 'applications'), where('applicantUid', '==', currentUser.uid)));
    const apps = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt));
    const drafts = apps.filter(item => item.status === 'draft');
    const inProgress = apps.filter(item => ['submitted', 'underReview', 'pendingFinalDecision', 'interviewRequested', 'interviewCompleted'].includes(item.status));
    const decisions = apps.filter(item => ['accepted', 'denied'].includes(item.status));
    const next = drafts[0] || inProgress[0] || decisions[0] || null;

    section.innerHTML = `
      <div class="tg-overview-head">
        <div><p class="eyebrow">Application activity</p><h2>Your hiring snapshot</h2></div>
        <a href="#/applications">View all applications →</a>
      </div>
      <div class="tg-overview-grid">
        <div class="tg-overview-stat"><span>Drafts</span><strong>${drafts.length}</strong><small>${drafts.length ? 'Waiting on you' : 'Nothing unfinished'}</small></div>
        <div class="tg-overview-stat"><span>In progress</span><strong>${inProgress.length}</strong><small>${inProgress.length ? 'With the hiring team' : 'No active reviews'}</small></div>
        <div class="tg-overview-stat"><span>Decisions</span><strong>${decisions.length}</strong><small>${decisions.length ? 'Completed applications' : 'No decisions yet'}</small></div>
        <div class="tg-overview-next">
          ${next ? nextApplicationCard(next) : `<span class="tg-overview-label">Next step</span><strong>Explore an opportunity</strong><p>You have no applications yet. Browse current openings when you are ready.</p><a class="button" href="#/applications">Browse applications</a>`}
        </div>
      </div>
    `;
  } catch (error) {
    section.innerHTML = `<div class="tg-overview-error"><strong>Your application summary could not be loaded.</strong><span>The rest of the gateway is still available.</span></div>`;
  }
}

function nextApplicationCard(app) {
  const isDraft = app.status === 'draft';
  const href = isDraft ? `#/apply/${esc(app.formId)}` : `#/status/${esc(app.id)}`;
  const action = isDraft ? 'Continue application' : 'View latest status';
  return `
    <span class="tg-overview-label">${isDraft ? 'Continue where you left off' : 'Most recent application'}</span>
    <strong>${esc(app.formTitle || 'Cognitus Application')}</strong>
    <p>${esc(statusLabels[app.status] || app.status || 'Application')} · ${esc(app.department || 'General')}</p>
    <a class="button" href="${href}">${action}</a>
  `;
}

function resumePendingApplication() {
  const pending = readPendingApplication();
  if (!pending) return false;
  sessionStorage.removeItem(PENDING_APPLY_KEY);
  setTimeout(() => { location.hash = pending.route; }, 80);
  return true;
}

function readPendingApplication() {
  try {
    const raw = sessionStorage.getItem(PENDING_APPLY_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (!pending?.route?.startsWith('#/apply/') || Date.now() - Number(pending.createdAt || 0) > PENDING_TTL) {
      sessionStorage.removeItem(PENDING_APPLY_KEY);
      return null;
    }
    return pending;
  } catch {
    sessionStorage.removeItem(PENDING_APPLY_KEY);
    return null;
  }
}

function enhanceApplications(main) {
  const tools = main.querySelector('.tg-opportunity-tools');
  if (!tools || tools.querySelector('[data-tg-browse-hint]')) return;
  const hint = document.createElement('div');
  hint.className = 'tg-browse-hint';
  hint.dataset.tgBrowseHint = 'true';
  hint.innerHTML = `<span><strong>Tip:</strong> Drafts stay editable until you submit them.</span><span>Submitted applications can be tracked from this same page.</span>`;
  tools.insertAdjacentElement('afterend', hint);
}

function enhanceApplication(main, formId) {
  const form = main.querySelector('#applicationForm');
  const panel = form?.closest('.panel');
  if (!form || !panel || form.dataset.tgUxEnhanced === 'true') return;
  form.dataset.tgUxEnhanced = 'true';

  const draftKey = `${DRAFT_PREFIX}${formId}`;
  lastApplyDraftKey = draftKey;
  let restored = 0;
  const localDraft = readLocalDraft(draftKey);

  if (localDraft?.fields) {
    Array.from(form.elements).forEach(field => {
      if (!field.name || !(field.name in localDraft.fields)) return;
      const saved = localDraft.fields[field.name];
      if (field.type === 'checkbox') {
        if (!field.checked && saved === true) { field.checked = true; restored += 1; }
      } else if (!String(field.value || '').trim() && typeof saved === 'string' && saved.trim()) {
        field.value = saved;
        restored += 1;
      }
    });
  }

  const ux = document.createElement('section');
  ux.className = 'tg-application-workspace';
  ux.innerHTML = `
    <div class="tg-application-progress-head">
      <div><span class="tg-progress-label">Application progress</span><strong data-tg-progress-text>0% complete</strong></div>
      <span class="tg-local-save" data-tg-local-save>${restored ? `Recovered ${restored} saved ${restored === 1 ? 'answer' : 'answers'} from this device` : 'Changes are backed up on this device'}</span>
    </div>
    <div class="tg-progress-track" aria-hidden="true"><span data-tg-progress-bar></span></div>
    <p class="tg-progress-help">Your answers are backed up locally while you type. Use <strong>Save Draft</strong> to store the draft in your Cognitus account and access it from another device.</p>
  `;
  form.insertAdjacentElement('beforebegin', ux);

  form.querySelectorAll('textarea').forEach(textarea => {
    if (textarea.dataset.tgCount === 'true') return;
    textarea.dataset.tgCount = 'true';
    const meta = document.createElement('div');
    meta.className = 'tg-field-meta';
    meta.innerHTML = `<span>Write a clear, complete answer.</span><span data-tg-char-count>0 characters</span>`;
    textarea.insertAdjacentElement('afterend', meta);
    updateCharacterCount(textarea, meta);
    textarea.addEventListener('input', () => updateCharacterCount(textarea, meta));
  });

  const updateProgress = () => {
    const required = Array.from(form.querySelectorAll('textarea[required], input[required], select[required]'));
    const complete = required.filter(field => field.type === 'checkbox' ? field.checked : String(field.value || '').trim().length > 0).length;
    const percent = required.length ? Math.round((complete / required.length) * 100) : 100;
    ux.querySelector('[data-tg-progress-text]').textContent = `${percent}% complete`;
    ux.querySelector('[data-tg-progress-bar]').style.width = `${percent}%`;
    ux.classList.toggle('tg-complete', percent === 100);
  };

  let saveTimer = null;
  const saveLocal = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const fields = {};
      Array.from(form.elements).forEach(field => {
        if (!field.name) return;
        fields[field.name] = field.type === 'checkbox' ? field.checked : String(field.value || '');
      });
      try {
        localStorage.setItem(draftKey, JSON.stringify({ fields, updatedAt: Date.now() }));
        const indicator = ux.querySelector('[data-tg-local-save]');
        indicator.textContent = `Backed up on this device at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      } catch {
        ux.querySelector('[data-tg-local-save]').textContent = 'Local backup is unavailable in this browser';
      }
    }, 350);
  };

  form.addEventListener('input', () => { updateProgress(); saveLocal(); });
  form.addEventListener('change', () => { updateProgress(); saveLocal(); });
  form.addEventListener('submit', event => {
    const intent = event.submitter?.value;
    const indicator = ux.querySelector('[data-tg-local-save]');
    indicator.textContent = intent === 'submit' ? 'Submitting application…' : 'Saving draft to your account…';
  }, true);

  updateProgress();
}

function readLocalDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (Date.now() - Number(draft.updatedAt || 0) > DRAFT_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function updateCharacterCount(textarea, meta) {
  const count = String(textarea.value || '').length;
  meta.querySelector('[data-tg-char-count]').textContent = `${count.toLocaleString()} ${count === 1 ? 'character' : 'characters'}`;
}

function enhanceAuth(main, current) {
  const form = main.querySelector('form');
  const password = form?.querySelector('input[type="password"]');
  if (!form || !password || form.dataset.tgAuthEnhanced === 'true') return;
  form.dataset.tgAuthEnhanced = 'true';

  const passwordLabel = password.closest('label');
  if (passwordLabel) {
    const wrap = document.createElement('div');
    wrap.className = 'tg-password-row';
    password.parentNode.insertBefore(wrap, password);
    wrap.appendChild(password);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tg-password-toggle';
    toggle.textContent = 'Show';
    toggle.setAttribute('aria-label', 'Show password');
    wrap.appendChild(toggle);
    toggle.addEventListener('click', () => {
      const showing = password.type === 'text';
      password.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'Show' : 'Hide';
      toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  }

  const discord = form.querySelector('input[name="discordId"]');
  if (discord) {
    discord.autocomplete = 'username';
    discord.inputMode = 'numeric';
  }
  password.autocomplete = current === '#/register' ? 'new-password' : 'current-password';

  const pending = readPendingApplication();
  if (pending) {
    const panel = form.closest('.panel');
    const notice = document.createElement('div');
    notice.className = 'tg-auth-context';
    notice.innerHTML = `<strong>${current === '#/register' ? 'Create your account to continue applying.' : 'Sign in to continue your application.'}</strong><span>After this step, Talent Gateway will take you back to the opportunity you selected.</span>`;
    form.insertAdjacentElement('beforebegin', notice);
  }
}

async function enhanceStatus(main, appId) {
  const panel = main.querySelector('.panel.wide');
  if (!panel || panel.dataset.tgStatusEnhanced === 'true' || !appId) return;
  panel.dataset.tgStatusEnhanced = 'true';

  const back = document.createElement('a');
  back.className = 'tg-status-back';
  back.href = '#/applications';
  back.textContent = '← Back to applications';
  panel.insertAdjacentElement('afterbegin', back);

  try {
    const snapshot = await getDoc(doc(db, 'applications', appId));
    if (!snapshot.exists()) return;
    const app = { id: snapshot.id, ...snapshot.data() };
    const status = app.status || 'submitted';
    const details = document.createElement('section');
    details.className = 'tg-status-guidance';
    details.innerHTML = `
      <div class="tg-status-guidance-head">
        <div><p class="eyebrow">What happens next</p><h2>${esc(statusLabels[status] || status)}</h2></div>
        ${app.updatedAt ? `<span>Updated ${esc(formatTimestamp(app.updatedAt))}</span>` : ''}
      </div>
      <p>${esc(nextStepCopy[status] || 'Return to this page for the latest application update.')}</p>
      ${renderTimeline(status)}
    `;

    const responsesHeading = Array.from(panel.querySelectorAll('h3')).find(item => /responses/i.test(item.textContent));
    if (responsesHeading) responsesHeading.insertAdjacentElement('beforebegin', details);
    else panel.appendChild(details);
  } catch {
    // The core status page remains usable if the supplemental status lookup is unavailable.
  }
}

function renderTimeline(status) {
  if (status === 'draft') return '';
  const core = ['submitted', 'underReview', 'pendingFinalDecision'];
  const interview = ['interviewRequested', 'interviewCompleted'].includes(status);
  const final = ['accepted', 'denied'].includes(status);
  const steps = [...core];
  if (interview || final) steps.push('interviewRequested');
  if (status === 'interviewCompleted' || final) steps.push('interviewCompleted');
  if (final) steps.push(status);
  const currentIndex = Math.max(0, steps.indexOf(status));
  return `<div class="tg-mini-timeline">${steps.map((step, index) => `<div class="${index <= currentIndex ? 'done' : ''} ${index === currentIndex ? 'current' : ''}"><span></span><strong>${esc(statusLabels[step] || step)}</strong></div>`).join('')}</div>`;
}

function formatTimestamp(value) {
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  } catch {
    return 'recently';
  }
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function handleDelegatedClick(event) {
  const view = event.target.closest('[data-tg-view-role]');
  if (view) {
    openRoleModal(view.dataset.tgViewRole).catch(() => {});
    return;
  }

  const apply = event.target.closest('[data-tg-apply-role]');
  if (apply) {
    startApplication(apply.dataset.tgApplyRole);
    return;
  }

  if (event.target.closest('[data-tg-close-role]')) closeRoleModal();
}

function handleRouteChange() {
  const current = route();
  if (lastRoute.startsWith('#/apply/') && !current.startsWith('#/apply/') && lastApplyDraftKey) {
    if (current.startsWith('#/status/') || current === '#/applications') {
      try { localStorage.removeItem(lastApplyDraftKey); } catch {}
    }
    lastApplyDraftKey = null;
  }
  lastRoute = current;
  closeRoleModal();
  scheduleEnhance();
}
