export interface StorageTreeEntry {
  name: string;
  id?: string | null;
}

export interface StorageListPage {
  limit: number;
  offset: number;
}

export type StorageTreeLister = (
  directory: string,
  page: StorageListPage,
) => Promise<{ data: StorageTreeEntry[] | null; error: unknown | null }>;

export async function collectStorageObjectPaths(
  root: string,
  list: StorageTreeLister,
  pageSize = 1000,
): Promise<string[]> {
  if (!root.trim()) throw new Error("A storage root is required.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error("A positive page size is required.");
  }

  const pendingDirectories = [root];
  const objectPaths: string[] = [];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()!;
    let offset = 0;

    while (true) {
      const { data, error } = await list(directory, { limit: pageSize, offset });
      if (error) throw error;

      const entries = data ?? [];
      for (const entry of entries) {
        if (
          !entry.name ||
          entry.name === "." ||
          entry.name === ".." ||
          entry.name.includes("/")
        ) {
          throw new Error("Storage returned an invalid child name.");
        }

        const path = directory + "/" + entry.name;
        if (entry.id == null) pendingDirectories.push(path);
        else objectPaths.push(path);
      }

      if (entries.length < pageSize) break;
      offset += entries.length;
    }
  }

  return objectPaths;
}
