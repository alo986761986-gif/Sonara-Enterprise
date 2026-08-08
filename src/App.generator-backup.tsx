import React, { useEffect, useRef, useState } from 'react';

import {
  AISongwriter,
  SongwriterResult
} from './components/songwriter/AISongwriter';

import { ProfessionalAudioEqualizer } from './components/eq/ProfessionalAudioEqualizer';
import { EmberAssistantPanel } from './components/ember/EmberAssistantPanel';
import { useEmberConversation } from './hooks/useEmberConversation';
import { useEmberVoice } from './hooks/useEmberVoice';

import {
  Activity,
  Download,
  Music,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Zap
} from 'lucide-react';

import { SONARA_MUSIC_DNA } from './core/musicDNA';
import { resolveMusicBrainContext } from './core/musicBrainIntegrator';

type JobStatus =
  | 'IDLE'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

interface JobResponse {
  jobId?: string;
  status?: JobStatus | string;
  progress?: number;
  audioUrl?: string | null;
  error?: string | null;
  metadata?: {
    currentStage?: string;
    engine?: string;
    audioUrl?: string;
    error?: string;
    title?: string;
    genre?: string;
    bpm?: number;
    [key: string]: unknown;
  };
  result?: {
    jobId?: string;
    audioUrl?: string;
    engine?: string;
    [key: string]: unknown;
  };
  data?: JobResponse;
  job?: JobResponse;
  message?: string;
}

const sleep = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const normalizeJob = (value: JobResponse): JobResponse =>
  value?.job || value?.data || value;

