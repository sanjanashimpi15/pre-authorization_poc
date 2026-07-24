
import { postToProxy } from './api';

/**
 * Synthesizes speech from text by sending a request to the backend proxy.
 */
export const synthesizeSpeech = async (text: string, lang: string): Promise<string | null> => {
  try {
    const response = await postToProxy('/tts/synthesize', {
      input: { text },
      voice: { languageCode: lang },
      audioConfig: { audioEncoding: 'MP3' },
    });

    if (response.audioContent) {
      return `data:audio/wav;base64,${response.audioContent}`;
    }
    return null;
  } catch (error) {
    console.error('Failed to synthesize speech via proxy:', error);
    return null;
  }
};
