import { combineSignals, isMeetingPath, signalsDisagree, type SignalState } from '../../src/meet/combine'

describe('combineSignals', () => {
    const cases: Array<[SignalState, SignalState, SignalState]> = [
        ['live', 'live', 'live'],
        ['live', 'muted', 'live'],
        ['muted', 'live', 'live'],
        ['live', 'unknown', 'live'],
        ['unknown', 'live', 'live'],
        ['muted', 'muted', 'muted'],
        ['muted', 'unknown', 'muted'],
        ['unknown', 'muted', 'muted'],
        ['unknown', 'unknown', 'unknown'],
    ]
    it.each(cases)('dom=%s sender=%s -> %s', (dom, sender, expected) => {
        expect(combineSignals(dom, sender)).toBe(expected)
    })
})

describe('signalsDisagree', () => {
    it('is true only when both signals are known and differ', () => {
        expect(signalsDisagree('live', 'muted')).toBe(true)
        expect(signalsDisagree('muted', 'live')).toBe(true)
        expect(signalsDisagree('live', 'live')).toBe(false)
        expect(signalsDisagree('muted', 'unknown')).toBe(false)
        expect(signalsDisagree('unknown', 'unknown')).toBe(false)
    })
})

describe('isMeetingPath', () => {
    it.each(['/abc-defg-hij', '/meet/abc-defg-hij', '/abc-defg-hij/', '/_meet/abc-defg-hij'])('%s is a meeting', p => {
        expect(isMeetingPath(p)).toBe(true)
    })
    it.each(['/', '/landing', '/new', '/abc-defg-hijk', '/settings'])('%s is not a meeting', p => {
        expect(isMeetingPath(p)).toBe(false)
    })
})
