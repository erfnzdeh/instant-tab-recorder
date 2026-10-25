import type { SignalState } from './combine'

/**
 * Reads the mute state from Meet's mic toggle button.
 *
 * Observed markup (2026-10, see tests/fixtures/meet/):
 *   <button role="button" data-is-muted="false" aria-label="Turn off microphone" jsname="hw0c9">
 *     ...<i>mic</i>...            (icon ligature becomes "mic_off" when muted)
 *   </button>
 *
 * Notes for future maintainers:
 * - The camera button carries data-is-muted too, so the attribute alone is not enough. The mic is
 *   picked by its Material Symbols ligature ("mic" / "mic_off"), which is the same in every UI
 *   language. aria-label is translated and must not be matched.
 * - jsname="hw0c9" also identifies the mic button but is an obfuscated build id, so it is only a
 *   fallback for when the icon markup changes.
 * - The pre-join screen ("Ready to join?") uses the same button, so it is followed as-is: muting
 *   there means you will join muted.
 * - Host mute ("mute everyone") and push-to-talk (hold space) flip the same button, so they need no
 *   special case.
 * - The "You left the meeting" screen has no button at all, which reads as unknown here; the sender
 *   signal resolves that case.
 */
const MIC_ICON_LIGATURES = new Set(['mic', 'mic_off'])
const MIC_BUTTON_FALLBACK_SELECTOR = '[data-is-muted][jsname="hw0c9"]'

function isMicButton(el: Element): boolean {
    for (const icon of el.querySelectorAll('i')) {
        if (MIC_ICON_LIGATURES.has(icon.textContent?.trim() ?? '')) return true
    }
    return false
}

export function findMicButtons(root: ParentNode): Element[] {
    const byIcon = [...root.querySelectorAll('[data-is-muted]')].filter(isMicButton)
    if (byIcon.length > 0) return byIcon
    return [...root.querySelectorAll(MIC_BUTTON_FALLBACK_SELECTOR)]
}

function readButton(el: Element): SignalState {
    switch (el.getAttribute('data-is-muted')) {
        case 'true':
            return 'muted'
        case 'false':
            return 'live'
        default:
            return 'unknown'
    }
}

/**
 * Current mute state according to the DOM. Several mic buttons can exist at once (e.g. during
 * layout transitions); if they disagree the state is unknown rather than a guess.
 */
export function readMicButtonState(root: ParentNode): SignalState {
    const states = new Set(findMicButtons(root).map(readButton))
    if (states.size !== 1) return 'unknown'
    return states.values().next().value ?? 'unknown'
}

/**
 * Watch the DOM and call onChange whenever the mic button state changes (including the button
 * appearing or disappearing). Returns a function that stops observing.
 */
export function observeMicButton(root: Document, onChange: (state: SignalState) => void): () => void {
    let last = readMicButtonState(root)
    onChange(last)
    const observer = new MutationObserver(() => {
        const next = readMicButtonState(root)
        if (next === last) return
        last = next
        onChange(next)
    })
    observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-is-muted'],
    })
    return () => observer.disconnect()
}
