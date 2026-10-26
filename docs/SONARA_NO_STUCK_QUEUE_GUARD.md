# SONARA No-Stuck Queue Guard

Before creating a new R2 generation job, the production Worker checks the private MoLab heartbeat.

If no authenticated relay heartbeat has been received within 15 seconds, the generation request returns HTTP 503 with code MOLAB_RELAY_OFFLINE instead of creating a job that would remain queued and appear frozen in the UI.

The watchdog normally restores the relay automatically; this guard prevents silent 10-percent stalls during a restart window.
