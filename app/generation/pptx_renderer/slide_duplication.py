# file: app/generation/pptx_renderer/slide_duplication.py
"""
Slide duplication via raw zip/XML surgery -- python-pptx has no API for
duplicating a slide, so this is the one part of the renderer that stays
low-level. Must run BEFORE the file is opened with python-pptx (mixing
raw XML edits with an open python-pptx Presentation on the same package
risks corrupting the in-memory part relationships).
"""

import shutil
from pathlib import Path
from lxml import etree

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def qn(tag: str) -> str:
    prefix, local = tag.split(":")
    full_ns = {
        "p": NS["p"],
        "r": NS["r"],
    }[prefix]
    return f"{{{full_ns}}}{local}"


def _next_free_slide_number(slides_dir: Path) -> int:
    existing = [int(p.stem.replace("slide", "")) for p in slides_dir.glob("slide[0-9]*.xml")]
    return max(existing) + 1


def duplicate_slide2(workdir: Path) -> Path:
    """
    Duplicates ppt/slides/slide2.xml as a new page: copies the XML + rels,
    declares it in [Content_Types].xml, and adds a relationship + <p:sldId>
    in presentation.xml. Returns the path to the new slide's XML file
    (still containing slide2's original placeholder content -- the caller
    fills it in after python-pptx re-opens the package).
    """
    slides_dir = workdir / "ppt" / "slides"
    new_num = _next_free_slide_number(slides_dir)
    new_slide_path = slides_dir / f"slide{new_num}.xml"
    shutil.copy(slides_dir / "slide2.xml", new_slide_path)
    shutil.copy(
        slides_dir / "_rels" / "slide2.xml.rels",
        slides_dir / "_rels" / f"slide{new_num}.xml.rels",
    )

    ct_path = workdir / "[Content_Types].xml"
    ct_tree = etree.parse(str(ct_path))
    ct_root = ct_tree.getroot()
    ct_ns = "http://schemas.openxmlformats.org/package/2006/content-types"
    override = etree.SubElement(ct_root, f"{{{ct_ns}}}Override")
    override.set("PartName", f"/ppt/slides/slide{new_num}.xml")
    override.set(
        "ContentType",
        "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
    )
    ct_tree.write(str(ct_path), xml_declaration=True, encoding="UTF-8", standalone=True)

    pres_rels_path = workdir / "ppt" / "_rels" / "presentation.xml.rels"
    rels_tree = etree.parse(str(pres_rels_path))
    rels_root = rels_tree.getroot()
    rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    existing_ids = [r.get("Id") for r in rels_root]
    next_rid_num = max(int(rid.replace("rId", "")) for rid in existing_ids) + 1
    new_rid = f"rId{next_rid_num}"
    new_rel = etree.SubElement(rels_root, f"{{{rel_ns}}}Relationship")
    new_rel.set("Id", new_rid)
    new_rel.set(
        "Type",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
    )
    new_rel.set("Target", f"slides/slide{new_num}.xml")
    rels_tree.write(str(pres_rels_path), xml_declaration=True, encoding="UTF-8", standalone=True)

    pres_path = workdir / "ppt" / "presentation.xml"
    pres_tree = etree.parse(str(pres_path))
    pres_root = pres_tree.getroot()
    sldIdLst = pres_root.find(qn("p:sldIdLst"))
    existing_slide_ids = [int(s.get("id")) for s in sldIdLst]
    new_slide_id = max(existing_slide_ids) + 1
    new_sldId = etree.SubElement(sldIdLst, qn("p:sldId"))
    new_sldId.set("id", str(new_slide_id))
    new_sldId.set(f"{{{NS['r']}}}id", new_rid)
    pres_tree.write(str(pres_path), xml_declaration=True, encoding="UTF-8", standalone=True)

    return new_slide_path