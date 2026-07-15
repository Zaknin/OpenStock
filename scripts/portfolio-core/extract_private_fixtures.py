#!/usr/bin/env python3
"""Read-only private fixture extraction for Portfolio Core Phase 0.

This script intentionally uses only Python's standard library and OOXML ZIP/XML
reads. It never saves, recalculates, repairs, or evaluates the source workbook.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


EXTRACTOR_VERSION = "portfolio-core-private-fixtures-v1"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"main": MAIN_NS, "rel": REL_NS, "pkgrel": PKG_REL_NS}


class ExtractionError(RuntimeError):
    """Raised for a safe, expected extraction refusal."""


def column_index(column: str) -> int:
    value = 0
    for character in column:
        value = value * 26 + ord(character) - ord("A") + 1
    return value


def cell_coordinate_parts(cell_ref: str) -> tuple[str, int]:
    letters = "".join(character for character in cell_ref if character.isalpha())
    digits = "".join(character for character in cell_ref if character.isdigit())
    if not letters or not digits:
        raise ExtractionError("Workbook contains an unsupported cell reference.")
    return letters, int(digits)


def in_ranges(cell_ref: str, ranges: list[tuple[str, int, str, int]]) -> bool:
    column, row = cell_coordinate_parts(cell_ref)
    index = column_index(column)
    return any(
        start_row <= row <= end_row
        and column_index(start_column) <= index <= column_index(end_column)
        for start_column, start_row, end_column, end_row in ranges
    )


def format_ranges(ranges: list[tuple[str, int, str, int]]) -> list[str]:
    return [f"{start_column}{start_row}:{end_column}{end_row}" for start_column, start_row, end_column, end_row in ranges]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def package_relationships(archive: zipfile.ZipFile, owner_path: str) -> dict[str, str]:
    directory, filename = owner_path.rsplit("/", 1)
    rel_path = f"{directory}/_rels/{filename}.rels"
    if rel_path not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(rel_path))
    relationships: dict[str, str] = {}
    for relationship in root.findall("pkgrel:Relationship", NS):
        target = relationship.attrib.get("Target", "")
        if target.startswith("/"):
            normalized = target.lstrip("/")
        else:
            normalized = os.path.normpath(os.path.join(directory, target)).replace("\\", "/")
        relationships[relationship.attrib["Id"]] = normalized
    return relationships


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(path))
    return ["".join(item.itertext()) for item in root.findall("main:si", NS)]


def cell_value(cell: ET.Element, strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find("main:is", NS)
        return "".join(inline.itertext()) if inline is not None else None
    value = cell.find("main:v", NS)
    if value is None:
        return None
    if cell_type == "s" and value.text is not None:
        index = int(value.text)
        return strings[index] if 0 <= index < len(strings) else None
    return value.text


def cell_record(cell: ET.Element, sheet_name: str, capture_class: str, sequence: int | None = None) -> dict[str, Any]:
    reference = cell.attrib["r"]
    column, row = cell_coordinate_parts(reference)
    formula_element = cell.find("main:f", NS)
    formula = formula_element.text if formula_element is not None else None
    value = cell.attrib.get("_decoded_value")
    return {
        "source": {
            "sheet": sheet_name,
            "row": row,
            "column": column,
            "cell": reference,
            "sequence": sequence,
        },
        "original_value": value if formula is None else None,
        "formula": formula,
        "cached_value": value if formula is not None else None,
        "cell_type": cell.attrib.get("t", "n"),
        "calculation_class": "formula" if formula is not None else capture_class,
    }


class WorkbookReader:
    def __init__(self, workbook_path: Path):
        self.workbook_path = workbook_path
        self.archive = zipfile.ZipFile(workbook_path, "r")
        self.strings = shared_strings(self.archive)
        self.sheets = self._load_sheets()
        self._sheet_cells: dict[str, list[ET.Element]] = {}

    def close(self) -> None:
        self.archive.close()

    def _load_sheets(self) -> dict[str, dict[str, Any]]:
        workbook_path = "xl/workbook.xml"
        root = ET.fromstring(self.archive.read(workbook_path))
        relationships = package_relationships(self.archive, workbook_path)
        sheets: dict[str, dict[str, Any]] = {}
        for index, sheet in enumerate(root.findall("main:sheets/main:sheet", NS)):
            relationship_id = sheet.attrib.get(f"{{{REL_NS}}}id")
            if relationship_id not in relationships:
                raise ExtractionError("Workbook sheet relationship is incomplete.")
            name = sheet.attrib["name"]
            sheets[name] = {
                "index": index,
                "name": name,
                "state": sheet.attrib.get("state", "visible"),
                "path": relationships[relationship_id],
            }
        return sheets

    def inventory(self) -> list[dict[str, Any]]:
        return [
            {"index": item["index"], "name": item["name"], "state": item["state"]}
            for item in self.sheets.values()
        ]

    def cells(self, sheet_name: str) -> list[ET.Element]:
        if sheet_name not in self.sheets:
            raise ExtractionError("Workbook is missing a required worksheet.")
        if sheet_name not in self._sheet_cells:
            root = ET.fromstring(self.archive.read(self.sheets[sheet_name]["path"]))
            cells: list[ET.Element] = []
            for cell in root.findall("main:sheetData/main:row/main:c", NS):
                decoded = cell_value(cell, self.strings)
                if decoded is not None or cell.find("main:f", NS) is not None:
                    cell.attrib["_decoded_value"] = "" if decoded is None else str(decoded)
                    cells.append(cell)
            self._sheet_cells[sheet_name] = cells
        return self._sheet_cells[sheet_name]


CAPTURES = {
    "setup": {
        "sheet": "Setup",
        "ranges": [("B", 5, "B", 9), ("B", 12, "B", 36), ("B", 39, "B", 48), ("B", 52, "D", 301), ("H", 52, "H", 301)],
        "class": "input",
    },
    "trade-log": {
        "sheet": "Trade Log",
        "ranges": [("B", 6, "J", 4005)],
        "class": "input",
    },
    "workflow-inputs": {
        "sources": [
            {"sheet": "Dashboard", "ranges": [("C", 2, "C", 4), ("E", 2, "E", 2), ("C", 53, "C", 54)]},
            {"sheet": "Monthly Performance", "ranges": [("D", 99, "D", 101)]},
            {"sheet": "Realized Gains", "ranges": [("D", 3, "D", 4)]},
            {"sheet": "Re-Balancing", "ranges": [("F", 4, "F", 5), ("F", 9, "F", 36), ("J", 12, "J", 36)]},
            {"sheet": "Corporate Actions", "ranges": [("C", 14, "C", 19)]},
        ],
        "class": "input",
    },
    "manual-overrides": {
        "sources": [
            {"sheet": "Your Portfolio Holdings", "ranges": [("H", 7, "H", 7), ("H", 9, "H", 259), ("AF", 7, "AF", 7), ("AF", 9, "AF", 259), ("AL", 7, "AL", 7), ("AL", 9, "AL", 259)]},
            {"sheet": "Dividends", "ranges": [("I", 125, "I", 374)]},
        ],
        "class": "input",
    },
    "benchmark-observations": {
        "sources": [
            {"sheet": "S&P 500 Data", "ranges": [("A", 1, "J", 2100)]},
            {"sheet": "Custom Benchmark Data", "ranges": [("A", 5, "G", 2100)]},
        ],
        "class": "cached_output",
    },
}

EXPECTED_CAPTURES = {
    "calc-trade-log": {"sheet": "Calc Trade Log", "ranges": [("B", 6, "AP", 5005)]},
    "holdings": {"sheet": "Your Portfolio Holdings", "ranges": [("B", 8, "CD", 259)]},
    "dashboard": {"sheet": "Dashboard", "ranges": [("B", 7, "J", 123)]},
    "realized-gains": {"sheet": "Realized Gains", "ranges": [("B", 8, "P", 326)]},
    "dividends": {"sheet": "Dividends", "ranges": [("B", 6, "Y", 374)]},
    "monthly-performance": {"sheet": "Monthly Performance", "ranges": [("J", 1, "Y", 1042)]},
    "rebalance": {"sheet": "Re-Balancing", "ranges": [("B", 7, "Z", 36)]},
    "corporate-actions": {"sheet": "Corporate Actions", "ranges": [("B", 21, "I", 31)]},
}


def selected_records(reader: WorkbookReader, sheet_name: str, ranges: list[tuple[str, int, str, int]], capture_class: str, sequence_rows: bool = False) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for cell in reader.cells(sheet_name):
        reference = cell.attrib["r"]
        if not in_ranges(reference, ranges):
            continue
        _, row = cell_coordinate_parts(reference)
        sequence = row - 5 if sequence_rows else None
        records.append(cell_record(cell, sheet_name, capture_class, sequence))
    return records


def grouped_trade_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["source"]["row"]].append(record)
    rows = []
    for row, cells in sorted(grouped.items()):
        ordered = sorted(cells, key=lambda item: column_index(item["source"]["column"]))
        user_entry_columns = {"B", "C", "D", "E", "F", "H", "I", "J"}
        has_nonblank_user_entry = any(
            cell["source"]["column"] in user_entry_columns
            and (cell["original_value"] if cell["formula"] is None else cell["cached_value"]) not in (None, "")
            for cell in ordered
        )
        if has_nonblank_user_entry:
            rows.append(
                {
                    "source": {"sheet": "Trade Log", "row": row, "sequence": row - 5},
                    "cells": ordered,
                }
            )
    return rows


def capture_fixture_data(reader: WorkbookReader) -> tuple[dict[str, Any], dict[str, int], dict[str, Any]]:
    setup = selected_records(reader, CAPTURES["setup"]["sheet"], CAPTURES["setup"]["ranges"], CAPTURES["setup"]["class"])
    trade_cells = selected_records(reader, CAPTURES["trade-log"]["sheet"], CAPTURES["trade-log"]["ranges"], CAPTURES["trade-log"]["class"], sequence_rows=True)
    trade_rows = grouped_trade_rows(trade_cells)

    workflow_sources = []
    workflow_count = 0
    for source in CAPTURES["workflow-inputs"]["sources"]:
        cells = selected_records(reader, source["sheet"], source["ranges"], CAPTURES["workflow-inputs"]["class"])
        workflow_sources.append({"source_sheet": source["sheet"], "source_ranges": format_ranges(source["ranges"]), "cells": cells})
        workflow_count += len(cells)

    manual_cells: list[dict[str, Any]] = []
    for source in CAPTURES["manual-overrides"]["sources"]:
        manual_cells.extend(selected_records(reader, source["sheet"], source["ranges"], CAPTURES["manual-overrides"]["class"]))

    benchmark_sources = []
    benchmark_count = 0
    for source in CAPTURES["benchmark-observations"]["sources"]:
        cells = selected_records(reader, source["sheet"], source["ranges"], CAPTURES["benchmark-observations"]["class"])
        benchmark_sources.append({"source_sheet": source["sheet"], "source_ranges": format_ranges(source["ranges"]), "cells": cells})
        benchmark_count += len(cells)

    expected: dict[str, Any] = {}
    expected_counts: dict[str, int] = {}
    for name, capture in EXPECTED_CAPTURES.items():
        cells = selected_records(reader, capture["sheet"], capture["ranges"], "cached_output")
        expected[name] = {
            "capture_type": "cached_calculated_output",
            "source_sheet": capture["sheet"],
            "source_ranges": format_ranges(capture["ranges"]),
            "cells": cells,
        }
        expected_counts[name] = len(cells)

    output = {
        "setup": {"capture_type": "raw_user_inputs", "source_sheet": "Setup", "source_ranges": format_ranges(CAPTURES["setup"]["ranges"]), "cells": setup},
        "trade-log": {"capture_type": "raw_user_inputs", "source_sheet": "Trade Log", "source_ranges": format_ranges(CAPTURES["trade-log"]["ranges"]), "transactions": trade_rows},
        "workflow-inputs": {"capture_type": "raw_user_inputs", "sources": workflow_sources},
        "manual-overrides": {"capture_type": "raw_user_inputs", "cells": manual_cells},
        "benchmark-observations": {"capture_type": "cached_benchmark_observations", "sources": benchmark_sources},
        "expected": expected,
    }
    counts = {
        "setup_cells": len(setup),
        "trade_log_rows": len(trade_rows),
        "trade_log_cells": sum(len(row["cells"]) for row in trade_rows),
        "workflow_input_cells": workflow_count,
        "manual_override_cells": len(manual_cells),
        "benchmark_observation_cells": benchmark_count,
        **{f"expected_{name}_cells": count for name, count in expected_counts.items()},
    }
    source_ranges = {
        "setup.json": [{"sheet": "Setup", "ranges": format_ranges(CAPTURES["setup"]["ranges"]), "capture_type": "raw_user_inputs"}],
        "trade-log.json": [{"sheet": "Trade Log", "ranges": format_ranges(CAPTURES["trade-log"]["ranges"]), "capture_type": "raw_user_inputs"}],
        "workflow-inputs.json": [{"sheet": source["sheet"], "ranges": format_ranges(source["ranges"]), "capture_type": "raw_user_inputs"} for source in CAPTURES["workflow-inputs"]["sources"]],
        "manual-overrides.json": [{"sheet": source["sheet"], "ranges": format_ranges(source["ranges"]), "capture_type": "raw_user_inputs"} for source in CAPTURES["manual-overrides"]["sources"]],
        "benchmark-observations.json": [{"sheet": source["sheet"], "ranges": format_ranges(source["ranges"]), "capture_type": "cached_benchmark_observations"} for source in CAPTURES["benchmark-observations"]["sources"]],
        "expected": [{"file": f"expected/{name}.json", "sheet": capture["sheet"], "ranges": format_ranges(capture["ranges"]), "capture_type": "cached_calculated_output"} for name, capture in EXPECTED_CAPTURES.items()],
    }
    return output, counts, source_ranges


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def output_root(repo_root: Path, requested: str | None) -> Path:
    allowed = (repo_root / ".local" / "portfolio-core-fixtures").resolve()
    candidate = allowed if requested is None else Path(requested).expanduser().resolve()
    if candidate != allowed or not is_within(candidate, repo_root.resolve()):
        raise ExtractionError("Fixture output is restricted to the ignored .local/portfolio-core-fixtures root.")
    return allowed


def write_json(path: Path, value: Any) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def write_fixture_pack(target: Path, manifest: dict[str, Any], data: dict[str, Any]) -> None:
    if target.exists():
        raise ExtractionError("A fixture pack for this workbook hash already exists; refusing to overwrite private evidence.")
    staging = target.parent / f".{target.name}.staging-{os.getpid()}"
    if staging.exists():
        raise ExtractionError("A private fixture staging directory already exists; refusing to overwrite it.")
    try:
        (staging / "expected").mkdir(parents=True, exist_ok=False)
        write_json(staging / "manifest.json", manifest)
        write_json(staging / "setup.json", data["setup"])
        write_json(staging / "trade-log.json", data["trade-log"])
        write_json(staging / "workflow-inputs.json", data["workflow-inputs"])
        write_json(staging / "manual-overrides.json", data["manual-overrides"])
        write_json(staging / "benchmark-observations.json", data["benchmark-observations"])
        for name, expected in data["expected"].items():
            write_json(staging / "expected" / f"{name}.json", expected)
        staging.replace(target)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read-only Portfolio Core private fixture extractor.")
    parser.add_argument("--workbook", required=True, help="Explicit path to the source .xlsx workbook.")
    parser.add_argument("--output-root", help="Must be the repository .local/portfolio-core-fixtures directory if provided.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and verify hashes without writing a fixture pack.")
    return parser.parse_args()


def main() -> int:
    args = parse_arguments()
    workbook = Path(args.workbook).expanduser().resolve()
    if not workbook.is_file() or workbook.suffix.lower() != ".xlsx":
        raise ExtractionError("The workbook argument must identify an existing .xlsx file.")

    repo_root = Path(__file__).resolve().parents[2]
    allowed_root = output_root(repo_root, args.output_root)
    before_hash = sha256_file(workbook)

    reader = WorkbookReader(workbook)
    try:
        data, row_counts, source_ranges = capture_fixture_data(reader)
        inventory = reader.inventory()
    finally:
        reader.close()

    after_hash = sha256_file(workbook)
    if before_hash != after_hash:
        raise ExtractionError("Workbook hash changed during extraction; no fixture pack was written.")

    manifest = {
        "schema": "portfolio-core-private-fixture-manifest-v1",
        "workbook_filename": workbook.name,
        "workbook_sha256": before_hash,
        "extraction_timestamp_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "workbook_sheet_inventory": inventory,
        "row_counts": row_counts,
        "cached_formula_warning": "Formulas were not recalculated or evaluated. Formula values are stored workbook caches, including Google Sheets-origin dummy-function formulas.",
        "source_ranges": source_ranges,
        "extractor_version": EXTRACTOR_VERSION,
        "privacy": {
            "contains_session_credentials": False,
            "contains_machine_specific_secrets": False,
            "console_output_is_sanitized": True,
            "tracked_output_prohibited": True,
        },
    }

    target = allowed_root / before_hash
    if not args.dry_run:
        allowed_root.mkdir(parents=True, exist_ok=True)
        write_fixture_pack(target, manifest, data)

    summary = {
        "status": "dry_run_complete" if args.dry_run else "extraction_complete",
        "workbook_filename": workbook.name,
        "workbook_sha256_before": before_hash,
        "workbook_sha256_after": after_hash,
        "hash_verified": True,
        "row_counts": row_counts,
        "workbook_sheet_count": len(inventory),
        "fixture_pack": f".local/portfolio-core-fixtures/{before_hash}" if not args.dry_run else None,
        "values_printed": False,
    }
    print(json.dumps(summary, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ExtractionError, zipfile.BadZipFile, ET.ParseError) as error:
        print(json.dumps({"status": "failed", "reason": str(error), "values_printed": False}), file=sys.stderr)
        raise SystemExit(2)
