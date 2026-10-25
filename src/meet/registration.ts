import { MEET_MATCH_PATTERN } from './service_worker_sync'

/**
 * Content scripts for "Follow Meet mute". They are registered dynamically (not in the manifest)
 * because access to meet.google.com is an optional permission the user grants from the settings.
 *
 * Both run at document_start so the MAIN-world hook is in place before Meet creates its
 * RTCPeerConnection. Registered scripts persist across browser restarts.
 */
export const MEET_CONTENT_SCRIPTS: chrome.scripting.RegisteredContentScript[] = [
    {
        id: 'meet-track-hook',
        matches: [MEET_MATCH_PATTERN],
        js: ['dist/meet_track_hook.js'],
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: false,
    },
    {
        id: 'meet-content',
        matches: [MEET_MATCH_PATTERN],
        js: ['dist/meet_content.js'],
        runAt: 'document_start',
        world: 'ISOLATED',
        allFrames: false,
    },
]

export async function hasMeetPermission(): Promise<boolean> {
    return chrome.permissions.contains({ origins: [MEET_MATCH_PATTERN] })
}

/** Register or unregister the content scripts to match the current permission */
export async function syncMeetContentScripts(): Promise<void> {
    const granted = await hasMeetPermission()
    const ids = MEET_CONTENT_SCRIPTS.map(s => s.id)
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids })
    const registeredIds = new Set(registered.map(s => s.id))

    if (!granted) {
        if (registeredIds.size > 0) await chrome.scripting.unregisterContentScripts({ ids: [...registeredIds] })
        return
    }
    const missing = MEET_CONTENT_SCRIPTS.filter(s => !registeredIds.has(s.id))
    if (missing.length > 0) await chrome.scripting.registerContentScripts(missing)
}

/** Inject into an already-open Meet tab (registered scripts only run on later page loads) */
export async function injectMeetContentScripts(tabId: number): Promise<void> {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/meet_track_hook.js'], world: 'MAIN' })
    await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/meet_content.js'], world: 'ISOLATED' })
}
