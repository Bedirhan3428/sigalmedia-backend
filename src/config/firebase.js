const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
    if (initialized) return;
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'sigalmedia.firebasestorage.app',
        });
        initialized = true;
        console.log('✅ Firebase Admin başlatıldı.');
    } catch (err) {
        console.warn('⚠️ Firebase Admin başlatılamadı (Storage silme devre dışı):', err.message);
    }
}

async function deleteFromStorage(imagePath) {
    if (!imagePath) return;
    try {
        await admin.storage().bucket().file(imagePath).delete();
        console.log('🗑️ Storage silindi:', imagePath);
    } catch (err) {
        console.warn('⚠️ Storage silinemedi:', imagePath, err.message);
    }
}

module.exports = { initFirebase, deleteFromStorage };