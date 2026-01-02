
import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { auth } from '../utils/firebase';

interface UserProfile {
    uid: string;
    name: string;
    email: string;
    imageUrl: string;
}

interface AuthContextType {
    isApiReady: boolean;
    isSignedIn: boolean;
    userProfile: UserProfile | null;
    error: string | null;
    signIn: () => void;
    signOut: () => void;
    fbUser: any | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 定義一個虛擬的本地使用者，用於在不登入的情況下維持程式碼運行
const GUEST_USER = {
    uid: 'local-guest-user',
    name: '本地使用者',
    email: 'guest@local',
    imageUrl: '',
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isApiReady, setIsApiReady] = useState(true);
    const [isSignedIn, setIsSignedIn] = useState(true); // 預設為已登入
    const [userProfile, setUserProfile] = useState<UserProfile | null>(GUEST_USER);
    const [fbUser, setFbUser] = useState<any | null>(GUEST_USER);
    const [error, setError] = useState<string | null>(null);

    // 雖然不強制登入，但仍監聽 Firebase 狀態，以便如果使用者真的想登入也能運作
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user: any | null) => {
            if (user) {
                setIsSignedIn(true);
                setFbUser(user);
                setUserProfile({
                    uid: user.uid,
                    name: user.displayName || user.email || 'Unknown',
                    email: user.email || 'No email',
                    imageUrl: user.photoURL || '',
                });
            } else {
                // 如果沒登入，就使用虛擬帳號
                setIsSignedIn(true);
                setFbUser(GUEST_USER);
                setUserProfile(GUEST_USER);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const signIn = () => {
        // 點擊登入時，可以執行原本的 Google 登入
        const provider = new (window as any).firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => {
            console.error("Sign-in error:", err);
            setError(err.message);
        });
    };

    const signOut = () => {
        auth.signOut();
    };

    const value = { isApiReady, isSignedIn, userProfile, error, signIn, signOut, fbUser };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
