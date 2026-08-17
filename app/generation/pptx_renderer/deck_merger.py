# file: app/generation/pptx_renderer/deck_merger.py
"""
Merges multiple already-generated candidate .pptx files into a single deck,
by copying each source file's slides (+ their referenced media, if any) into
a base presentation. python-pptx has no merge API, and neither does raw
python-pptx editing support cross-file slide copy -- this stays at the
zip/XML level, same approach as slide_duplication.py's slide duplication.

Assumption: all source files were rendered from the SAME template
(Template CV format DVT.pptx), so shared assets (logos) are byte-identical
across files -- media is copied with content-hash dedup rather than trusting
filenames, so identical images collapse to one copy in the merged deck.
"""

import hashlib
import shutil
import uuid
import zipfile
from pathlib import Path

from lxml import etree

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def qn(prefix_tag: str) -> str:
    prefix, local = prefix_tag.split(":")
    return f"{{{NS[prefix]}}}{local}"


def _next_free_slide_number(slides_dir: Path) -> int:
    existing = [int(p.stem.replace("slide", "")) for p in slides_dir.glob("slide[0-9]*.xml")]
    return max(existing, default=0) + 1


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _copy_media_dedup(src_media_dir: Path, dst_media_dir: Path, hash_to_name: dict) -> dict:
    """
    Copies every file in src_media_dir into dst_media_dir, skipping files
    whose content already exists there (by hash). Returns a mapping of
    {original_filename: final_filename_in_dst} for rewriting rels.
    """
    dst_media_dir.mkdir(parents=True, exist_ok=True)
    rename_map = {}
    if not src_media_dir.exists():
        return rename_map

    for src_file in src_media_dir.iterdir():
        if not src_file.is_file():
            continue
        file_hash = _file_hash(src_file)
        if file_hash in hash_to_name:
            rename_map[src_file.name] = hash_to_name[file_hash]
            continue
        final_name = src_file.name
        dst_path = dst_media_dir / final_name
        counter = 1
        while dst_path.exists() and _file_hash(dst_path) != file_hash:
            final_name = f"{src_file.stem}_{counter}{src_file.suffix}"
            dst_path = dst_media_dir / final_name
            counter += 1
        if not dst_path.exists():
            shutil.copy(src_file, dst_path)
        hash_to_name[file_hash] = final_name
        rename_map[src_file.name] = final_name
    return rename_map


def _append_slide_from_source(
    base_workdir: Path,
    src_workdir: Path,
    src_slide_num: int,
    media_hash_map: dict,
) -> None:
    base_slides_dir = base_workdir / "ppt" / "slides"
    src_slides_dir = src_workdir / "ppt" / "slides"

    new_num = _next_free_slide_number(base_slides_dir)
    new_slide_path = base_slides_dir / f"slide{new_num}.xml"
    shutil.copy(src_slides_dir / f"slide{src_slide_num}.xml", new_slide_path)

    src_rels_path = src_slides_dir / "_rels" / f"slide{src_slide_num}.xml.rels"
    new_rels_path = base_slides_dir / "_rels" / f"slide{new_num}.xml.rels"

    if src_rels_path.exists():
        rename_map = _copy_media_dedup(
            src_workdir / "ppt" / "media", base_workdir / "ppt" / "media", media_hash_map
        )
        rels_tree = etree.parse(str(src_rels_path))
        for rel in rels_tree.getroot():
            target = rel.get("Target", "")
            if target.startswith("../media/"):
                old_name = target.split("/")[-1]
                new_name = rename_map.get(old_name, old_name)
                rel.set("Target", f"../media/{new_name}")
        rels_tree.write(str(new_rels_path), xml_declaration=True, encoding="UTF-8", standalone=True)

    # Register in [Content_Types].xml
    ct_path = base_workdir / "[Content_Types].xml"
    ct_tree = etree.parse(str(ct_path))
    override = etree.SubElement(ct_tree.getroot(), qn("ct:Override"))
    override.set("PartName", f"/ppt/slides/slide{new_num}.xml")
    override.set(
        "ContentType",
        "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
    )
    ct_tree.write(str(ct_path), xml_declaration=True, encoding="UTF-8", standalone=True)

    # Register relationship + sldId in presentation.xml(.rels)
    pres_rels_path = base_workdir / "ppt" / "_rels" / "presentation.xml.rels"
    rels_tree = etree.parse(str(pres_rels_path))
    rels_root = rels_tree.getroot()
    existing_ids = [int(r.get("Id").replace("rId", "")) for r in rels_root]
    new_rid = f"rId{max(existing_ids) + 1}"
    new_rel = etree.SubElement(rels_root, qn("pr:Relationship"))
    new_rel.set("Id", new_rid)
    new_rel.set(
        "Type",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
    )
    new_rel.set("Target", f"slides/slide{new_num}.xml")
    rels_tree.write(str(pres_rels_path), xml_declaration=True, encoding="UTF-8", standalone=True)

    pres_path = base_workdir / "ppt" / "presentation.xml"
    pres_tree = etree.parse(str(pres_path))
    sldIdLst = pres_tree.getroot().find(qn("p:sldIdLst"))
    existing_slide_ids = [int(s.get("id")) for s in sldIdLst]
    new_sldId = etree.SubElement(sldIdLst, qn("p:sldId"))
    new_sldId.set("id", str(max(existing_slide_ids) + 1))
    new_sldId.set(qn("r:id"), new_rid)
    pres_tree.write(str(pres_path), xml_declaration=True, encoding="UTF-8", standalone=True)


def merge_pptx_files(pptx_paths: list[str], output_path: str) -> str:
    """
    Merges N already-generated .pptx files into one, in the given order.
    The first file's own slides are kept as-is (base deck); every
    subsequent file's slides are appended.
    """
    if not pptx_paths:
        raise ValueError("No files to merge.")

    tmp_root = Path("/tmp") / f"pptx_merge_{uuid.uuid4().hex}"
    tmp_root.mkdir(parents=True)
    base_workdir = tmp_root / "base"

    with zipfile.ZipFile(pptx_paths[0]) as z:
        z.extractall(base_workdir)

    # Seed the dedup map with the base deck's own media, so later files
    # reusing the same logos don't get duplicated.
    media_hash_map = {}
    base_media_dir = base_workdir / "ppt" / "media"
    if base_media_dir.exists():
        for f in base_media_dir.iterdir():
            if f.is_file():
                media_hash_map[_file_hash(f)] = f.name

    for extra_path in pptx_paths[1:]:
        src_workdir = tmp_root / f"src_{uuid.uuid4().hex}"
        with zipfile.ZipFile(extra_path) as z:
            z.extractall(src_workdir)

        src_slides_dir = src_workdir / "ppt" / "slides"
        slide_nums = sorted(
            int(p.stem.replace("slide", "")) for p in src_slides_dir.glob("slide[0-9]*.xml")
        )
        for slide_num in slide_nums:
            _append_slide_from_source(base_workdir, src_workdir, slide_num, media_hash_map)

    if Path(output_path).exists():
        Path(output_path).unlink()
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in base_workdir.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(base_workdir))

    shutil.rmtree(tmp_root)
    return output_path