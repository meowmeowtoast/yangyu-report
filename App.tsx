
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FileUpload from './components/FileUpload';
import DataManagementPage, { LocalDataManager } from './components/DataManagementPage';
import Footer from './components/Footer';
import type { DataSet, NormalizedPost, SelectionState, AllMonthlyFollowerData, BaseFollowerData, CompanyProfile, AnalysisData, ReadOnlyViewState, SharedData, UserData, ThemeColor } from './types';
import { useAuth } from './components/AuthContext';
import * as Firestore from './utils/firebase';
import { generateShortLink, generateLongLink, getViewIdFromUrl, decompressViewData } from './utils/sharing';
import { exportDataAsJson, importDataFromFile } from './utils/backup';


/**
 * A robust data sanitizer and validator.
 */
const sanitizeAndValidateData = (data: any | null): UserData | null => {
    if (!data) {
        console.error("Data is null or undefined");
        return null;
    }

    console.log("Raw data to sanitize:", data);

    let processingData: any = data;

    // --- Legacy Backup Support ---
    if (data['metaDashboardDataSets'] || data['metaDashboardCompanyProfile']) {
        console.log("Detected legacy backup format. Attempting to parse...");
        try {
            const parseJSONSafe = (key: string, defaultVal: any) => {
                const val = data[key];
                if (typeof val === 'string') {
                    try {
                        return JSON.parse(val);
                    } catch (e) {
                        console.warn(`Failed to parse legacy key ${key}:`, e);
                        return defaultVal;
                    }
                }
                return val || defaultVal;
            };

            processingData = {
                dataSets: parseJSONSafe('metaDashboardDataSets', []),
                selectionState: parseJSONSafe('metaDashboardSelectionState', { enabledDataSetIds: {}, enabledPostPermalinks: {} }),
                allMonthlyFollowerData: parseJSONSafe('metaDashboardMonthlyFollowers', {}),
                baseFollowerData: parseJSONSafe('metaDashboardBaseFollowers', { fbBase: '', igBase: '' }),
                companyProfile: parseJSONSafe('metaDashboardCompanyProfile', { companyName: '', instagramUrl: '', facebookUrl: '', logo: '' }),
            };
        } catch (e) {
            console.error("Critical error transforming legacy data:", e);
        }
    }
    // -----------------------------

    // Validate DataSets structure
    if (!Array.isArray(processingData.dataSets)) {
        console.warn("dataSets is not an array, initializing as empty.");
        processingData.dataSets = [];
    }

    const sanitizedDataSets = (processingData.dataSets || []).map((ds: any) => {
        const validPosts = (ds.posts || []).filter((post: any) => {
            // Check if publishTime exists. String dates from JSON need to be parseable.
            return post.publishTime && !isNaN(new Date(post.publishTime).getTime());
        });
        
        const postsWithDates = validPosts.map((p: any) => ({
            ...p,
            publishTime: new Date(p.publishTime)
        }));

        return {
            ...ds,
            posts: postsWithDates,
            filenames: ds.filenames || [], 
        };
    });

    const validatedData: UserData = {
        dataSets: sanitizedDataSets,
        selectionState: processingData.selectionState || { enabledDataSetIds: {}, enabledPostPermalinks: {} },
        allMonthlyFollowerData: processingData.allMonthlyFollowerData || {},
        baseFollowerData: processingData.baseFollowerData || { fbBase: '', igBase: '' },
        companyProfile: processingData.companyProfile || { companyName: '', instagramUrl: '', facebookUrl: '', logo: '' },
    };

    console.log("Sanitized Data:", validatedData);
    return validatedData;
};


