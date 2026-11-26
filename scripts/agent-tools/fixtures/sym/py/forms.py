"""Module docstring with def fake(): inside."""
import os
from typing import overload

MAX_SIZE: int = 10
DEFAULT_NAME = "x"  # trailing comment
a_pair, b_pair = 1, 2


# leading comment for helper
def helper(a, b=")"):
    """Docstring with a } and "quotes"."""
    def inner():
        return 1
    text = """
def not_a_def():
    pass
"""
    return inner() + len(text)  # trailing


@decorator
@other(1,
       2)
class Service(Base):
    """Service docstring."""

    registry: dict = {}
    limit = 5

    def __init__(self, x):
        self.x = x

    @property
    def name(self):
        return "n"

    @name.setter
    def name(self, value):
        self._name = value

    @staticmethod
    async def create(
        cls,
        arg: str = "}",
    ) -> "Service":
        return cls(arg)

    class Nested:
        def deep(self):
            return 1

    # trailing comment inside class


@overload
def ov(a: int) -> int: ...
@overload
def ov(a: str) -> str: ...
def ov(a):
    return a


async def fetch(url):
    return await go(url)


def multiline_string():
    s = '''
class Fake:
    pass
'''
    return s


if TYPE_CHECKING:
    COND_CONST: str = "cond"

lam = lambda x: x + 1
type Alias = list[int]


def last():
    pass
