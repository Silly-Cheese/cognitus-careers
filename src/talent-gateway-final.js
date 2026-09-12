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
let draftController = null;

const labels = {
  draft: 'Draft', submitted: 'Submitted', underReview: 'Under review',
  pendingFinalDecision: 'Awaiting final decision', interviewRequested: 'Interview requested',
  interviewCompleted: 'Interview completed', accepted: 'Accepted', denied: 'Denied', archived: 'Archived'
};

const nextSteps = {
  draft: 'Finish the remaining questions and submit when you are ready.',
  submitted: 'Your application is in the queue. No action is needed from you right now.',
  underReview: 'A reviewer is actively evaluating your application. Return here for the next update.',
  pendingFinalDecision: 'Review is complete and your application is waiting on a final decision.',
  interviewRequested: 'Review the interview details on this page and prepare for the next step.',
  interviewCompleted: 'Your interview is complete. The hiring team will post the next decision here.',
  accepted: 'Your application was accepted. Follow any instructions attached to the decision.',
  denied: 'This application is complete. You can return to Applications to view other opportunities.',
  archived: 'This application has been archived and no longer needs action.'
};

if (root) {
  onAuthStateChanged(auth, user => {
    currentUser = user;
    schedule();
  });

  // Only watch route-level renders. The previous subtree observer reacted to its own
  // inserted elements and repeatedly appended UI, which caused the endless tip list and lag.
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true });

  window.addEventListener('hashchange', () => {
    closeModal();
    draftController?.flush?.();
    draftController = null;
    schedule();
  });
  window.addEventListener('pagehide', () => draftController?.flush?.());
  window.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  root.addEventListener('click', handleClick);
  schedule();
}

function currentRoute() {
  return (location.hash || '#/').split('?')[0];
}

function esc(value = '') {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance().catch(error => console.warn('Talent Gateway enhancement skipped:', error));
  });
}

async function enhance() {
  const main = root.querySelector('main');
  if (!main) return;
  decorateHeader();
  decorateFooter();

  const route = currentRoute();
  if (route === '#/' || route === '#') await home(main);
  else if (route === '#/dashboard') await dashboard(main);
  else if (route === '#/applications') applications(main);
  else if (route.startsWith('#/apply/')) application(main, route.split('/')[2]);
  else if (route.startsWith('#/status/')) await status(main, route.split('/')[2]);
  else if (route === '#/signin' || route === '#/register') authPage(main);
}

