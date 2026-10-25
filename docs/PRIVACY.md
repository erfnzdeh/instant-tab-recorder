# Privacy Policy

This privacy policy aims to provide you with a understanding of how the website (recorder.appcloud.info) and the Chrome extension (Instant Tab Recorder) treat user data.

We place a high priority on protecting the privacy of our users and will not obtain, retain, or provide data unnecessarily.

For general terms and conditions governing the use of the Service, please refer to our [Terms of Service](TERMS.md).

## Purpose of Use

The purpose is to achieve the following items necessary for the operation of the service

- Quality improvement
- To understand the usage of the service

## Data Collection

The following information will be obtained and retained.

- Randomly generated user ID (UUID v7) when installing extensions
- User-Agent of the browser
- Recording configuration and transcription processing statistics (not including recording data or transcription text itself)
  - Video resolution (aspect ratio)
  - Video format (codec)
  - Video bit rate (data volume)
  - Transcription processing time, model identifier, language
  - Other configuration items
- Whether "Follow Google Meet mute" detection stopped working or its two signals disagreed during a recording (only the detected states, such as "muted" or "unknown"; no meeting URL, meeting code, participant names or audio)

No personally identifiable information is included in the information collected.

## Information not collected

The following information will not be collected at all.

- IP address
- Personal information (name, address, date of birth, email address, etc.)
- Recording data
- Audio data and transcription data
- Content of Google Meet pages (meeting URL, meeting code, participants, chat, audio or video)

## Google Meet Access (optional)

The "Follow Google Meet mute" setting (added after Chrome extension v1.9.0) silences your microphone in the recording while you are muted in the Google Meet tab being recorded.

- Access to meet.google.com is requested only when you turn this setting on, and is removed when you turn it off.
- With access granted, the extension runs a script on meet.google.com pages that reads only whether your microphone is muted (the mic button state and whether Meet is sending your microphone audio).
- This mute state is used only inside your browser to silence the recording. It is not sent to us or to any external service, except the detection status events described under Data Collection.

## Cookie

Although we do not use this information directly, it may be used by external services as described below.

## External Services

The external services used by the Service are described below.

Please refer to the privacy policy of each service for information regarding collected personal data and their respective handling policies.

- [Sentry](https://sentry.io/privacy/)
  - Purpose: Introduced to manage crash reports, understand service usage patterns for quality improvement, and receive user feedback.
  - For Chrome extensions (<= v1.2.0), you can opt out of sending events via Options Page => Privacy Settings => Bug Tracking.
  - For Chrome extensions (>= v1.3.0), you can opt out of sending events via Options Page => Support Tab => Bug Tracking.
    - Note: The Feedback feature that uses Sentry cannot be used when opted out.

- [Hugging Face](https://huggingface.co/privacy)
  - Purpose: Used to retrieve model data required to use the transcription feature.
  - Added in Chrome extension v1.8.0.
  - Model data will be downloaded when you opt in via Options Page => Settings.

## Privacy Policy Revisions

This Privacy Policy may be revised from time to time.
Revised versions will be posted on this site.

### Revision History

- 2024-06-22: Enacted
- 2026-02-10: Revised (updated Sentry opt-out instructions, added other configuration items to data collection)
- 2026-09-04: Revised (updated upon release of Terms of Service)
- 2026-09-09: Revised (clarified data handling for transcription feature, clarified independence from Terms of Service)
- 2026-10-25: Revised (added optional Google Meet access for the "Follow Google Meet mute" setting)
