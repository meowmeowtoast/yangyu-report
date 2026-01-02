
import React, { useEffect } from 'react';
import App from '../App';
import ReportPage from './ReportPage';
import { AuthProvider } from './AuthContext';
import { getViewIdFromUrl } from '../utils/sharing';

const AuthGuard: React.FC = () => {
    const isDevMode = sessionStorage.getItem('devMode') === 'true';

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toUpperCase() === 'D') {
                event.preventDefault();
                const isCurrentlyDev = sessionStorage.getItem('devMode') === 'true';
                
                if (isCurrentlyDev) {
                    sessionStorage.removeItem('devMode');
                    alert('開發者模式已關閉。頁面將會重新整理。');
                } else {
                    sessionStorage.setItem('devMode', 'true');
                    alert('開發者模式已啟用。頁面將會重新整理。');
                }
                window.location.reload();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const renderContent = () => {
        const hash = window.location.hash;
        const viewId = getViewIdFromUrl();
        const hasLongLink = hash.startsWith('#/readonly/');

        // 報表頁面保持獨立
        if (hash === '#report') {
            return <ReportPage />;
        }
        
        // 直接進入 App，不論是否登入
        return <App />;
    };

    return (
        <AuthProvider>
            {renderContent()}
        </AuthProvider>
    );
};

export default AuthGuard;
