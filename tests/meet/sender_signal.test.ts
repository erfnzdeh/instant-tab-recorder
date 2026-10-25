import { evaluateSenders, type AudioSenderSnapshot } from '../../src/meet/sender_signal'

function sender(overrides: Partial<AudioSenderSnapshot> = {}): AudioSenderSnapshot {
    return {
        hasTrack: true,
        hadTrack: true,
        trackLive: true,
        trackEnabled: true,
        encodingsActive: [true],
        connectionClosed: false,
        ...overrides,
    }
}

describe('evaluateSenders', () => {
    it('is unknown when no sender has been seen', () => {
        expect(evaluateSenders([])).toBe('unknown')
    })

    it('is live for an open sender with a live, enabled track and active encoding', () => {
        expect(evaluateSenders([sender()])).toBe('live')
    })

    it('treats missing encodings as not disabled', () => {
        expect(evaluateSenders([sender({ encodingsActive: [] })])).toBe('live')
    })

    it('is muted when Meet disables the track and the encoding (observed mute)', () => {
        expect(evaluateSenders([sender({ trackEnabled: false, encodingsActive: [false] })])).toBe('muted')
    })

    it('is muted when only the encoding is inactive', () => {
        expect(evaluateSenders([sender({ encodingsActive: [false] })])).toBe('muted')
    })

    it('is muted when only the track is disabled', () => {
        expect(evaluateSenders([sender({ trackEnabled: false })])).toBe('muted')
    })

    it('is muted when the track ended', () => {
        expect(evaluateSenders([sender({ trackLive: false })])).toBe('muted')
    })

    it('is muted after leaving the call (track went null)', () => {
        expect(evaluateSenders([sender({ hasTrack: false, hadTrack: true })])).toBe('muted')
    })

    it('is muted when the connection closed', () => {
        expect(evaluateSenders([sender({ connectionClosed: true })])).toBe('muted')
    })

    it('ignores senders that never had a track (pre-created transceivers)', () => {
        expect(evaluateSenders([sender({ hasTrack: false, hadTrack: false })])).toBe('unknown')
    })

    it('is live when any sender is live, even next to stale ones', () => {
        expect(evaluateSenders([sender({ connectionClosed: true }), sender({ hasTrack: false }), sender()])).toBe(
            'live',
        )
    })
})
