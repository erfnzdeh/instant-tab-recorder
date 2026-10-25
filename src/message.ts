import type { Resolution, Configuration, SyncConfiguration, CropRegion, VideoRecordingMode } from './configuration'
import type { RecordingState } from './handler'
import type { ModelDownloadProgress } from './ml/model_downloader'
import type { SummaryResult } from './summary/types'
import type { MeetMuteState, SignalState } from './meet/combine'

export const TIMER_STOP_CONFIRM_PENDING_KEY = 'timerStopConfirmPending'
export const TIMER_STOP_TRIGGER_KEY = 'timerStopTrigger'

export type Message =
    | ExceptionMessage
    | SentryEventMessage
    | StartRecordingMessage
    | TabTrackEndedMessage
    | StopRecordingMessage
    | PauseRecordingMessage
    | ResumeRecordingMessage
    | UnexpectedRecordingStateMessage
    | CancelRecordingMessage
    | ResizeWindowMessage
    | FetchConfigMessage
    | SaveConfigLocalMessage
    | SaveConfigSyncMessage
    | RecordingStateMessage
    | RequestRecordingStateMessage
    | PreviewFrameMessage
    | PreviewControlMessage
    | UpdateCropRegionMessage
    | RecordingTickMessage
    | TimerExpiredMessage
    | TimerUpdatedMessage
    | ConfirmTimerStopMessage
    | UpdateRecordingTimerMessage
    | ClaimClientsMessage
    | StartModelDownloadMessage
    | ModelDownloadProgressMessage
    | ModelDownloadCompleteMessage
    | ModelDownloadErrorMessage
    | CancelModelDownloadMessage
    | QueryModelDownloadStatusMessage
    | ModelDownloadStatusResponseMessage
    | StartTranscriptionMessage
    | TranscriptionProgressMessage
    | TranscriptionCompleteMessage
    | TranscriptionErrorMessage
    | TranscriptionDeletedMessage
    | QueryTranscriptionStatusMessage
    | TranscriptionStatusResponseMessage
    | StartSummaryMessage
    | SummaryProgressMessage
    | SummaryCompleteMessage
    | SummaryErrorMessage
    | SummaryDeletedMessage
    | QuerySummaryStatusMessage
    | SummaryStatusResponseMessage
    | CancelTasksForPathMessage
    | CloseOffscreenIfIdleMessage
    | SetMicMutedMessage
    | MeetMuteStateMessage
    | MeetMuteDisagreementMessage
    | MeetContentReadyMessage
    | MeetSyncControlMessage
    | MeetFollowMessage

export interface ExceptionMessage {
    type: 'exception'
    data: unknown
}

export interface SentryEventMessage {
    type: 'sentry-event'
    event: import('./sentry_event').Event
}

export type Trigger = 'action-icon' | 'context-menu' | 'keyboard-shortcut' | 'tab-track-ended' | 'timer'

export type StartTrigger = Exclude<Trigger, 'tab-track-ended' | 'timer'>

export interface StartRecordingMessage {
    type: 'start-recording'
    data: StartRecording
    trigger: StartTrigger
}
export interface StartRecording {
    tabSize: Resolution
    streamId: string
}
export interface StartRecordingResponse {
    startAtMs: number
    mainFilePath: string
    mimeType: string
    recordingMode: VideoRecordingMode
    micEnabled: boolean
    /** The recorded mic should follow Meet's mute state (setting on and a mic is being recorded) */
    followMeetMute: boolean
    stopAtMs?: number
}

export interface TabTrackEndedMessage {
    type: 'tab-track-ended'
}

export interface StopRecordingMessage {
    type: 'stop-recording'
    trigger: Trigger
}

export interface PauseRecordingMessage {
    type: 'pause-recording'
    trigger: Trigger
}

export interface ResumeRecordingMessage {
    type: 'resume-recording'
    trigger: Trigger
}

export interface UnexpectedRecordingStateMessage {
    type: 'unexpected-recording-state'
    error: string
}