function decorateHeader() {
  const nav = root.querySelector('.topbar nav');
  if (!nav) return;
  const route = currentRoute();
  nav.querySelectorAll('a').forEach(link => {
    const active = link.getAttribute('href') === route;
    link.classList.toggle('tg-active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}

function decorateFooter() {
  const footer = root.querySelector('footer');
  if (!footer || footer.dataset.tgFinal === 'true') return;
  footer.dataset.tgFinal = 'true';
  footer.innerHTML = '© Cognitus Solutions <span aria-hidden="true">·</span> Talent Gateway <span aria-hidden="true">·</span> Clear applications. Structured review.';
}

async function home(main) {
  const hero = main.querySelector('.hero');
  if (!hero || hero.dataset.tgFinal === 'true') return;
  hero.dataset.tgFinal = 'true';
  hero.className = 'hero tg-final-home';
  hero.innerHTML = `
    <section class="tg-final-hero">
      <div class="tg-final-copy">
        <p class="eyebrow">Cognitus Solutions / Talent Gateway</p>
        <h1>Build what comes next.</h1>
        <p class="lead">Explore current opportunities, apply when you are ready, and track every step of the hiring process from one account.</p>
        <div class="actions"><a class="button" href="#/register">Create account</a><a class="button secondary" href="#/signin">Sign in</a></div>
      </div>
      <aside class="tg-final-card">
        <div class="tg-final-card-head"><div class="tg-final-mark" aria-hidden="true"></div><span class="tg-final-live">Gateway online</span></div>
        <h2>One place. Every step.</h2>
        <div class="tg-final-steps">
          <div class="tg-final-step"><b>01</b><div><strong>Explore</strong><span>See the role before creating an account.</span></div></div>
          <div class="tg-final-step"><b>02</b><div><strong>Apply</strong><span>Save a draft and finish it later.</span></div></div>
          <div class="tg-final-step"><b>03</b><div><strong>Track</strong><span>Follow your application through review.</span></div></div>
          <div class="tg-final-step"><b>04</b><div><strong>Decide</strong><span>See interviews, updates, and final decisions.</span></div></div>
        </div>
      </aside>
    </section>
    <section class="tg-final-section" data-tg-final-openings>
      <div class="tg-final-section-head"><div><p class="eyebrow">Open opportunities</p><h2>Find where you fit.</h2></div><p>Browse openings first. You only need to sign in when you are ready to apply.</p></div>
      <div data-tg-opening-state><div class="tg-final-skeleton"></div></div>
    </section>
  `;

  const state = hero.querySelector('[data-tg-opening-state]');
  try {
    const openings = await loadOpenings();
    if (!openings.length) {
      state.innerHTML = '<div class="tg-final-empty"><strong>No openings are accepting applications right now.</strong><span>New Cognitus opportunities will appear here when they open.</span></div>';
      return;
    }
    state.innerHTML = `<div class="tg-final-openings">${openings.map(openingCard).join('')}</div>`;
  } catch {
    state.innerHTML = '<div class="tg-final-error"><strong>Openings could not be loaded.</strong><span>Try again shortly or sign in to check the Applications area.</span></div>';
  }
}

function loadOpenings() {
  if (!openingsPromise) {
    openingsPromise = getDocs(collection(db, 'application_forms')).then(snapshot => snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.status === 'open')
      .sort((a,b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
    ).catch(error => { openingsPromise = null; throw error; });
  }
  return openingsPromise;
}

function openingCard(opening) {
  const requirements = Array.isArray(opening.requirements) ? opening.requirements : [];
  const questions = Array.isArray(opening.questions) ? opening.questions : [];
  return `<article class="tg-final-opening">
    <div class="tg-final-opening-top"><span>${esc(opening.department || 'General')}</span><span class="tg-final-open">Open</span></div>
    <h3>${esc(opening.title || 'Cognitus Opportunity')}</h3>
    <p>${esc(opening.description || 'View the opportunity for details and application requirements.')}</p>
    <div class="tg-final-opening-meta"><span>${questions.length} ${questions.length === 1 ? 'question' : 'questions'}</span><span>${requirements.length} ${requirements.length === 1 ? 'requirement' : 'requirements'}</span></div>
    <div class="tg-final-opening-actions"><button type="button" class="button secondary" data-tg-view-role="${esc(opening.id)}">View details</button><button type="button" class="button" data-tg-apply-role="${esc(opening.id)}">Apply</button></div>
  </article>`;
}

async function dashboard(main) {
  if (resumePending()) return;
  if (main.dataset.tgFinal === 'true') return;
  const head = main.querySelector('.page-head');
  const cards = main.querySelector('.grid.cards');
  if (!head || !cards) return;
  main.dataset.tgFinal = 'true';

  const heading = head.querySelector('h1')?.textContent || 'Welcome';
  const username = esc(heading.replace(/^Welcome,\s*/i, ''));
  const role = esc(head.querySelector('.eyebrow')?.textContent || 'Applicant');
  const idText = esc(head.querySelector('.muted')?.textContent || 'Cognitus Talent Gateway account');

  const banner = document.createElement('section');
  banner.className = 'tg-final-dashboard-banner';
  banner.innerHTML = `<div class="tg-final-dashboard-main"><p class="eyebrow" style="color:rgba(255,255,255,.55)!important">Your next move</p><h2>Keep your applications moving.</h2><p>Continue a draft, find an opening, or check the latest status of an application already in review.</p><a class="button secondary" href="#/applications">Open applications</a></div><div class="tg-final-account"><div><div class="tg-final-account-mark"></div><h3>${username}</h3><small>${idText}</small></div><strong>${role}</strong></div>`;
  head.insertAdjacentElement('afterend', banner);

  if (!currentUser) return;
  const overview = document.createElement('section');
  overview.className = 'tg-final-overview';
  overview.innerHTML = '<div class="tg-final-skeleton"></div>';
  banner.insertAdjacentElement('afterend', overview);

  try {
    // Single-field query only: no composite index required.
    const snapshot = await getDocs(query(collection(db, 'applications'), where('applicantUid', '==', currentUser.uid)));
    const apps = snapshot.docs.map(item => ({ id:item.id, ...item.data() })).sort((a,b) => timestampValue(b.updatedAt) - timestampValue(a.updatedAt));
    const drafts = apps.filter(item => item.status === 'draft');
    const active = apps.filter(item => ['submitted','underReview','pendingFinalDecision','interviewRequested','interviewCompleted'].includes(item.status));
    const decisions = apps.filter(item => ['accepted','denied'].includes(item.status));
    const next = drafts[0] || active[0] || decisions[0] || null;
    overview.innerHTML = `<div class="tg-final-overview-head"><div><p class="eyebrow">Application activity</p><h2>Your hiring snapshot</h2></div><a href="#/applications">View all →</a></div><div class="tg-final-overview-grid"><div class="tg-final-stat"><span>Drafts</span><strong>${drafts.length}</strong><small>${drafts.length ? 'Waiting on you' : 'Nothing unfinished'}</small></div><div class="tg-final-stat"><span>In progress</span><strong>${active.length}</strong><small>${active.length ? 'With the hiring team' : 'No active reviews'}</small></div><div class="tg-final-stat"><span>Decisions</span><strong>${decisions.length}</strong><small>${decisions.length ? 'Completed applications' : 'No decisions yet'}</small></div><div class="tg-final-next">${next ? nextCard(next) : '<span>Next step</span><strong>Explore an opportunity</strong><p>You have no applications yet.</p><a class="button" href="#/applications">Browse applications</a>'}</div></div>`;
  } catch {
    overview.innerHTML = '<div class="tg-final-error"><strong>Your application summary could not be loaded.</strong><span>The rest of the gateway is still available.</span></div>';
  }
}

function nextCard(app) {
  const draft = app.status === 'draft';
  const href = draft ? `#/apply/${esc(app.formId)}` : `#/status/${esc(app.id)}`;
  return `<span>${draft ? 'Continue where you left off' : 'Most recent application'}</span><strong>${esc(app.formTitle || 'Cognitus Application')}</strong><p>${esc(labels[app.status] || app.status || 'Application')} · ${esc(app.department || 'General')}</p><a class="button" href="${href}">${draft ? 'Continue application' : 'View status'}</a>`;
}

function applications(main) {
  if (main.dataset.tgFinal === 'true') return;
  const head = main.querySelector('.page-head');
  const grid = main.querySelector('.grid.cards');
  if (!head || !grid) return;
  main.dataset.tgFinal = 'true';
  main.classList.add('tg-applications');

  const cards = Array.from(grid.querySelectorAll('.card'));
  const tools = document.createElement('div');
  tools.className = 'tg-opportunity-tools';
  tools.innerHTML = '<div class="tg-search-wrap"><input class="tg-opportunity-search" type="search" placeholder="Search opportunities by title or department" aria-label="Search opportunities"></div><div class="tg-result-count" aria-live="polite"></div>';
  head.insertAdjacentElement('afterend', tools);

  const tip = document.createElement('div');
  tip.className = 'tg-final-tip';
  tip.innerHTML = '<span><strong>Drafts save your progress.</strong> You can return and finish them later.</span><span>Submitted applications stay here so you can track updates.</span>';
  tools.insertAdjacentElement('afterend', tip);

  const noResults = document.createElement('div');
  noResults.className = 'tg-no-results';
  noResults.textContent = 'No opportunities match that search.';
  noResults.hidden = true;
  grid.appendChild(noResults);

  const input = tools.querySelector('input');
  const count = tools.querySelector('.tg-result-count');
  const update = () => {
    const needle = input.value.trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      const match = !needle || card.textContent.toLowerCase().includes(needle);
      card.hidden = !match;
      if (match) visible++;
    }
    count.textContent = `${visible} ${visible === 1 ? 'opportunity' : 'opportunities'}`;
    noResults.hidden = visible !== 0;
  };
  input.addEventListener('input', update, { passive:true });
  update();
}

function application(main, formId) {
  const form = main.querySelector('#applicationForm');
  if (!form || form.dataset.tgFinal === 'true') return;
  form.dataset.tgFinal = 'true';

  const draftButton = form.querySelector('button[name="intent"][value="draft"]');
  if (draftButton) {
    draftButton.formNoValidate = true;
    draftButton.setAttribute('formnovalidate','');
    draftButton.title = 'Save your progress without completing every required field.';
  }

  const key = `${DRAFT_PREFIX}${formId}`;
  const local = readDraft(key);
  let restored = 0;
  if (local?.fields) {
    for (const field of Array.from(form.elements)) {
      if (!field.name || !(field.name in local.fields)) continue;
      const saved = local.fields[field.name];
      if (field.type === 'checkbox') {
        if (!field.checked && saved === true) { field.checked = true; restored++; }
      } else if (!String(field.value || '').trim() && typeof saved === 'string' && saved.trim()) {
        field.value = saved; restored++;
      }
    }
  }

  const progress = document.createElement('section');
  progress.className = 'tg-final-progress';
  progress.innerHTML = `<div class="tg-final-progress-head"><div><span>Application progress</span><strong data-progress-text>0% complete</strong></div><small data-save-state>${restored ? `Recovered ${restored} saved ${restored === 1 ? 'answer' : 'answers'}` : 'Autosave ready'}</small></div><div class="tg-final-track"><span data-progress-bar></span></div>`;
  form.insertAdjacentElement('beforebegin', progress);

  const required = Array.from(form.querySelectorAll('[required]')).filter(field => field.name !== 'intent');
  const text = progress.querySelector('[data-progress-text]');
  const bar = progress.querySelector('[data-progress-bar]');
  const saveState = progress.querySelector('[data-save-state]');
  let timer = null;

  const calculate = () => {
    const complete = required.filter(field => field.type === 'checkbox' ? field.checked : String(field.value || '').trim().length > 0).length;
    const percent = required.length ? Math.round(complete / required.length * 100) : 100;
    text.textContent = `${percent}% complete`;
    bar.style.width = `${percent}%`;
  };

  const save = () => {
    clearTimeout(timer);
    const fields = {};
    for (const field of Array.from(form.elements)) {
      if (!field.name || ['submit','button'].includes(field.type) || field.name === 'intent') continue;
      fields[field.name] = field.type === 'checkbox' ? field.checked : String(field.value || '');
    }
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt:Date.now(), fields }));
      saveState.textContent = 'Saved on this device';
    } catch {
      saveState.textContent = 'Browser autosave unavailable';
    }
  };

  const queue = () => {
    calculate();
    saveState.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  };

  form.addEventListener('input', queue, { passive:true });
  form.addEventListener('change', queue, { passive:true });
  form.addEventListener('submit', save);
  draftController = { flush:save };
  calculate();
}

