// Browser cache (IndexedDB) of built terrain geometry. Building a map's terrain mesh (terrainMesh.ts) is pure
// per-vertex CPU work - about half the boot for all maps - and its result only changes with the code or data, so a
// production build keys entries by its own bundle URL (hashed, and the map data is bundled in): any update misses
// and rebuilds, and entries of older builds are dropped. Dev builds don't cache (the module URL isn't hashed).
import * as THREE from "three";

const DB = "grudge-cache";
const STORE = "terrain";
const BUILD = import.meta.env.DEV ? "" : import.meta.url;

interface Entry {
  attrs: { name: string; array: Float32Array; size: number }[];
  index: Uint32Array | Uint16Array;
}

let db: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((res) => {
    if (!BUILD || typeof indexedDB === "undefined") return res(null);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        res(req.result);
        prune(req.result);
      };
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
    } catch {
      res(null);
    }
  });
  return db;
}

/** Drops the entries of other builds. */
function prune(d: IDBDatabase): void {
  const tx = d.transaction(STORE, "readwrite");
  const req = tx.objectStore(STORE).openKeyCursor();
  req.onsuccess = () => {
    const c = req.result;
    if (!c) return;
    if (!String(c.key).startsWith(`${BUILD}|`)) tx.objectStore(STORE).delete(c.key);
    c.continue();
  };
}

/** The cached geometry for `key` (the map's model URL), or null. */
export async function cachedTerrain(key: string): Promise<THREE.BufferGeometry | null> {
  const d = await open();
  if (!d) return null;
  const e = await new Promise<Entry | undefined>((res) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(`${BUILD}|${key}`);
      req.onsuccess = () => res(req.result as Entry | undefined);
      req.onerror = () => res(undefined);
    } catch {
      res(undefined);
    }
  });
  if (!e) return null;
  const geo = new THREE.BufferGeometry();
  for (const a of e.attrs) geo.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.size));
  geo.setIndex(new THREE.BufferAttribute(e.index, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Stores a freshly built terrain geometry under `key` (fire and forget). */
export function storeTerrain(key: string, geo: THREE.BufferGeometry): void {
  void open().then((d) => {
    if (!d) return;
    const index = geo.getIndex();
    if (!index) return;
    const e: Entry = {
      attrs: Object.entries(geo.attributes).map(([name, a]) => ({
        name,
        array: (a as THREE.BufferAttribute).array as Float32Array,
        size: a.itemSize,
      })),
      index: index.array as Uint32Array | Uint16Array,
    };
    try {
      d.transaction(STORE, "readwrite").objectStore(STORE).put(e, `${BUILD}|${key}`);
    } catch {
      // Quota or private mode: the next boot just builds it again.
    }
  });
}