export interface CancelRecordingMessage {
    type: 'cancel-recording'
}

export interface ResizeWindowMessage {
    type: 'resize-window'
    data: Resolution
}

export interface FetchConfigMessage {
    type: 'fetch-config'
}

export interface SaveConfigLocalMessage {
    type: 'save-config-local'
    data: Configuration
}

export interface SaveConfigSyncMessage {
    type: 'save-config-sync'
    data: SyncConfiguration
}

// Recording state notification (service_worker → option page)
export interface RecordingStateMessage {
    type: 'recording-state'
    data: RecordingState
}

// Request current recording state (option page → service_worker)
export interface RequestRecordingStateMessage {
    type: 'request-recording-state'
}

// Preview frame transfer (offscreen → service_worker → option page)
export interface PreviewFrameMessage {
    type: 'preview-frame'
    recordingSize: Resolution
    image: string // base64 encoded jpeg image
}

// Preview start/stop request (option page → service_worker → offscreen)
export interface PreviewControlMessage {
    type: 'preview-control'
    action: 'start' | 'stop'
}

// Cropping region update (option page → service_worker → offscreen)
export interface UpdateCropRegionMessage {
    type: 'update-crop-region'
    region: CropRegion
}

// Periodic tick during recording (offscreen → service_worker)
export interface RecordingTickMessage {
    type: 'recording-tick'
}

// Timer expired notification (offscreen → service_worker)
export interface TimerExpiredMessage {
    type: 'timer-expired'
}

// Timer updated notification (offscreen → service_worker)
export interface TimerUpdatedMessage {
    type: 'timer-updated'
    stopAtMs: number | null
}

// Confirm timer stop (option page → service_worker)
export interface ConfirmTimerStopMessage {
    type: 'confirm-timer-stop'
    trigger: Trigger
}

// Update recording timer (option page → offscreen)
export interface UpdateRecordingTimerMessage {
    type: 'update-recording-timer'
    enabled: boolean
    durationMinutes: number
}

// Request service worker to claim clients (option page → service_worker)
export interface ClaimClientsMessage {
    type: 'claim-clients'
}

export type ModelType = 'transcription' | 'summary'

// Model download request (settings → service_worker → offscreen)
export interface StartModelDownloadMessage {
    type: 'start-model-download'
    modelType: ModelType
}

// Model download progress (offscreen → service_worker → settings)
export interface ModelDownloadProgressMessage {
    type: 'model-download-progress'
    modelType: ModelType
    loaded: number
    total: number
    file: string
    fileIndex?: number
    totalFiles?: number
}

// Model download complete notification (offscreen → service_worker → settings)
export interface ModelDownloadCompleteMessage {
    type: 'model-download-complete'
    modelType: ModelType
}

// Model download error notification (offscreen → service_worker → settings)
export interface ModelDownloadErrorMessage {
    type: 'model-download-error'
    modelType: ModelType
    error: string
}

// Model download cancel request (settings → service_worker → offscreen)
export interface CancelModelDownloadMessage {
    type: 'cancel-model-download'
    modelType: ModelType
}

// Query if model download is in progress (settings → service_worker → offscreen)
export interface QueryModelDownloadStatusMessage {
    type: 'query-model-download-status'
    modelType: ModelType
}

// Response for model download status query (offscreen → settings)
export interface ModelDownloadStatusResponseMessage {
    type: 'model-download-status-response'
    modelType: ModelType
    isDownloading: boolean
    progress?: ModelDownloadProgress | null
}

// Transcription start request (player → service_worker → offscreen)
export interface StartTranscriptionMessage {
    type: 'start-transcription'
    path: string
}

// Transcription progress update (offscreen → service_worker → player)
export interface TranscriptionProgressMessage {
    type: 'transcription-progress'
    path: string
    stage?: 'model_load' | 'loudness' | 'vad' | 'inference'
    loaded: number
    total: number
}

