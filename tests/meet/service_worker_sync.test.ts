import { isMeetUrl, MeetSync, type MeetSyncDeps } from '../../src/meet/service_worker_sync'
import type { RecordingState } from '../../src/handler'
import type { MeetMuteStateMessage } from '../../src/message'

function stateMsg(
    state: MeetMuteStateMessage['state'],
    overrides: Partial<MeetMuteStateMessage> = {},
): MeetMuteStateMessage {
    const signal = state === 'inactive' ? 'unknown' : state
    return {
        type: 'meet-mute-state',
        state,
        dom: signal,
        sender: signal,
        hookActive: true,
        settling: false,
        ...overrides,
    }
}

function setup(initial: Partial<RecordingState> = {}) {
    let state: RecordingState = { isRecording: true, tabId: 7, followMeetMute: true, ...initial }
    const deps = {
        getRecordingState: vi.fn(async () => state),
        setRecordingState: vi.fn(async (s: RecordingState) => {
            state = s
        }),
        hasMeetPermission: vi.fn().mockResolvedValue(true),
        sendToTab: vi.fn().mockResolvedValue(stateMsg('live')),
        injectContentScripts: vi.fn().mockResolvedValue(undefined),
        setFollowedTab: vi.fn().mockResolvedValue(undefined),
        setMicMuted: vi.fn().mockResolvedValue(undefined),
        onStatusChanged: vi.fn().mockResolvedValue(undefined),
        sendEvent: vi.fn().mockResolvedValue(undefined),
    } satisfies MeetSyncDeps
    return { deps, sync: new MeetSync(deps), get: () => state }
}

describe('isMeetUrl', () => {
    it('matches only https://meet.google.com', () => {
        expect(isMeetUrl('https://meet.google.com/abc-defg-hij')).toBe(true)
        expect(isMeetUrl('http://meet.google.com/abc-defg-hij')).toBe(false)
        expect(isMeetUrl('https://meet.google.com.evil.example/')).toBe(false)
        expect(isMeetUrl('https://example.com/?meet.google.com')).toBe(false)
        expect(isMeetUrl(undefined)).toBe(false)
        expect(isMeetUrl('not a url')).toBe(false)
    })
})

describe('MeetSync.start', () => {
    const meetUrl = 'https://meet.google.com/abc-defg-hij'

    it('does nothing when the recording does not follow Meet', async () => {
        const { deps, sync } = setup({ followMeetMute: false })
        await sync.start(meetUrl)
        expect(deps.sendToTab).not.toHaveBeenCalled()
        expect(deps.setFollowedTab).not.toHaveBeenCalled()
        expect(deps.setRecordingState).not.toHaveBeenCalled()
    })

    it('is off without Meet access on this device', async () => {
        const { deps, sync, get } = setup()
        deps.hasMeetPermission.mockResolvedValue(false)
        await sync.start(meetUrl)
        expect(get().meetSync).toBe('off')
        expect(deps.sendToTab).not.toHaveBeenCalled()
        expect(deps.setFollowedTab).not.toHaveBeenCalled()
    })

    it('follows the tab but is inactive when it is not Meet yet', async () => {
        const { deps, sync, get } = setup()
        await sync.start('https://example.com/')
        expect(get().meetSync).toBe('inactive')
        expect(deps.setFollowedTab).toHaveBeenCalledWith(7)
        expect(deps.sendToTab).not.toHaveBeenCalled()
    })

    it('tells the recorder which tab to follow before the page starts reporting', async () => {
        const { deps, sync, get } = setup()
        deps.sendToTab.mockResolvedValue(stateMsg('muted'))
        await sync.start(meetUrl)
        expect(deps.setFollowedTab).toHaveBeenCalledWith(7)
        expect(deps.setFollowedTab.mock.invocationCallOrder[0]).toBeLessThan(deps.sendToTab.mock.invocationCallOrder[0])
        expect(deps.sendToTab).toHaveBeenCalledWith(7, { type: 'meet-sync-control', report: true })
        expect(get().meetSync).toBe('muted')
        // The page's broadcast reaches the recorder directly; the service worker only shows status
        expect(deps.setMicMuted).not.toHaveBeenCalled()
        expect(deps.injectContentScripts).not.toHaveBeenCalled()
    })

    it('injects the content scripts into tabs opened before access was granted', async () => {
        const { deps, sync, get } = setup()
        deps.sendToTab
            .mockRejectedValueOnce(new Error('Receiving end does not exist'))
            .mockResolvedValue(stateMsg('live'))
        await sync.start(meetUrl)
        expect(deps.injectContentScripts).toHaveBeenCalledWith(7)
        expect(get().meetSync).toBe('live')
    })

    it('keeps the fail-open status while a freshly injected page is settling', async () => {
        const { deps, sync, get } = setup()
        deps.sendToTab
            .mockRejectedValueOnce(new Error('Receiving end does not exist'))
            .mockResolvedValue(stateMsg('unknown', { settling: true }))
        await sync.start(meetUrl)
        expect(get().meetSync).toBe('unknown')
        expect(deps.sendEvent).not.toHaveBeenCalled()
    })

    it('fails open and reports when the page never answers', async () => {
        const { deps, sync, get } = setup()
        deps.sendToTab.mockRejectedValue(new Error('Receiving end does not exist'))
        await sync.start(meetUrl)
        expect(get().meetSync).toBe('unknown')
        expect(deps.setMicMuted).not.toHaveBeenCalled()
        expect(deps.sendEvent).toHaveBeenCalledWith({
            type: 'meet_mute_detection_lost',
            tags: { dom: 'unknown', sender: 'unknown', hookActive: false, reason: 'no-content-script' },
        })
    })
})

