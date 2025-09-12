/**
 * Save Data Synchronization Utility
 * Handles bidirectional synchronization between localStorage and IndexedDB for Deltarune save data
 */

(function() {
    'use strict';

    const SAVE_DATA_PATH = '/_savedata';
    const LOCALSTORAGE_PREFIX = 'deltarune_save_';
    const INDEXEDDB_NAME = 'emscripten_filesystem';
    const OBJECT_STORE_NAME = 'FILES';

    /**
     * Get save data from IndexedDB
     */
    async function getIndexedDBSaveData() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(INDEXEDDB_NAME);
                
                request.onerror = () => {
                    console.log('IndexedDB not available or error opening database');
                    resolve({});
                };
                
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    
                    try {
                        // Check if the object store exists
                        if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                            db.close();
                            resolve({});
                            return;
                        }
                        
                        const transaction = db.transaction([OBJECT_STORE_NAME], 'readonly');
                        const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
                        
                        // Get all files that start with the save data path
                        const saveData = {};
                        const request = objectStore.openCursor();
                        
                        request.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (cursor) {
                                if (cursor.key.startsWith(SAVE_DATA_PATH)) {
                                    const fileName = cursor.key.replace(SAVE_DATA_PATH + '/', '');
                                    const fileData = cursor.value;
                                    
                                    // Extract content from Emscripten filesystem structure
                                    if (fileData && fileData.contents) {
                                        const decoder = new TextDecoder();
                                        const textContent = decoder.decode(fileData.contents);
                                        saveData[fileName] = {
                                            content: textContent,
                                            timestamp: fileData.timestamp || 0
                                        };
                                    }
                                }
                                cursor.continue();
                            } else {
                                // No more entries
                                db.close();
                                console.log(`IndexedDB save data: found ${Object.keys(saveData).length} files`);
                                resolve(saveData);
                            }
                        };
                        
                        request.onerror = () => {
                            db.close();
                            resolve({});
                        };
                    } catch (error) {
                        db.close();
                        console.log('Error reading IndexedDB contents:', error);
                        resolve({});
                    }
                };
                
                request.onupgradeneeded = () => {
                    // Database doesn't exist
                    console.log('IndexedDB does not exist');
                    resolve({});
                };
            } catch (error) {
                console.log('Error accessing IndexedDB:', error);
                resolve({});
            }
        });
    }

    /**
     * Get save data from localStorage
     */
    function getLocalStorageSaveData() {
        const saveData = {};
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(LOCALSTORAGE_PREFIX)) {
                    const saveDataKey = key.replace(LOCALSTORAGE_PREFIX, '');
                    const value = localStorage.getItem(key);
                    if (value) {
                        let content = value;
                        try {
                            // Try to parse as JSON first, fallback to raw string
                            const parsed = JSON.parse(value);
                            content = parsed;
                        } catch (e) {
                            // Keep as string
                        }
                        
                        // Store with metadata including timestamp
                        const timestamp = Date.now(); // For localStorage, we'll use current time as we don't have stored timestamps
                        saveData[saveDataKey] = {
                            content: content,
                            timestamp: timestamp
                        };
                    }
                }
            }
        } catch (error) {
            console.log('Error reading localStorage:', error);
        }
        
        return saveData;
    }

    /**
     * Save data to localStorage
     */
    function saveToLocalStorage(fileName, content) {
        try {
            const key = LOCALSTORAGE_PREFIX + fileName;
            let valueToStore = content;
            
            if (typeof content === 'object') {
                valueToStore = JSON.stringify(content);
            }
            
            localStorage.setItem(key, valueToStore);
            console.log(`Saved to localStorage: ${fileName}`);
            return true;
        } catch (error) {
            console.log(`Error saving to localStorage: ${fileName}`, error);
            return false;
        }
    }

    /**
     * Save data to IndexedDB
     */
    async function saveToIndexedDB(fileName, content) {
        return new Promise((resolve, reject) => {
            try {
                // First check if database exists and what version it is
                const versionRequest = indexedDB.open(INDEXEDDB_NAME);
                
                versionRequest.onerror = () => {
                    console.log('Error checking IndexedDB version');
                    resolve(false);
                };
                
                versionRequest.onsuccess = (event) => {
                    const testDb = event.target.result;
                    const currentVersion = testDb.version;
                    const hasObjectStore = testDb.objectStoreNames.contains(OBJECT_STORE_NAME);
                    testDb.close();
                    
                    let targetVersion = currentVersion;
                    if (!hasObjectStore) {
                        targetVersion = Math.max(currentVersion + 1, 1);
                    }
                    
                    // Now open with the appropriate version
                    const request = indexedDB.open(INDEXEDDB_NAME, targetVersion);
                    
                    request.onerror = () => {
                        console.log('Error opening IndexedDB for saving');
                        resolve(false);
                    };
                    
                    let savePerformed = false;
                    
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        
                        // Create object store if it doesn't exist
                        if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                            const objectStore = db.createObjectStore(OBJECT_STORE_NAME);
                            console.log('Created object store:', OBJECT_STORE_NAME);
                        }
                        
                        // Perform save within the upgrade transaction
                        performIndexedDBSave(event.target.transaction, fileName, content);
                        savePerformed = true;
                    };
                    
                    request.onsuccess = (event) => {
                        const db = event.target.result;
                        
                        if (!savePerformed) {
                            // Database exists but save didn't happen in upgrade - do it now
                            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                                console.log('Object store does not exist, cannot save without upgrade');
                                db.close();
                                resolve(false);
                                return;
                            }
                            
                            const transaction = db.transaction([OBJECT_STORE_NAME], 'readwrite');
                            
                            performIndexedDBSave(transaction, fileName, content);
                            
                            transaction.oncomplete = () => {
                                console.log(`Successfully saved to IndexedDB: ${fileName}`);
                                db.close();
                                resolve(true);
                            };
                            
                            transaction.onerror = (errorEvent) => {
                                console.log(`Error saving to IndexedDB: ${fileName}`, errorEvent.target.error);
                                db.close();
                                resolve(false);
                            };
                        } else {
                            console.log(`Successfully saved to IndexedDB during upgrade: ${fileName}`);
                            db.close();
                            resolve(true);
                        }
                    };
                };
                
                versionRequest.onupgradeneeded = () => {
                    // This should not happen for the version check
                    console.log('Unexpected upgrade needed during version check');
                };
            } catch (error) {
                console.log('Error during IndexedDB save:', error);
                resolve(false);
            }
        });
    }

    /**
     * Perform the actual IndexedDB save within a transaction
     */
    function performIndexedDBSave(transaction, fileName, content) {
        const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
        const filePath = `${SAVE_DATA_PATH}/${fileName}`;
        
        // Convert content to appropriate format for storage
        let fileData = content;
        if (typeof fileData === 'object') {
            fileData = JSON.stringify(fileData);
        }
        
        // Convert string to Uint8Array for file contents
        const encoder = new TextEncoder();
        const contentsArray = encoder.encode(fileData);
        
        // Create file object with proper Emscripten filesystem structure
        const fileObject = {
            timestamp: Date.now(),  // Current timestamp
            mode: 33188,           // Regular file mode (0100644 in octal)
            contents: contentsArray
        };
        
        const putRequest = objectStore.put(fileObject, filePath);
        
        putRequest.onsuccess = () => {
            console.log(`File saved to IndexedDB: ${filePath}`);
        };
        
        putRequest.onerror = (errorEvent) => {
            console.log(`Error saving file to IndexedDB: ${filePath}`, errorEvent.target.error);
        };
    }
    /**
     * Synchronize save data between localStorage and IndexedDB
     */
    async function synchronizeSaveData() {
        try {
            console.log('Starting save data synchronization...');
            
            // Get save data from both storage systems
            const [localSaveData, indexedDBSaveData] = await Promise.all([
                Promise.resolve(getLocalStorageSaveData()),
                getIndexedDBSaveData()
            ]);
            
            console.log(`Found ${Object.keys(localSaveData).length} files in localStorage`);
            console.log(`Found ${Object.keys(indexedDBSaveData).length} files in IndexedDB`);
            
            // Get all unique file names from both storages
            const allFileNames = new Set([
                ...Object.keys(localSaveData),
                ...Object.keys(indexedDBSaveData)
            ]);
            
            if (allFileNames.size === 0) {
                console.log('No save data found in either storage system');
                return;
            }
            
            console.log(`Synchronizing ${allFileNames.size} unique files...`);
            
            // Synchronize each file
            for (const fileName of allFileNames) {
                const localFile = localSaveData[fileName];
                const indexedDBFile = indexedDBSaveData[fileName];
                
                if (localFile && indexedDBFile) {
                    // File exists in both - compare timestamps or just ensure both are up to date
                    console.log(`File exists in both storages: ${fileName}`);
                    // For now, we'll keep both as they are since we can't determine which is newer
                    // In a real implementation, you might want to compare content or ask user
                    continue;
                } else if (localFile && !indexedDBFile) {
                    // File only in localStorage - copy to IndexedDB
                    console.log(`Copying from localStorage to IndexedDB: ${fileName}`);
                    await saveToIndexedDB(fileName, localFile.content);
                } else if (!localFile && indexedDBFile) {
                    // File only in IndexedDB - copy to localStorage
                    console.log(`Copying from IndexedDB to localStorage: ${fileName}`);
                    saveToLocalStorage(fileName, indexedDBFile.content);
                }
            }
            
            console.log('Save data synchronization completed');
        } catch (error) {
            console.log('Error during save data synchronization:', error);
        }
    }

    // Export the synchronization function to global scope
    window.synchronizeSaveData = synchronizeSaveData;

    // Auto-run synchronization when the script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', synchronizeSaveData);
    } else {
        synchronizeSaveData();
    }
})();