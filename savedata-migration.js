/**
 * Save Data Migration Utility
 * Handles migration from localStorage to IndexedDB for Deltarune save data
 */

(function() {
    'use strict';

    const SAVE_DATA_PATH = '/_savedata';
    const LOCALSTORAGE_PREFIX = 'deltarune_save_';
    const INDEXEDDB_NAME = 'emscripten_filesystem';
    const OBJECT_STORE_NAME = 'FILES';

    /**
     * Check if IndexedDB has save data
     */
    async function hasIndexedDBSaveData() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(INDEXEDDB_NAME);
                
                request.onerror = () => {
                    console.log('IndexedDB not available or error opening database');
                    resolve(false);
                };
                
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    
                    try {
                        // Check if the object store exists
                        if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                            db.close();
                            resolve(false);
                            return;
                        }
                        
                        const transaction = db.transaction([OBJECT_STORE_NAME], 'readonly');
                        const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
                        
                        // Check for files that start with the save data path
                        const files = [];
                        const request = objectStore.openCursor();
                        
                        request.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (cursor) {
                                if (cursor.key.startsWith(SAVE_DATA_PATH)) {
                                    files.push(cursor.key);
                                }
                                cursor.continue();
                            } else {
                                // No more entries
                                db.close();
                                const hasSaveData = files.length > 0;
                                console.log(`IndexedDB save data check: found ${files.length} files`);
                                resolve(hasSaveData);
                            }
                        };
                        
                        request.onerror = () => {
                            db.close();
                            resolve(false);
                        };
                    } catch (error) {
                        db.close();
                        console.log('Error checking IndexedDB contents:', error);
                        resolve(false);
                    }
                };
                
                request.onupgradeneeded = () => {
                    // Database doesn't exist or needs upgrade
                    console.log('IndexedDB needs upgrade, no save data exists');
                    resolve(false);
                };
            } catch (error) {
                console.log('Error checking IndexedDB:', error);
                resolve(false);
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
                        try {
                            // Try to parse as JSON first, fallback to raw string
                            saveData[saveDataKey] = JSON.parse(value);
                        } catch (e) {
                            saveData[saveDataKey] = value;
                        }
                    }
                }
            }
        } catch (error) {
            console.log('Error reading localStorage:', error);
        }
        
        return saveData;
    }

    /**
     * Migrate save data from localStorage to IndexedDB
     */
    async function migrateSaveDataToIndexedDB(saveData) {
        return new Promise((resolve, reject) => {
            try {
                // First, try to open with version 1 to trigger upgrade if needed
                const request = indexedDB.open(INDEXEDDB_NAME, 1);
                
                request.onerror = () => {
                    console.log('Error opening IndexedDB for migration');
                    resolve(false);
                };
                
                request.onupgradeneeded = (event) => {
                    console.log('Creating IndexedDB object store for migration');
                    const db = event.target.result;
                    
                    // Create object store if it doesn't exist
                    if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                        const objectStore = db.createObjectStore(OBJECT_STORE_NAME);
                        console.log('Created object store:', OBJECT_STORE_NAME);
                    }
                    
                    // Perform migration within the upgrade transaction
                    const transaction = event.target.transaction;
                    const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
                    
                    console.log('Starting migration of', Object.keys(saveData).length, 'files');
                    
                    // Convert save data to files in the _savedata directory
                    Object.keys(saveData).forEach((key) => {
                        const filePath = `${SAVE_DATA_PATH}/${key}`;
                        let fileData = saveData[key];
                        
                        console.log(`Migrating file: ${key} -> ${filePath}`);
                        console.log(`File data:`, fileData);
                        
                        // Convert data to appropriate format for storage
                        if (typeof fileData === 'object') {
                            fileData = JSON.stringify(fileData);
                        }
                        
                        // Convert string to Uint8Array
                        const encoder = new TextEncoder();
                        const uint8Array = encoder.encode(fileData);
                        
                        console.log(`File size:`, uint8Array.length, 'bytes');
                        
                        const putRequest = objectStore.put(uint8Array, filePath);
                        
                        putRequest.onsuccess = () => {
                            console.log(`Successfully migrated save file: ${filePath}`);
                        };
                        
                        putRequest.onerror = (errorEvent) => {
                            console.log(`Error migrating save file: ${filePath}`, errorEvent.target.error);
                        };
                    });
                    
                    if (Object.keys(saveData).length === 0) {
                        console.log('No save data to migrate');
                    }
                    
                    transaction.oncomplete = () => {
                        console.log('Migration transaction completed');
                    };
                    
                    transaction.onerror = (errorEvent) => {
                        console.log('Migration transaction error:', errorEvent.target.error);
                    };
                };
                
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    console.log('IndexedDB opened successfully');
                    db.close();
                    resolve(true);
                };
            } catch (error) {
                console.log('Error during save data migration:', error);
                resolve(false);
            }
        });
    }

    /**
     * Main migration function
     */
    async function checkAndMigrateSaveData() {
        try {
            console.log('Checking for save data migration...');
            
            // Check if IndexedDB already has save data
            const hasIDBSaveData = await hasIndexedDBSaveData();
            
            if (hasIDBSaveData) {
                console.log('IndexedDB already contains save data, skipping migration');
                return;
            }
            
            console.log('No save data found in IndexedDB, checking localStorage...');
            
            // Get save data from localStorage
            const localSaveData = getLocalStorageSaveData();
            
            if (Object.keys(localSaveData).length === 0) {
                console.log('No save data found in localStorage, skipping migration');
                return;
            }
            
            console.log(`Found ${Object.keys(localSaveData).length} save file(s) in localStorage, migrating...`);
            
            // Migrate save data to IndexedDB
            const migrationSuccess = await migrateSaveDataToIndexedDB(localSaveData);
            
            if (migrationSuccess) {
                console.log('Save data migration completed successfully');
            } else {
                console.log('Save data migration failed');
            }
        } catch (error) {
            console.log('Error during save data migration check:', error);
        }
    }

    // Export the migration function to global scope
    window.checkAndMigrateSaveData = checkAndMigrateSaveData;

    // Auto-run migration check when the script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndMigrateSaveData);
    } else {
        checkAndMigrateSaveData();
    }
})();