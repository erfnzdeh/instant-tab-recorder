/**
 * Google Meet mute detection: shared types and the rule that merges the two signals.
 *
 * Two independent signals report whether Meet is sending your microphone:
 * - dom:    the mic toggle button in Meet's UI (see dom_detector.ts)
 * - sender: Meet's outgoing audio RTCRtpSender (see sender_signal.ts / track_hook.ts)
 *
 * The recorded microphone mirrors what Meet would actually send to the call.
 */

/** State reported by a single signal */
export type SignalState = 'live' | 'muted' | 'unknown'

/**
 * State reported for the whole Meet tab.
 * - inactive: the page is not a meeting (Meet home screen, etc.), so the mic records normally
 * - unknown:  detection failed; the recorder keeps the mic live (fail-open) and warns
 */
export type MeetMuteState = 'live' | 'muted' | 'unknown' | 'inactive'

/**
 * Merge the DOM and sender signals.
 *
 * "Unmuted wins": if either working signal says live, the mic is recorded. This is deliberate
 * (fail-open): a stuck or misread signal can at worst record a moment you were muted, never drop
 * your voice while you are talking. A signal that says unknown is ignored, so e.g. on the
 * pre-join screen (no RTC sender yet) the button decides, and on the "You left the meeting"
 * screen (no button, sender track gone) the sender decides.
 */
export function combineSignals(dom: SignalState, sender: SignalState): SignalState {
    if (dom === 'live' || sender === 'live') return 'live'
    if (dom === 'muted' || sender === 'muted') return 'muted'
    return 'unknown'
}

/** Both signals are known and contradict each other */
export function signalsDisagree(dom: SignalState, sender: SignalState): boolean {
    return dom !== 'unknown' && sender !== 'unknown' && dom !== sender
}

/**
 * Meeting pages carry a meeting code (abc-defg-hij) in the path, e.g. /abc-defg-hij or
 * /meet/abc-defg-hij. Anything else on meet.google.com (home screen, landing, settings) is not a
 * call, so the feature is inactive there.
 */
const meetingCodeRegex = /(^|\/)[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/

export function isMeetingPath(pathname: string): boolean {
    return meetingCodeRegex.test(pathname)
}

/** CustomEvent names used between the MAIN-world hook and the isolated content script */
export const SENDER_STATE_EVENT = 'instant-tab-recorder:meet-sender-state'
export const SENDER_STATE_REQUEST_EVENT = 'instant-tab-recorder:meet-sender-state-request'
