export type UpgradeCallbackType = (db: IDBDatabase, oldVersion: number, newVersion: number) => void;

export const openDB = (dbName: string, dbVersion: number, upgradeCallback?: UpgradeCallbackType): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (indexedDB) {
      let db: IDBDatabase;
      const req: IDBOpenDBRequest = indexedDB.open(dbName, dbVersion);
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
      req.onerror = (ev: Event) => {
        reject(`Unable to open database`);
      };
      req.onupgradeneeded = (ev: IDBVersionChangeEvent) => {
        db = req.result;
        const oldVersion: number = ev.oldVersion;
        const newVersion: number = ev.newVersion || 1;
        if (upgradeCallback) {
          upgradeCallback(db, oldVersion, newVersion);
        }
      };
    } else {
      reject('Indexed not supported in this platform.')
    }
  })
}

export const createObjectStore = ({
  db,
  storeName,
  primaryKey,
  autoIncrement = false,
}: {
  db: IDBDatabase
  storeName: string;
  primaryKey: string;
  autoIncrement?: boolean;
}): IDBObjectStore => {
  return db.createObjectStore(storeName, { keyPath: primaryKey, autoIncrement });
}


export const createIndex = ({
  store,
  indexKey,
  unique = false,
  multiEntry = false,
}: {
  store: IDBObjectStore;
  indexKey: string;
  unique?: boolean;
  multiEntry?: boolean;
}): IDBIndex => {
  return store.createIndex(indexKey, indexKey, { multiEntry, unique });
}

export const getObjectStore = ({ db, storeName, readOnlyMode = false }: { db: IDBDatabase, storeName: string; readOnlyMode?: boolean }): IDBObjectStore => {
  const tx = db.transaction(storeName, readOnlyMode ? 'readonly' : 'readwrite');
  return tx.objectStore(storeName);
}

export const clearObjectStore = ({ db, storeName }: { db: IDBDatabase, storeName: string }): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const store = getObjectStore({ db, storeName });
    const req = store.clear();
    req.onsuccess = () => {
      resolve(true);
    };
    req.onerror = () => {
      reject('Error on clearing object store');
    };
  });
}

export const find = ({
  db,
  storeName,
  indexName,
  skip = 0,
  limit = Math.pow(2, 32),
  desc = false,
  unique = false,
  value,
  valueStart,
  valueStartAfter,
  valueEnd,
  valueEndBefore,
  filter,
  map,
}: {
  db: IDBDatabase,
  storeName: string,
  skip?: number,
  limit?: number,
  indexName?: string,
  desc?: boolean,
  unique?: boolean,
  value?: IDBValidKey,
  valueStart?: IDBValidKey,
  valueStartAfter?: IDBValidKey,
  valueEnd?: IDBValidKey,
  valueEndBefore?: IDBValidKey,
  filter?: (object: any) => boolean,
  map?: (object: any) => any,
}): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const cursorProcessor = (cursor: IDBCursorWithValue) => {
      if (cursor) {
        if (!filter && skip) {
          cursor.advance(skip);
          skip = 0;
        }
        skip = skip || 0;
        limit = limit || 0;
        const array: any[] = [];
        while (cursor && limit > 0) {
          let object = cursor.value;
          if (filter) {
            if (!filter(object)) {
              cursor.continue();
              continue;
            }
          }
          if (skip <= 0) {
            array.push(map ? map(object) : object);
            limit--;
          } else {
            skip--;
          }
          cursor.continue();
        }
        return array;
      } else {
        return [];
      }
    };

    openCursor({
      db,
      storeName,
      indexName,
      desc,
      unique,
      value,
      valueStart,
      valueStartAfter,
      valueEnd,
      valueEndBefore,
      processor: cursorProcessor,
    }).then((items: any[]) => {
      resolve(items);
    });

  });
}

export const getAllObjects = ({
  db,
  storeName,
  indexName,
  count,
  value,
  valueStart,
  valueStartAfter,
  valueEnd,
  valueEndBefore,
}: {
  db: IDBDatabase,
  storeName: string,
  indexName?: string,
  count?: number,
  value?: IDBValidKey,
  valueStart?: IDBValidKey,
  valueStartAfter?: IDBValidKey,
  valueEnd?: IDBValidKey,
  valueEndBefore?: IDBValidKey,
}): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const store: IDBObjectStore = getObjectStore({ db, storeName, readOnlyMode: true });
    const indexStore: IDBIndex | null = indexName ? store.index(indexName) : null;
    const keyRange = createKeyRange({ value, valueStart, valueStartAfter, valueEnd, valueEndBefore });
    let req = (indexStore || (store as any)).getAll(keyRange, count);
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject('Error on get all objects from store');
    };
  });
}

export const countObjects = ({
  db,
  storeName,
  indexName,
  count,
  value,
  valueStart,
  valueStartAfter,
  valueEnd,
  valueEndBefore,
}: {
  db: IDBDatabase,
  storeName: string,
  indexName?: string,
  count?: number,
  value?: IDBValidKey,
  valueStart?: IDBValidKey,
  valueStartAfter?: IDBValidKey,
  valueEnd?: IDBValidKey,
  valueEndBefore?: IDBValidKey,
}): Promise<number> => {
  return new Promise((resolve, reject) => {
    const store = getObjectStore({ db, storeName, readOnlyMode: true });
    const indexStore = indexName ? store.index(indexName) : null;
    const keyRange = createKeyRange({ value, valueStart, valueStartAfter, valueEnd, valueEndBefore });
    let req = (indexStore || store).count(keyRange);
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject('Error on count objects from store');
    };

  });

}

