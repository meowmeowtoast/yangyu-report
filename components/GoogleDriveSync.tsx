
import React, { useState, useEffect, useCallback } from 'react';
import { 
    areGoogleServicesConfigured,
    loadGapiAndGis,
    initGapiClient,
    initGisClient,
    handleSignIn as performSignIn,
    handleSignOut as performSignOut,
    listBackupFiles, 
    uploadBackupFile, 
    getBackupFileContent 
} from '../utils/googleDrive';
import type { GoogleFile, AnalysisData, UserData } from '../types';
import Modal from './Modal';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';

interface GoogleDriveSyncProps {
    // Fix: Update prop types to match the expected data structure from App.tsx.
    onBackupRequest: () => UserData & { analyses: Record<string, AnalysisData> };
    onRestoreRequest: (data: any) => void;
}

const GoogleDriveSync: React.FC<GoogleDriveSyncProps> = ({ onBackupRequest, onRestoreRequest }) => {
    // Internal auth state for GAPI
    const [isGapiReady, setIsGapiReady] = useState(false);
    const [isGapiSignedIn, setIsGapiSignedIn] = useState(false);
    const [gapiUserProfile, setGapiUserProfile] = useState<{name: string, email: string, imageUrl: string} | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [backupFiles, setBackupFiles] = useState<GoogleFile[]>([]);
    const [isListingFiles, setIsListingFiles] = useState(false);

    const handleAuthChange = useCallback(async (signedIn: boolean) => {
        setIsGapiSignedIn(signedIn);
        if (signedIn) {
            try {
                const response = await window.gapi.client.request({
                    'path': 'https://www.googleapis.com/oauth2/v3/userinfo'
                });
                const profile = response.result;
                setGapiUserProfile({
                    name: profile.name || profile.email,
                    email: profile.email,
                    imageUrl: profile.picture || '',
                });
            } catch (err) {
                 console.error("Error fetching gapi user profile:", err);
            }
        } else {
            setGapiUserProfile(null);
        }
    }, []);

    useEffect(() => {
        if (!areGoogleServicesConfigured()) {
            setError('Google Drive 功能未設定');
            return;
        }
        const initialize = async () => {
            try {
                await loadGapiAndGis();
                await initGapiClient();
                await initGisClient(handleAuthChange);
                setIsGapiReady(true);
                if (window.gapi.client.getToken()) {
                    handleAuthChange(true);
                }
            } catch (err: any) {
                console.error("Error initializing Google services for Drive", err);
                setError(`無法載入 Google Drive: ${err.message}`);
            }
        };
        initialize();
    }, [handleAuthChange]);


    const handleBackup = async () => {
        setError(null);
        setIsProcessing(true);
        try {
            const backupData = onBackupRequest(); // Get fresh data from parent
            const jsonString = JSON.stringify(backupData);
            await uploadBackupFile(jsonString);
            alert('備份成功！檔案已儲存至您的 Google Drive。');
        } catch (err: any) {
            console.error("Backup failed", err);
            const errorMessage = `備份失敗: ${err.result?.error?.message || err.message || '未知錯誤'}`;
            setError(errorMessage);
            alert(errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const openRestoreModal = async () => {
        setIsRestoreModalOpen(true);
        setIsListingFiles(true);
        setError(null);
        try {
            const files = await listBackupFiles();
            setBackupFiles(files);
        } catch (err: any) {
            console.error("Failed to list files", err);
            const errorMessage = `無法讀取備份列表: ${err.result?.error?.message || err.message || '未知錯誤'}`;
            setError(errorMessage);
        } finally {
            setIsListingFiles(false);
        }
    };

    const handleRestore = async (fileId: string) => {
        if (!window.confirm('確定要從此雲端備份還原嗎？這將會覆寫目前的資料。')) {
            return;
        }

        setIsProcessing(true);
        setError(null);
        try {
            const content = await getBackupFileContent(fileId);
            const parsedContent = JSON.parse(content);
            // Parent handles logic, validation, and persistence
            onRestoreRequest(parsedContent);
        } catch (err: any) {
            console.error("Restore failed", err);
            const errorMessage = `還原失敗: ${err.result?.error?.message || err.message || '未知錯誤'}`;
            setError(errorMessage);
            alert(errorMessage);
        } finally {
            setIsProcessing(false);
            setIsRestoreModalOpen(false);
        }
    };


    if (!isGapiReady) {
        return <div className="text-sm text-slate-500 dark:text-slate-400">正在載入 Google 同步服務...</div>;
    }
    
    if (!isGapiSignedIn) {
         return (
             <>
                <button 
                    onClick={performSignIn}
                    className="w-full flex items-center justify-center gap-3 px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-700 transition-colors"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                    連接 Google Drive
                </button>
                {error && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
             </>
        );
    }
    
    return (
        <div>
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                { gapiUserProfile && (
                    <div className="flex items-center space-x-3 min-w-0">
                        {gapiUserProfile.imageUrl && <img src={gapiUserProfile.imageUrl} alt={gapiUserProfile.name} className="w-10 h-10 rounded-full" />}
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={gapiUserProfile.name}>{gapiUserProfile.name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate" title={gapiUserProfile.email}>{gapiUserProfile.email}</p>
                        </div>
                    </div>
                )}
                <button onClick={() => performSignOut(handleAuthChange)} className="text-sm text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-500 font-semibold">
                    中斷連線
                </button>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
                <button onClick={handleBackup} disabled={isProcessing} className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                    {isProcessing ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : '備份至雲端'}
                </button>
                <button onClick={openRestoreModal} disabled={isProcessing} className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-300">
                    從雲端還原
                </button>
            </div>
            
             {error && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
             
             <Modal isOpen={isRestoreModalOpen} onClose={() => setIsRestoreModalOpen(false)} title="從 Google Drive 還原備份">
                {isListingFiles ? (
                     <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div></div>
                ) : backupFiles.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {backupFiles.map(file => (
                            <div key={file.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md">
                                <div>
                                    <p className="font-medium text-slate-800 dark:text-slate-200">{file.name.replace('yangyu_dashboard_backup_', '').replace('.json', '')}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">建立時間: {format(parseISO(file.createdTime), 'yyyy/MM/dd HH:mm')}</p>
                                </div>
                                <button
                                    onClick={() => handleRestore(file.id)}
                                    disabled={isProcessing}
                                    className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-green-300"
                                >
                                    還原
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-slate-500 dark:text-slate-400 py-8">在您的 Google Drive 中找不到任何備份檔案。</p>
                )}
                 {error && <div className="mt-4 text-sm text-center text-red-600 dark:text-red-400">{error}</div>}
            </Modal>
        </div>
    );
};

export default GoogleDriveSync;
