# file: app/generation/pptx_renderer/template_filler.py
"""
Fills the DVT PPTX template from a cv_json produced by
cv_json_builder.build_cv_json_from_selection.

Hybrid approach:
  - Slide duplication (pagination) is raw XML surgery (see slide_duplication.py)
    -- python-pptx has no API for it, and it must happen BEFORE the file is
    opened with python-pptx.
  - Everything else (text replacement, bullets, photo removal) uses
    python-pptx's object model for readability. Bullet formatting isn't
    exposed by python-pptx's high-level API, so add_bullet_format() drops
    to paragraph._p (the underlying lxml element) for that one attribute --
    this is the documented, supported way to reach OOXML python-pptx doesn't
    wrap.

Shape IDs (SLIDE1_SHAPES / SLIDE2_SHAPES) were identified by inspecting the
template's raw slide XML -- specific to this template file, will break if
shapes are re-authored (id changes, shapes deleted/reordered).
"""

import shutil
import zipfile
from pathlib import Path

from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.util import Pt

from .slide_duplication import duplicate_slide2

YEARS_LABEL = {
    "French": "ans d'expérience",
    "English": "years of experience",
    "Spanish": "años de experiencia",
    "German": "Jahre Erfahrung",
}

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEMPLATE_PATH = PROJECT_ROOT / "Templates" / "Template_CV_format_DVT.pptx"

SLIDE1_SHAPES = {
    "name": 869, "summary": 870, "years": 872, "title": 877,
    "education": 879, "skills": 881, "exp1": 882, "exp2": 887,
    "photo": 2,
}
SLIDE2_SHAPES = {
    "name": 11, "title": 15, "exp_box_a": 3, "exp_box_b": 5,
    "photo": 16,
}

CHAR_BUDGET_PER_BOX = 650
CHAR_BUDGET_PER_SLOT = 550
MAX_BULLETS_PER_EXPERIENCE = 5
MAX_CHARS_PER_BULLET = 220
SKILLS_CHAR_BUDGET = 500


# ---------------------------------------------------------------------------
# Shape lookup / low-level helpers
# ---------------------------------------------------------------------------

def find_shape_by_id(shapes, shape_id: int):
    """Recurses into groups. Returns None if not found on this slide."""
    for shape in shapes:
        if shape.shape_id == shape_id:
            return shape
        if shape.shape_type == 6:  # MSO_SHAPE_TYPE.GROUP
            found = find_shape_by_id(shape.shapes, shape_id)
            if found is not None:
                return found
    return None


def set_single_run_text(shape, text: str) -> None:
    """Replaces the text of a shape meant to hold ONE simple run, keeping
    the first run's formatting (font/size/bold) untouched."""
    tf = shape.text_frame
    first_para = tf.paragraphs[0]
    if not first_para.runs:
        first_para.text = text or ""
        return
    first_para.runs[0].text = text or ""
    # Drop any extra runs/paragraphs so leftover template text can't survive
    # a shorter replacement value.
    for run in first_para.runs[1:]:
        run._r.getparent().remove(run._r)
    for para in tf.paragraphs[1:]:
        para._p.getparent().remove(para._p)


def add_bullet_format(paragraph, char: str = "•", indent_emu: int = 128588) -> None:
    """python-pptx has no high-level bullet API -- this reaches into the
    paragraph's underlying XML element (the documented escape hatch) to set
    marL/indent + buChar, matching the template's existing bullet style."""
    pPr = paragraph._p.get_or_add_pPr()
    pPr.set("marL", str(indent_emu))
    pPr.set("indent", str(-indent_emu))
    buFont = pPr.makeelement(qn("a:buFont"), {"typeface": "Arial"})
    buChar = pPr.makeelement(qn("a:buChar"), {"char": char})
    pPr.append(buFont)
    pPr.append(buChar)


def remove_shape(shape) -> None:
    shape._element.getparent().remove(shape._element)


# ---------------------------------------------------------------------------
# Experience formatting
# ---------------------------------------------------------------------------

def _experience_title_line(exp: dict) -> str:
    company = exp.get("company") or ""
    title = exp.get("title") or ""
    if company and title:
        return f"{company} | {title} :"
    return company or title or ""


