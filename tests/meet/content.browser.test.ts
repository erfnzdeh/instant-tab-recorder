import { describe, it, expect, afterEach, vi } from 'vitest'
import { MeetContent, type MeetContentDeps } from '../../src/meet/content'
import { SENDER_STATE_EVENT } from '../../src/meet/combine'
import { STARTUP_GRACE_MS } from '../../src/meet/tracker'
import type { MeetMuteStateMessage, Message } from '../../src/message'
import unmutedHtml from '../fixtures/meet/call_controls_unmuted.html?raw'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(readyResponse: unknown = { report: false }, pathname = '/abc-defg-hij') {
    // A fresh document per test so listeners from earlier tests do not leak in
    const doc = document.implementation.createHTMLDocument('meet')
    doc.body.innerHTML = unmutedHtml
    const sent: Message[] = []
    let control: ((msg: Message, sendResponse: (r: MeetMuteStateMessage) => void) => void) | undefined
    const location = { pathname }
    const deps: MeetContentDeps = {
        document: doc,
        location,
        sendMessage: vi.fn(async (msg: Message) => {
            sent.push(msg)
            return msg.type === 'meet-content-ready' ? readyResponse : undefined
        }),
        onMessage: listener => {
            control = listener
        },
    }
    new MeetContent(deps).start()
    const mic = () => doc.querySelector('[jsname="hw0c9"]')!
    const states = () => sent.filter(m => m.type === 'meet-mute-state').map(m => (m as MeetMuteStateMessage).state)
    return { doc, sent, states, mic, location, control: () => control! }
}

afterEach(() => {
    vi.useRealTimers()
})

describe('MeetContent', () => {
    it('announces itself and stays quiet unless the tab is recorded', async () => {
        const { sent, mic } = setup({ report: false })
        await flush()
        mic().setAttribute('data-is-muted', 'true')
        await flush()
        expect(sent).toEqual([{ type: 'meet-content-ready' }])
    })

    it('reports after a reload when the service worker says so', async () => {
        const { states, mic } = setup({ report: true })
        await flush()
        mic().setAttribute('data-is-muted', 'true')
        await flush()
        expect(states()).toEqual(['live', 'muted'])
    })

    it('starts and stops reporting on meet-sync-control and answers with the current state', async () => {
        const { states, mic, control } = setup()
        await flush()
        const responses: MeetMuteStateMessage[] = []
        control()({ type: 'meet-sync-control', report: true }, r => responses.push(r))
        expect(responses[0]).toMatchObject({
            state: 'live',
            dom: 'live',
            sender: 'unknown',
            hookActive: false,
            settling: false,
        })

        mic().setAttribute('data-is-muted', 'true')
        await flush()
        control()({ type: 'meet-sync-control', report: false }, () => {})
        mic().setAttribute('data-is-muted', 'false')
        await flush()
        // The current state is broadcast on start too, so the recorder gets it without the service worker
        expect(states()).toEqual(['live', 'muted'])
    })

    it('uses the sender signal from the MAIN-world hook', async () => {
        const { doc, states, control } = setup()
        await flush()
        control()({ type: 'meet-sync-control', report: true }, () => {})
        doc.body.innerHTML = '<h1>You left the meeting</h1>'
        doc.dispatchEvent(new CustomEvent(SENDER_STATE_EVENT, { detail: 'muted' }))
        await flush()
        expect(states()).toEqual(['live', 'muted'])
    })

    it('ignores malformed hook events', async () => {
        const { doc, control } = setup()
        await flush()
        const responses: MeetMuteStateMessage[] = []
        doc.dispatchEvent(new CustomEvent(SENDER_STATE_EVENT, { detail: { evil: true } }))
        doc.dispatchEvent(new CustomEvent(SENDER_STATE_EVENT, { detail: 'definitely' }))
        control()({ type: 'meet-sync-control', report: true }, r => responses.push(r))
        expect(responses[0]).toMatchObject({ sender: 'unknown', hookActive: false })
    })

    it('reports inactive when Meet navigates away from the meeting without reloading', async () => {
        vi.useFakeTimers({ toFake: ['setInterval'] })
        const { states, control, location } = setup()
        await flush()
        control()({ type: 'meet-sync-control', report: true }, () => {})
        location.pathname = '/landing'
        vi.advanceTimersByTime(1000)
        await flush()
        expect(states()).toEqual(['live', 'inactive'])
    })

    it('stays quiet while a page without the mic button is still loading', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
        const doc = document.implementation.createHTMLDocument('meet')
        const sent: Message[] = []
        const responses: MeetMuteStateMessage[] = []
        let control: ((msg: Message, sendResponse: (r: MeetMuteStateMessage) => void) => void) | undefined
        new MeetContent({
            document: doc,
            location: { pathname: '/abc-defg-hij' },
            sendMessage: async msg => {
                sent.push(msg)
                return msg.type === 'meet-content-ready' ? { report: true } : undefined
            },
            onMessage: listener => {
                control = listener
            },
        }).start()
        await vi.advanceTimersByTimeAsync(0)
        control!({ type: 'meet-sync-control', report: true }, r => responses.push(r))
        expect(responses[0]).toMatchObject({ state: 'unknown', settling: true })
        expect(sent.filter(m => m.type === 'meet-mute-state')).toEqual([])

        // The button shows up: the first real reading is reported right away
        doc.body.innerHTML = unmutedHtml
        await vi.advanceTimersByTimeAsync(0)
        expect(sent.filter(m => m.type === 'meet-mute-state')).toMatchObject([{ state: 'live', settling: false }])
    })

    it('reports unknown once the startup window passes without any reading', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
        const doc = document.implementation.createHTMLDocument('meet')
        const sent: Message[] = []
        new MeetContent({
            document: doc,
            location: { pathname: '/abc-defg-hij' },
            sendMessage: async msg => {
                sent.push(msg)
                return msg.type === 'meet-content-ready' ? { report: true } : undefined
            },
            onMessage: () => {},
        }).start()
        await vi.advanceTimersByTimeAsync(STARTUP_GRACE_MS)
        expect(sent.filter(m => m.type === 'meet-mute-state')).toMatchObject([{ state: 'unknown', settling: false }])
    })
})
