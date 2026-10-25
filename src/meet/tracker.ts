import { combineSignals, signalsDisagree, type MeetMuteState, type SignalState } from './combine'

/**
 * How long the last known state is kept when both signals turn unknown. Joining a call, moving
 * between breakout rooms or reconnecting briefly removes the mic button and the sender; holding
 * the state avoids flapping, while a longer outage still surfaces as unknown (fail-open + warning).
 */
export const UNKNOWN_GRACE_MS = 3000

/** A contradiction between the two signals must last this long before it is reported */
export const DISAGREEMENT_REPORT_MS = 1000

/**
 * After a page load (or entering a meeting without reloading) Meet needs a moment to render the
 * mic button and create its connection. During this settling window "unknown" is not reported, so
 * a normal page load is not mistaken for broken detection. The recorder keeps whatever it last
 * applied: after leaving a call (silenced) the mic stays silent until the pre-join screen shows the
 * real toggle. If nothing is detected by the end of the window, unknown is reported (fail-open).
 */
export const STARTUP_GRACE_MS = 5000

export interface MeetMuteSnapshot {
    state: MeetMuteState
    dom: SignalState
    sender: SignalState
    /** Still inside the startup window: state is not yet meaningful and must not be acted on */
    settling: boolean
}

export interface MeetMuteTrackerCallbacks {
    onChange: (snapshot: MeetMuteSnapshot) => void
    /** Called once per disagreement episode that lasts longer than DISAGREEMENT_REPORT_MS */
    onDisagreement?: (snapshot: MeetMuteSnapshot) => void
}

/**
 * Turns raw signal updates into the state reported for the tab: applies the combine rule,
 * the unknown grace period, and the meeting-page check.
 */
export class MeetMuteTracker {
    private dom: SignalState = 'unknown'
    private sender: SignalState = 'unknown'
    private meetingPage = true
    private reported: MeetMuteState | null = null
    private graceTimer: ReturnType<typeof setTimeout> | null = null
    private disagreementTimer: ReturnType<typeof setTimeout> | null = null
    private settling = false
    private settleTimer: ReturnType<typeof setTimeout> | null = null

    constructor(private readonly callbacks: MeetMuteTrackerCallbacks) {
        this.startSettling()
    }

    get snapshot(): MeetMuteSnapshot {
        return {
            state: this.reported ?? 'unknown',
            dom: this.dom,
            sender: this.sender,
            settling: this.meetingPage && this.settling,
        }
    }

    setDom(state: SignalState): void {
        this.dom = state
        this.update()
    }

    setSender(state: SignalState): void {
        this.sender = state
        this.update()
    }

    setMeetingPage(isMeetingPage: boolean): void {
        if (isMeetingPage && !this.meetingPage) this.startSettling()
        this.meetingPage = isMeetingPage
        this.update()
    }

    dispose(): void {
        this.clearGrace()
        this.clearDisagreement()
        this.stopSettling()
    }

    private startSettling(): void {
        this.stopSettling()
        this.settling = true
        this.settleTimer = setTimeout(() => {
            this.settleTimer = null
            this.settling = false
            this.update()
        }, STARTUP_GRACE_MS)
    }

    private stopSettling(): void {
        this.settling = false
        if (this.settleTimer == null) return
        clearTimeout(this.settleTimer)
        this.settleTimer = null
    }

    private update(): void {
        this.trackDisagreement()

        if (!this.meetingPage) {
            this.clearGrace()
            this.report('inactive')
            return
        }

        const combined = combineSignals(this.dom, this.sender)
        if (combined !== 'unknown') {
            this.stopSettling()
            this.clearGrace()
            this.report(combined)
            return
        }

        // The page is still loading: wait for the first real reading
        if (this.settling) return

        // Unknown after settling: report immediately so the recorder fails open without delay
        if (this.reported === null || this.reported === 'unknown' || this.reported === 'inactive') {
            this.report('unknown')
            return
        }
        if (this.graceTimer != null) return
        this.graceTimer = setTimeout(() => {
            this.graceTimer = null
            this.report('unknown')
        }, UNKNOWN_GRACE_MS)
    }

    private trackDisagreement(): void {
        if (!signalsDisagree(this.dom, this.sender)) {
            this.clearDisagreement()
            return
        }
        if (this.disagreementTimer != null) return
        this.disagreementTimer = setTimeout(() => {
            // Keep the (fired) handle set so the same episode is not reported twice
            this.callbacks.onDisagreement?.(this.snapshot)
        }, DISAGREEMENT_REPORT_MS)
    }

    private report(state: MeetMuteState): void {
        if (state === this.reported) return
        this.reported = state
        this.callbacks.onChange(this.snapshot)
    }

    private clearGrace(): void {
        if (this.graceTimer == null) return
        clearTimeout(this.graceTimer)
        this.graceTimer = null
    }

    private clearDisagreement(): void {
        if (this.disagreementTimer == null) return
        clearTimeout(this.disagreementTimer)
        this.disagreementTimer = null
    }
}
