
declare const firebase: any;

import type { 
    DataSet, 
    SelectionState, 
    AllMonthlyFollowerData, 
    BaseFollowerData, 
    CompanyProfile,
    AnalysisData,
    UserData
} from '../types';

import { 
    loadDataSets, saveDataSets,
    loadSelectionState, saveSelectionState,
    loadAllMonthlyFollowerData, saveAllMonthlyFollowerData,
    loadBaseFollowerData, saveBaseFollowerData,
    loadCompanyProfile, saveCompanyProfile,
    loadAllAnalyses, saveAnalysis as saveAnalysisLS
} from './localStorage';

const firebaseConfig = {
  apiKey: "AIzaSyALtl956IGP1elTXz2_awA_wqcd6gw5hZQ",
  authDomain: "gen-lang-client-0974434997.firebaseapp.com",
  projectId: "gen-lang-client-0974434997",
  storageBucket: "gen-lang-client-0974434997.firebasestorage.app",
  messagingSenderId: "274384850395",
  appId: "1:274384850395:web:3240403a5bbe3140e42bfe",
  measurementId: "G-PYFG95QZ26"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export const googleProvider = new firebase.auth.GoogleAuthProvider();

export const initializeFirebase = (): Promise<void> => {
    return auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log("Firebase auth persistence set to 'local'.");
        })
        .catch((error: any) => {
            console.warn("Firebase: Could not set persistence.", error);
        });
};

export const signInWithGoogle = () => {
    return auth.signInWithPopup(googleProvider);
};
export const signOut = () => auth.signOut();

// 移除白名單限制，讓所有人都可以存取
export const isUserAuthorized = (email: string | null): boolean => {
    return true; 
};

const dataDocRef = (userId: string) => db.collection('users').doc(userId);
const analysesCollectionRef = (userId: string) => dataDocRef(userId).collection('analyses');
const historyCollectionRef = (userId: string) => dataDocRef(userId).collection('history');
const sharedViewsCollectionRef = () => db.collection('sharedViews');

const MAX_HISTORY_COUNT = 10;

const convertDatesToTimestamps = (data: any): any => {
    if (data instanceof Date) {
        return firebase.firestore.Timestamp.fromDate(data);
    }
    if (Array.isArray(data)) {
        return data.map(convertDatesToTimestamps);
    }
    if (typeof data === 'object' && data !== null) {
        return Object.keys(data).reduce((acc, key) => {
            acc[key] = convertDatesToTimestamps(data[key]);
            return acc;
        }, {} as any);
    }
    return data;
};

const convertTimestampsToDates = (data: any): any => {
    if (data instanceof firebase.firestore.Timestamp) {
        return data.toDate();
    }
    if (Array.isArray(data)) {
        return data.map(convertTimestampsToDates);
    }
    if (typeof data === 'object' && data !== null) {
        return Object.keys(data).reduce((acc, key) => {
            acc[key] = convertTimestampsToDates(data[key]);
            return acc;
        }, {} as any);
    }
    return data;
};

export const onUserDataSnapshot = (userId: string, callback: (data: UserData | null) => void) => {
    // 虛擬使用者改為從 LocalStorage 讀取資料
    if (userId === 'local-guest-user') {
        const data: UserData = {
            dataSets: loadDataSets(),
            selectionState: loadSelectionState() || { enabledDataSetIds: {}, enabledPostPermalinks: {} },
            allMonthlyFollowerData: loadAllMonthlyFollowerData(),
            baseFollowerData: loadBaseFollowerData(),
            companyProfile: loadCompanyProfile()
        };
        setTimeout(() => callback(data), 0);
        return () => {};
    }
    return dataDocRef(userId).onSnapshot(
        (doc) => {
            if (doc.exists) {
                const data = doc.data() as UserData;
                const convertedData = convertTimestampsToDates(data);
                callback(convertedData);
            } else {
                callback(null);
            }
        },
        (error) => {
            console.error("Error listening to user data:", error);
            callback(null); 
        }
    );
};

export const updateUserData = async (userId: string, data: Partial<UserData>) => {
    // 虛擬使用者儲存至 LocalStorage
    if (userId === 'local-guest-user') {
        if (data.dataSets) saveDataSets(data.dataSets);
        if (data.selectionState) saveSelectionState(data.selectionState);
        if (data.allMonthlyFollowerData) saveAllMonthlyFollowerData(data.allMonthlyFollowerData);
        if (data.baseFollowerData) saveBaseFollowerData(data.baseFollowerData);
        if (data.companyProfile) saveCompanyProfile(data.companyProfile);
        return;
    }
    
    const docRef = dataDocRef(userId);
    const convertedData = convertDatesToTimestamps(data);
    
    try {
        await db.runTransaction(async (transaction) => {
            const currentDoc = await transaction.get(docRef);
            if (currentDoc.exists) {
                const historyRef = historyCollectionRef(userId).doc(new Date().toISOString());
                transaction.set(historyRef, currentDoc.data());
            }
            transaction.set(docRef, convertedData, { merge: true });
        });
        
        const historyQuery = historyCollectionRef(userId).orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(MAX_HISTORY_COUNT + 5);
        const snapshot = await historyQuery.get();
        if (snapshot.size > MAX_HISTORY_COUNT) {
            const batch = db.batch();
            snapshot.docs.slice(MAX_HISTORY_COUNT).forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    } catch (error) {
        console.error("Transaction failed: ", error);
    }
};

export const clearAllUserDataForUser = async (userId: string) => {
    if (userId === 'local-guest-user') {
        // Implement clearing local storage via setting empty arrays/objects
        saveDataSets([]);
        saveSelectionState({ enabledDataSetIds: {}, enabledPostPermalinks: {} });
        saveAllMonthlyFollowerData({});
        saveBaseFollowerData({ fbBase: '', igBase: '' });
        saveCompanyProfile({ companyName: '', instagramUrl: '', facebookUrl: '', logo: '' });
        return;
    }
    try {
        await dataDocRef(userId).delete();
    } catch (error) {
        console.error(`Failed to clear user data:`, error);
        throw error;
    }
};

export const onAnalysesSnapshot = (userId: string, callback: (data: Record<string, AnalysisData>) => void) => {
    if (userId === 'local-guest-user') {
        const analyses = loadAllAnalyses();
        setTimeout(() => callback(analyses), 0);
        return () => {};
    }
    return analysesCollectionRef(userId).onSnapshot(
        (snapshot) => {
            const analyses: Record<string, AnalysisData> = {};
            snapshot.forEach((doc) => {
                analyses[doc.id] = doc.data() as AnalysisData;
            });
            callback(analyses);
        },
        (error) => {
            console.error("Error listening to analyses data:", error);
            callback({});
        }
    );
};

export const saveAnalysis = async (userId: string, key: string, data: AnalysisData) => {
    if (!key) return;
    if (userId === 'local-guest-user') {
        saveAnalysisLS(key, data);
        return;
    }
    await analysesCollectionRef(userId).doc(key).set(data);
};

export const saveSharedView = async (data: string): Promise<string> => {
    const docRef = await sharedViewsCollectionRef().add({
        data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
};

export const getSharedView = async (id: string): Promise<string | null> => {
    const doc = await sharedViewsCollectionRef().doc(id).get();
    if (doc.exists) {
        const docData = doc.data();
        return docData.data;
    }
    return null;
};