// Transcription complete notification (offscreen → service_worker → player / record list)
export interface TranscriptionCompleteMessage {
    type: 'transcription-complete'
    path: string
}

// Transcription error notification (offscreen → service_worker → player)
export interface TranscriptionErrorMessage {
    type: 'transcription-error'
    path: string
    error: string
}

// Transcription deleted notification (player / handler → record list)
export interface TranscriptionDeletedMessage {
    type: 'transcription-deleted'
    path: string
}

// Query if transcription is in progress for a file (player → service_worker → offscreen)
export interface QueryTranscriptionStatusMessage {
    type: 'query-transcription-status'
    path: string
}

// Response for transcription status query (offscreen → player)
export interface TranscriptionStatusResponseMessage {
    type: 'transcription-status-response'
    path: string
    isTranscribing: boolean
}

// Summary start request (player → service_worker → offscreen)
export interface StartSummaryMessage {
    type: 'start-summary'
    path: string
}

// Summary progress update (offscreen → service_worker → player)
export interface SummaryProgressMessage {
    type: 'summary-progress'
    path: string
    stage?: 'model_load' | 'generating'
    loaded: number
    total: number
}

// Summary complete notification (offscreen → service_worker → player)
export interface SummaryCompleteMessage {
    type: 'summary-complete'
    path: string
    summary: SummaryResult
}

// Summary error notification (offscreen → service_worker → player)
export interface SummaryErrorMessage {
    type: 'summary-error'
    path: string
    error: string
}

// Summary deleted notification (player / handler)
export interface SummaryDeletedMessage {
    type: 'summary-deleted'
    path: string
}

// Query if summary is in progress for a file (player → service_worker → offscreen)
export interface QuerySummaryStatusMessage {
    type: 'query-summary-status'
    path: string
}

// Response for summary status query (offscreen → player)
export interface SummaryStatusResponseMessage {
    type: 'summary-status-response'
    path: string
    isSummarizing: boolean
}

// Cancel all in-progress transcription / summary tasks for a recording path
// (service_worker → offscreen, triggered by recording DELETE)
export interface CancelTasksForPathMessage {
    type: 'cancel-tasks-for-path'
    path: string
}

// Request offscreen document to close itself if no tasks are active (service_worker → offscreen)
export interface CloseOffscreenIfIdleMessage {
    type: 'close-offscreen-if-idle'
}

// Silence or restore the recorded microphone (service_worker → offscreen)
export interface SetMicMutedMessage {
    type: 'set-mic-muted'
    muted: boolean
}

// Mute state of a Meet tab (Meet content script → offscreen and service_worker).
// The offscreen recorder applies it directly (no service worker wake-up on the critical path);
// the service worker only keeps the displayed status.
export interface MeetMuteStateMessage {
    type: 'meet-mute-state'
    state: MeetMuteState
    dom: SignalState
    sender: SignalState
    /** The MAIN-world sender hook is running in the page */
    hookActive: boolean
    /** The page is still loading; state is not meaningful yet and must not be acted on */
    settling: boolean
}

// The DOM and sender signals contradicted each other for a while (Meet content script → service_worker)
export interface MeetMuteDisagreementMessage {
    type: 'meet-mute-disagreement'
    dom: SignalState
    sender: SignalState
}

// A Meet content script loaded; the response says whether it should report (content script → service_worker)
export interface MeetContentReadyMessage {
    type: 'meet-content-ready'
}
export interface MeetContentReadyResponse {
    report: boolean
}

// Start or stop reporting mute state (service_worker → Meet content script, via chrome.tabs.sendMessage).
// The content script responds with its current MeetMuteStateMessage.
export interface MeetSyncControlMessage {
    type: 'meet-sync-control'
    report: boolean
}

// Which tab's Meet mute state the recorder follows, or null for none (service_worker → offscreen)
export interface MeetFollowMessage {
    type: 'meet-follow'
    tabId: number | null
}