async function status(main, appId) {
  if (!currentUser || main.querySelector('[data-tg-final-nextstep]')) return;
  const panel = main.querySelector('.panel.wide') || main.querySelector('.panel');
  if (!panel) return;
  try {
    const snap = await getDoc(doc(db,'applications',appId));
    if (!snap.exists()) return;
    const app = snap.data();
    const card = document.createElement('section');
    card.className = 'tg-final-nextstep';
    card.dataset.tgFinalNextstep = 'true';
    card.innerHTML = `<div><p class="eyebrow">What happens next</p><h2>${esc(labels[app.status] || app.status || 'Application update')}</h2><p>${esc(nextSteps[app.status] || 'Return here for future updates from the hiring team.')}</p></div><a class="button secondary" href="#/applications">Back to applications</a>`;
    const row = panel.querySelector('.row');
    if (row) row.insertAdjacentElement('afterend', card); else panel.prepend(card);
  } catch {}
}

function authPage(main) {
  const panel = main.querySelector('.panel.narrow');
  if (!panel || panel.dataset.tgFinal === 'true') return;
  panel.dataset.tgFinal = 'true';
  const pending = readPending();
  if (pending) {
    const note = document.createElement('div');
    note.className = 'tg-final-auth-note';
    note.textContent = 'After you sign in or create your account, we will take you back to the opportunity you selected.';
    panel.querySelector('form')?.insertAdjacentElement('beforebegin', note);
  }

  const password = panel.querySelector('input[type="password"]');
  if (password && !password.closest('.tg-final-password-wrap')) {
    const wrap = document.createElement('div');
    wrap.className = 'tg-final-password-wrap';
    password.parentNode.insertBefore(wrap, password);
    wrap.appendChild(password);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tg-final-password-toggle';
    button.textContent = 'Show';
    button.addEventListener('click', () => {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
    });
    wrap.appendChild(button);
  }
}

