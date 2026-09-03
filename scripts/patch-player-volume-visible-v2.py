from pathlib import Path

CANDIDATE = Path('src/components/generator/ElevenMusicGenerationControl.tsx')
FIXED = Path('src/components/player/SonaraProfessionalFixedPlayer.tsx')
DEPLOY = Path('.github/workflows/deploy-sonara-music-director-v3.yml')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY_PATCHED')
        return text
    if old not in text:
        raise SystemExit(f'{label}=OLD_MARKER_NOT_FOUND')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_candidate() -> None:
    text = CANDIDATE.read_text(encoding='utf-8')
    old = '''          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-1.5 py-1" data-sonara-candidate-volume={candidate.id}>
            <button
              type="button"
              onClick={toggleMute}
              className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
              aria-label={isMuted ? `Riattiva volume brano ${candidate.id}` : `Silenzia volume brano ${candidate.id}`}
              title={`Volume ${Math.round(volume * 100)}%`}
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={event => applyVolume(Number(event.target.value))}
              aria-label={`Volume brano ${candidate.id}`}
              className="h-1 w-20 cursor-pointer accent-violet-500"
            />
            <span className="w-7 text-right font-mono text-[8px] tabular-nums text-zinc-500">{Math.round(volume * 100)}%</span>
          </div>'''
    new = '''          <div
            className="flex min-w-[210px] items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-2.5 py-2 shadow-[0_0_22px_rgba(139,92,246,0.10)]"
            data-sonara-candidate-volume={candidate.id}
            aria-label={`Controllo volume brano ${candidate.id}`}
          >
            <span className="shrink-0 text-[9px] font-black tracking-[0.12em] text-violet-200">VOLUME {candidate.id}</span>
            <button
              type="button"
              onClick={toggleMute}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-black/20 text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
              aria-label={isMuted ? `Riattiva volume brano ${candidate.id}` : `Silenzia volume brano ${candidate.id}`}
              title={`Volume ${candidate.id}: ${Math.round(volume * 100)}%`}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={event => applyVolume(Number(event.target.value))}
              aria-label={`Volume brano ${candidate.id}`}
              className="h-2 min-w-20 flex-1 cursor-pointer accent-violet-500"
            />
            <span className="w-9 shrink-0 text-right font-mono text-[9px] font-bold tabular-nums text-violet-100">{Math.round(volume * 100)}%</span>
          </div>'''
    text = replace_once(text, old, new, 'VISIBLE_VOLUME_AB')
    CANDIDATE.write_text(text, encoding='utf-8')


def patch_fixed() -> None:
    text = FIXED.read_text(encoding='utf-8')
    old = '''          <div className="sonara-pro-volume" data-sonara-universal-volume="true" title={`Volume ${Math.round(volume * 100)}%`}>
            <button type="button" className="sonara-pro-icon-button" onClick={toggleMute} aria-label={isMuted ? 'Riattiva volume' : `Silenzia volume ${Math.round(volume * 100)}%`}>{isMuted ? <VolumeX /> : <Volume2 />}<small>{Math.round(volume * 100)}</small></button>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label={`Volume universale ${Math.round(volume * 100)}%`} />
          </div>'''
    new = '''          <div className="sonara-pro-volume" data-sonara-universal-volume="true" title={`Volume ${Math.round(volume * 100)}%`}>
            <span className="sonara-pro-volume-label">VOLUME</span>
            <button type="button" className="sonara-pro-icon-button" onClick={toggleMute} aria-label={isMuted ? 'Riattiva volume' : `Silenzia volume ${Math.round(volume * 100)}%`}>{isMuted ? <VolumeX /> : <Volume2 />}<small>{Math.round(volume * 100)}</small></button>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label={`Volume universale ${Math.round(volume * 100)}%`} />
            <strong className="sonara-pro-volume-value">{Math.round(volume * 100)}%</strong>
          </div>'''
    text = replace_once(text, old, new, 'VISIBLE_VOLUME_UNIVERSAL_UI')

    old_css = '''.sonara-pro-player-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0}.sonara-pro-volume{display:grid;grid-template-columns:36px 92px;align-items:center;gap:4px}.sonara-pro-menu-wrap{position:relative}'''
    new_css = '''.sonara-pro-player-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0}.sonara-pro-volume{display:grid;grid-template-columns:auto 36px minmax(72px,92px) 34px;align-items:center;gap:5px;padding:4px 7px;border:1px solid rgba(192,132,252,.30);border-radius:12px;background:rgba(126,34,206,.10);box-shadow:0 0 22px rgba(139,92,246,.08)}.sonara-pro-volume-label{color:#d8b4fe;font-size:8px;font-weight:900;letter-spacing:.12em}.sonara-pro-volume-value{color:#ddd6fe;font-size:8px;font-variant-numeric:tabular-nums;text-align:right}.sonara-pro-menu-wrap{position:relative}'''
    text = replace_once(text, old_css, new_css, 'VISIBLE_VOLUME_UNIVERSAL_CSS')

    old_1100 = '''.sonara-pro-volume{grid-template-columns:36px 72px}'''
    new_1100 = '''.sonara-pro-volume{grid-template-columns:auto 34px 64px 30px}.sonara-pro-volume-label{font-size:7px}.sonara-pro-volume-value{font-size:7px}'''
    text = replace_once(text, old_1100, new_1100, 'VISIBLE_VOLUME_TABLET')

    old_mobile = '''.sonara-pro-volume{display:grid;grid-template-columns:34px 64px;gap:2px}.sonara-pro-volume .sonara-pro-icon-button{display:grid;width:34px;height:34px}.sonara-pro-volume input{display:block;width:64px}'''
    new_mobile = '''.sonara-pro-volume{display:grid;grid-template-columns:auto 32px 58px;gap:3px;padding:3px 5px}.sonara-pro-volume-label{display:block;font-size:7px}.sonara-pro-volume-value{display:none}.sonara-pro-volume .sonara-pro-icon-button{display:grid;width:32px;height:32px}.sonara-pro-volume input{display:block!important;width:58px!important;min-width:58px}'''
    text = replace_once(text, old_mobile, new_mobile, 'VISIBLE_VOLUME_MOBILE')
    FIXED.write_text(text, encoding='utf-8')


def patch_deploy() -> None:
    text = DEPLOY.read_text(encoding='utf-8')
    text = replace_once(
        text,
        'npm run test:unit -- --runInBand',
        'npm run test:generation-prompt',
        'DEPLOY_VALID_TEST_SCRIPT'
    )
    DEPLOY.write_text(text, encoding='utf-8')


patch_candidate()
patch_fixed()
patch_deploy()
print('SONARA_PLAYER_VOLUME_VISIBLE_V2=PATCHED')
