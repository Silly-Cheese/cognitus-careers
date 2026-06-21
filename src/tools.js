import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const staffRoles = ['reviewer', 'seniorReviewer', 'hiringLead', 'executive', 'owner'];
const executiveRoles = ['executive', 'owner'];
let user = auth.currentUser;
let profile = null;
let draftQuestions = [];

const esc = (v = '') => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(v || 'Unknown')}</span>`;
const staff = () => profile && staffRoles.includes(profile.role);
const executive = () => profile && executiveRoles.includes(profile.role);
const go = p => { location.hash = p; };

onAuthStateChanged(auth, async current => { user = current; profile = current ? await loadProfile(current.uid) : null; routeTools(); });
window.addEventListener('hashchange', routeTools);

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}
function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>${staff()?'<a href="#/review">Review</a>':''}${executive()?'<a href="#/executive">Executive</a>':''}${profile?.role==='owner'?'<a href="#/owner">Owner</a>':''}<span class="muted">${esc(profile?.discordUsername || '')}</span></nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal</footer>`;
}
function needLogin() { if (!user || !profile) { go('#/signin'); return false; } return true; }

async function routeTools() {
  const [path, param] = (location.hash || '#/').replace('#','').split('/').filter(Boolean);
  if (!['executive','review','apply','status'].includes(path)) return;
  if (path === 'executive') return executivePage();
  if (path === 'review' && param) return reviewOnePage(param);
  if (path === 'review') return reviewPage();
  if (path === 'apply') return applyPage(param);
  if (path === 'status') return statusPage(param);
}

async function executivePage() {
  if (!needLogin()) return;
  if (!executive()) return shell('<section class="panel"><h1>Access denied</h1><p class="muted">Only executives and owners can manage applications.</p></section>');
  const forms = await getDocs(query(collection(db, 'application_forms'), orderBy('createdAt', 'desc')));
  const cards = forms.docs.map(d => {
    const f = { id: d.id, ...d.data() };
    return `<div class="mini-card"><div><strong>${esc(f.title)}</strong><p>${esc(f.department || 'General')} · ${badge(f.status)}</p><p class="muted">${esc((f.questions || []).length)} question(s)</p></div><div class="actions"><button class="button small" data-status="open" data-form="${f.id}">Open</button><button class="button small secondary" data-status="closed" data-form="${f.id}">Close</button><button class="button small quiet" data-status="archived" data-form="${f.id}">Archive</button></div></div>`;
  }).join('') || '<p class="muted">No forms created yet.</p>';
  shell(`<section class="page-head"><div><p class="eyebrow">Executive Center</p><h1>Application Controls</h1><p class="muted">Create, open, close, and archive Cognitus applications.</p></div><button class="button" id="createApplicationBtn">Create Application</button></section><section class="panel"><h2>Manage Forms</h2><div id="executiveMessage"></div>${cards}</section>`);
  document.querySelector('#createApplicationBtn').onclick = openCreateModal;
  document.querySelectorAll('[data-status]').forEach(btn => btn.onclick = async () => {
    try { await updateDoc(doc(db, 'application_forms', btn.dataset.form), { status: btn.dataset.status, updatedAt: serverTimestamp() }); executivePage(); }
    catch (err) { document.querySelector('#executiveMessage').innerHTML = `<p class="error">Could not update status: ${esc(err.message)}</p>`; }
  });
}

