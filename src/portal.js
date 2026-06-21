import './styles.css';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const root = document.querySelector('#app');
const BOOTSTRAP_KEY = 'CognitusOwnerSetup2026';
const roles = ['applicant','reviewer','seniorReviewer','hiringLead','executive','owner'];
const staffRoles = ['reviewer','seniorReviewer','hiringLead','executive','owner'];
const executiveRoles = ['executive','owner'];
let user = null;
let profile = null;
let ready = false;

const esc = (v='') => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const discordId = v => { const id = String(v || '').trim(); if (!/^\d{10,25}$/.test(id)) throw new Error('Enter a valid numeric Discord User ID.'); return id; };
const authEmail = id => `discord-${discordId(id)}@cognitus.internal`;
const canStaff = () => profile && staffRoles.includes(profile.role);
const canExecutive = () => profile && executiveRoles.includes(profile.role);
const badge = v => `<span class="badge badge-${String(v || 'unknown').toLowerCase()}">${esc(v || 'Unknown')}</span>`;
const go = path => { location.hash = path; };

onAuthStateChanged(auth, async current => {
  user = current;
  profile = current ? await getProfile(current.uid) : null;
  ready = true;
  render();
});
window.addEventListener('hashchange', render);

async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

function shell(content) {
  root.innerHTML = `<header class="topbar"><div class="brand" onclick="location.hash='#/'"><div class="brand-mark">C</div><div><strong>Cognitus Talent Gateway</strong><span>Careers & Application Review</span></div></div><nav>${profile ? `<a href="#/dashboard">Dashboard</a><a href="#/applications">Applications</a>` : `<a href="#/">Home</a><a href="#/signin">Sign In</a><a href="#/register">Create Account</a>`}${canStaff()?'<a href="#/review">Review</a>':''}${canExecutive()?'<a href="#/executive">Executive</a>':''}${profile?.role==='owner'?'<a href="#/owner">Owner</a>':''}${profile?`<span class="muted">${esc(profile.discordUsername)}</span><button class="ghost" id="signOutBtn">Sign Out</button>`:''}</nav></header><main>${content}</main><footer>© Cognitus Solutions · Careers Portal</footer>`;
  document.querySelector('#signOutBtn')?.addEventListener('click', async () => { await signOut(auth); go('#/'); });
}
function loading(){ shell('<section class="panel"><h1>Loading...</h1></section>'); }
function needLogin(){ if(!ready){ loading(); return false; } if(!profile){ go('#/signin'); return false; } return true; }
function home(){ shell(`<section class="hero"><div><p class="eyebrow">Cognitus Solutions Careers</p><h1>Find your place at Cognitus.</h1><p class="lead">Apply for open roles, check your status, and keep your application history in one place.</p><div class="actions"><a class="button" href="#/signin">Sign In</a><a class="button secondary" href="#/register">Create Account</a></div></div><div class="hero-card"><h3>For applicants</h3><p>Use your Discord User ID and password to access your account from any device.</p></div></section>`); }

function signInPage(){
  if(profile) return go('#/dashboard');
  shell(`<section class="panel narrow"><p class="eyebrow">Sign In</p><h1>Welcome back.</h1><p class="muted">Enter your Discord User ID and password.</p><form id="loginForm" class="form"><label>Discord User ID<input name="discordId" required></label><label>Password<input name="password" type="password" required></label><button class="button">Sign In</button></form><p class="muted">Need an account? <a href="#/register">Create one here.</a></p><div id="msg"></div></section>`);
  document.querySelector('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const msg = document.querySelector('#msg');
    msg.innerHTML = '<p class="muted">Signing in...</p>';
    try { await signInWithEmailAndPassword(auth, authEmail(f.get('discordId')), String(f.get('password') || '')); go('#/dashboard'); }
    catch (err) { msg.innerHTML = `<p class="error">Sign in failed: ${esc(err.message)}</p>`; }
  });
}

function registerPage(){
  if(profile) return go('#/dashboard');
  shell(`<section class="panel narrow"><p class="eyebrow">Applicant Registration</p><h1>Create your account</h1><p class="muted">No real email is collected. Your Discord ID is your login.</p><form id="registerForm" class="form"><label>Discord Username<input name="discordUsername" required></label><label>Discord User ID<input name="discordId" required></label><label>Roblox Username, optional<input name="robloxUsername"></label><label>Password<input name="password" type="password" minlength="8" required></label><button class="button">Create Account</button></form><p class="muted">Already have an account? <a href="#/signin">Sign in here.</a></p><div id="msg"></div></section>`);
  document.querySelector('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const msg = document.querySelector('#msg');
    msg.innerHTML = '<p class="muted">Creating account...</p>';
    try {
      const id = discordId(f.get('discordId'));
      const name = String(f.get('discordUsername') || '').trim();
      const cred = await createUserWithEmailAndPassword(auth, authEmail(id), String(f.get('password') || ''));
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, discordUsername: name, discordId: id, robloxUsername: String(f.get('robloxUsername') || '').trim(), role: 'applicant', accountStatus: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await setDoc(doc(db, 'discord_ids', id), { uid: cred.user.uid, createdAt: serverTimestamp() });
      profile = await getProfile(cred.user.uid);
      go('#/dashboard');
    } catch (err) { msg.innerHTML = `<p class="error">Account was not created: ${esc(err.message)}</p>`; }
  });
}

