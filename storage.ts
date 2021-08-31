export interface DatabaseInterface<T> {
  saveDatastoreEntry(dbKey: string, entity: T): Promise<void>;

  readDatastoreEntry(dbKey: string): Promise<T | undefined>;

  updateDatastoreEntry(dbKey: string, modifier: (v: T | undefined) => T | undefined): Promise<T | undefined>;
}

