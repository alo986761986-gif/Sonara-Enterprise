export default function SonaraCreatorLayoutPolish() {
  return (
    <style>{`
      /* SONARA Creator Studio Layout V2
         One clear reading flow: toolbar -> prompt/voice -> controls -> lyrics -> create -> results/workspace. */
      section[data-sonara-creator-skin="true"]{
        --sonara-studio-max:1180px;
        display:flex!important;
        flex-direction:column!important;
        align-items:stretch!important;
        gap:0!important;
        width:100%!important;
        max-width:1440px!important;
        margin-left:auto!important;
        margin-right:auto!important;
        padding:0 0 28px!important;
        overflow:visible!important;
        border:1px solid rgba(255,255,255,.065)!important;
        border-radius:24px!important;
        background:linear-gradient(180deg,#0a0a0d 0%,#09090c 62%,#0b0b10 100%)!important;
        box-shadow:0 22px 70px rgba(0,0,0,.34)!important;
      }

      section[data-sonara-creator-skin="true"]>*{
        grid-column:auto!important;
        grid-row:auto!important;
        min-width:0!important;
        width:auto!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-creator-toolbar-host]{
        order:0!important;
        width:100%!important;
        margin:0!important;
        border-bottom:1px solid rgba(255,255,255,.055)!important;
        background:rgba(11,11,15,.94)!important;
        border-radius:24px 24px 0 0!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="prompt"]{
        order:10!important;
        width:calc(100% - 48px)!important;
        max-width:var(--sonara-studio-max)!important;
        margin:24px auto 0!important;
        padding:0!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="taxonomy"]{
        order:20!important;
      }
      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="musical"]{
        order:30!important;
      }
      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="bpm"]{
        order:40!important;
      }
      section[data-sonara-creator-skin="true"]>details[data-sonara-creator-block="lyrics"]{
        order:60!important;
      }
      section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]{
        order:70!important;
      }
      section[data-sonara-creator-skin="true"]>[data-sonara-creator-single-result="true"]{
        order:80!important;
      }
      section[data-sonara-creator-skin="true"]>[data-sonara-creator-workspace-host]{
        order:90!important;
      }
      section[data-sonara-creator-skin="true"]>[data-sonara-creator-resizer]{
        display:none!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="taxonomy"],
      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="musical"],
      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="bpm"],
      section[data-sonara-creator-skin="true"]>details[data-sonara-creator-block="lyrics"]{
        width:calc(100% - 48px)!important;
        max-width:var(--sonara-studio-max)!important;
        margin-left:auto!important;
        margin-right:auto!important;
      }

      section[data-sonara-creator-skin="true"]>div:not([data-sonara-creator-toolbar-host]):not([data-sonara-creator-workspace-host]):not([data-sonara-dual-generator-host]):not([data-sonara-creator-single-result]):not([data-sonara-creator-resizer]):not([data-sonara-creator-block]){
        width:calc(100% - 48px)!important;
        max-width:var(--sonara-studio-max)!important;
        margin-left:auto!important;
        margin-right:auto!important;
      }

      section[data-sonara-creator-skin="true"] [data-sonara-creator-block="prompt"] textarea#sonara-prompt{
        width:100%!important;
        min-height:148px!important;
        padding:18px 20px!important;
        border:1px solid rgba(255,255,255,.08)!important;
        border-radius:16px!important;
        background:#101014!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;
        color:#fafafa!important;
        font-size:14px!important;
        line-height:1.62!important;
        resize:vertical!important;
      }
      section[data-sonara-creator-skin="true"] [data-sonara-creator-block="prompt"] textarea#sonara-prompt:focus{
        border-color:rgba(167,139,250,.42)!important;
        box-shadow:0 0 0 3px rgba(124,58,237,.08),inset 0 1px 0 rgba(255,255,255,.025)!important;
        outline:none!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="bpm"]{
        margin-top:14px!important;
        margin-bottom:14px!important;
        padding:12px 14px!important;
        border:1px solid rgba(255,255,255,.065)!important;
        border-radius:14px!important;
        background:#0f0f13!important;
      }

      section[data-sonara-creator-skin="true"] details[data-sonara-creator-block="lyrics"]{
        margin-top:0!important;
        margin-bottom:16px!important;
        padding:14px!important;
        border:1px solid rgba(255,255,255,.065)!important;
        border-radius:16px!important;
        background:#0f0f13!important;
      }
      section[data-sonara-creator-skin="true"] textarea#sonara-lyrics{
        min-height:180px!important;
        border-radius:13px!important;
        background:#0b0b0f!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host],
      section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div{
        display:block!important;
        width:100%!important;
        max-width:none!important;
        margin:0!important;
      }
      section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div>button:first-child{
        display:flex!important;
        width:min(460px,calc(100% - 48px))!important;
        min-height:54px!important;
        margin:6px auto 24px!important;
        border:1px solid rgba(255,255,255,.16)!important;
        border-radius:14px!important;
        background:linear-gradient(110deg,#f4f4f5,#ffffff 48%,#e4e4e7)!important;
        color:#09090b!important;
        box-shadow:0 12px 34px rgba(0,0,0,.28)!important;
      }

      section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"]{
        position:static!important;
        display:grid!important;
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        gap:14px!important;
        width:calc(100% - 48px)!important;
        max-width:var(--sonara-studio-max)!important;
        max-height:none!important;
        overflow:visible!important;
        margin:0 auto 18px!important;
        padding:0!important;
      }
      section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"] article{
        min-width:0!important;
        border:1px solid rgba(255,255,255,.07)!important;
        border-radius:16px!important;
        background:#111116!important;
        box-shadow:none!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-creator-single-result="true"]{
        position:static!important;
        width:calc(100% - 48px)!important;
        max-width:var(--sonara-studio-max)!important;
        margin:0 auto 18px!important;
        overflow:visible!important;
        border:1px solid rgba(255,255,255,.07)!important;
        border-radius:16px!important;
        background:#111116!important;
      }

      section[data-sonara-creator-skin="true"]>[data-sonara-creator-workspace-host]{
        width:calc(100% - 48px)!important;
        max-width:var(--sonara-studio-max)!important;
        min-height:0!important;
        margin:2px auto 0!important;
        overflow:visible!important;
        border:1px solid rgba(255,255,255,.06)!important;
        border-radius:16px!important;
        background:#0e0e12!important;
      }
      .sonara-creator-workspace-head{
        min-height:0!important;
        padding:16px!important;
      }
      .sonara-creator-empty{
        min-height:150px!important;
        margin-top:16px!important;
        padding:22px!important;
        border-radius:13px!important;
        background:#0b0b0f!important;
      }
      .sonara-creator-empty-icon{
        width:42px!important;
        height:42px!important;
        border-radius:13px!important;
      }

      .sonara-creator-toolbar{
        display:grid!important;
        grid-template-columns:minmax(220px,1fr) auto auto!important;
        align-items:center!important;
        gap:18px!important;
        padding:15px 24px!important;
      }
      .sonara-creator-tabs{
        width:auto!important;
        min-width:280px!important;
        margin:0!important;
        padding:3px!important;
        border:1px solid rgba(255,255,255,.05)!important;
        border-radius:11px!important;
        background:#111116!important;
      }
      .sonara-creator-tabs button{
        min-height:34px!important;
        border-radius:8px!important;
      }
      .sonara-creator-actions{
        display:flex!important;
        align-items:center!important;
        justify-content:flex-end!important;
        gap:7px!important;
        margin:0!important;
      }
      .sonara-creator-actions button{
        width:auto!important;
        min-width:82px!important;
        min-height:38px!important;
        padding:0 12px!important;
        border-radius:10px!important;
        background:#141419!important;
      }
      .sonara-creator-actions button[data-sonara-audio-attached="true"],
      .sonara-creator-actions button[data-sonara-voice-attached="true"]{
        border-color:rgba(167,139,250,.38)!important;
        background:linear-gradient(135deg,rgba(91,33,182,.20),rgba(37,99,235,.12))!important;
      }

      [data-sonara-voice-clip-host]{
        width:100%!important;
        max-width:none!important;
        margin:0!important;
      }
      .sonara-voice-clip-shelf{
        margin-top:12px!important;
        padding:13px!important;
        border-radius:14px!important;
        border-color:rgba(167,139,250,.18)!important;
        background:linear-gradient(125deg,rgba(76,29,149,.10),rgba(15,23,42,.32) 50%,rgba(9,9,13,.68))!important;
        box-shadow:none!important;
      }
      .sonara-voice-wave{
        height:46px!important;
        margin:11px 0 8px!important;
      }
      .sonara-voice-editor{
        margin-top:11px!important;
        padding:12px!important;
        border-radius:12px!important;
      }

      section[data-sonara-creator-skin="true"] select,
      section[data-sonara-creator-skin="true"] input[type="text"],
      section[data-sonara-creator-skin="true"] input[type="number"]{
        border-radius:11px!important;
      }

      @media(max-width:1100px){
        .sonara-creator-toolbar{
          grid-template-columns:1fr auto!important;
        }
        .sonara-creator-tabs{
          grid-column:1 / -1!important;
          grid-row:2!important;
          width:100%!important;
          min-width:0!important;
        }
        .sonara-creator-actions{
          grid-column:2!important;
          grid-row:1!important;
        }
      }

      @media(max-width:760px){
        section[data-sonara-creator-skin="true"]{
          border-radius:18px!important;
          padding-bottom:20px!important;
        }
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="prompt"],
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="taxonomy"],
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="musical"],
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="bpm"],
        section[data-sonara-creator-skin="true"]>details[data-sonara-creator-block="lyrics"],
        section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"],
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-single-result="true"],
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-workspace-host]{
          width:calc(100% - 28px)!important;
        }
        section[data-sonara-creator-skin="true"]>div:not([data-sonara-creator-toolbar-host]):not([data-sonara-creator-workspace-host]):not([data-sonara-dual-generator-host]):not([data-sonara-creator-single-result]):not([data-sonara-creator-resizer]):not([data-sonara-creator-block]){
          width:calc(100% - 28px)!important;
        }
        .sonara-creator-toolbar{
          display:flex!important;
          flex-direction:column!important;
          align-items:stretch!important;
          gap:10px!important;
          padding:14px!important;
        }
        .sonara-creator-brand{
          justify-content:flex-start!important;
        }
        .sonara-creator-tabs{
          order:2!important;
          width:100%!important;
        }
        .sonara-creator-actions{
          order:3!important;
          display:grid!important;
          grid-template-columns:repeat(3,minmax(0,1fr))!important;
          width:100%!important;
        }
        .sonara-creator-actions button{
          width:100%!important;
          min-width:0!important;
          padding:0 8px!important;
        }
        section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"]{
          grid-template-columns:1fr!important;
        }
        section[data-sonara-creator-skin="true"] [data-sonara-creator-block="prompt"] textarea#sonara-prompt{
          min-height:132px!important;
          padding:15px!important;
        }
      }
    `}</style>
  );
}