function bootstrapPage(){
  shell(`<section class="panel narrow"><p class="eyebrow">Owner Bootstrap</p><h1>Create first owner</h1><p class="muted">Direct link only. Key: <strong>${BOOTSTRAP_KEY}</strong></p><form id="bootForm" class="form"><label>Bootstrap Key<input name="key" required></label><label>Discord Username<input name="discordUsername" value="Executive_Eagle" required></label><label>Discord User ID<input name="discordId" required></label><label>Roblox Username<input name="robloxUsername" value="Executive_Eagle"></label><label>Password<input name="password" type="password" minlength="8" required></label><button class="button">Create Owner</button></form><div id="msg"></div></section>`);
  document.querySelector('#bootForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const msg = document.querySelector('#msg');
    msg.innerHTML = '<p class="muted">Creating owner...</p>';
    try {
      if (String(f.get('key')) !== BOOTSTRAP_KEY) throw new Error('Invalid bootstrap key.');
      const id = discordId(f.get('discordId'));
      const name = String(f.get('discordUsername') || '').trim();
      const cred = await createUserWithEmailAndPassword(auth, authEmail(id), String(f.get('password') || ''));
      await updateProfile(cred.user, { displayName: name });
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, discordUsername: name, discordId: id, robloxUsername: String(f.get('robloxUsername') || '').trim(), role: 'owner', accountStatus: 'active', permissions: ['*'], bootstrapOwner: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(db, 'discord_ids', id), { uid: cred.user.uid, createdAt: serverTimestamp() });
      batch.set(doc(db, 'system', 'ownerBootstrap'), { createdBy: cred.user.uid, createdAt: serverTimestamp(), locked: true });
      batch.set(doc(collection(db, 'audit_logs')), { action: 'OWNER_BOOTSTRAPPED', performedBy: cred.user.uid, targetId: cred.user.uid, timestamp: serverTimestamp() });
      await batch.commit();
      profile = await getProfile(cred.user.uid);
      go('#/owner');
    } catch (err) { msg.innerHTML = `<p class="error">Owner was not created: ${esc(err.message)}</p>`; }
  });
}

function dashboard(){ if(!needLogin()) return; shell(`<section class="page-head"><div><p class="eyebrow">${esc(profile.role)}</p><h1>Welcome, ${esc(profile.discordUsername)}</h1><p class="muted">Discord ID: ${esc(profile.discordId)}</p></div></section><section class="grid cards"><a class="card" href="#/applications"><h3>Applications</h3><p>Apply for open positions or view submissions.</p></a>${canStaff()?'<a class="card" href="#/review"><h3>Review Queue</h3><p>Review submitted applications.</p></a>':''}${canExecutive()?'<a class="card" href="#/executive"><h3>Executive Controls</h3><p>Create, open, close, and archive forms.</p></a>':''}${profile.role==='owner'?'<a class="card" href="#/owner"><h3>Owner Console</h3><p>Manage user roles.</p></a>':''}</section>`); }

async function applicationsPage(){
  if(!needLogin()) return;
  const forms = await getDocs(query(collection(db, 'application_forms'), orderBy('createdAt', 'desc')));
  const cards = forms.docs.map(d => { const f = { id: d.id, ...d.data() }; return `<article class="card"><div class="row"><h3>${esc(f.title)}</h3>${badge(f.status)}</div><p class="muted">${esc(f.department || 'General')}</p><p>${esc(f.description || '')}</p><button class="button" data-apply="${f.id}" ${f.status === 'open' ? '' : 'disabled'}>Apply Now</button></article>`; }).join('') || '<p class="muted">No applications are open yet.</p>';
  shell(`<section class="page-head"><h1>Applications</h1><p class="muted">You may submit one application per form.</p></section><section class="grid cards">${cards}</section>`);
  document.querySelectorAll('[data-apply]').forEach(btn => btn.onclick = () => go(`#/apply/${btn.dataset.apply}`));
}

async function ownerPage(){
  if(!needLogin()) return;
  if(profile.role !== 'owner') return shell('<section class="panel"><h1>Access denied</h1></section>');
  const users = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
  const rows = users.docs.map(d => { const u = { id: d.id, ...d.data() }; return `<tr><td>${esc(u.discordUsername)}</td><td>${esc(u.discordId)}</td><td>${badge(u.role)}</td><td><select data-role-select="${u.id}">${roles.map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><button class="button small" data-save-role="${u.id}">Save</button></td></tr>`; }).join('');
  shell(`<section class="page-head"><h1>Owner Console</h1><p class="muted">Manage user roles.</p></section><section class="panel"><table><thead><tr><th>User</th><th>Discord ID</th><th>Current Role</th><th>New Role</th><th></th></tr></thead><tbody>${rows}</tbody></table></section>`);
  document.querySelectorAll('[data-save-role]').forEach(btn => btn.onclick = async () => { const uid = btn.dataset.saveRole; const role = document.querySelector(`[data-role-select="${uid}"]`).value; await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp() }); if(uid === profile.uid) profile = await getProfile(uid); ownerPage(); });
}

async function render(){
  if(!ready) return loading();
  const [path, param] = (location.hash || '#/').replace('#','').split('/').filter(Boolean);
  if(!path) return home();
  if(path === 'signin') return signInPage();
  if(path === 'register') return registerPage();
  if(path === 'bootstrap') return bootstrapPage();
  if(path === 'dashboard') return dashboard();
  if(path === 'applications') return applicationsPage();
  if(path === 'owner') return ownerPage();
  if(path === 'apply') return shell('<section class="panel"><h1>Application form loading will be restored next.</h1></section>');
  if(path === 'review') return shell('<section class="panel"><h1>Reviewer tools will be restored next.</h1></section>');
  if(path === 'executive') return shell('<section class="panel"><h1>Executive tools will be restored next.</h1></section>');
  return home();
}

loading();
