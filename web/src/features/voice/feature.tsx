// Voice: speaking to the message box, replies read aloud, and hands-free mode. The microphone and the
// hands-free button sit by the attach button (in sessions and on the start page); the bar to pause or stop
// reading sits above a session's message box; Settings → Voice holds the language, the server's speech
// recognition and the reading voice.
import { Mic } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import type { WebFeature } from '../registry';
import { HandsFreeButton } from './HandsFree';
import { MicButton } from './MicButton';
import { ReadAloudDock } from './ReadAloud';
import { VoiceSettings } from './VoiceSettings';

export const voiceFeature: WebFeature = {
  id: 'voice',
  ComposerButtons: (p: { s?: SessionSummary; insert: (text: string) => void; disabled?: boolean; confidential?: boolean }) => (
    <>
      <MicButton {...p} />
      <HandsFreeButton {...p} />
    </>
  ),
  SessionDock: ReadAloudDock,
  settings: [{ id: 'voice', label: 'Voice', icon: Mic, sub: 'Dictate messages, and have replies read aloud', Body: VoiceSettings }],
};
