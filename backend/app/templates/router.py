from fastapi import APIRouter

from app.templates.registry import list_templates

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def get_templates():
    return list_templates()
