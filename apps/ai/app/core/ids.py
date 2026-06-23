"""CUID2 ids — matches @paralleldrive/cuid2 (the TS schema's `createId`, default
length 24) so Python-inserted rows are indistinguishable from TS-inserted ones."""

from cuid2 import Cuid

_gen = Cuid(length=24)


def new_id() -> str:
    return _gen.generate()
