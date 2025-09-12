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
                    
                    console.log(`IndexedDB current version: ${currentVersion}, has object store: ${hasObjectStore}`);
                    
                    let targetVersion = currentVersion;
                    if (!hasObjectStore) {
                        targetVersion = Math.max(currentVersion + 1, 1);
                        console.log(`Need to create object store, upgrading to version ${targetVersion}`);
                    }
                    
                    // Now open with the appropriate version
                    const request = indexedDB.open(INDEXEDDB_NAME, targetVersion);
                    
                    request.onerror = () => {
                        console.log('Error opening IndexedDB for migration');
                        resolve(false);
                    };
                    
                    let migrationPerformed = false;
                    
                    request.onupgradeneeded = (event) => {
                        console.log('IndexedDB onupgradeneeded event fired - creating object store');
                        const db = event.target.result;
                        
                        // Create object store if it doesn't exist
                        if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                            const objectStore = db.createObjectStore(OBJECT_STORE_NAME);
                            console.log('Created object store:', OBJECT_STORE_NAME);
                        }
                        
                        // Perform migration within the upgrade transaction
                        performMigration(event.target.transaction, saveData);
                        migrationPerformed = true;
                    };
                    
                    request.onsuccess = (event) => {
                        console.log('IndexedDB onsuccess event fired');
                        const db = event.target.result;
                        
                        if (!migrationPerformed) {
                            console.log('Migration was not performed in upgrade, checking if we can do it now');
                            // Database exists but migration didn't happen in upgrade - do it now
                            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                                console.log('Object store does not exist, cannot migrate without upgrade');
                                db.close();
                                resolve(false);
                                return;
                            }
                            
                            console.log('Performing migration in regular transaction');
                            const transaction = db.transaction([OBJECT_STORE_NAME], 'readwrite');
                            
                            performMigration(transaction, saveData);
                            
                            transaction.oncomplete = () => {
                                console.log('Migration transaction completed successfully');
                                db.close();
                                resolve(true);
                            };
                            
                            transaction.onerror = (errorEvent) => {
                                console.log('Migration transaction error:', errorEvent.target.error);
                                db.close();
                                resolve(false);
                            };
                        } else {
                            console.log('Migration was performed in upgrade transaction');
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
                console.log('Error during save data migration:', error);
                resolve(false);
            }
        });
    }

    /**
     * Perform the actual migration within a transaction
     */
    function performMigration(transaction, saveData) {
        const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
        
        console.log('Starting migration of', Object.keys(saveData).length, 'files');
        
        // Convert save data to files in the _savedata directory
        Object.keys(saveData).forEach((key) => {
            const filePath = `${SAVE_DATA_PATH}/${key}`;
            let fileData = saveData[key];
            
            console.log(`Migrating file: ${key} -> ${filePath}`);
            
            // Convert data to appropriate format for storage
            if (typeof fileData === 'object') {
                fileData = JSON.stringify(fileData);
            }
            
            // Convert string to Uint8Array for file contents
            const encoder = new TextEncoder();
            const contentsArray = encoder.encode(fileData);
            
            console.log(`File size:`, contentsArray.length, 'bytes');
            
            // Create file object with proper Emscripten filesystem structure
            const fileObject = {
                timestamp: Date.now(),  // Current timestamp for migration
                mode: 33188,           // Regular file mode (0100644 in octal)
                contents: contentsArray
            };
            
            const putRequest = objectStore.put(fileObject, filePath);
            
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
            console.log('Migration transaction completed successfully');
        };
        
        transaction.onerror = (errorEvent) => {
            console.log('Migration transaction error:', errorEvent.target.error);
        };
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