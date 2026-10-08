import app


def test_package_imports() -> None:
    assert app.__doc__ is not None
