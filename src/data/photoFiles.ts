// Internal to src/data: where photo images live until Supabase Storage (private bucket, signed URLs).
// Demo mode keeps them in memory; trial mode keeps them in IndexedDB on this phone, because
// localStorage only holds a few MB. Keys are the photo's storage_path.
import { MODE } from './store'

const DB_NAME = 'gymshift-photos'
const STORE = 'files'

const memory = new Map<string, Blob>()
const urls = new Map<string, string>()

let opening: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      opening = null
      reject(req.error)
    }
  })
  return opening
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openDb()
  return new Promise((resolve, reject) => {
    const req = op(idb.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putFile(path: string, blob: Blob): Promise<void> {
  if (MODE === 'trial') await run('readwrite', (s) => s.put(blob, path))
  else memory.set(path, blob)
}

/** A URL the page can show, or null when there is no image (seeded rows, or a removed photo). */
export async function fileUrl(path: string): Promise<string | null> {
  const cached = urls.get(path)
  if (cached) return cached
  const blob = MODE === 'trial' ? await run<Blob | undefined>('readonly', (s) => s.get(path)) : memory.get(path)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urls.set(path, url)
  return url
}

export async function deleteFile(path: string): Promise<void> {
  const url = urls.get(path)
  if (url) URL.revokeObjectURL(url)
  urls.delete(path)
  if (MODE === 'trial') await run('readwrite', (s) => s.delete(path))
  else memory.delete(path)
}

export async function clearFiles(): Promise<void> {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  memory.clear()
  if (MODE === 'trial') await run('readwrite', (s) => s.clear())
}
