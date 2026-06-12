"""The founder's review screen — minimal, dependency-free HTML.

One page per run: shows the Gate 1 report (approve / flag) or the Gate 2
content cards (per-item Approve / Reject-with-note). Deliberately spartan —
the real dashboard is a later slice; gates must be usable TODAY.

Access is by signed review link (`?t=…`, minted via GET /runs/{id}/review-link
by the run's owner) — browser navigation can't carry a Bearer header, so the
link itself is the run-scoped, expiring credential. The page forwards the same
token on its gate calls.

Product rules visible in the markup: no Approve-All button exists, every
item is decided alone, silence simply leaves items awaiting (until expiry).
"""

import html
import json
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ContentItemRow, RunRow
from ..security.reviewtoken import verify_review_token
from ..security.tenant import apply_tenant_scope
from .deps import get_session

router = APIRouter(tags=["review"])

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MRK18 — Review</title>
<style nonce="{nonce}">
 body {{ font-family: system-ui, sans-serif; background:#0f1115; color:#e8e8e8; margin:0; padding:24px; }}
 .wrap {{ max-width: 760px; margin: 0 auto; }}
 h1 {{ font-size: 20px; }} h1 span {{ color:#e8483f; }}
 .card {{ background:#181b22; border:1px solid #2a2e38; border-radius:12px; padding:18px; margin:16px 0; }}
 .tag {{ display:inline-block; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
        background:#2a2e38; border-radius:99px; padding:3px 10px; margin-right:6px; }}
 .body {{ white-space:pre-wrap; line-height:1.5; margin:12px 0; }}
 img {{ max-width:100%; border-radius:8px; margin-top:8px; }}
 button {{ border:0; border-radius:8px; padding:10px 16px; font-weight:600; cursor:pointer; margin-right:8px; }}
 .ok {{ background:#1d7f4f; color:#fff; }} .no {{ background:#8a2b26; color:#fff; }}
 textarea {{ width:100%; box-sizing:border-box; background:#0f1115; color:#e8e8e8;
            border:1px solid #2a2e38; border-radius:8px; padding:8px; margin-top:8px; }}
 .muted {{ color:#9aa3b2; font-size:13px; }}
 .decided {{ opacity:.55; }}
 .status {{ font-weight:700; }}
</style></head>
<body><div class="wrap">
 <h1><span>MRK18</span> · Review — run {run_id_short}…</h1>
 <p class="muted">Status: <b class="status">{status}</b> · No “Approve All” exists. Undecided items expire (silence = rejection).</p>
 {content}
</div>
<script nonce="{nonce}">
 const RUN = {run_id_json};
 const T = {review_token_json};
 async function gate1(action) {{
   const flags = action === 'flag'
     ? (prompt('What do you disagree with? (one line)') || '').trim() : '';
   if (action === 'flag' && !flags) return;
   const body = action === 'flag' ? {{action, flags: [flags]}} : {{action}};
   const r = await fetch(`/runs/${{RUN}}/gate1?t=${{encodeURIComponent(T)}}`, {{method:'POST',
     headers:{{'Content-Type':'application/json'}}, body: JSON.stringify(body)}});
   alert(r.ok ? 'Submitted — agents are working. Refresh in a minute.' : 'Error: ' + await r.text());
   if (r.ok) setTimeout(()=>location.reload(), 1500);
 }}
 async function decide(itemId, action) {{
   let note = null;
   if (action === 'reject') {{
     note = (prompt('Why? Your note steers the regeneration (leave empty = reject without regenerating)') || '').trim() || null;
   }}
   const r = await fetch(`/runs/${{RUN}}/gate2?t=${{encodeURIComponent(T)}}`, {{method:'POST',
     headers:{{'Content-Type':'application/json'}},
     body: JSON.stringify({{decisions:[{{item_id: itemId, action, note}}]}})}});
   alert(r.ok ? 'Decision recorded.' : 'Error: ' + await r.text());
   if (r.ok) setTimeout(()=>location.reload(), 1500);
 }}
</script></body></html>"""


def _gate1_html(run: RunRow) -> str:
    payload = (run.gate1 or {}).get("payload", {})
    report = payload.get("report") or run.report or {}
    sections = ""
    for key in ("market_intel", "audience_positioning", "content_strategy"):
        sec = report.get(key)
        if not sec:
            continue
        claims = "".join(
            f"<li><b>[{html.escape(c.get('confidence', ''))}]</b> "
            f"{html.escape(c.get('text', ''))} "
            f"<span class='muted'>({html.escape(c.get('source', ''))})</span></li>"
            for c in sec.get("claims", [])
        )
        sections += (
            f"<div class='card'><span class='tag'>{key.replace('_', ' ')}</span>"
            f"<div class='body'>{html.escape(sec.get('summary', ''))}</div><ul>{claims}</ul></div>"
        )
    synthesis = html.escape(report.get("synthesis", ""))
    return (
        f"{sections}"
        f"<div class='card'><span class='tag'>the CMO's verdict</span>"
        f"<div class='body'>{synthesis}</div>"
        f"<button class='ok' onclick=\"gate1('approve')\">Approve report</button>"
        f"<button class='no' onclick=\"gate1('flag')\">Flag a disagreement</button></div>"
    )


def _gate2_html(items: list[ContentItemRow]) -> str:
    cards = ""
    for it in items:
        body = html.escape(it.body)
        if it.thread:
            body = "<br>".join(
                f"<b>{i}/{len(it.thread)}</b> {html.escape(seg)}"
                for i, seg in enumerate(it.thread, 1)
            )
        img = ""
        if it.media:
            img = f"<img src='{html.escape(it.media[0]['url'])}' alt='' loading='lazy'>"
        comment = (
            f"<p class='muted'>first comment: {html.escape(it.first_comment)}</p>"
            if it.first_comment
            else ""
        )
        awaiting = it.status == "awaiting_approval"
        buttons = (
            f"<button class='ok' onclick=\"decide('{it.item_id}','approve')\">Approve</button>"
            f"<button class='no' onclick=\"decide('{it.item_id}','reject')\">Reject…</button>"
            if awaiting
            else f"<p class='status'>{html.escape(it.status)}"
            + (f" · note: {html.escape(it.regeneration_note)}" if it.regeneration_note else "")
            + "</p>"
        )
        card_class = "card" if awaiting else "card decided"
        cards += (
            f"<div class='{card_class}'>"
            f"<span class='tag'>{it.platform}</span><span class='tag'>{it.format}</span>"
            f"<div class='body'>{body}</div>{comment}{img}<div>{buttons}</div></div>"
        )
    return cards or "<div class='card'>No content items on this run.</div>"


@router.get("/review/{run_id}", response_class=HTMLResponse)
async def review_page(
    run_id: UUID,
    request: Request,
    t: str = "",
    session: AsyncSession = Depends(get_session),
) -> HTMLResponse:
    key = getattr(request.app.state, "review_token_key", None)
    if key is None:
        raise HTTPException(
            status_code=503, detail="review links not configured (APPROVAL_SIGNING_KEY)"
        )
    if not t or not verify_review_token(key, run_id, t):
        raise HTTPException(
            status_code=401,
            detail="invalid or expired review link — mint a fresh one via GET /runs/{run_id}/review-link",
        )
    run = await session.get(RunRow, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    # the link is already a per-run capability; scope the content read to the
    # run's owner too so RLS is the backstop for every founder-data path
    await apply_tenant_scope(session, run.founder_id)

    if run.status == "awaiting_gate1":
        content = _gate1_html(run)
    elif run.status == "generating":
        content = (
            "<div class='card'>⏳ The agents are working on this run — "
            "refresh in a minute or two.</div>"
        )
    else:
        items = (
            (
                await session.execute(
                    select(ContentItemRow)
                    .where(ContentItemRow.run_id == run_id)
                    .order_by(ContentItemRow.platform)
                )
            )
            .scalars()
            .all()
        )
        content = _gate2_html(items)

    # Slice 2.4 — nonce CSP: OUR inline script/style runs; anything injected
    # into the page (a hostile body that survived escaping, an extension) won't.
    nonce = secrets.token_urlsafe(16)
    page = PAGE.format(
        run_id_short=str(run_id)[:8],
        run_id_json=json.dumps(str(run_id)),
        review_token_json=json.dumps(t),
        status=html.escape(run.status),
        content=content,
        nonce=nonce,
    )
    csp = (
        f"default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; "
        "img-src https: data:; connect-src 'self'; frame-ancestors 'none'; "
        "base-uri 'none'; form-action 'none'"
    )
    return HTMLResponse(content=page, headers={"Content-Security-Policy": csp})
