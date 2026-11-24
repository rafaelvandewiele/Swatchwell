import { describe, expect, it } from "vitest";
import { collectStorageObjectPaths, type StorageTreeLister } from "./storage-cleanup";

describe("collectStorageObjectPaths", () => {
  it("walks nested virtual folders and returns only actual object paths", async () => {
    const pages: Record<string, Array<{ name: string; id?: string | null }>> = {
      "user-1": [
        { name: "item-1", id: null },
        { name: "profile.jpg", id: "file-1" },
      ],
      "user-1/item-1": [
        { name: "photo.webp", id: "file-2" },
        { name: "variants", id: null },
      ],
      "user-1/item-1/variants": [
        { name: "thumbnail.webp", id: "file-3" },
      ],
    };
    const list: StorageTreeLister = async (directory) => ({
      data: pages[directory] ?? [],
      error: null,
    });

    await expect(collectStorageObjectPaths("user-1", list)).resolves.toEqual([
      "user-1/profile.jpg",
      "user-1/item-1/photo.webp",
      "user-1/item-1/variants/thumbnail.webp",
    ]);
  });

  it("continues through every page without skipping entries", async () => {
    const calls: Array<{ directory: string; offset: number }> = [];
    const list: StorageTreeLister = async (directory, page) => {
      calls.push({ directory, offset: page.offset });
      if (page.offset === 0) {
        return {
          data: [
            { name: "one.jpg", id: "1" },
            { name: "two.jpg", id: "2" },
          ],
          error: null,
        };
      }
      if (page.offset === 2) {
        return { data: [{ name: "three.jpg", id: "3" }], error: null };
      }
      return { data: [], error: null };
    };

    await expect(collectStorageObjectPaths("user-1", list, 2)).resolves.toEqual([
      "user-1/one.jpg",
      "user-1/two.jpg",
      "user-1/three.jpg",
    ]);
    expect(calls.map((call) => call.offset)).toEqual([0, 2]);
  });

  it("fails closed on list errors and invalid entry names", async () => {
    const failed: StorageTreeLister = async () => ({
      data: null,
      error: new Error("storage unavailable"),
    });
    await expect(collectStorageObjectPaths("user-1", failed)).rejects.toThrow("storage unavailable");

    const invalid: StorageTreeLister = async () => ({
      data: [{ name: "../other-user.jpg", id: "file-1" }],
      error: null,
    });
    await expect(collectStorageObjectPaths("user-1", invalid)).rejects.toThrow("invalid child name");
  });

  it("rejects invalid roots and page sizes", async () => {
    const empty: StorageTreeLister = async () => ({ data: [], error: null });
    await expect(collectStorageObjectPaths(" ", empty)).rejects.toThrow("storage root");
    await expect(collectStorageObjectPaths("user-1", empty, 0)).rejects.toThrow("page size");
  });
});
