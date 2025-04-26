// Конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBaq_faWwfE_TXn4Xh_2U3GYSAsUzGJ1bk",
  authDomain: "vr-lounge33.firebaseapp.com",
  projectId: "vr-lounge33",
  storageBucket: "vr-lounge33.firebasestorage.app",
  messagingSenderId: "825655988090",
  appId: "1:825655988090:web:76d8e0554b8601f8bd10c3",
  measurementId: "G-WG8BDG9D4M"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Функция для входа администратора
async function adminLogin(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    return userCredential.user;
  } catch (error) {
    console.error('Ошибка входа:', error);
    throw error;
  }
}

// Функция для проверки авторизации
function checkAuth() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged((user) => {
      resolve(user);
    });
  });
}

// Функция для выхода
function adminLogout() {
  return auth.signOut();
}

// Функция для получения списка администраторов
async function getAdmins() {
  try {
    const snapshot = await db.collection('admins').get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Ошибка при получении списка администраторов:', error);
    throw error;
  }
}

// Функция для получения назначений администраторов
async function getAdminAssignments(date) {
  try {
    const snapshot = await db.collection('adminAssignments')
      .where('date', '==', date)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Ошибка при получении назначений:', error);
    throw error;
  }
}

// Функция для сохранения назначения администратора
async function saveAdminAssignment(assignmentData) {
  try {
    const docRef = await db.collection('adminAssignments').add({
      ...assignmentData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('Ошибка при сохранении назначения:', error);
    throw error;
  }
} 