function drawQuestionList() {
  const list = document.querySelector('#questionList');
  if (!list) return;
  list.innerHTML = draftQuestions.length ? draftQuestions.map((q, i) => `<div class="question-row"><span><strong>Q${i + 1}.</strong> ${esc(q)}</span><button class="button small quiet" type="button" data-remove="${i}">Remove</button></div>`).join('') : '<p class="muted">No questions added yet. Click Add Question to add one.</p>';
  document.querySelectorAll('[data-remove]').forEach(btn => btn.onclick = () => { draftQuestions.splice(Number(btn.dataset.remove), 1); drawQuestionList(); });
}
function openCreateModal() {
  draftQuestions = [];
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="applicationModal"><div class="modal-card"><div class="row"><div><p class="eyebrow">Executive Tool</p><h2>Create Application</h2></div><button class="button small quiet" type="button" id="closeModal">Close</button></div><form id="createForm" class="form"><label>Position Title<input name="title" required placeholder="Hiring Specialist"></label><label>Department<input name="department" placeholder="Human Resources"></label><label>Description<textarea name="description" rows="4" required></textarea></label><label>Requirements, one per line<textarea name="requirements" rows="4"></textarea></label><div class="question-builder"><div class="row"><h3>Application Questions</h3><button class="button secondary small" type="button" id="addQuestion">Add Question</button></div><div id="questionList"></div></div><label>Max Openings<input name="maxOpenings" type="number" min="0"></label><label>Status<select name="status"><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></label><div class="actions"><button class="button">Create Application</button><button class="button secondary" type="button" id="cancelModal">Cancel</button></div></form><div id="createMessage"></div></div></div>`);
  drawQuestionList();
  const close = () => document.querySelector('#applicationModal')?.remove();
  document.querySelector('#closeModal').onclick = close;
  document.querySelector('#cancelModal').onclick = close;
  document.querySelector('#addQuestion').onclick = () => { const q = prompt('Enter the application question:'); if (q && q.trim()) { draftQuestions.push(q.trim()); drawQuestionList(); } };
  document.querySelector('#createForm').onsubmit = createApplication;
}
async function createApplication(e) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  const msg = document.querySelector('#createMessage');
  msg.innerHTML = '<p class="muted">Creating application...</p>';
  try {
    if (!draftQuestions.length) throw new Error('Add at least one application question.');
    await addDoc(collection(db, 'application_forms'), {
      title: String(data.get('title') || '').trim(),
      department: String(data.get('department') || 'General').trim() || 'General',
      description: String(data.get('description') || '').trim(),
      requirements: String(data.get('requirements') || '').split('\n').map(x => x.trim()).filter(Boolean),
      questions: draftQuestions.map((question, i) => ({ id: `q${i + 1}`, type: 'longText', question })),
      maxOpenings: Number(data.get('maxOpenings') || 0),
      status: data.get('status') || 'draft',
      visibility: 'public',
      finalApprovalRequired: true,
      createdBy: profile.uid,
      createdByUsername: profile.discordUsername,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    msg.innerHTML = '<p class="notice"><strong>Created.</strong> Application saved.</p>';
    setTimeout(() => { document.querySelector('#applicationModal')?.remove(); executivePage(); }, 500);
  } catch (err) { msg.innerHTML = `<p class="error">Application was not created:<br>${esc(err.message)}</p>`; }
}

async function reviewPage() {
  if (!needLogin()) return;
  if (!staff()) return shell('<section class="panel"><h1>Access denied</h1><p class="muted">Only reviewers and leadership can review applications.</p></section>');
  const apps = await getDocs(query(collection(db, 'applications'), orderBy('updatedAt', 'desc'), limit(100)));
  const rows = apps.docs.map(d => { const a = { id: d.id, ...d.data() }; return `<tr><td>${esc(a.formTitle)}</td><td>${esc(a.applicantDiscordUsername)}</td><td>${badge(a.status)}</td><td><button class="button small" data-review="${a.id}">Open</button></td></tr>`; }).join('') || '<tr><td colspan="4">No applications yet.</td></tr>';
  shell(`<section class="page-head"><div><p class="eyebrow">Reviewer Center</p><h1>Review Queue</h1><p class="muted">Review submitted applications and add internal notes.</p></div></section><section class="panel"><table><thead><tr><th>Application</th><th>Applicant</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
  document.querySelectorAll('[data-review]').forEach(btn => btn.onclick = () => go(`#/review/${btn.dataset.review}`));
}

async function reviewOnePage(appId) {
  if (!needLogin()) return;
  if (!staff()) return shell('<section class="panel"><h1>Access denied</h1></section>');
  const appSnap = await getDoc(doc(db, 'applications', appId));
  if (!appSnap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
  const app = { id: appSnap.id, ...appSnap.data() };
  const notes = await getDocs(query(collection(db, 'review_notes'), where('applicationId', '==', appId), orderBy('createdAt', 'desc')));
  shell(`<section class="panel wide"><p class="eyebrow">Reviewer Workspace</p><div class="row"><h1>${esc(app.formTitle)}</h1>${badge(app.status)}</div><p><strong>Applicant:</strong> ${esc(app.applicantDiscordUsername)} · ${esc(app.applicantDiscordId)}</p><h3>Responses</h3>${Object.entries(app.answers || {}).map(([k,v]) => `<div class="answer"><strong>${esc(k)}</strong><p>${esc(v)}</p></div>`).join('')}<h3>Reviewer Action</h3><form id="reviewForm" class="form split"><label>Status<select name="status"><option>underReview</option><option>interviewRequested</option><option>interviewCompleted</option><option>pendingFinalDecision</option><option>accepted</option><option>denied</option><option>archived</option></select></label><label>Recommendation<select name="recommendation"><option value="">None</option><option>approve</option><option>deny</option><option>interview</option><option>executiveReview</option></select></label><label class="full">Private Note<textarea name="note" rows="4"></textarea></label>${executive()?`<label class="full">Public Applicant Message<textarea name="publicMessage" rows="3">${esc(app.publicMessage || '')}</textarea></label>`:''}<button class="button">Save Review</button></form><h3>Internal Notes</h3>${notes.docs.map(d => `<div class="note"><p>${esc(d.data().note)}</p><span>${esc(d.data().createdByUsername || '')}</span></div>`).join('') || '<p class="muted">No notes yet.</p>'}</section>`);
  document.querySelector('[name="status"]').value = app.status || 'underReview';
  document.querySelector('#reviewForm').onsubmit = async e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updates = { status: data.get('status'), reviewerRecommendation: data.get('recommendation'), reviewedBy: profile.uid, reviewedByUsername: profile.discordUsername, updatedAt: serverTimestamp() };
    if (executive()) { updates.publicMessage = data.get('publicMessage') || ''; if (['accepted','denied'].includes(updates.status)) updates.decision = updates.status; }
    await updateDoc(doc(db, 'applications', appId), updates);
    const note = String(data.get('note') || '').trim();
    if (note) await addDoc(collection(db, 'review_notes'), { applicationId: appId, note, createdBy: profile.uid, createdByUsername: profile.discordUsername, createdAt: serverTimestamp() });
    go('#/review');
  };
}

