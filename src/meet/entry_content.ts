// Content script entry (isolated world). Built as a standalone IIFE, see vite.config.ts.
import { MeetContent } from './content'
import type { Message } from '../message'

const INSTALLED = '__instantTabRecorderMeetContent'
const marker = window as unknown as Record<string, unknown>

// executeScript may inject into a tab where the registered script already runs
if (!marker[INSTALLED]) {
    marker[INSTALLED] = true
    new MeetContent({
        document,
        location,
        sendMessage: msg => chrome.runtime.sendMessage(msg),
        onMessage: listener => {
            chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
                if (msg.type !== 'meet-sync-control') return
                listener(msg, sendResponse)
            })
        },
    }).start()
}
