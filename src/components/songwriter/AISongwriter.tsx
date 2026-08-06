import React, { useMemo, useState } from 'react';

export interface SongwriterResult {
  prompt: string;
  lyrics: string;
  genre: string;
  mood: string;
  voice: string;
  language: string;
}

interface AISongwriterProps {
  onApply: (result: SongwriterResult) => void;
}export function AISongwriter({ onApply }: AISongwriterProps) {
  const [genre, setGenre] = useState('Deep House');
  const [mood, setMood] = useState('Emotional');
  const [voice, setVoice] = useState('Female');
  const [language, setLanguage] = useState('English');
  const [theme, setTheme] = useState('');

  const generatedPrompt = useMemo(() => {
    return [
      `Create a professional ${genre} track.`,
      `${mood} atmosphere.`,
      `${voice} lead vocals in ${language}.`,
      theme ? `Song theme: ${theme}.` : '',
      'Deep bassline, punchy kick, organic percussion, atmospheric pads,',
      'catchy chorus, clear song structure, professional club mix,',
      'radio-ready mastering and high-quality vocal production.'
    ]
      .filter(Boolean)
      .join(' ');
  }, [genre, mood, voice, language, theme]);  const generatedLyrics = useMemo(() => {
    const subject = theme.trim() || 'freedom, connection and the night';

    return `[Verse 1]
Under the lights, I hear your call
We feel the rhythm through it all
Every heartbeat comes alive
Tonight we leave the world behind

[Pre-Chorus]
Let the music take control
Feel the fire in your soul

[Chorus]
Take me higher through the night
We are dancing in the light
No more fear and no goodbyes
We are free beneath the sky

[Verse 2]
Every shadow fades away
We keep moving till the day
In this moment we belong
Our hearts are beating with the song

[Bridge]
This song is about ${subject}

[Final Chorus]
Take me higher through the night
We are dancing in the light
Hold me closer, feel the fire
You and I will rise higher

[Outro]
Higher
Higher
Into the light`;
  }, [theme]);

  const applySong = () => {
    onApply({
      prompt: generatedPrompt,
      lyrics: generatedLyrics,
      genre,
      mood,
      voice,
      language
    });
  };  return (
    <section className="rounded-2xl border border-purple-800/50 bg-slate-900/70 p-5">
      <h2 className="mb-4 text-lg font-semibold text-purple-300">
        AI Songwriter
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-400">
          <span>Genre</span>

          <select
            value={genre}
            onChange={event => setGenre(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
          >
            <option>House</option>
            <option>Deep House</option>
            <option>Tech House</option>
            <option>Tribal House</option>
            <option>Afro House</option>
            <option>Melodic House</option>
          </select>
        </label>        <label className="space-y-1 text-xs text-slate-400">
          <span>Mood</span>

          <select
            value={mood}
            onChange={event => setMood(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
          >
            <option>Emotional</option>
            <option>Romantic</option>
            <option>Energetic</option>
            <option>Dreamy</option>
            <option>Dark</option>
            <option>Uplifting</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          <span>Voice</span>

          <select
            value={voice}
            onChange={event => setVoice(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
          >
            <option>Female</option>
            <option>Male</option>
            <option>Duo</option>
          </select>
        </label>

        <label className="space-y-1 text-xs text-slate-400">
          <span>Language</span>

          <select
            value={language}
            onChange={event => setLanguage(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
          >
            <option>English</option>
            <option>Italian</option>
            <option>Spanish</option>
          </select>
        </label>
      </div>      <label className="mt-4 block space-y-1 text-xs text-slate-400">
        <span>Theme</span>

        <input
          value={theme}
          onChange={event => setTheme(event.target.value)}
          placeholder="Example: summer love at an Ibiza beach club"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
        />
      </label>

      <button
        type="button"
        onClick={applySong}
        className="mt-5 w-full rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-500"
      >
        Create Prompt and Lyrics
      </button>
    </section>
  );
}