async function applyPage(formId) {
  if (!needLogin()) return;
  const formSnap = await getDoc(doc(db, 'application_forms', formId));
  if (!formSnap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
  const form = { id: formSnap.id, ...formSnap.data() };
  const appId = `${profile.uid}_${formId}`;
  const oldSnap = await getDoc(doc(db, 'applications', appId));
  const old = oldSnap.exists() ? oldSnap.data() : null;
  if (old && old.status !== 'draft') return go(`#/status/${appId}`);
  if (form.status !== 'open' && !old) return shell('<section class="panel"><h1>This application is closed.</h1></section>');
  const questions = Array.isArray(form.questions) ? form.questions : [];
  shell(`<section class="panel wide"><p class="eyebrow">${esc(form.department || 'Cognitus')}</p><h1>${esc(form.title)}</h1><p>${esc(form.description || '')}</p><form id="applicationForm" class="form">${questions.map((q,i) => { const qid = q.id || `q${i+1}`; return `<label>${esc(q.question || qid)}<textarea name="${esc(qid)}" rows="5" required>${esc(old?.answers?.[qid] || '')}</textarea></label>`; }).join('')}<label>Conflict of Interest Disclosure<textarea name="conflictDisclosure" rows="4">${esc(old?.conflictDisclosure || '')}</textarea></label><label class="check"><input type="checkbox" name="agreement" required ${old?.agreement ? 'checked' : ''}> I certify this is truthful and understand I may only submit once for this application.</label><div class="actions"><button class="button secondary" name="intent" value="draft">Save Draft</button><button class="button" name="intent" value="submit">Submit Application</button></div></form></section>`);
  document.querySelector('#applicationForm').onsubmit = async e => {
    e.preventDefault();
    const intent = e.submitter?.value || 'draft';
    const data = new FormData(e.currentTarget);
    const answers = {};
    questions.forEach((q,i) => { const qid = q.id || `q${i+1}`; answers[qid] = data.get(qid) || ''; });
    await setDoc(doc(db, 'applications', appId), { applicationId: appId, applicantUid: profile.uid, applicantDiscordUsername: profile.discordUsername, applicantDiscordId: profile.discordId, applicantRobloxUsername: profile.robloxUsername || '', formId, formTitle: form.title, department: form.department || 'General', answers, conflictDisclosure: data.get('conflictDisclosure') || '', agreement: data.get('agreement') === 'on', status: intent === 'submit' ? 'submitted' : 'draft', updatedAt: serverTimestamp(), submittedAt: intent === 'submit' ? serverTimestamp() : old?.submittedAt || null }, { merge: true });
    go(intent === 'submit' ? `#/status/${appId}` : '#/applications');
  };
}

async function statusPage(appId) {
  if (!needLogin()) return;
  const snap = await getDoc(doc(db, 'applications', appId));
  if (!snap.exists()) return shell('<section class="panel"><h1>Application not found</h1></section>');
  const app = { id: snap.id, ...snap.data() };
  if (app.applicantUid !== profile.uid && !staff()) return shell('<section class="panel"><h1>Access denied</h1></section>');
  shell(`<section class="panel wide"><p class="eyebrow">Application Status</p><div class="row"><h1>${esc(app.formTitle)}</h1>${badge(app.status)}</div><p class="muted">Department: ${esc(app.department || 'General')}</p>${app.decision ? `<div class="notice"><strong>Decision:</strong> ${esc(app.decision)}</div>` : ''}${app.publicMessage ? `<div class="notice">${esc(app.publicMessage)}</div>` : ''}<h3>Responses</h3>${Object.entries(app.answers || {}).map(([k,v]) => `<div class="answer"><strong>${esc(k)}</strong><p>${esc(v)}</p></div>`).join('')}</section>`);
}
