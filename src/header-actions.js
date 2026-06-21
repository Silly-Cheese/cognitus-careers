import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase.js';

let timer = null;

onAuthStateChanged(auth, user => {
  if (timer) clearInterval(timer);
  if (!user) return;
  timer = setInterval(() => {
    const nav = document.querySelector('.topbar nav');
    if (!nav || nav.querySelector('[data-header-action]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost signout-mobile-fix';
    button.textContent = 'Sign Out';
    button.setAttribute('data-header-action', 'true');
    button.onclick = async () => {
      await signOut(auth);
      window.location.hash = '#/';
    };
    nav.appendChild(button);
  }, 500);
});
