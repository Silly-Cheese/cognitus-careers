import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase.js';

let timer = null;

onAuthStateChanged(auth, user => {
  if (timer) clearInterval(timer);
  if (!user) return;

  timer = setInterval(() => {
    const nav = document.querySelector('.topbar nav');
    if (!nav) return;

    const builtInButton = nav.querySelector('#signOutBtn');
    const helperButtons = [...nav.querySelectorAll('[data-header-action]')];

    if (builtInButton) {
      builtInButton.classList.add('signout-mobile-fix');
      builtInButton.onclick = doSignOut;
      helperButtons.forEach(button => button.remove());
      return;
    }

    if (helperButtons.length > 1) {
      helperButtons.slice(1).forEach(button => button.remove());
    }

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
  }, 500);
});

async function doSignOut() {
  await signOut(auth);
  window.location.hash = '#/';
}
