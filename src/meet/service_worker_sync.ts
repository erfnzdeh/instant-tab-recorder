import type { MeetSyncStatus, RecordingState } from '../handler'
import type {
    MeetContentReadyResponse,
    MeetMuteDisagreementMessage,
    MeetMuteStateMessage,
    MeetSyncControlMessage,
} from '../message'
import type { Event } from '../sentry_event'

export const MEET_MATCH_PATTERN = 'https://meet.google.com/*'
const MEET_HOST = 'meet.google.com'

export function isMeetUrl(url: string | undefined): boolean {
    if (url == null) return false
    try {
        const u = new URL(url)
        return u.protocol === 'https:' && u.hostname === MEET_HOST
    } catch {
        return false
    }
}

export interface MeetSyncDeps {
    getRecordingState(): Promise<RecordingState>
    setRecordingState(state: RecordingState): Promise<void>
    hasMeetPermission(): Promise<boolean>
    /** chrome.tabs.sendMessage; rejects when no content script is listening */
    sendToTab(tabId: number, msg: MeetSyncControlMessage): Promise<MeetMuteStateMessage | undefined>
    /** Inject the content scripts into a Meet tab opened before access was granted */
    injectContentScripts(tabId: number): Promise<void>
    /** Tell the offscreen recorder which tab's mute messages to apply (null: none) */
    setFollowedTab(tabId: number | null): Promise<void>
    /** Forward to the offscreen recorder */
    setMicMuted(muted: boolean): Promise<void>
    /** Refresh the action tooltip and the option page after meetSync changed */
    onStatusChanged(state: RecordingState): Promise<void>
    sendEvent(event: Event): Promise<void>
}

/**
 * Service-worker side of "Follow Meet mute": decides which tab is followed and keeps
 * RecordingState.meetSync (tooltip, option page, Sentry) up to date.
 *
 * The mute itself is applied by the offscreen recorder, which receives the content script's
 * meet-mute-state messages directly. A service worker that went idle takes a few hundred ms to
 * wake, which measurably delayed silencing when it sat on the critical path. The service worker
 * only touches the mic for transitions it detects itself (the tab leaving Meet).
 *
 * Only the recorded tab is followed. A Meet call in another tab never affects the recording.
 */
export class MeetSync {
    // Messages can arrive back to back (e.g. rapid ⌘D); serialize the read-modify-write of state
    private queue: Promise<unknown> = Promise.resolve()

    constructor(private readonly deps: MeetSyncDeps) {}

    private run<T>(fn: () => Promise<T>): Promise<T> {
        const next = this.queue.then(fn, fn)
        this.queue = next.catch(() => {})
        return next
    }

    /** Call right after a recording started and its state (tabId, followMeetMute) was stored */
    start(tabUrl: string | undefined): Promise<void> {
        return this.run(async () => {
            const state = await this.deps.getRecordingState()
            if (!state.isRecording || !state.followMeetMute || state.tabId == null) return
            if (!(await this.deps.hasMeetPermission())) {
                await this.apply('off')
                return
            }
            await this.deps.setFollowedTab(state.tabId)
            if (!isMeetUrl(tabUrl)) {
                // The tab may still navigate to Meet; its content script then announces itself
                await this.apply('inactive')
                return
            }
            // Fail-open until the page answers
            await this.apply('unknown')
            const control: MeetSyncControlMessage = { type: 'meet-sync-control', report: true }
            let snapshot = await this.deps.sendToTab(state.tabId, control).catch(() => undefined)
            if (snapshot == null) {
                // Tab opened before access was granted: registered content scripts did not run there.
                // The late MAIN-world hook only sees the sender once Meet touches it again; the DOM
                // signal covers the gap.
                await this.deps.injectContentScripts(state.tabId).catch(e => console.error('Meet inject failed:', e))
                snapshot = await this.deps.sendToTab(state.tabId, control).catch(() => undefined)
            }
            if (snapshot != null) {
                await this.applyMessage(snapshot)
            } else {
                await this.reportDetectionLost(
                    {
                        type: 'meet-mute-state',
                        state: 'unknown',
                        dom: 'unknown',
                        sender: 'unknown',
                        hookActive: false,
                        settling: false,
                    },
                    'no-content-script',
                )
            }
        })
    }