export default function App() {

  const [prompt, setPrompt] = useState(
    'Deep House and Tech House with Afro House influence, 124 BPM, deep rolling bassline, punchy four-on-the-floor kick, organic tribal percussion, atmospheric pads and a polished club mix.'
  );

  const [genre, setGenre] = useState('Tech House');

  const [selectedGenre, setSelectedGenre] =
    useState('Electronic');

  const [selectedSubgenre, setSelectedSubgenre] =
    useState('Tech House');

  const [selectedMood, setSelectedMood] =
    useState('Energetic');

  const [bpm, setBpm] = useState(124);

  const [durationSec, setDurationSec] =
    useState(15);

  const [lyrics, setLyrics] =
    useState('');

  const [status, setStatus] =
    useState<JobStatus>('IDLE');

  const [progress, setProgress] =
    useState(0);

  const [stage, setStage] =
    useState('Ready');

  const [error, setError] =
    useState('');

  const [jobId, setJobId] =
    useState('');

  const [audioUrl, setAudioUrl] =
    useState('');

  const [engine, setEngine] =
    useState('Sonara V12 ACE-Step Engine');

  const [recommendedEQPreset, setRecommendedEQPreset] =
    useState('');

  const [recommendedEQPresetId, setRecommendedEQPresetId] =
    useState('');

  const [health, setHealth] =
    useState('CHECKING');

  const [isPlaying, setIsPlaying] =
    useState(false);

  const audioRef =
    useRef<HTMLAudioElement | null>(null);

  const selectedDNA =
    SONARA_MUSIC_DNA.find(
      item => item.genre === selectedGenre
    );

  const emberConversation = useEmberConversation({
    prompt,
    genre,
    subgenre: selectedSubgenre,
    mood: selectedMood,
    bpm,
    currentJobId: jobId || undefined,
    hasAudio: Boolean(audioUrl),
    recommendedEqPresetId: recommendedEQPresetId || undefined
  });
  const emberVoice = useEmberVoice(emberConversation.messages);


  useEffect(() => {
    void checkHealth();
  }, []);


  useEffect(() => {

    const audio = audioRef.current;

    if (!audio || !audioUrl) return;

    if (isPlaying) {
      void audio.play().catch(error => {
        console.error(
          'Playback failed:',
          error
        );
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }

  }, [isPlaying, audioUrl]);


  const checkHealth = async () => {

    try {

      const response =
        await fetch('/api/health',
          { cache: 'no-store' }
        );

      setHealth(
        response.ok
          ? 'READY'
          : `HTTP ${response.status}`
      );

    } catch {

      setHealth('OFFLINE');

    }

  };


  const generate = async () => {

    if (
      !prompt.trim() ||
      status === 'QUEUED' ||
      status === 'PROCESSING'
    ) return;


    setStatus('QUEUED');
    setProgress(0);
    setStage(
      'Sending generation request...'
    );

    setError('');
    setAudioUrl('');
    setJobId('');
    setIsPlaying(false);


    try {

      setStage(
        'Consulting Music Brain intelligence...'
      );

      const brainContext =
        await resolveMusicBrainContext({
          prompt: prompt.trim(),
          genre,
          subgenre: selectedSubgenre,
          mood: selectedMood,
          bpm
        });

      const finalPrompt =
        brainContext.enhancedPrompt || prompt.trim();

      const finalGenre =
        brainContext.recommendedGenre || genre;

      const finalSubgenre =
        brainContext.recommendedSubgenre ||
        selectedSubgenre;

      const finalMood =
        brainContext.recommendedMood || selectedMood;

      setRecommendedEQPreset(
        brainContext.recommendedEQPreset || ''
      );

      setRecommendedEQPresetId(
        brainContext.recommendedEQPresetId || ''
      );

      setStage(
        'Sending generation request...'
      );

      const response =
        await fetch(
          '/api/engine/generate',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({

              prompt:
                finalPrompt,

              genre:
                finalGenre,

              subgenre:
                finalSubgenre,

              mood:
                finalMood,

              lyrics,

              title:
                'Sonara AI Track',

              bpm,

              durationSec,

              duration:
                durationSec,

              engineId:
                'sonara_ace_step_v12'

            })
          }
        );


      let responseData: JobResponse;

      try {

        responseData =
          await response.json();

      } catch {

        throw new Error(
          `Invalid JSON response HTTP ${response.status}`
        );

      }


      if (!response.ok) {

        throw new Error(
          responseData.error ||
          responseData.message ||
          `Generation failed HTTP ${response.status}`
        );

      }


      const initial =
        normalizeJob(responseData);

      const id =
        responseData.jobId ||
        responseData.result?.jobId ||
        initial.jobId;


      if (!id) {

        throw new Error(
          'Missing generation job ID'
        );

      }


      setJobId(id);
      setStatus('PROCESSING');

      setStage(
        'ACE-Step is generating the track...'
      );


      for (
        let attempt = 0;
        attempt < 1200;
        attempt++
      ) {

        await sleep(300);


        const poll =
          await fetch(
            `/api/music/job/${encodeURIComponent(id)}`,
            {
              cache:'no-store'
            }
          );


        if (!poll.ok) continue;


        const currentData =
          normalizeJob(
            await poll.json()
          );


        const currentStatus =
          String(
            currentData.status ||
            'PROCESSING'
          ).toUpperCase();


        const currentAudio =
          currentData.audioUrl ||
          currentData.metadata?.audioUrl ||
          '';


        setProgress(
          Number(
            currentData.progress || 0
          )
        );


        if (currentStatus === 'COMPLETED') {

          setAudioUrl(currentAudio);
          setProgress(100);
          setStatus('COMPLETED');

          return;

        }


        if (currentStatus === 'FAILED') {

          throw new Error(
            currentData.error ||
            'Generation failed'
          );

        }

      }


      throw new Error(
        'Generation timeout'
      );


    } catch(error) {

      console.error(
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : String(error)
      );

      setStatus('FAILED');

    }

  };  const busy =
    status === 'QUEUED' ||
    status === 'PROCESSING';


  const applySongwriterResult = (
    result: SongwriterResult
  ) => {

    setPrompt(result.prompt);
    setLyrics(result.lyrics);
    setGenre(result.genre);

  };


  return (

    <div className="min-h-screen bg-[#090d16] text-slate-100">

      <header className="border-b border-slate-800 bg-[#0d1322] px-6 py-4">

        <div className="mx-auto flex max-w-7xl items-center justify-between">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
              <Music className="h-5 w-5" />
            </div>

            <div>

              <h1 className="text-lg font-bold">
                SONARA AI
              </h1>

              <p className="text-xs text-slate-400">
                Generation Studio 2.0
              </p>

            </div>

          </div>


          <button
            type="button"
            onClick={() => void checkHealth()}
            className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs"
          >

            <Activity className="h-3.5 w-3.5 text-emerald-400" />

            Engine {health}

          </button>


        </div>

      </header>



      <main className="mx-auto max-w-7xl p-6">

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">

          <div className="min-w-0 space-y-6">


        <AISongwriter
          onApply={applySongwriterResult}
        />



        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">


          <div className="mb-5 flex items-center gap-2">

            <Sparkles className="h-5 w-5 text-purple-400" />

            <h2 className="font-semibold">
              Generate Music
            </h2>

          </div>



          <textarea

            value={prompt}

            onChange={
              event =>
                setPrompt(event.target.value)
            }

            rows={5}

            placeholder="Describe your track..."

            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm"

          />



          <div className="mt-4">

            <textarea

              value={lyrics}

              onChange={
                event =>
                  setLyrics(event.target.value)
              }

              rows={8}

              placeholder="Lyrics..."

              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm"

            />

          </div>



          <div className="mt-5 grid gap-4 sm:grid-cols-3">



            <label className="space-y-1 text-xs text-slate-400">

              <span>
                Genre DNA
              </span>


              <select

                value={selectedGenre}

                onChange={
                  event => {

                    const value =
                      event.target.value;

                    setSelectedGenre(value);


                    const dna =
                      SONARA_MUSIC_DNA.find(
                        item =>
                          item.genre === value
                      );


                    if (dna) {

                      setSelectedSubgenre(
                        dna.subgenres[0]
                      );

                      setSelectedMood(
                        dna.moods[0]
                      );

                      setGenre(
                        dna.subgenres[0]
                      );

                    }

                  }
                }

                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2"

              >

                {SONARA_MUSIC_DNA.map(item => (

                  <option
                    key={item.genre}
                    value={item.genre}
                  >

                    {item.genre}

                  </option>

                ))}


              </select>


            </label>




            <label className="space-y-1 text-xs text-slate-400">

              <span>
                Subgenre
              </span>


              <select

                value={selectedSubgenre}

                onChange={
                  event => {

                    setSelectedSubgenre(
                      event.target.value
                    );

                    setGenre(
                      event.target.value
                    );

                  }
                }

                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2"

              >

                {(selectedDNA?.subgenres ?? []).map(sub => (

                  <option
                    key={sub}
                    value={sub}
                  >
                    {sub}
                  </option>

                ))}


              </select>


            </label>





            <label className="space-y-1 text-xs text-slate-400">

              <span>
                Mood
              </span>


              <select

                value={selectedMood}

                onChange={
                  event =>
                    setSelectedMood(
                      event.target.value
                    )
                }

                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2"

              >

                {(selectedDNA?.moods ?? []).map(mood => (

                  <option
                    key={mood}
                    value={mood}
                  >
                    {mood}
                  </option>

                ))}


              </select>


            </label>





            <label className="space-y-1 text-xs text-slate-400">

              BPM {bpm}


              <input

                type="range"

                min="60"

                max="180"

                value={bpm}

                onChange={
                  event =>
                    setBpm(
                      Number(event.target.value)
                    )
                }

                className="w-full"

              />

            </label>





            <label className="space-y-1 text-xs text-slate-400">

              Duration


              <select

                value={durationSec}

                onChange={
                  event =>
                    setDurationSec(
                      Number(event.target.value)
                    )
                }

                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2"

              >

                <option value={15}>
                  15 seconds
                </option>

                <option value={30}>
                  30 seconds
                </option>

                <option value={60}>
                  60 seconds
                </option>

                <option value={120}>
                  2 minutes
                </option>


              </select>


            </label>


          </div>

          {recommendedEQPreset && (
            <div className="mt-4 rounded-xl border border-cyan-800/60 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
              Music Brain EQ recommendation: <strong>{recommendedEQPreset}</strong>
            </div>
          )}




          <button

            type="button"

            onClick={() => void generate()}

            disabled={busy || !prompt.trim()}

            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 py-3 font-semibold"

          >

            {busy ? (

              <>

                <RefreshCw className="h-5 w-5 animate-spin" />

                Generating...

              </>

            ) : (

              <>

                <Zap className="h-5 w-5" />

                Generate Track

              </>

            )}

          </button>



        </section>





        {status === 'COMPLETED' && audioUrl && (

          <section className="rounded-2xl border border-emerald-800 bg-slate-900 p-6">


            <h2 className="mb-4 font-semibold text-emerald-300">

              Generation Complete

            </h2>



            <audio

              ref={audioRef}

              controls

              src={audioUrl}

              className="w-full"

            />



            <div className="mt-6">

              <ProfessionalAudioEqualizer

                audioUrl={audioUrl}

                defaultPresetId={recommendedEQPresetId}

                isEmbedded={true}

                onProcessedAudio={
                  newAudioUrl =>
                    setAudioUrl(newAudioUrl)
                }

              />


            </div>



            <div className="mt-5 flex gap-3">


              <button

                type="button"

                onClick={
                  () =>
                    setIsPlaying(
                      value => !value
                    )
                }

                className="rounded-lg bg-purple-600 px-4 py-2"

              >

                {isPlaying
                  ? 'Pause'
                  : 'Play'
                }


              </button>


              <a

                href={audioUrl}

                download="Sonara-track.wav"

                className="rounded-lg bg-slate-800 px-4 py-2"

              >

                Download WAV

              </a>


            </div>


          </section>

        )}

          </div>

          <div className="min-w-0 lg:sticky lg:top-6">
            <EmberAssistantPanel
              insight={recommendedEQPreset ? `Music Brain EQ recommendation: ${recommendedEQPreset}` : null}
              status={emberConversation.status}
              messages={emberConversation.messages}
              isSending={emberConversation.isSending}
              error={emberConversation.error}
              toolTrace={emberConversation.toolTrace}
              onSendMessage={emberConversation.sendMessage}
              voice={emberVoice}
            />
          </div>

        </div>


      </main>


    </div>

  );

}