import { describe, it, expect, afterEach } from 'vitest'
import { findMicButtons, observeMicButton, readMicButtonState } from '../../src/meet/dom_detector'
import type { SignalState } from '../../src/meet/combine'
import unmutedHtml from '../fixtures/meet/call_controls_unmuted.html?raw'
import mutedHtml from '../fixtures/meet/call_controls_muted.html?raw'
import leftHtml from '../fixtures/meet/left_meeting.html?raw'

function mount(html: string): HTMLElement {
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    return container
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('readMicButtonState (real Meet markup)', () => {
    it('reads live from the unmuted call controls', () => {
        expect(readMicButtonState(mount(unmutedHtml))).toBe('live')
    })

    it('reads muted from the muted call controls', () => {
        expect(readMicButtonState(mount(mutedHtml))).toBe('muted')
    })

    it('ignores the camera button, which also has data-is-muted', () => {
        const root = mount(mutedHtml)
        const buttons = findMicButtons(root)
        expect(buttons).toHaveLength(1)
        expect(buttons[0].getAttribute('jsname')).toBe('hw0c9')
    })

    it('is unknown on the "You left the meeting" screen', () => {
        expect(readMicButtonState(mount(leftHtml))).toBe('unknown')
    })

    it('does not depend on the translated aria-label', () => {
        const root = mount(mutedHtml)
        root.querySelectorAll('[aria-label]').forEach(el => el.setAttribute('aria-label', 'マイクをオンにする'))
        root.querySelectorAll('[role="tooltip"]').forEach(el => (el.textContent = 'マイクをオンにする'))
        expect(readMicButtonState(root)).toBe('muted')
    })

    it('falls back to jsname when the icon markup changes', () => {
        const root = mount(mutedHtml)
        root.querySelectorAll('i').forEach(i => i.remove())
        expect(readMicButtonState(root)).toBe('muted')
    })

    it('is unknown when two mic buttons disagree', () => {
        const root = mount(unmutedHtml + mutedHtml)
        expect(readMicButtonState(root)).toBe('unknown')
    })

    it('is unknown when data-is-muted has an unexpected value', () => {
        const root = mount(unmutedHtml)
        findMicButtons(root)[0].setAttribute('data-is-muted', 'maybe')
        expect(readMicButtonState(root)).toBe('unknown')
    })
})

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('observeMicButton', () => {
    it('reports the initial state and every change', async () => {
        const root = mount(unmutedHtml)
        const seen: SignalState[] = []
        const stop = observeMicButton(document, s => seen.push(s))

        const mic = () => findMicButtons(root)[0]
        mic().setAttribute('data-is-muted', 'true')
        await flush()
        mic().setAttribute('data-is-muted', 'false')
        await flush()
        root.innerHTML = leftHtml
        await flush()
        root.innerHTML = mutedHtml
        await flush()
        stop()
        root.innerHTML = unmutedHtml
        await flush()

        expect(seen).toEqual(['live', 'muted', 'live', 'unknown', 'muted'])
    })

    it('does not report unrelated DOM changes', async () => {
        mount(mutedHtml)
        const seen: SignalState[] = []
        const stop = observeMicButton(document, s => seen.push(s))
        mount('<p>caption text</p>')
        await flush()
        stop()
        expect(seen).toEqual(['muted'])
    })
})
