#!/usr/bin/env python3
from pathlib import Path

EDGE = Path('cloudflare/sonara-yue-primary-edge.mjs')
GEN = Path('src/components/generator/ElevenMusicGenerationControl.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY')
        return text
    if old not in text:
        raise RuntimeError(f'Pattern missing: {label}')
    print(f'{label}=PATCHED')
    return text.replace(old, new, 1)


def patch_edge() -> None:
    text = EDGE.read_text(encoding='utf-8')
    text = replace_once(
        text,
        "const ELEVEN_JOB_PATH = /^\\/api\\/music\\/job\\/(eleven_[^/]+)$/;\n",
        "const ELEVEN_JOB_PATH = /^\\/api\\/music\\/job\\/(eleven_[^/]+)$/;\nconst ELEVEN_COVER_PATH = '/api/eleven-music/cover';\n",
        'EDGE_COVER_PATH',
    )

    needle = """async function visibleYueJobResponse(request, env, ctx) {\n"""
    helper = """async function proxyElevenCover(request) {\n  const target = `${VERCEL_ORIGIN}${ELEVEN_COVER_PATH}`;\n  const headers = new Headers(request.headers);\n  headers.delete('host');\n  headers.delete('content-length');\n  headers.set('accept', 'application/json');\n  headers.set('cache-control', 'no-cache');\n  headers.set('x-sonara-edge-proxy', VERSION);\n\n  const response = await fetch(target, {\n    method: request.method,\n    headers,\n    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,\n    redirect: 'manual'\n  });\n  return decorate(response, 'cover-art');\n}\n\nasync function visibleYueJobResponse(request, env, ctx) {\n"""
    text = replace_once(text, needle, helper, 'EDGE_COVER_PROXY')

    old_route = """    const elevenMatch = url.pathname.match(ELEVEN_JOB_PATH);\n    if (request.method === 'GET' && elevenMatch) {\n      return proxyElevenJob(request, decodeURIComponent(elevenMatch[1]));\n    }\n\n    // Direct engine requests remain a private fallback route for existing integrations.\n"""
    new_route = """    const elevenMatch = url.pathname.match(ELEVEN_JOB_PATH);\n    if (request.method === 'GET' && elevenMatch) {\n      return proxyElevenJob(request, decodeURIComponent(elevenMatch[1]));\n    }\n\n    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === ELEVEN_COVER_PATH) {\n      return proxyElevenCover(request);\n    }\n\n    // Direct engine requests remain a private fallback route for existing integrations.\n"""
    text = replace_once(text, old_route, new_route, 'EDGE_COVER_ROUTE')
    EDGE.write_text(text, encoding='utf-8')


