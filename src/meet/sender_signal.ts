import type { SignalState } from './combine'

/**
 * Snapshot of one outgoing audio RTCRtpSender, taken by the MAIN-world hook (track_hook.ts).
 *
 * Observed behaviour (2026-10): Meet keeps one live mic track on the audio sender and mutes it in
 * two ways at once: track.enabled = false and setParameters() with encodings[].active = false.
 * Unmuting reverses both. Meet also creates and stops several cloned mic tracks on every toggle,
 * which is why the sender is watched instead of individual tracks.
 */
export interface AudioSenderSnapshot {
    /** sender.track is non-null */
    hasTrack: boolean
    /** sender.track had a value at some point (a null track after that means "stopped sending") */
    hadTrack: boolean
    trackLive: boolean
    trackEnabled: boolean
    /** encodings[].active values; empty when parameters are unavailable */
    encodingsActive: boolean[]
    /** owning RTCPeerConnection is closed, so the sender no longer sends anything */
    connectionClosed: boolean
}

function senderIsLive(s: AudioSenderSnapshot): boolean {
    if (s.connectionClosed || !s.hasTrack || !s.trackLive || !s.trackEnabled) return false
    // No encodings reported means "not disabled via parameters"
    return s.encodingsActive.length === 0 || s.encodingsActive.some(active => active)
}

/**
 * Evaluate the sender signal.
 * - live:    some open audio sender is sending a live, enabled track
 * - muted:   at least one relevant sender exists and none is live (this includes leaving the call:
 *            the track goes null or the connection closes)
 * - unknown: no relevant sender has been seen (pre-join screen, or the hook loaded too late)
 *
 * A sender that never had a track (a transceiver pre-created before joining) carries no
 * information and is ignored, so the pre-join screen stays unknown and the DOM decides there.
 * Stale senders of old, closed connections count as not live, which is harmless: any live sender
 * of the current connection still wins.
 */
export function evaluateSenders(senders: Iterable<AudioSenderSnapshot>): SignalState {
    let relevant = false
    for (const s of senders) {
        if (!s.hasTrack && !s.hadTrack) continue
        relevant = true
        if (senderIsLive(s)) return 'live'
    }
    return relevant ? 'muted' : 'unknown'
}
