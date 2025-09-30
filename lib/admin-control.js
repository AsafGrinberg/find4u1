import { db, collection, getDocs, addDoc, deleteDoc, query, where } from '../firebase/firebase-config';

// Get all admin emails
export async function getAdminEmails() {
  const snapshot = await getDocs(collection(db, 'admins'));
  return snapshot.docs.map(doc => doc.data().email);
}

// Add a new admin (only main admin can call)
export async function addAdmin(email) {
  await addDoc(collection(db, 'admins'), { email });
}

// Remove an admin by email (only main admin can call)
export async function removeAdmin(email) {
  const q = query(collection(db, 'admins'), where('email', '==', email));
  const snapshot = await getDocs(q);
  for (const docSnap of snapshot.docs) {
    await deleteDoc(docSnap.ref);
  }
}

// Check if user is admin
export async function isAdminUser(email) {
  if (email === 'asafg999@gmail.com') return true;
  const admins = await getAdminEmails();
  return admins.includes(email);
}

// Count products uploaded by admin
export async function countProductsByAdmin(email) {
  const q = query(collection(db, 'products'), where('createdBy', '==', email));
  const snapshot = await getDocs(q);
  return snapshot.size;
}