describe('MeetSync.handleState', () => {
    it('ignores messages from other tabs', async () => {
        const { deps, sync } = setup({ meetSync: 'live' })
        await sync.handleState(stateMsg('muted'), 8)
        await sync.handleState(stateMsg('muted'), undefined)
        expect(deps.setRecordingState).not.toHaveBeenCalled()
    })

    it('ignores messages when not recording', async () => {
        const { deps, sync } = setup({ isRecording: false })
        await sync.handleState(stateMsg('muted'), 7)
        expect(deps.setRecordingState).not.toHaveBeenCalled()
    })

    it('updates the status but leaves the mic to the recorder', async () => {
        const { deps, sync, get } = setup({ meetSync: 'live' })
        await sync.handleState(stateMsg('muted'), 7)
        expect(get().meetSync).toBe('muted')
        expect(deps.onStatusChanged).toHaveBeenCalledWith(expect.objectContaining({ meetSync: 'muted' }))
        expect(deps.setMicMuted).not.toHaveBeenCalled()
    })

    it('ignores settling pages (a normal page load is not broken detection)', async () => {
        const { deps, sync, get } = setup({ meetSync: 'muted' })
        await sync.handleState(stateMsg('unknown', { settling: true }), 7)
        expect(get().meetSync).toBe('muted')
        expect(deps.sendEvent).not.toHaveBeenCalled()
    })

    it('does not refresh an unchanged status', async () => {
        const { deps, sync } = setup({ meetSync: 'live' })
        await sync.handleState(stateMsg('muted'), 7)
        await sync.handleState(stateMsg('muted'), 7)
        expect(deps.onStatusChanged).toHaveBeenCalledTimes(1)
    })

    it('processes rapid messages in order', async () => {
        const { deps, sync, get } = setup({ meetSync: 'live' })
        await Promise.all([
            sync.handleState(stateMsg('muted'), 7),
            sync.handleState(stateMsg('live'), 7),
            sync.handleState(stateMsg('muted'), 7),
        ])
        expect(deps.onStatusChanged.mock.calls.map(([s]) => s.meetSync)).toEqual(['muted', 'live', 'muted'])
        expect(get().meetSync).toBe('muted')
    })

    it('reports detection lost once per recording', async () => {
        const { deps, sync } = setup({ meetSync: 'live' })
        await sync.handleState(stateMsg('unknown', { dom: 'unknown', sender: 'unknown', hookActive: true }), 7)
        await sync.handleState(stateMsg('live'), 7)
        await sync.handleState(stateMsg('unknown'), 7)
        expect(deps.sendEvent).toHaveBeenCalledTimes(1)
        expect(deps.sendEvent).toHaveBeenCalledWith({
            type: 'meet_mute_detection_lost',
            tags: { dom: 'unknown', sender: 'unknown', hookActive: true, reason: 'content-script' },
        })
    })
})

describe('MeetSync other handlers', () => {
    it('reports a disagreement once per recording', async () => {
        const { deps, sync } = setup()
        await sync.handleDisagreement({ type: 'meet-mute-disagreement', dom: 'live', sender: 'muted' }, 7)
        await sync.handleDisagreement({ type: 'meet-mute-disagreement', dom: 'muted', sender: 'live' }, 7)
        expect(deps.sendEvent).toHaveBeenCalledTimes(1)
        expect(deps.sendEvent).toHaveBeenCalledWith({
            type: 'meet_mute_signal_disagreement',
            tags: { dom: 'live', sender: 'muted' },
        })
    })

    it('tells only the recorded tab to report after a reload', async () => {
        const { sync } = setup()
        expect(await sync.handleContentReady(7)).toEqual({ report: true })
        expect(await sync.handleContentReady(8)).toEqual({ report: false })
    })

    it('goes inactive and restores the mic itself when the tab leaves Meet', async () => {
        const { deps, sync, get } = setup({ meetSync: 'live' })
        await sync.handleState(stateMsg('muted'), 7)
        await sync.handleTabUpdated(7, undefined)
        expect(get().meetSync).toBe('inactive')
        expect(deps.setMicMuted.mock.calls).toEqual([[false]])
    })

    it('leaves Meet tab updates to the content script', async () => {
        const { deps, sync } = setup({ meetSync: 'muted' })
        await sync.handleTabUpdated(7, 'https://meet.google.com/abc-defg-hij')
        await sync.handleTabUpdated(8, undefined)
        expect(deps.setRecordingState).not.toHaveBeenCalled()
    })

    it('stops following and tells the tab to stop reporting', async () => {
        const { deps, sync } = setup()
        await sync.stop()
        expect(deps.setFollowedTab).toHaveBeenCalledWith(null)
        expect(deps.sendToTab).toHaveBeenCalledWith(7, { type: 'meet-sync-control', report: false })
    })
})
