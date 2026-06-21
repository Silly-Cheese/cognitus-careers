import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc, addDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const executiveRoles = ['executive', 'owner'];
let user = auth.currentUser;
let profile = null;
let ready = false;
let draftQuestions = [];
let draftRequirements = [];
let editingFormId = null;

const esc = (v = '') => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const go = path => { location.hash = path; };
const executive = () => profile && executiveRoles.includes(profile.role);
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(v || 'Unknown')}</span>`;
const timeValue = value => value?.toMillis ? value.toMillis() : 0;

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  handleExecutiveRoute();
});
window.addEventListener('hashchange', () => setTimeout(handleExecutiveRoute, 0));

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav><a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a><a href="#/review">Review</a>${executive() ? '<a href="#/executive">Executive</a>' : ''}${profile?.role === 'owner' ? '<a href="#/owner">Owner</a>' : ''}${profile ? `<span class="muted">${esc(profile.discordUsername)}</span>` : ''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal · ExecutiveEdit v1</footer>`;
}

function routeParts() {
  return (location.hash || '#/').replace('#', '').split('/').filter(Boolean);
}

async function handleExecutiveRoute() {
  const [path, action, id] = routeParts();
  if (path !== 'executive') return;
  if (!ready) return shell('<section class="panel"><h1>Loading executive tools...</h1></section>');
  if (!user || !profile) return go('#/signin');
  if (!executive()) return shell(`<section class="panel wide"><h1>Access denied</h1><p class="muted">Your current role is <strong>${esc(profile.role || 'unknown')}</strong>. Executive tools require executive or owner.</p></section>`);
  if (action === 'edit' && id) return openEditPage(id);
  return executivePage();
}

