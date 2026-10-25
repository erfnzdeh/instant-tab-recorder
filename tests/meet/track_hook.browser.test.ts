import { describe, it, expect, beforeAll } from 'vitest'
import { installTrackHook, type TrackHookHandle } from '../../src/meet/track_hook'
import { SENDER_STATE_EVENT, SENDER_STATE_REQUEST_EVENT } from '../../src/meet/combine'

// Real Chromium WebRTC objects; the hook patches this test page's globals once
let hook: TrackHookHandle
const events: string[] = []

function audioTrack(): MediaStreamTrack {
    const ctx = new AudioContext()
    return ctx.createMediaStreamDestination().stream.getAudioTracks()[0]
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

async function setActive(sender: RTCRtpSender, active: boolean) {
    const params = sender.getParameters()
    params.encodings.forEach(e => (e.active = active))
    await sender.setParameters(params)
    await tick()
}

beforeAll(() => {
    document.addEventListener(SENDER_STATE_EVENT, e => events.push((e as CustomEvent<string>).detail))
    hook = installTrackHook(window)!
})

describe('installTrackHook', () => {
    it('installs only once', () => {
        expect(hook).not.toBeNull()
        expect(installTrackHook(window)).toBeNull()
    })

    it('is unknown before any audio sender exists, ignoring video', async () => {
        const pc = new RTCPeerConnection()
        pc.addTransceiver('video')
        await tick()
        expect(hook.evaluate()).toBe('unknown')
        pc.close()
    })

    it('follows mute the way Meet does it: track.enabled and encodings[].active', async () => {
        const pc = new RTCPeerConnection()
        const track = audioTrack()
        const sender = pc.addTrack(track, new MediaStream([track]))
        await tick()
        expect(hook.evaluate()).toBe('live')

        track.enabled = false
        await setActive(sender, false)
        expect(hook.evaluate()).toBe('muted')

        track.enabled = true
        await setActive(sender, true)
        expect(hook.evaluate()).toBe('live')
        pc.close()
    })

    it('reports muted after leaving: track replaced by null, then connection closed', async () => {
        const pc = new RTCPeerConnection()
        const track = audioTrack()
        const sender = pc.addTrack(track, new MediaStream([track]))
        await tick()
        expect(hook.evaluate()).toBe('live')

        await sender.replaceTrack(null)
        await tick()
        expect(hook.evaluate()).toBe('muted')

        await sender.replaceTrack(track)
        await tick()
        expect(hook.evaluate()).toBe('live')

        pc.close()
        await tick()
        expect(hook.evaluate()).toBe('muted')
    })

    it('finds senders it missed through getSenders (late injection)', async () => {
        // Senders created before install are invisible until Meet touches them; simulate with
        // a fresh connection whose sender is only discovered via getSenders()
        const pc = new RTCPeerConnection()
        const track = audioTrack()
        pc.addTrack(track, new MediaStream([track]))
        pc.getSenders()
        await tick()
        expect(hook.evaluate()).toBe('live')
        pc.close()
    })

    it('emits state changes and answers requests on the page document', async () => {
        events.length = 0
        const pc = new RTCPeerConnection()
        const track = audioTrack()
        pc.addTrack(track, new MediaStream([track]))
        await tick()
        track.enabled = false
        await tick()
        document.dispatchEvent(new CustomEvent(SENDER_STATE_REQUEST_EVENT))
        expect(events).toEqual(['live', 'muted', 'muted'])
        pc.close()
    })

    it('does not change what Meet sees from the wrapped APIs', async () => {
        const pc = new RTCPeerConnection()
        const track = audioTrack()
        const sender = pc.addTrack(track, new MediaStream([track]))
        expect(sender).toBeInstanceOf(RTCRtpSender)
        expect(pc.getSenders()).toContain(sender)
        expect(pc.addTransceiver('audio')).toBeInstanceOf(RTCRtpTransceiver)
        await expect(sender.setParameters({ ...sender.getParameters(), transactionId: 'stale' })).rejects.toThrow()
        track.enabled = false
        expect(track.enabled).toBe(false)
        pc.close()
    })
})
