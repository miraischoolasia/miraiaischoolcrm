import { describe, expect, it } from 'vitest'
import {
  bunnyEmbedUrl,
  bunnyState,
  pickRecordingFile,
  readRecordingFiles,
  recordingTitle,
  zoomRecordingsPath,
} from '../../supabase/functions/zoom-lesson/recordings'

describe('recordings to Bunny', () => {
  it('picks the shared screen with the teacher, else the biggest video', () => {
    const files = [
      { file_type: 'M4A', recording_type: 'audio_only', download_url: 'a' },
      { file_type: 'MP4', recording_type: 'gallery_view', download_url: 'g', file_size: 900 },
      { file_type: 'MP4', recording_type: 'shared_screen_with_speaker_view', download_url: 's', file_size: 100 },
    ]
    expect(pickRecordingFile(files)?.download_url).toBe('s')
    expect(pickRecordingFile([{ file_type: 'MP4', recording_type: 'x', download_url: 'x1', file_size: 1 }, { file_type: 'MP4', recording_type: 'y', download_url: 'y1', file_size: 5 }])?.download_url).toBe('y1')
    expect(pickRecordingFile([{ file_type: 'MP4', recording_type: 'active_speaker', download_url: 'p', status: 'processing' }])).toBeNull()
    expect(pickRecordingFile(undefined)).toBeNull()
  })

  it('reads the files and the download token from Zoom\'s message', () => {
    expect(readRecordingFiles({ download_token: 'tok', payload: { object: { recording_files: [{ id: '1' }] } } })).toEqual({
      files: [{ id: '1' }],
      downloadToken: 'tok',
    })
    expect(readRecordingFiles({})).toEqual({ files: [], downloadToken: null })
  })

  it('reads Bunny\'s status', () => {
    expect(bunnyState(4)).toBe('ready')
    expect(bunnyState(5)).toBe('failed')
    expect(bunnyState(6)).toBe('failed')
    expect(bunnyState(3)).toBe('processing')
    expect(bunnyState(undefined)).toBe('processing')
  })

  it('encodes Zoom meeting UUIDs that need it twice', () => {
    expect(zoomRecordingsPath('abc==')).toBe('/meetings/abc%3D%3D/recordings')
    expect(zoomRecordingsPath('/ab//c')).toBe(`/meetings/${encodeURIComponent(encodeURIComponent('/ab//c'))}/recordings`)
  })

  it('names the video after the class and lesson, and plays it from Bunny', () => {
    expect(recordingTitle('WED Coding C002', '2026-10-21', 12)).toBe('WED Coding C002 · 2026-10-21 · lesson 12')
    expect(recordingTitle(null, '2026-10-21', 12)).toBe('Class · 2026-10-21 · lesson 12')
    expect(bunnyEmbedUrl('123', 'abc')).toBe('https://iframe.mediadelivery.net/embed/123/abc')
  })
})