    /** Call before the recording stops so the page stops reporting */
    stop(): Promise<void> {
        return this.run(async () => {
            const state = await this.deps.getRecordingState()
            if (!state.isRecording || !state.followMeetMute || state.tabId == null) return
            await this.deps.setFollowedTab(null).catch(() => {})
            await this.deps.sendToTab(state.tabId, { type: 'meet-sync-control', report: false }).catch(() => {})
        })
    }

    handleState(msg: MeetMuteStateMessage, senderTabId: number | undefined): Promise<void> {
        return this.run(async () => {
            if (!(await this.isFollowedTab(senderTabId))) return
            await this.applyMessage(msg)
        })
    }

    handleDisagreement(msg: MeetMuteDisagreementMessage, senderTabId: number | undefined): Promise<void> {
        return this.run(async () => {
            if (!(await this.isFollowedTab(senderTabId))) return
            const state = await this.deps.getRecordingState()
            if (state.meetSyncReported?.disagreement) return
            await this.deps.sendEvent({
                type: 'meet_mute_signal_disagreement',
                tags: { dom: msg.dom, sender: msg.sender },
            })
            await this.deps.setRecordingState({
                ...state,
                meetSyncReported: { ...state.meetSyncReported, disagreement: true },
            })
        })
    }

    /** A Meet page (re)loaded, e.g. after "Rejoin". Tell it whether to report. */
    handleContentReady(senderTabId: number | undefined): Promise<MeetContentReadyResponse> {
        return this.run(async () => ({ report: await this.isFollowedTab(senderTabId) }))
    }

    /** chrome.tabs.onUpdated for any tab; tabUrl is undefined for sites we have no access to */
    handleTabUpdated(tabId: number, tabUrl: string | undefined): Promise<void> {
        return this.run(async () => {
            if (!(await this.isFollowedTab(tabId))) return
            // On Meet the content script reports by itself (including SPA navigation)
            if (isMeetUrl(tabUrl)) return
            // The page that reported is gone, so this transition is ours to apply
            await this.apply('inactive', { applyMic: true })
        })
    }

    private async isFollowedTab(tabId: number | undefined): Promise<boolean> {
        if (tabId == null) return false
        const state = await this.deps.getRecordingState()
        return state.isRecording && state.followMeetMute === true && state.tabId === tabId
    }

    private async applyMessage(msg: MeetMuteStateMessage): Promise<void> {
        // A page that is still loading has nothing to say yet (and is not broken detection)
        if (msg.settling) return
        await this.apply(msg.state)
        if (msg.state === 'unknown') await this.reportDetectionLost(msg, 'content-script')
    }

    private async reportDetectionLost(
        msg: MeetMuteStateMessage,
        reason: 'content-script' | 'no-content-script',
    ): Promise<void> {
        const state = await this.deps.getRecordingState()
        if (!state.isRecording || state.meetSyncReported?.detectionLost) return
        await this.deps.sendEvent({
            type: 'meet_mute_detection_lost',
            tags: { dom: msg.dom, sender: msg.sender, hookActive: msg.hookActive, reason },
        })
        await this.deps.setRecordingState({
            ...state,
            meetSyncReported: { ...state.meetSyncReported, detectionLost: true },
        })
    }

    private async apply(next: MeetSyncStatus, { applyMic = false } = {}): Promise<void> {
        const state = await this.deps.getRecordingState()
        if (!state.isRecording) return
        const prev = state.meetSync
        if (prev === next) return

        // Only 'muted' silences the mic; every other status records it (fail-open)
        const wasMuted = prev === 'muted'
        const nowMuted = next === 'muted'
        if (applyMic && wasMuted !== nowMuted) {
            await this.deps.setMicMuted(nowMuted).catch(e => console.error('Failed to set mic muted:', e))
        }

        const updated: RecordingState = { ...state, meetSync: next }
        await this.deps.setRecordingState(updated)
        await this.deps.onStatusChanged(updated)
    }
}