def _experience_bullets(exp: dict) -> list[str]:
    bullets = []
    responsibilities = exp.get("responsibilities") or []
    if responsibilities:
        for r in responsibilities:
            text = (r.get("description") or r.get("category") or "").strip()
            if text:
                bullets.append(text)
    elif exp.get("description"):
        bullets.append(exp["description"].strip())
    return bullets


def _experience_char_count(exp: dict) -> int:
    return len(_experience_title_line(exp)) + sum(len(b) for b in _experience_bullets(exp))


def _truncate_experience_for_display(exp: dict, char_budget: int) -> dict:
    exp = dict(exp)
    bullets = _experience_bullets(exp)[:MAX_BULLETS_PER_EXPERIENCE]
    bullets = [
        (b if len(b) <= MAX_CHARS_PER_BULLET else b[:MAX_CHARS_PER_BULLET].rstrip() + "…")
        for b in bullets
    ]
    exp["responsibilities"] = [{"description": b} for b in bullets]
    exp["description"] = ""
    return exp


def _paginate_by_char_budget(experiences: list[dict], budget_per_box: int) -> list[list[dict]]:
    boxes: list[list[dict]] = []
    current: list[dict] = []
    current_chars = 0
    for exp in experiences:
        exp_chars = _experience_char_count(exp)
        if current and current_chars + exp_chars > budget_per_box:
            boxes.append(current)
            current, current_chars = [], 0
        current.append(exp)
        current_chars += exp_chars
    if current:
        boxes.append(current)
    return boxes


def _write_experiences_into_shape(shape, experiences: list[dict], with_spacer: bool = False) -> None:
    tf = shape.text_frame
    tf.clear()  # leaves ONE empty paragraph
    first = True
    for exp in experiences:
        if with_spacer and not first:
            tf.add_paragraph()  # blank spacer between stacked experiences
        para = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        run = para.add_run()
        run.text = _experience_title_line(exp)
        run.font.bold = True
        run.font.size = Pt(8)

        for bullet_text in _experience_bullets(exp):
            b_para = tf.add_paragraph()
            b_run = b_para.add_run()
            b_run.text = bullet_text
            b_run.font.size = Pt(8)
            add_bullet_format(b_para)


def fill_single_experience_shape(shape, exp: dict) -> None:
    _write_experiences_into_shape(shape, [exp] if exp else [], with_spacer=False)


def fill_multi_experience_shape(shape, experiences: list[dict]) -> None:
    _write_experiences_into_shape(shape, experiences, with_spacer=True)


# ---------------------------------------------------------------------------
# Static sections
# ---------------------------------------------------------------------------

def fill_skills_shape(shape, skills: list[str]) -> None:
    """One flowing line ('Python  •  SQL  •  ...') instead of one bullet per
    skill. Truncated to SKILLS_CHAR_BUDGET -- past that, text overlaps the
    Formation section below it (observed empirically, no auto-fit available)."""
    tf = shape.text_frame
    tf.clear()
    clean = [str(s) for s in skills if s]

    kept = []
    running_len = 0
    separator_len = len("  •  ")
    for skill in clean:
        added_len = len(skill) + (separator_len if kept else 0)
        if running_len + added_len > SKILLS_CHAR_BUDGET:
            break
        kept.append(skill)
        running_len += added_len

    text = "  •  ".join(kept)
    

    run = tf.paragraphs[0].add_run()
    run.text = text
    run.font.size = Pt(8)


def fill_education_shape(shape, education: list[dict]) -> None:
    tf = shape.text_frame
    tf.clear()
    if not education:
        return
    first = True
    for edu in education:
        para = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        parts = [p for p in (edu.get("degree"), edu.get("field_of_study"), edu.get("institution")) if p]
        line = " - ".join(parts)
        if edu.get("years"):
            line = f"{line} ({edu['years']})" if line else str(edu["years"])
        run = para.add_run()
        run.text = line
        run.font.size = Pt(7.5)


# ---------------------------------------------------------------------------
# Slide-level fill
# ---------------------------------------------------------------------------