def patch_generator() -> None:
    text = GEN.read_text(encoding='utf-8')

    replacements = [
        ('<div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/25 p-3.5 shadow-inner shadow-black/20">', '<div className="mt-2 rounded-xl border border-white/[0.07] bg-black/25 p-2 shadow-inner shadow-black/20">', 'PLAYER_SHELL'),
        ('<div className="flex items-center gap-3">', '<div className="flex items-center gap-2">', 'PLAYER_TOP_GAP'),
        ('className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white text-black shadow-lg shadow-black/25 transition hover:scale-[1.03] hover:bg-zinc-100"', 'className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white text-black shadow-md shadow-black/20 transition hover:scale-[1.03] hover:bg-zinc-100"', 'PLAYER_PLAY_SIZE'),
        ('{playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}', '{playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}', 'PLAYER_ICON_SIZE'),
        ('<div className="relative mt-3 h-4">', '<div className="relative mt-1.5 h-3">', 'PLAYER_SEEK_SPACING'),
        ('className="absolute inset-0 h-4 w-full cursor-pointer opacity-0"', 'className="absolute inset-0 h-3 w-full cursor-pointer opacity-0"', 'PLAYER_SEEK_HEIGHT'),
        ('<div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">', '<div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">', 'PLAYER_FOOTER'),
        ('className="flex min-w-[210px] items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-2.5 py-2 shadow-[0_0_22px_rgba(139,92,246,0.10)]"', 'className="flex min-w-[150px] items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/[0.08] px-2 py-1.5"', 'PLAYER_VOLUME_SHELL'),
        ('className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-black/20 text-violet-100 transition hover:bg-violet-500/20 hover:text-white"', 'className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-black/20 text-violet-100 transition hover:bg-violet-500/20 hover:text-white"', 'PLAYER_VOLUME_BUTTON'),
        ('className="h-2 min-w-20 flex-1 cursor-pointer accent-violet-500"', 'className="h-1.5 min-w-16 flex-1 cursor-pointer accent-violet-500"', 'PLAYER_VOLUME_RANGE'),
        ('className={`rounded-lg px-3 py-2 text-[9px] font-black tracking-[0.08em] transition ${chosen ?', 'className={`rounded-md px-2.5 py-1.5 text-[8px] font-black tracking-[0.08em] transition ${chosen ?', 'PLAYER_SELECT_BUTTON'),
        ('className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.09] bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"', 'className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.09] bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"', 'PLAYER_DOWNLOAD_BUTTON'),
        ('className={`rounded-[20px] border p-4 transition ${chosen ?', 'className={`rounded-2xl border p-3 transition ${chosen ?', 'CARD_PADDING'),
        ('<span className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[10px] font-black text-zinc-200">{candidate.id}</span>', '<span className="grid h-6 w-6 place-items-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[9px] font-black text-zinc-200">{candidate.id}</span>', 'CARD_BADGE'),
        ('<div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">', '<div className="mt-3 grid gap-3 sm:grid-cols-[104px_1fr]">', 'CARD_RESULT_GRID'),
        ('<div className="relative aspect-square overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-[#101019] to-blue-950/60 shadow-lg shadow-purple-950/20" data-sonara-candidate-cover={candidate.id}>', '<div className="relative aspect-square overflow-hidden rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-[#101019] to-blue-950/60 shadow-md shadow-purple-950/20" data-sonara-candidate-cover={candidate.id}>', 'CARD_COVER_SIZE'),
        ('<div className="flex min-w-0 flex-col justify-between rounded-2xl border border-white/[0.06] bg-black/20 p-4">', '<div className="flex min-w-0 flex-col justify-between rounded-xl border border-white/[0.06] bg-black/20 p-3">', 'CARD_META_PANEL'),
        ('<div className="text-lg font-black tracking-tight text-white">', '<div className="truncate text-sm font-black tracking-tight text-white">', 'CARD_TITLE'),
        ('<div className="mt-1 text-[10px] text-zinc-500">AUDIO + COVER · identità visiva coordinata A/B</div>', '<div className="mt-0.5 text-[9px] text-zinc-500">AUDIO + COVER · A/B coordinati</div>', 'CARD_SUBTITLE'),
        ('<div className="mt-4 flex flex-wrap gap-2">', '<div className="mt-2 flex items-center gap-1.5">', 'CARD_ACTION_ROW'),
        ('{candidate.coverError && <div className="mt-3 text-[9px] text-amber-300">Cover: {candidate.coverError}</div>}', '{candidate.coverError && <div className="mt-2 truncate text-[8px] text-amber-300" title={candidate.coverError}>Cover: {candidate.coverError}</div>}', 'CARD_COVER_ERROR'),
    ]
    for old, new, label in replacements:
        text = replace_once(text, old, new, label)

    old_controls = """      <div className=\"grid gap-3 rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center\">\n        <label className=\"flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5\">\n          <span><strong className=\"block text-[10px] text-zinc-100\">Genera copertine automaticamente</strong><small className=\"text-[8px] text-zinc-500\">A + B insieme all'audio</small></span>\n          <input type=\"checkbox\" checked={autoCover} onChange={event => setAutoCover(event.target.checked)} className=\"h-4 w-4 accent-violet-500\" />\n        </label>\n        <label className=\"flex items-center gap-2 text-[9px] text-zinc-400\">STILE\n          <select value={coverStyle} onChange={event => setCoverStyle(event.target.value)} className=\"rounded-lg border border-white/[0.08] bg-[#111117] px-2 py-2 text-[9px] text-zinc-200\">\n            <option value=\"auto\">Auto</option><option value=\"cinematic\">Cinematica</option><option value=\"realistic\">Realistica</option><option value=\"abstract\">Astratta</option><option value=\"minimal\">Minimal</option><option value=\"futuristic\">Futuristica</option><option value=\"dark\">Dark</option><option value=\"tropical\">Tropical</option><option value=\"retro\">Retro</option>\n          </select>\n        </label>\n        <label className=\"flex items-center gap-2 text-[9px] text-zinc-400\">TESTO\n          <select value={coverTextMode} onChange={event => setCoverTextMode(event.target.value)} className=\"rounded-lg border border-white/[0.08] bg-[#111117] px-2 py-2 text-[9px] text-zinc-200\">\n            <option value=\"none\">Nessuno</option><option value=\"title\">Titolo</option>\n          </select>\n        </label>\n      </div>\n"""
    new_controls = """      <div className=\"flex flex-wrap items-center gap-2 rounded-xl border border-violet-400/15 bg-violet-500/[0.035] px-2.5 py-2\" data-sonara-cover-toolbar=\"compact\">\n        <label className=\"inline-flex items-center gap-2 text-[9px] font-bold text-zinc-300\">\n          <input type=\"checkbox\" checked={autoCover} onChange={event => setAutoCover(event.target.checked)} className=\"h-3.5 w-3.5 accent-violet-500\" />\n          COVER A+B\n        </label>\n        <span className=\"h-4 w-px bg-white/[0.08]\" />\n        <label className=\"inline-flex items-center gap-1.5 text-[8px] font-bold tracking-[0.08em] text-zinc-500\">STILE\n          <select value={coverStyle} onChange={event => setCoverStyle(event.target.value)} className=\"rounded-md border border-white/[0.08] bg-[#111117] px-2 py-1.5 text-[8px] text-zinc-200\">\n            <option value=\"auto\">Auto</option><option value=\"cinematic\">Cinematica</option><option value=\"realistic\">Realistica</option><option value=\"abstract\">Astratta</option><option value=\"minimal\">Minimal</option><option value=\"futuristic\">Futuristica</option><option value=\"dark\">Dark</option><option value=\"tropical\">Tropical</option><option value=\"retro\">Retro</option>\n          </select>\n        </label>\n        <label className=\"inline-flex items-center gap-1.5 text-[8px] font-bold tracking-[0.08em] text-zinc-500\">TESTO\n          <select value={coverTextMode} onChange={event => setCoverTextMode(event.target.value)} className=\"rounded-md border border-white/[0.08] bg-[#111117] px-2 py-1.5 text-[8px] text-zinc-200\">\n            <option value=\"none\">Off</option><option value=\"title\">Titolo</option>\n          </select>\n        </label>\n        <span className=\"ml-auto text-[8px] text-zinc-600\">audio + artwork simultanei</span>\n      </div>\n"""
    text = replace_once(text, old_controls, new_controls, 'COVER_TOOLBAR_COMPACT')

    text = replace_once(
        text,
        'className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold text-white shadow-lg shadow-purple-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"',
        'className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-purple-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"',
        'GENERATE_BUTTON_COMPACT',
    )

    old_actions = """                          <button type=\"button\" onClick={() => void download(candidate)} className=\"inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[9px] font-black text-zinc-200 hover:bg-white/[0.08]\"><Download className=\"h-3.5 w-3.5\" />SCARICA {candidate.audioFormat.toUpperCase()}</button>\n                          <button type=\"button\" onClick={() => downloadCover(candidate)} disabled={!candidate.coverDataUrl} className=\"inline-flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[9px] font-black text-violet-100 disabled:opacity-35\"><ImageIcon className=\"h-3.5 w-3.5\" />SCARICA COVER</button>\n                          <button type=\"button\" onClick={() => void regenerateCover(candidate)} disabled={candidate.coverStatus === 'PROCESSING'} className=\"inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-[9px] font-black text-blue-100 disabled:opacity-35\"><RefreshCw className={`h-3.5 w-3.5 ${candidate.coverStatus === 'PROCESSING' ? 'animate-spin' : ''}`} />RIGENERA COPERTINA</button>\n"""
    new_actions = """                          <button type=\"button\" onClick={() => void download(candidate)} className=\"inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.09] bg-white/[0.04] px-2 text-[8px] font-black text-zinc-200 hover:bg-white/[0.08]\" aria-label={`Scarica audio ${candidate.id}`} title={`Scarica ${candidate.audioFormat.toUpperCase()}`}><Download className=\"h-3.5 w-3.5\" /><span>{candidate.audioFormat.toUpperCase()}</span></button>\n                          <button type=\"button\" onClick={() => downloadCover(candidate)} disabled={!candidate.coverDataUrl} className=\"grid h-8 w-8 place-items-center rounded-md border border-violet-400/20 bg-violet-500/10 text-violet-100 disabled:opacity-35\" aria-label={`Scarica cover ${candidate.id}`} title=\"SCARICA COVER\"><ImageIcon className=\"h-3.5 w-3.5\" /><span className=\"sr-only\">SCARICA COVER</span></button>\n                          <button type=\"button\" onClick={() => void regenerateCover(candidate)} disabled={candidate.coverStatus === 'PROCESSING'} className=\"grid h-8 w-8 place-items-center rounded-md border border-blue-400/20 bg-blue-500/10 text-blue-100 disabled:opacity-35\" aria-label={`Rigenera copertina ${candidate.id}`} title=\"RIGENERA COPERTINA\"><RefreshCw className={`h-3.5 w-3.5 ${candidate.coverStatus === 'PROCESSING' ? 'animate-spin' : ''}`} /><span className=\"sr-only\">RIGENERA COPERTINA</span></button>\n"""
    text = replace_once(text, old_actions, new_actions, 'CARD_ACTIONS_COMPACT')

    GEN.write_text(text, encoding='utf-8')


def main() -> None:
    patch_edge()
    patch_generator()
    print('SONARA_COVER_ROUTE_COMPACT_AB_V1=READY')


if __name__ == '__main__':
    main()
