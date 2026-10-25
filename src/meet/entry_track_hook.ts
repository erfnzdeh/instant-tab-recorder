// Content script entry (MAIN world). Built as a standalone IIFE, see vite.config.ts.
import { installTrackHook } from './track_hook'

installTrackHook(window)
