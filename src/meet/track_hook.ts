import { SENDER_STATE_EVENT, SENDER_STATE_REQUEST_EVENT, type SignalState } from './combine'
import { evaluateSenders, type AudioSenderSnapshot } from './sender_signal'

/**
 * MAIN-world hook for Google Meet: watches Meet's outgoing audio RTCRtpSender and reports whether
 * it is sending (see sender_signal.ts for the observed behaviour).
 *
 * Safety rules, since this runs inside Meet's own page:
 * - Every wrapper calls the original with the same arguments and returns its result unchanged.
 * - Our own bookkeeping is wrapped in try/catch and never throws into Meet.
 * - The hook never calls RTCRtpSender.getParameters(): doing so between Meet's own getParameters()
 *   and setParameters() could invalidate Meet's transactionId. Encoding state is read from the
 *   parameters Meet passes to setParameters() instead.
 * - Nothing is sent anywhere except a CustomEvent on this page's document, read by our isolated
 *   content script.
 */

interface TrackedSender {
    pc?: RTCPeerConnection
    hadTrack: boolean
    /** encodings[].active from Meet's last successful setParameters() call */
    encodingsActive: boolean[]
}

const INSTALLED = Symbol.for('instant-tab-recorder.meet-track-hook')

/** Run our own bookkeeping without ever throwing into Meet */
function safe(fn: () => void): void {
    try {
        fn()
    } catch (e) {
        console.debug('[instant-tab-recorder] meet hook:', e)
    }
}

export interface TrackHookHandle {
    /** Current sender state (for tests) */
    evaluate(): SignalState
}

export function installTrackHook(win: Window & typeof globalThis): TrackHookHandle | null {
    const marker = win as unknown as Record<symbol, unknown>
    if (marker[INSTALLED]) return null
    marker[INSTALLED] = true

    const senders = new Map<RTCRtpSender, TrackedSender>()
    let lastReported: SignalState | null = null

    const track = (sender: RTCRtpSender | null | undefined, pc?: RTCPeerConnection, kindHint?: string) => {
        if (sender == null) return
        const existing = senders.get(sender)
        const kind = sender.track?.kind ?? kindHint
        if (existing == null && kind !== 'audio') return
        const entry = existing ?? { hadTrack: false, encodingsActive: [] }
        if (pc != null && entry.pc == null) entry.pc = pc
        if (sender.track != null) entry.hadTrack = true
        senders.set(sender, entry)
    }

    const snapshot = (sender: RTCRtpSender, entry: TrackedSender): AudioSenderSnapshot => {
        const t = sender.track
        if (t != null) entry.hadTrack = true
        const pc = entry.pc
        return {
            hasTrack: t != null,
            hadTrack: entry.hadTrack,
            trackLive: t?.readyState === 'live',
            trackEnabled: t?.enabled ?? false,
            encodingsActive: entry.encodingsActive,
            connectionClosed: pc != null && (pc.connectionState === 'closed' || pc.signalingState === 'closed'),
        }
    }

    const evaluate = (): SignalState => evaluateSenders([...senders].map(([s, e]) => snapshot(s, e)))

    const emit = (force = false) =>
        safe(() => {
            const state = evaluate()
            if (!force && state === lastReported) return
            lastReported = state
            win.document.dispatchEvent(new CustomEvent(SENDER_STATE_EVENT, { detail: state }))
        })

    // Re-evaluate once Meet's current synchronous code has finished (it toggles several things at once)
    let scheduled = false
    const schedule = () => {
        if (scheduled) return
        scheduled = true
        win.queueMicrotask(() => {
            scheduled = false
            emit()
        })
    }

    const pcProto = win.RTCPeerConnection?.prototype
    const senderProto = win.RTCRtpSender?.prototype
    const trackProto = win.MediaStreamTrack?.prototype
    if (pcProto == null || senderProto == null || trackProto == null) return { evaluate }

    const origAddTrack = pcProto.addTrack
    pcProto.addTrack = function (this: RTCPeerConnection, ...args: Parameters<RTCPeerConnection['addTrack']>) {
        const sender = origAddTrack.apply(this, args)
        safe(() => {
            track(sender, this, args[0]?.kind)
            schedule()
        })
        return sender
    }

    const origAddTransceiver = pcProto.addTransceiver
    pcProto.addTransceiver = function (
        this: RTCPeerConnection,
        ...args: Parameters<RTCPeerConnection['addTransceiver']>
    ) {
        const transceiver = origAddTransceiver.apply(this, args)
        safe(() => {
            const kind = typeof args[0] === 'string' ? args[0] : args[0]?.kind
            track(transceiver.sender, this, kind)
            schedule()
        })
        return transceiver
    }

    // Catch-alls for senders created before the hook saw them (e.g. late injection)
    const origGetSenders = pcProto.getSenders
    pcProto.getSenders = function (this: RTCPeerConnection) {
        const result = origGetSenders.call(this)
        safe(() => result.forEach(s => track(s, this)))
        return result
    }
    const origGetTransceivers = pcProto.getTransceivers
    pcProto.getTransceivers = function (this: RTCPeerConnection) {
        const result = origGetTransceivers.call(this)
        safe(() => result.forEach(t => track(t.sender, this, t.receiver?.track?.kind)))
        return result
    }

    const origClose = pcProto.close
    pcProto.close = function (this: RTCPeerConnection) {
        const result = origClose.call(this)
        safe(schedule)
        return result
    }

    const origSetParameters = senderProto.setParameters
    senderProto.setParameters = function (this: RTCRtpSender, ...args: Parameters<RTCRtpSender['setParameters']>) {
        const params = args[0]
        safe(() => track(this))
        const result = origSetParameters.apply(this, args)
        result.then(
            () =>
                safe(() => {
                    const entry = senders.get(this)
                    if (entry != null && Array.isArray(params?.encodings)) {
                        entry.encodingsActive = params.encodings.map(e => e.active !== false)
                    }
                    schedule()
                }),
            () => {},
        )
        return result
    }

    const origReplaceTrack = senderProto.replaceTrack
    senderProto.replaceTrack = function (this: RTCRtpSender, ...args: Parameters<RTCRtpSender['replaceTrack']>) {
        safe(() => track(this, undefined, args[0]?.kind))
        const result = origReplaceTrack.apply(this, args)
        result.then(
            () => safe(schedule),
            () => {},
        )
        return result
    }

    const enabledDescriptor = Object.getOwnPropertyDescriptor(trackProto, 'enabled')
    if (enabledDescriptor?.set != null && enabledDescriptor.get != null) {
        const origSet = enabledDescriptor.set
        Object.defineProperty(trackProto, 'enabled', {
            ...enabledDescriptor,
            set(this: MediaStreamTrack, value: boolean) {
                origSet.call(this, value)
                if (this.kind === 'audio') safe(schedule)
            },
        })
    }

    const origStop = trackProto.stop
    trackProto.stop = function (this: MediaStreamTrack) {
        const result = origStop.call(this)
        if (this.kind === 'audio') safe(schedule)
        return result
    }

    win.document.addEventListener(SENDER_STATE_REQUEST_EVENT, () => emit(true))
    // Safety net for changes no wrapper sees (e.g. a track ending on its own)
    win.setInterval(() => emit(), 1000)

    return { evaluate }
}
