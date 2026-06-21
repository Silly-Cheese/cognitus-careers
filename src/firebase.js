import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyACKZhEsOaiYkAU_mwLJNgU7RF58TAqaPE',
  authDomain: 'cognitus-car.firebaseapp.com',
  projectId: 'cognitus-car',
  storageBucket: 'cognitus-car.firebasestorage.app',
  messagingSenderId: '904900902243',
  appId: '1:904900902243:web:2b1bd2cdc0362b0a86a756'
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
