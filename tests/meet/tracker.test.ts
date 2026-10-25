import {
    DISAGREEMENT_REPORT_MS,
    STARTUP_GRACE_MS,
    MeetMuteTracker,
    UNKNOWN_GRACE_MS,
    type MeetMuteSnapshot,
} from '../../src/meet/tracker'

describe('MeetMuteTracker', () => {
    let changes: MeetMuteSnapshot[]
    let disagreements: MeetMuteSnapshot[]
    let tracker: MeetMuteTracker

    const states = () => changes.map(c => c.state)

    beforeEach(() => {
        vi.useFakeTimers()
        changes = []
        disagreements = []
        tracker = new MeetMuteTracker({
            onChange: s => changes.push(s),
            onDisagreement: s => disagreements.push(s),
        })
    })

    afterEach(() => {
        tracker.dispose()
        vi.useRealTimers()
    })

    it('waits out the startup window before reporting unknown (page still loading)', () => {
        tracker.setDom('unknown')
        expect(states()).toEqual([])
        expect(tracker.snapshot).toMatchObject({ state: 'unknown', settling: true })
        vi.advanceTimersByTime(STARTUP_GRACE_MS - 1)
        expect(states()).toEqual([])
        vi.advanceTimersByTime(1)
        expect(states()).toEqual(['unknown'])
        expect(changes[0].settling).toBe(false)
    })

    it('ends the startup window at the first real reading', () => {
        tracker.setDom('muted')
        expect(changes).toEqual([{ state: 'muted', dom: 'muted', sender: 'unknown', settling: false }])
        tracker.setDom('unknown')
        vi.advanceTimersByTime(STARTUP_GRACE_MS)
        // Lost after having worked: the normal grace period applies, then unknown
        expect(states()).toEqual(['muted', 'unknown'])
    })

    it('follows the DOM on the pre-join screen (sender unknown)', () => {
        tracker.setDom('live')
        tracker.setDom('muted')
        expect(states()).toEqual(['live', 'muted'])
    })

    it('does not report duplicate states', () => {
        tracker.setDom('muted')
        tracker.setSender('muted')
        expect(states()).toEqual(['muted'])
    })

    it('reports live when either signal is live', () => {
        tracker.setDom('muted')
        tracker.setSender('live')
        expect(states()).toEqual(['muted', 'live'])
    })

    it('holds the last known state during the grace period, then reports unknown', () => {
        tracker.setDom('muted')
        tracker.setDom('unknown')
        expect(states()).toEqual(['muted'])
        vi.advanceTimersByTime(UNKNOWN_GRACE_MS - 1)
        expect(states()).toEqual(['muted'])
        vi.advanceTimersByTime(1)
        expect(states()).toEqual(['muted', 'unknown'])
    })

    it('cancels the grace period when a signal comes back', () => {
        tracker.setDom('muted')
        tracker.setDom('unknown')
        vi.advanceTimersByTime(UNKNOWN_GRACE_MS / 2)
        tracker.setSender('muted')
        vi.advanceTimersByTime(UNKNOWN_GRACE_MS)
        expect(states()).toEqual(['muted'])
    })

    it('resolves the left-meeting screen as muted via the sender', () => {
        tracker.setDom('live')
        tracker.setSender('live')
        tracker.setDom('unknown')
        tracker.setSender('muted')
        expect(states()).toEqual(['live', 'muted'])
    })

    it('reports inactive on non-meeting pages, regardless of signals', () => {
        tracker.setDom('muted')
        tracker.setMeetingPage(false)
        tracker.setDom('live')
        expect(states()).toEqual(['muted', 'inactive'])
        tracker.setMeetingPage(true)
        expect(states()).toEqual(['muted', 'inactive', 'live'])
    })

    it('settles again when entering a meeting from a non-meeting page', () => {
        tracker.setMeetingPage(false)
        tracker.setMeetingPage(true)
        expect(states()).toEqual(['inactive'])
        expect(tracker.snapshot.settling).toBe(true)
        vi.advanceTimersByTime(STARTUP_GRACE_MS)
        expect(states()).toEqual(['inactive', 'unknown'])
    })

    it('reports a disagreement once it lasts long enough, once per episode', () => {
        tracker.setDom('live')
        tracker.setSender('muted')
        vi.advanceTimersByTime(DISAGREEMENT_REPORT_MS - 1)
        expect(disagreements).toHaveLength(0)
        vi.advanceTimersByTime(1)
        expect(disagreements).toHaveLength(1)
        expect(disagreements[0]).toMatchObject({ dom: 'live', sender: 'muted', state: 'live' })
        vi.advanceTimersByTime(DISAGREEMENT_REPORT_MS * 5)
        expect(disagreements).toHaveLength(1)

        tracker.setSender('live')
        tracker.setSender('muted')
        vi.advanceTimersByTime(DISAGREEMENT_REPORT_MS)
        expect(disagreements).toHaveLength(2)
    })

    it('does not report short disagreements (signals update a few ms apart)', () => {
        tracker.setDom('live')
        tracker.setSender('live')
        tracker.setDom('muted')
        vi.advanceTimersByTime(5)
        tracker.setSender('muted')
        vi.advanceTimersByTime(DISAGREEMENT_REPORT_MS * 2)
        expect(disagreements).toHaveLength(0)
    })
})
