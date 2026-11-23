"""A line can run whole ("AB") or split in two halves ("A" / "B"). Each
half then reports on its own and shows up as its own row (e.g. "39A")."""

PARTS = ("AB", "A", "B")
PART_PATTERN = "^(AB|A|B)$"


def part_label(line_number: str, part: str) -> str:
    """"39AB" + "A" -> "39A"; "AB" keeps the line's own number."""
    if part == "AB":
        return line_number
    base = line_number[:-2] if line_number.upper().endswith("AB") else line_number
    return f"{base}{part}"


def part_order(part: str) -> int:
    return PARTS.index(part) if part in PARTS else len(PARTS)


def conflicting_parts(part: str) -> tuple[str, ...]:
    """A whole-line report and half-line reports can't both exist on a day."""
    return ("A", "B") if part == "AB" else ("AB",)
