# Hydor's word suggestions trainer (server/suggest starts it as `python -I <this folder>/train.py`): the package beside this file does the work.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hydor_suggest import train  # noqa: E402

if __name__ == '__main__':
    train.main()
