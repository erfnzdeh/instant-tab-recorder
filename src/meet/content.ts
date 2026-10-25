import { isMeetingPath, SENDER_STATE_EVENT, SENDER_STATE_REQUEST_EVENT, type SignalState } from './combine'
import { observeMicButton } from './dom_detector'
import { MeetMuteTracker, type MeetMuteSnapshot } from './tracker'
import type {
    MeetContentReadyMessage,
    MeetContentReadyResponse,
    MeetMuteDisagreementMessage,
    MeetMuteStateMessage,
    Message,
} from '../message'

/**
 * Isolated-world content script for Google Meet. Combines the mic button (DOM) and the sender
 * signal from the MAIN-world hook, and reports the result to the service worker.
 *
 * It stays passive until the service worker says this tab is being recorded (meet-sync-control,
 * or the meet-content-ready response after a page reload), so normal Meet use sends no messages.
 */

const SIGNAL_STATES = new Set<SignalState>(['live', 'muted', 'unknown'])

export interface MeetContentDeps {
    document: Document
    location: Pick<Location, 'pathname'>
    sendMessage(msg: Message): Promise<unknown>
    onMessage(listener: (msg: Message, sendResponse: (response: MeetMuteStateMessage) => void) => void): void
}

export class MeetContent {
    private reporting = false
    private hookActive = false
    private readonly tracker: MeetMuteTracker

    constructor(private readonly deps: MeetContentDeps) {
        this.tracker = new MeetMuteTracker({
            onChange: snapshot => this.report(snapshot),
            onDisagreement: snapshot => {
                if (!this.reporting) return
                const msg: MeetMuteDisagreementMessage = {
                    type: 'meet-mute-disagreement',
                    dom: snapshot.dom,
                    sender: snapshot.sender,
                }
                this.send(msg)
            },
        })
    }

    start(): void {
        const { document } = this.deps
        document.addEventListener(SENDER_STATE_EVENT, event => {
            const detail = (event as CustomEvent<unknown>).detail
            if (typeof detail !== 'string' || !SIGNAL_STATES.has(detail as SignalState)) return
            this.hookActive = true
            this.tracker.setSender(detail as SignalState)
        })

        this.checkPath()
        observeMicButton(document, state => {
            this.checkPath()
            this.tracker.setDom(state)
        })
        // Meet navigates between home and meetings without reloading
        setInterval(() => this.checkPath(), 1000)

        // Ask the hook for its current state in case it loaded first
        document.dispatchEvent(new CustomEvent(SENDER_STATE_REQUEST_EVENT))

        this.deps.onMessage((msg, sendResponse) => {
            if (msg.type !== 'meet-sync-control') return
            this.reporting = msg.report
            const current = this.stateMessage(this.tracker.snapshot)
            sendResponse(current)
            // The response only reaches the service worker; broadcast so the recorder applies it too
            if (this.reporting && !current.settling) this.send(current)
        })

        const ready: MeetContentReadyMessage = { type: 'meet-content-ready' }
        this.deps
            .sendMessage(ready)
            .then(response => {
                if ((response as MeetContentReadyResponse | undefined)?.report !== true) return
                this.reporting = true
                const current = this.stateMessage(this.tracker.snapshot)
                if (!current.settling) this.send(current)
            })
            .catch(() => {})
    }

    private checkPath(): void {
        this.tracker.setMeetingPage(isMeetingPath(this.deps.location.pathname))
    }

    private stateMessage(snapshot: MeetMuteSnapshot): MeetMuteStateMessage {
        return { type: 'meet-mute-state', ...snapshot, hookActive: this.hookActive }
    }

    private report(snapshot: MeetMuteSnapshot): void {
        if (!this.reporting) return
        this.send(this.stateMessage(snapshot))
    }

    private send(msg: Message): void {
        // Fails when the extension was reloaded or updated; this page then simply stops reporting
        this.deps.sendMessage(msg).catch(() => {})
    }
}
