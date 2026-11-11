# Causes

**1. A read that was under way when the name was saved put the old profile back.** `get()` shares one database read
between everyone who asks while it runs, and when it ends it writes what it read into the cache. If `update()`
saved and dropped the cache entry while such a read was under way, the read (which started before the save and so
has the old name) finished afterwards and filled the cache with the old profile for the whole TTL; and a `get()`
made after the update could even join that old read. A busy site has more reads under way, hence more of this.
Fix: every update of a profile counts up a version for it, a read only fills the cache if the version has not
changed since it started, `update()` also forgets the read under way (so later callers start a new one), and a
finished read only removes its own entry from the map of reads under way, never a newer read's.

**2. `update()` dropped the cache entry under a different key.** `get()` keys the cache by the address trimmed and
in lower case; `update()` deleted the raw address it was given. For addresses written with capitals or spaces the
entry was never dropped, so the old name stayed until the TTL ran out. Fix: `update()` uses the same `key()`.

**3. A failed read stayed in the map of reads under way.** The read was removed from the map only when it succeeded,
so after a database error every later `get()` of that profile was handed the same rejected promise. Fix: the read
is removed when it fails as well.

**4. The page changed the cached profile.** `renderProfilePage()` added " (you)" to the name of the object it got
from `get()`, which is the cache's own object, so each view of one's own page added another one, and others
saw it too. Fix: the page builds the name it shows and leaves the profile alone.