const App: React.FC = () => {
    const { fbUser, isSignedIn } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [isRestoring, setIsRestoring] = useState(false);
    
    // Main application state
    const [allUserData, setAllUserData] = useState<UserData>({
        dataSets: [],
        selectionState: { enabledDataSetIds: {}, enabledPostPermalinks: {} },
        allMonthlyFollowerData: {},
        baseFollowerData: { fbBase: '', igBase: '' },
        companyProfile: { companyName: '', instagramUrl: '', facebookUrl: '', logo: '' }
    });
    const [allAnalyses, setAllAnalyses] = useState<Record<string, AnalysisData>>({});
    
    const [currentView, setCurrentView] = useState<'dashboard' | 'dataManagement'>('dashboard');
    const [dateRangeLabel, setDateRangeLabel] = useState('');

    // Read-only state
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [readOnlyViewState, setReadOnlyViewState] = useState<ReadOnlyViewState | null>(null);
    const [readOnlyAnalysis, setReadOnlyAnalysis] = useState<AnalysisData | null>(null);

    // UI State
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [themeColor, setThemeColor] = useState<ThemeColor>('zinc');

    // Deconstruct for easier access
    const { dataSets, selectionState, allMonthlyFollowerData, baseFollowerData, companyProfile } = allUserData;

    const updateStateAndPersist = useCallback(async (newUserData: Partial<UserData>, newAnalyses?: Record<string, AnalysisData>) => {
        if (isReadOnly) return;
        
        if (newUserData) {
            setAllUserData(prev => ({ ...prev, ...newUserData }));
        }
        if (newAnalyses) {
            setAllAnalyses(newAnalyses);
        }

        if (fbUser) {
            if (newUserData) {
                try {
                    await Firestore.updateUserData(fbUser.uid, newUserData);
                } catch (error) {
                    console.error("Failed to persist user data:", error);
                }
            }
        }
    }, [fbUser, isReadOnly]);


    // Initial check for read-only link or safe mode
    useEffect(() => {
        const initializeApp = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const hash = window.location.hash;

            if (urlParams.has('safe_mode')) {
                console.warn("SAFE MODE ACTIVATED. Skipping all data loading.");
                setIsLoading(false);
                return;
            }

            const viewId = getViewIdFromUrl();
            
            const loadSharedData = (sharedData: SharedData | null) => {
                if (!sharedData) {
                    alert('分享的檢視不存在或資料已損毀。');
                    return;
                }
                
                const restoredUserData = sanitizeAndValidateData(sharedData.allData as unknown as UserData);
                if (!restoredUserData) {
                    alert('分享的資料已損毀。');
                    return;
                }
        
                const allSharedPosts = restoredUserData.dataSets.flatMap(ds => ds.posts);
                const allSharedPermalinks = allSharedPosts.reduce((acc, post) => {
                    acc[post.permalink] = true;
                    return acc;
                }, {} as Record<string, boolean>);
        
                const allSharedDataSetIds = restoredUserData.dataSets.reduce((acc, ds) => {
                    acc[ds.id] = true;
                    return acc;
                }, {} as Record<string, boolean>);

                const forcedSelectionState: SelectionState = {
                    enabledDataSetIds: allSharedDataSetIds,
                    enabledPostPermalinks: allSharedPermalinks,
                };
                
                restoredUserData.selectionState = forcedSelectionState;

                setAllUserData(restoredUserData);
                setAllAnalyses(sharedData.analyses || {});
                setReadOnlyViewState(sharedData.viewState);
                setReadOnlyAnalysis(sharedData.analysis);
            };

            if (viewId) {
                setIsReadOnly(true);
                setIsLoading(true);
                try {
                    const compressedData = await Firestore.getSharedView(viewId);
                    if (compressedData) {
                        const sharedData = decompressViewData(compressedData);
                        loadSharedData(sharedData);
                    } else {
                        alert('分享的檢視不存在或已過期。');
                    }
                } catch (err) {
                    console.error("Failed to load shared view:", err);
                    alert('載入分享的檢視時發生錯誤。');
                } finally {
                    setIsLoading(false);
                }
            } else if (hash.startsWith('#/readonly/')) {
                setIsReadOnly(true);
                setIsLoading(true);
                try {
                    const compressedData = hash.substring('#/readonly/'.length);
                    const sharedData = decompressViewData(compressedData);
                    loadSharedData(sharedData);
                    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                } catch (err) {
                     console.error("Failed to load shared view from hash:", err);
                     alert('載入分享的檢視時發生錯誤。');
                } finally {
                     setIsLoading(false);
                }
            }
        };

        initializeApp();
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (isReadOnly || urlParams.has('safe_mode')) return;
        
        let unsubUserData: (() => void) | undefined;
        let unsubAnalyses: (() => void) | undefined;

        if (fbUser) { 
            setIsLoading(true);
            unsubUserData = Firestore.onUserDataSnapshot(fbUser.uid, (data) => {
                // If we are currently restoring, ignore realtime updates to prevent conflicts
                if (isRestoring) return;

                const sanitizedData = sanitizeAndValidateData(data);
                if (sanitizedData) {
                    setAllUserData(sanitizedData);
                } else {
                    // Don't clear data if snapshot is null, just keep existing
                    // setAllUserData({ ... }); 
                }
                setIsLoading(false);
            });
            unsubAnalyses = Firestore.onAnalysesSnapshot(fbUser.uid, (analyses) => {
                if (isRestoring) return;
                setAllAnalyses(analyses);
            });
        } else if (isSignedIn === false) { 
            setIsLoading(false);
        }
        
        return () => {
            if (unsubUserData) unsubUserData();
            if (unsubAnalyses) unsubAnalyses();
        };
    }, [fbUser, isSignedIn, isReadOnly, isRestoring]);
    
    const persistAnalysis = useCallback((key: string, data: AnalysisData) => {
        if (isReadOnly || !fbUser) return;
        Firestore.saveAnalysis(fbUser.uid, key, data);
    }, [fbUser, isReadOnly]);

    const handleFilesProcessed = useCallback((processedFiles: { filename: string; posts: NormalizedPost[] }[]) => {
        const newDataSet: DataSet = {
            id: `ds-${Date.now()}-${Math.random()}`,
            name: processedFiles.map(f => f.filename).join(', '),
            uploadDate: new Date().toISOString(),
            posts: processedFiles.flatMap(f => f.posts),
            filenames: processedFiles.map(f => f.filename)
        };
        
        const updatedDataSets = [...dataSets, newDataSet];
        
        const newSelectionState: SelectionState = {
            enabledDataSetIds: {
                ...selectionState.enabledDataSetIds,
                [newDataSet.id]: true,
            },
            enabledPostPermalinks: { ...selectionState.enabledPostPermalinks },
        };
        
        newDataSet.posts.forEach(post => {
            newSelectionState.enabledPostPermalinks[post.permalink] = true;
        });

        updateStateAndPersist({ dataSets: updatedDataSets, selectionState: newSelectionState });
        setCurrentView('dashboard'); // Auto-switch to dashboard on new file
    }, [dataSets, selectionState, updateStateAndPersist]);


    const handleDeleteDataSet = (dataSetId: string) => {
        if (!window.confirm("確定要刪除這個資料集嗎？此操作無法復原。")) return;

        const updatedDataSets = dataSets.filter(ds => ds.id !== dataSetId);
        
        const updatedSelection = { ...selectionState };
        delete updatedSelection.enabledDataSetIds[dataSetId];
        const postsToRemove = dataSets.find(ds => ds.id === dataSetId)?.posts.map(p => p.permalink) || [];
        postsToRemove.forEach(permalink => {
            delete updatedSelection.enabledPostPermalinks[permalink];
        });

        updateStateAndPersist({ dataSets: updatedDataSets, selectionState: updatedSelection });
    };

    const handleClearAllData = () => {
        if (!window.confirm("警告：這將會清除您雲端所有上傳的資料、設定與分析，且無法復原。確定要繼續嗎？")) return;
        
        const emptyData = {
            dataSets: [],
            selectionState: { enabledDataSetIds: {}, enabledPostPermalinks: {} },
            allMonthlyFollowerData: {},
            baseFollowerData: { fbBase: '', igBase: '' },
            companyProfile: { companyName: '', instagramUrl: '', facebookUrl: '', logo: '' }
        };
        
        setAllUserData(emptyData);
        setAllAnalyses({});

        if (fbUser) {
             Firestore.updateUserData(fbUser.uid, emptyData);
        }
    };
    
     const handleClearDataByRange = (startDate: Date, endDate: Date) => {
        const start = startDate.getTime();
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        
        if (!window.confirm(`確定要刪除從 ${startDate.toLocaleDateString()} 到 ${endDate.toLocaleDateString()} 之間的所有貼文嗎？`)) return;

        const updatedDataSets = dataSets.map(ds => ({
            ...ds,
            posts: ds.posts.filter(post => {
                const postTime = post.publishTime.getTime();
                return !(postTime >= start && postTime <= end);
            })
        })).filter(ds => ds.posts.length > 0);

        updateStateAndPersist({ dataSets: updatedDataSets });
        alert('指定範圍內的資料已清除。');
    };
    
    const getAllDataForBackup = (): UserData & { analyses: Record<string, AnalysisData> } => {
        return {
            ...allUserData,
            analyses: allAnalyses
        };
    };

    const restoreAllData = async (dataToRestore: any) => {
        // Confirmation is now handled by the UI components (LocalDataManager/GoogleDriveSync)
        // to prevent browser blocking issues and improve UX.
        
        setIsRestoring(true);
        console.log("Starting Restore Process. Data received:", dataToRestore ? "Object present" : "Null/Undefined");
        
        try {
            const restoredUserData = sanitizeAndValidateData(dataToRestore);
            let restoredAnalyses = dataToRestore.analyses || {};
            
            // Legacy handling for analyses
            if (!dataToRestore.analyses && typeof dataToRestore === 'object') {
                 Object.keys(dataToRestore).forEach(key => {
                     if (key.startsWith('metaDashboardAnalysis_')) {
                         const analysisId = key.replace('metaDashboardAnalysis_', '');
                         try {
                             const analysisContent = typeof dataToRestore[key] === 'string' 
                                ? JSON.parse(dataToRestore[key]) 
                                : dataToRestore[key];
                             if (analysisContent) {
                                 restoredAnalyses[analysisId] = analysisContent;
                             }
                         } catch (e) {
                             console.warn("Failed to parse legacy analysis", key, e);
                         }
                     }
                 });
            }

            if (restoredUserData) {
                // Update Local State Immediately
                setAllUserData(restoredUserData);
                setAllAnalyses(restoredAnalyses);
                
                // Persist to Cloud/LocalStorage
                await updateStateAndPersist(restoredUserData);
                
                if(fbUser) {
                    const analysisPromises = Object.entries(restoredAnalyses).map(([key, value]) => {
                        return Firestore.saveAnalysis(fbUser.uid, key, value as AnalysisData);
                    });
                    await Promise.all(analysisPromises);
                }
                
                // Feedback
                if (restoredUserData.dataSets.length === 0) {
                    alert('還原成功，但備份檔案中沒有發現任何貼文資料。');
                } else {
                    alert(`還原成功！已載入 ${restoredUserData.dataSets.length} 個資料集。`);
                    setCurrentView('dashboard'); // Force switch to dashboard
                }
            } else {
                console.error("Sanitization failed. Returned null.");
                alert('還原失敗：備份檔案格式不正確或資料已損毀。請檢查檔案內容。');
            }
        } catch (error: any) {
            console.error("Error during data restoration:", error);
            alert(`還原過程中發生錯誤: ${error.message}`);
        } finally {
            setIsRestoring(false);
        }
    };

    const handleShareRequest = async (viewState: ReadOnlyViewState, analysis: AnalysisData, postsForView: NormalizedPost[]): Promise<{link: string; isShort: boolean}> => {
        const minimalDataSet: DataSet = {
            id: 'shared-view-data',
            name: `Shared View - ${new Date().toISOString()}`,
            uploadDate: new Date().toISOString(),
            posts: postsForView,
            filenames: [],
        };

        const enabledPostPermalinks = postsForView.reduce((acc, post) => {
            acc[post.permalink] = true;
            return acc;
        }, {} as Record<string, boolean>);

        const minimalSelectionState: SelectionState = {
            enabledDataSetIds: { [minimalDataSet.id]: true },
            enabledPostPermalinks,
        };

        const minimalUserData: UserData = {
            dataSets: [minimalDataSet],
            selectionState: minimalSelectionState, 
            allMonthlyFollowerData: allMonthlyFollowerData,
            baseFollowerData: baseFollowerData,
            companyProfile: companyProfile,
        };

        const sharedData: SharedData = {
            allData: minimalUserData,
            analyses: allAnalyses,
            viewState,
            analysis,
        };

        try {
            const link = await generateShortLink(sharedData);
            return { link, isShort: true };
        } catch (error: any) {
            console.warn('Short link error', error);
            const isPermissionError = error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission'));

            if (isPermissionError) {
                try {
                    const longLink = generateLongLink(sharedData);
                    return { link: longLink, isShort: false };
                } catch (longLinkError) {
                    console.error('Fallback error:', longLinkError);
                    throw new Error('產生分享連結時發生未知錯誤。');
                }
            } else {
                 throw new Error('產生分享連結時發生錯誤，請稍後再試。');
            }
        }
    };
    
    const handleExportData = () => {
        exportDataAsJson(getAllDataForBackup());
    };

    const handleImportData = async (file: File) => {
        console.log("Handling import for file:", file.name);
        try {
            const data = await importDataFromFile(file);
            // Don't log full data to console to keep it clean, just length check or summary
            console.log(`File parsed. Keys: ${Object.keys(data).join(', ')}`);
            await restoreAllData(data);
        } catch(err: any) {
            console.error("Import failed:", err);
            alert(`匯入失敗: ${err.message}`);
        }
    };

    const enabledPosts = useMemo(() => {
        return dataSets
            .flatMap(ds => ds.posts)
            .filter(post => selectionState.enabledPostPermalinks[post.permalink] === true);
    }, [dataSets, selectionState]);

    if (isLoading || isRestoring) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-zinc-50 dark:bg-zinc-900 gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zinc-500"></div>
                {isRestoring && <p className="text-zinc-600 dark:text-zinc-400 font-medium">正在還原資料，請稍候...</p>}
            </div>
        );
    }

    // Empty State - ONLY show if we are on dashboard view AND have no data.
    // If we are on DataManagement view, we want to see the management UI even if empty.
    if (dataSets.length === 0 && !isReadOnly && currentView === 'dashboard') {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-center items-center p-4">
                 <div className="w-full max-w-2xl text-center mb-8">
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 tracking-tight">歡迎來到社群儀表板</h1>
                    <p className="text-zinc-500 dark:text-zinc-400">請上傳您的 Meta 報表以開始分析</p>
                 </div>
                 <FileUpload onFilesProcessed={handleFilesProcessed} />
                 <div className="max-w-2xl mx-auto w-full mt-8">
                    <LocalDataManager 
                        onExportData={handleExportData}
                        onImportData={handleImportData}
                        onClearAllData={handleClearAllData}
                        onClearDataByRange={handleClearDataByRange}
                    />
                 </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex font-inter">
            <Sidebar 
                currentView={currentView}
                setView={setCurrentView}
                profile={companyProfile}
                isReadOnly={isReadOnly}
                isCollapsed={isSidebarCollapsed}
                toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                themeColor={themeColor}
                setThemeColor={setThemeColor}
            />
            
            <main 
                className={`flex-1 transition-all duration-300 ease-in-out px-6 py-8 ${
                    isSidebarCollapsed ? 'ml-[72px]' : 'ml-[260px]'
                }`}
            >
                <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    
                    {/* Top Bar / Breadcrumb context could go here */}
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                {currentView === 'dashboard' ? '儀表板總覽' : '資料集管理'}
                            </h2>
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                                {currentView === 'dashboard' ? '檢視您的社群成效與分析洞察' : '管理您的上傳檔案與基本設定'}
                            </p>
                        </div>
                    </div>

                    {currentView === 'dashboard' ? (
                        <Dashboard 
                            posts={enabledPosts}
                            allMonthlyFollowerData={allMonthlyFollowerData}
                            baseFollowerData={baseFollowerData}
                            isReadOnly={isReadOnly}
                            readOnlyViewState={readOnlyViewState}
                            readOnlyAnalysis={readOnlyAnalysis}
                            onDateRangeLabelChange={setDateRangeLabel}
                            allAnalyses={allAnalyses}
                            onSaveAnalysis={persistAnalysis}
                            onShareRequest={handleShareRequest}
                        />
                    ) : (
                        <DataManagementPage 
                            dataSets={dataSets}
                            selectionState={selectionState}
                            onSelectionChange={(newState) => updateStateAndPersist({ selectionState: newState })}
                            onAddMoreFiles={handleFilesProcessed}
                            onClearAllData={handleClearAllData}
                            onClearDataByRange={handleClearDataByRange}
                            onDeleteDataSet={handleDeleteDataSet}
                            allMonthlyFollowerData={allMonthlyFollowerData}
                            onMonthlyFollowerDataUpdate={(newData) => updateStateAndPersist({ allMonthlyFollowerData: newData })}
                            baseFollowerData={baseFollowerData}
                            onBaseFollowerDataUpdate={(newData) => updateStateAndPersist({ baseFollowerData: newData })}
                            companyProfile={companyProfile}
                            onCompanyProfileUpdate={(newProfile) => updateStateAndPersist({ companyProfile: newProfile })}
                            onExportData={handleExportData}
                            onImportData={handleImportData}
                            onBackupRequest={getAllDataForBackup}
                            onRestoreRequest={restoreAllData}
                        />
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;