def fill_slide1(slide, cv_json: dict, target_language: str = "French"   ) -> None:
    shapes = slide.shapes
    set_single_run_text(find_shape_by_id(shapes, SLIDE1_SHAPES["name"]), cv_json.get("name") or "")
    set_single_run_text(find_shape_by_id(shapes, SLIDE1_SHAPES["title"]), cv_json.get("title") or "")

    years = cv_json.get("years_of_experience")
    label = YEARS_LABEL.get(target_language, YEARS_LABEL["French"])
    set_single_run_text(
        find_shape_by_id(shapes, SLIDE1_SHAPES["years"]),
        f"{years} {label}" if years else "",
    )
    set_single_run_text(find_shape_by_id(shapes, SLIDE1_SHAPES["summary"]), cv_json.get("summary") or "")
    fill_education_shape(find_shape_by_id(shapes, SLIDE1_SHAPES["education"]), cv_json.get("education") or [])
    fill_skills_shape(find_shape_by_id(shapes, SLIDE1_SHAPES["skills"]), cv_json.get("skills") or [])

    experiences = cv_json.get("experience") or []
    exp1 = experiences[0] if len(experiences) > 0 else {}
    exp2 = experiences[1] if len(experiences) > 1 else {}
    if exp1 and _experience_char_count(exp1) > CHAR_BUDGET_PER_SLOT:
        exp1 = _truncate_experience_for_display(exp1, CHAR_BUDGET_PER_SLOT)
    if exp2 and _experience_char_count(exp2) > CHAR_BUDGET_PER_SLOT:
        exp2 = _truncate_experience_for_display(exp2, CHAR_BUDGET_PER_SLOT)
    fill_single_experience_shape(find_shape_by_id(shapes, SLIDE1_SHAPES["exp1"]), exp1)
    fill_single_experience_shape(find_shape_by_id(shapes, SLIDE1_SHAPES["exp2"]), exp2)

    photo = find_shape_by_id(shapes, SLIDE1_SHAPES["photo"])
    if photo is not None:
        remove_shape(photo)


def fill_slide2_page(slide, cv_json: dict, boxes: list[list[dict]]) -> None:
    shapes = slide.shapes
    set_single_run_text(find_shape_by_id(shapes, SLIDE2_SHAPES["name"]), cv_json.get("name") or "")
    set_single_run_text(find_shape_by_id(shapes, SLIDE2_SHAPES["title"]), cv_json.get("title") or "")

    box_a = find_shape_by_id(shapes, SLIDE2_SHAPES["exp_box_a"])
    box_b = find_shape_by_id(shapes, SLIDE2_SHAPES["exp_box_b"])
    fill_multi_experience_shape(box_a, boxes[0] if len(boxes) > 0 else [])
    fill_multi_experience_shape(box_b, boxes[1] if len(boxes) > 1 else [])

    photo = find_shape_by_id(shapes, SLIDE2_SHAPES["photo"])
    if photo is not None:
        remove_shape(photo)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def render_cv_pptx(cv_json: dict, output_path: str, target_language: str = "French") -> str:
    import uuid
    workdir = Path("/tmp") / f"pptx_render_{uuid.uuid4().hex}"
    if workdir.exists():
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True)

    with zipfile.ZipFile(TEMPLATE_PATH) as z:
        z.extractall(workdir)

    # 1. Compute pagination BEFORE touching python-pptx.
    experiences = cv_json.get("experience") or []
    remaining = experiences[2:]
    boxes = _paginate_by_char_budget(remaining, CHAR_BUDGET_PER_BOX)
    pages = [boxes[i:i + 2] for i in range(0, len(boxes), 2)] or [[]]

    # 2. Duplicate slide 2 (raw XML) for every extra page needed.
    extra_slide_paths = [duplicate_slide2(workdir) for _ in pages[1:]]

    # 3. Rezip into an intermediate file, then open it with python-pptx.
    intermediate_path = workdir.parent / f"{workdir.name}_intermediate.pptx"
    with zipfile.ZipFile(intermediate_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in workdir.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(workdir))

    prs = Presentation(str(intermediate_path))

    # slides[0] = slide1, slides[1] = slide2, slides[2:] = duplicated pages,
    # in the same order they were added to sldIdLst.
    fill_slide1(prs.slides[0], cv_json,target_language)
    fill_slide2_page(prs.slides[1], cv_json, pages[0])
    for i, page in enumerate(pages[1:], start=2):
        fill_slide2_page(prs.slides[i], cv_json, page)

    prs.save(output_path)

    shutil.rmtree(workdir)
    intermediate_path.unlink()
    return output_path