async function executivePage() {
  shell('<section class="panel"><h1>Loading executive tools...</h1><p class="muted">Fetching application forms.</p></section>');
  try {
    const formsSnap = await getDocs(collection(db, 'application_forms'));
    const forms = formsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    const cards = forms.map(form => `<div class="mini-card"><div><strong>${esc(form.title)}</strong><p>${esc(form.department || 'General')} · ${badge(form.status)}</p><p class="muted">${(form.questions || []).length} question(s) · ${(form.requirements || []).length} requirement(s)</p></div><div class="actions"><button class="button small" data-edit="${form.id}">Edit</button><button class="button small" data-status="open" data-form="${form.id}">Open</button><button class="button small secondary" data-status="closed" data-form="${form.id}">Close</button><button class="button small quiet" data-status="archived" data-form="${form.id}">Archive</button></div></div>`).join('') || '<p class="muted">No forms created yet.</p>';
    shell(`<section class="page-head"><div><p class="eyebrow">Executive Center</p><h1>Application Controls</h1><p class="muted">Create, edit, open, close, and archive Cognitus applications.</p></div><button class="button" id="createApplicationBtn">Create Application</button></section><section class="panel"><h2>Manage Forms</h2><div id="executiveMessage"></div>${cards}</section>`);
    document.querySelector('#createApplicationBtn').onclick = () => openEditorModal();
    document.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => go(`#/executive/edit/${btn.dataset.edit}`));
    document.querySelectorAll('[data-status]').forEach(btn => btn.onclick = async () => {
      try {
        await updateDoc(doc(db, 'application_forms', btn.dataset.form), { status: btn.dataset.status, updatedAt: serverTimestamp(), updatedBy: profile.uid, updatedByUsername: profile.discordUsername });
        executivePage();
      } catch (error) {
        document.querySelector('#executiveMessage').innerHTML = `<p class="error">Could not update status: ${esc(error.message)}</p>`;
      }
    });
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not load executive tools</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

async function openEditPage(formId) {
  shell('<section class="panel"><h1>Opening editor...</h1><p class="muted">Loading application form.</p></section>');
  try {
    const snap = await getDoc(doc(db, 'application_forms', formId));
    if (!snap.exists()) return shell('<section class="panel"><h1>Application form not found</h1></section>');
    openEditorModal({ id: snap.id, ...snap.data() });
  } catch (error) {
    shell(`<section class="panel wide"><h1>Could not open editor</h1><p class="error">${esc(error.message)}</p></section>`);
  }
}

function drawList(type) {
  const source = type === 'question' ? draftQuestions : draftRequirements;
  const box = document.querySelector(type === 'question' ? '#questionList' : '#requirementList');
  if (!box) return;
  box.innerHTML = source.length
    ? source.map((item, index) => `<div class="question-row"><span><strong>${type === 'question' ? `Q${index + 1}.` : `${index + 1}.`}</strong> ${esc(item)}</span><button class="button small quiet" type="button" data-remove-${type}="${index}">Remove</button></div>`).join('')
    : `<p class="muted">No ${type}s added yet.</p>`;
  document.querySelectorAll(`[data-remove-${type}]`).forEach(btn => btn.onclick = () => {
    source.splice(Number(btn.dataset[`remove${type[0].toUpperCase()}${type.slice(1)}`]), 1);
    drawList(type);
  });
}

function addItem(type) {
  const input = document.querySelector(type === 'question' ? '#questionInput' : '#requirementInput');
  const value = input?.value.trim();
  if (!value) return;
  if (type === 'question') draftQuestions.push(value);
  else draftRequirements.push(value);
  input.value = '';
  drawList(type);
  input.focus();
}

function openEditorModal(existing = null) {
  editingFormId = existing?.id || null;
  draftRequirements = Array.isArray(existing?.requirements) ? [...existing.requirements] : [];
  draftQuestions = Array.isArray(existing?.questions) ? existing.questions.map(q => q.question || String(q)) : [];
  document.querySelector('#applicationModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="applicationModal">
      <div class="modal-card">
        <div class="row">
          <div><p class="eyebrow">Executive Tool</p><h2>${editingFormId ? 'Edit Application' : 'Create Application'}</h2></div>
          <button class="button small quiet" type="button" id="closeModal">Close</button>
        </div>
        <form id="applicationEditor" class="form">
          <label>Position Title<input name="title" required placeholder="Hiring Specialist" value="${esc(existing?.title || '')}"></label>
          <label>Department<input name="department" placeholder="Human Resources" value="${esc(existing?.department || '')}"></label>
          <label>Description<textarea name="description" rows="4" required placeholder="Describe the role, expectations, and purpose.">${esc(existing?.description || '')}</textarea></label>
          <div class="question-builder"><h3>Requirements</h3><div class="inline-builder"><input id="requirementInput" type="text" placeholder="Example: Must be active in Discord"><button class="button secondary small" type="button" id="addRequirement">Add Requirement</button></div><div id="requirementList"></div></div>
          <div class="question-builder"><h3>Application Questions</h3><div class="inline-builder"><input id="questionInput" type="text" placeholder="Example: Why do you want this position?"><button class="button secondary small" type="button" id="addQuestion">Add Question</button></div><div id="questionList"></div><p class="muted">Changing questions affects future applicants. Already-submitted answers are kept as they were submitted.</p></div>
          <label>Max Openings<input name="maxOpenings" type="number" min="0" placeholder="0 for unlimited" value="${esc(existing?.maxOpenings ?? 0)}"></label>
          <label>Status<select name="status"><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option><option value="archived">Archived</option></select></label>
          <div class="actions"><button class="button">${editingFormId ? 'Save Changes' : 'Create Application'}</button><button class="button secondary" type="button" id="cancelModal">Cancel</button></div>
        </form>
        <div id="editorMessage"></div>
      </div>
    </div>`);
  document.querySelector('[name="status"]').value = existing?.status || 'draft';
  drawList('requirement');
  drawList('question');
  document.querySelector('#closeModal').onclick = closeEditor;
  document.querySelector('#cancelModal').onclick = closeEditor;
  document.querySelector('#addRequirement').onclick = () => addItem('requirement');
  document.querySelector('#addQuestion').onclick = () => addItem('question');
  document.querySelector('#requirementInput').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); addItem('requirement'); } };
  document.querySelector('#questionInput').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); addItem('question'); } };
  document.querySelector('#applicationEditor').onsubmit = saveApplicationForm;
}

function closeEditor() {
  document.querySelector('#applicationModal')?.remove();
  go('#/executive');
}

async function saveApplicationForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const msg = document.querySelector('#editorMessage');
  msg.innerHTML = '<p class="muted">Saving application...</p>';
  try {
    if (!draftQuestions.length) throw new Error('Add at least one application question.');
    const payload = {
      title: String(form.get('title') || '').trim(),
      department: String(form.get('department') || 'General').trim() || 'General',
      description: String(form.get('description') || '').trim(),
      requirements: draftRequirements,
      questions: draftQuestions.map((question, index) => ({ id: `q${index + 1}`, type: 'longText', question })),
      maxOpenings: Number(form.get('maxOpenings') || 0),
      status: form.get('status') || 'draft',
      visibility: 'public',
      finalApprovalRequired: true,
      updatedBy: profile.uid,
      updatedByUsername: profile.discordUsername,
      updatedAt: serverTimestamp()
    };

    if (editingFormId) {
      await updateDoc(doc(db, 'application_forms', editingFormId), payload);
      msg.innerHTML = '<p class="notice"><strong>Saved.</strong> Application updated.</p>';
    } else {
      await addDoc(collection(db, 'application_forms'), {
        ...payload,
        createdBy: profile.uid,
        createdByUsername: profile.discordUsername,
        createdAt: serverTimestamp()
      });
      msg.innerHTML = '<p class="notice"><strong>Created.</strong> Application saved.</p>';
    }
    setTimeout(closeEditor, 550);
  } catch (error) {
    msg.innerHTML = `<p class="error">Could not save application:<br>${esc(error.message)}</p>`;
  }
}
