import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase.js';

const root = document.querySelector('#app');
let currentUser = auth.currentUser;
let scheduled = false;

onAuthStateChanged(auth, user => {
  currentUser = user;
  schedule();
});

if (root) {
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true });
}

window.addEventListener('hashchange', schedule);
schedule();

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    syncHeaderAction();
  });
}

function syncHeaderAction() {
  const nav = document.querySelector('.topbar nav');
  if (!nav) return;

  const helperButtons = [...nav.querySelectorAll('[data-header-action]')];
  if (!currentUser) {
    helperButtons.forEach(button => button.remove());
    return;
  }

  const builtInButton = nav.querySelector('#signOutBtn');
  if (builtInButton) {
    builtInButton.classList.add('signout-mobile-fix');
    builtInButton.onclick = doSignOut;
    helperButtons.forEach(button => button.remove());
    return;
  }

  helperButtons.slice(1).forEach(button => button.remove());
  let helperButton = nav.querySelector('[data-header-action]');
  if (!helperButton) {
    helperButton = document.createElement('button');
    helperButton.type = 'button';
    helperButton.className = 'ghost signout-mobile-fix';
    helperButton.textContent = 'Sign Out';
    helperButton.setAttribute('data-header-action', 'true');
    nav.appendChild(helperButton);
  }
  helperButton.onclick = doSignOut;
}

async function doSignOut() {
  await signOut(auth);
  window.location.hash = '#/';
}