export const get = ({ db, storeName, key }: { db: IDBDatabase, storeName: string; key: string }): Promise<any> => {
  return new Promise((resolve, reject) => {
    const store = getObjectStore({ db, storeName, readOnlyMode: true });
    const req = store.get(key);
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject('Error on get object from store');
    };
  });

}

export const insert = ({ db, key, storeName, data, store }: { db: IDBDatabase, key: string; storeName: string; data: any; store?: IDBObjectStore }): Promise<any> => {
  return new Promise((resolve, reject) => {
    const objectStore = store || getObjectStore({ db, storeName });
    const req = objectStore.add(data);
    req.onsuccess = () => {
      resolve(data);
    };
    req.onerror = () => {
      reject('Error on add object to store');
    };
  });

}

export const update = ({ db, key, storeName, data, store }: { db: IDBDatabase, key: string; storeName: string; data: any; store?: IDBObjectStore }): Promise<any> => {
  return new Promise((resolve, reject) => {
    const objectStore = store || getObjectStore({ db, storeName });
    const req = objectStore.put(data, createKeyRange({ value: key }) as IDBValidKey);
    req.onsuccess = () => {
      resolve(key);
    };
    req.onerror = () => {
      reject('Error on put object to store');
    };
  });

}

export const remove = ({ db, key, storeName }: { db: IDBDatabase, key: string; storeName: string }): Promise<any> => {
  return new Promise((resolve, reject) => {
    const store = getObjectStore({ db, storeName });
    const req = store.delete(createKeyRange({ value: key }) as IDBKeyRange);
    req.onsuccess = () => {
      resolve(key);
    };
    req.onerror = () => {
      reject('Error on delete object to store');
    };
  });
}

export const openCursor = ({
  db,
  storeName,
  processor,
  indexName,
  desc = false,
  unique = false,
  value,
  valueStart,
  valueStartAfter,
  valueEnd,
  valueEndBefore,
}: {
  db: IDBDatabase,
  storeName: string;
  processor: (cursor: IDBCursorWithValue) => any[];
  indexName?: string;
  desc?: boolean;
  unique?: boolean;
  value?: IDBValidKey;
  valueStart?: IDBValidKey;
  valueStartAfter?: IDBValidKey;
  valueEnd?: IDBValidKey;
  valueEndBefore?: IDBValidKey;
}): Promise<any> => {
  return new Promise((resolve, reject) => {
    const queryDirection = createQueryDirection({ desc, unique });
    const keyRange = createKeyRange({ value, valueStart, valueStartAfter, valueEnd, valueEndBefore });
    const store = getObjectStore({ db, storeName, readOnlyMode: true });
    const indexStore = indexName ? store.index(indexName) : null;
    let cursorReq: IDBRequest = (indexStore || store).openCursor(keyRange, queryDirection);
    if (cursorReq) {
      cursorReq.onsuccess = (ev: any) => {
        const cursor: IDBCursorWithValue = cursorReq.result;
        if (processor) {
          const items = processor(cursor);
          resolve(items || []);
        }
        resolve([]);
      };
      cursorReq.onerror = (ev: any) => {
        reject('Error! unable to obtain the cursor');
      };
    }
  });

}

export const createKeyRange = ({
  value,
  valueStart,
  valueStartAfter,
  valueEnd,
  valueEndBefore,
}: {
  value?: IDBValidKey;
  valueStart?: IDBValidKey;
  valueStartAfter?: IDBValidKey;
  valueEnd?: IDBValidKey;
  valueEndBefore?: IDBValidKey;
}): IDBKeyRange | IDBValidKey | undefined => {
  let keyRange: IDBKeyRange | IDBValidKey | undefined;
  if (value) {
    keyRange = IDBKeyRange.only(value);
  } else if (valueStart || valueStartAfter) {
    keyRange = IDBKeyRange.lowerBound(valueStart || valueStartAfter, !!valueStartAfter);
  } else if (valueEnd || valueEndBefore) {
    keyRange = IDBKeyRange.upperBound(valueEnd || valueEndBefore, !!valueEndBefore);
  } else if (valueStart || valueStartAfter || valueEnd || valueEndBefore) {
    keyRange = IDBKeyRange.bound(valueStart || valueStartAfter, valueEnd || valueEndBefore, !!valueStartAfter, !!valueEndBefore);
  }
  return keyRange;
}

export const createQueryDirection = ({ desc = false, unique = false }: { desc?: boolean; unique?: boolean }): IDBCursorDirection => {
  const direction: IDBCursorDirection = desc ? (unique ? 'prevunique' : 'prev') : unique ? 'next' : 'nextunique';
  return direction || null;
}


export const deleteDB = (dbName: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const deleteReq = indexedDB.deleteDatabase(dbName);
    deleteReq.onsuccess = () => {
      resolve('DB deleted');
    };
    deleteReq.onerror = (errorEvent: Event) => {
      reject(`Unable to delete database`);
    };

  });
}


