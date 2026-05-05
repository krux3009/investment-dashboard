"""Notes CRUD routes.

GET /api/notes/{code} → 200 with Note. Empty `body` indicates no note
                        exists yet; the frontend treats that as null.
                        Always returns 200 so a missing note doesn't
                        spam the browser console with 404 errors on
                        every drill-in expand.
PUT /api/notes/{code} → 200 with persisted Note. Empty body deletes
                        and returns 204.
DELETE /api/notes/{code} → 204, 404 if absent.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from api.data import notes
from api.models import Note

router = APIRouter()

_MAX_BODY = 10_000


class NoteBody(BaseModel):
    body: str = Field(default="")


def _to_response(note: notes.Note) -> Note:
    return Note(
        code=note.code,
        body=note.body,
        updated_at=note.updated_at.isoformat(),
    )


@router.get("/notes/{code:path}", response_model=Note)
def get_note(code: str) -> Note:
    note = notes.get_note(code)
    if note is None:
        return Note(code=code, body="", updated_at="")
    return _to_response(note)


@router.put("/notes/{code:path}")
def put_note(code: str, payload: NoteBody, response: Response) -> Note | None:
    body = payload.body
    if len(body) > _MAX_BODY:
        raise HTTPException(status_code=413, detail=f"body exceeds {_MAX_BODY} chars")
    if body.strip() == "":
        notes.delete_note(code)
        response.status_code = 204
        return None
    return _to_response(notes.put_note(code, body))


@router.delete("/notes/{code:path}", status_code=204)
def delete_note(code: str) -> Response:
    if not notes.delete_note(code):
        raise HTTPException(status_code=404, detail="no note")
    return Response(status_code=204)
