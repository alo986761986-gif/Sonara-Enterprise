def sonara_rtx6000pro_full_fresh_0905():
    import urllib.request as _u

    _url = (
        "https://raw.githubusercontent.com/"
        "alo986761986-gif/Sonara-Enterprise/"
        "main/scripts/ace-step-rtx6000pro-full-fresh-bootstrap-0905.py"
    )

    print("SONARA RTX 6000 PRO - avvio installazione completa da zero...", flush=True)
    _code = _u.urlopen(_url, timeout=120).read().decode("utf-8")
    exec(
        compile(
            _code,
            "<sonara-rtx6000pro-full-fresh-0905>",
            "exec",
        ),
        {"__name__": "__main__", "__file__": _url},
    )


sonara_rtx6000pro_full_fresh_0905()