async function openModal(formId) {
  closeModal();
  const openings = await loadOpenings();
  const opening = openings.find(item => item.id === formId);
  if (!opening) return;
  const requirements = Array.isArray(opening.requirements) ? opening.requirements : [];
  const questions = Array.isArray(opening.questions) ? opening.questions : [];
  const modal = document.createElement('div');
  modal.className = 'tg-final-modal-backdrop';
  modal.dataset.tgFinalModal = 'true';
  modal.innerHTML = `<section class="tg-final-modal" role="dialog" aria-modal="true" aria-labelledby="tgFinalRole"><div class="tg-final-modal-head"><div><p class="eyebrow">${esc(opening.department || 'Cognitus')}</p><h2 id="tgFinalRole">${esc(opening.title || 'Opportunity')}</h2></div><button type="button" class="tg-final-modal-close" data-tg-close-role aria-label="Close">×</button></div><p>${esc(opening.description || 'No additional description has been provided.')}</p><div class="tg-final-facts"><div><span>Application</span><strong>${questions.length} ${questions.length === 1 ? 'question' : 'questions'}</strong></div><div><span>Requirements</span><strong>${requirements.length || 'None listed'}</strong></div><div><span>Status</span><strong>Accepting applications</strong></div></div>${requirements.length ? `<h3>Requirements</h3><ul>${requirements.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}<div class="tg-final-modal-actions"><button type="button" class="button secondary" data-tg-close-role>Keep browsing</button><button type="button" class="button" data-tg-apply-role="${esc(opening.id)}">Start application</button></div></section>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  modal.querySelector('.tg-final-modal-close')?.focus();
}

function closeModal() {
  document.querySelector('[data-tg-final-modal]')?.remove();
}

function handleClick(event) {
  const view = event.target.closest('[data-tg-view-role]');
  if (view) { openModal(view.dataset.tgViewRole); return; }
  const apply = event.target.closest('[data-tg-apply-role]');
  if (apply) {
    closeModal();
    const target = `#/apply/${apply.dataset.tgApplyRole}`;
    sessionStorage.setItem(PENDING_APPLY_KEY, JSON.stringify({ route:target, createdAt:Date.now() }));
    location.hash = target;
    return;
  }
  if (event.target.closest('[data-tg-close-role]')) closeModal();
}

function resumePending() {
  const pending = readPending();
  if (!pending || !currentUser) return false;
  sessionStorage.removeItem(PENDING_APPLY_KEY);
  setTimeout(() => { location.hash = pending.route; }, 0);
  return true;
}

function readPending() {
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

function readDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (Date.now() - Number(draft.savedAt || 0) > DRAFT_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
