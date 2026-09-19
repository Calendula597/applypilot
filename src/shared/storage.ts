import { emptyProfile, migrateProfile, type Profile } from './types'

const KEY = 'resumeFillerData'

export interface Store {
  profiles: Profile[]
  activeId: string
}

export async function loadStore(): Promise<Store> {
  const got = await chrome.storage.local.get(KEY)
  const data = got[KEY] as Store | undefined
  if (data && Array.isArray(data.profiles) && data.profiles.length > 0) {
    const profiles = data.profiles.map(p => migrateProfile(p))
    const activeId = profiles.some(p => p.id === data.activeId) ? data.activeId : profiles[0].id
    const migrated: Store = { profiles, activeId }
    if (migrated.profiles !== data.profiles) await saveStore(migrated)
    return migrated
  }
  const fresh: Store = { profiles: [emptyProfile()], activeId: '' }
  fresh.activeId = fresh.profiles[0].id
  await saveStore(fresh)
  return fresh
}

export async function saveStore(store: Store): Promise<void> {
  await chrome.storage.local.set({ [KEY]: store })
}

export function getActiveProfile(store: Store): Profile | undefined {
  return store.profiles.find(p => p.id === store.activeId) ?? store.profiles[0]
}
