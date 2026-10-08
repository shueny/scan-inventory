from pathlib import Path

import pytest

from pnid import load_pnid, parse_inches, parse_instance_ids


@pytest.mark.parametrize(
    ("text", "expected"),
    [('2 1/2"', 2.5), ('1/2"', 0.5), ('4"', 4.0), ("", None), (None, None), ("  ", None)],
)
def test_parse_inches(text: str | None, expected: float | None) -> None:
    assert parse_inches(text) == expected


def test_parse_instance_ids() -> None:
    assert parse_instance_ids("177,175") == (177, 175)
    assert parse_instance_ids(" 3 ") == (3,)
    assert parse_instance_ids("") == ()


def test_load_pnid_trims_cells_and_reads_multiple_ids(tmp_path: Path) -> None:
    csv_path = tmp_path / "pnid.csv"
    csv_path.write_text(
        "TAG,TAG Simplified,Element,Dimension,Spool colour,Location,System,Instance ID\n"
        'VBF-1 ,VBF,butterfly valve ,"2 1/2""",blue,NW ,RWP - 109,"177,175"\n'
        "PT-1,PT,transmitter,,,,ASS - 108,\n",
        encoding="utf-8",
    )

    first, second = load_pnid(csv_path)

    assert first.tag == "VBF-1"
    assert first.element == "butterfly valve"
    assert first.nominal_inch == 2.5
    assert first.location == "NW"
    assert first.instance_ids == (177, 175)
    assert second.instance_ids == ()
    assert second.location is None
    assert second.dimension is None
