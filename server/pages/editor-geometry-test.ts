// Tests for what the page editor works out without a page (editor-geometry.ts): where a part snaps while it is moved or sized,
// the address a link may have, and what a pasted line of words may keep. Run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/editor-geometry-test.ts
//   DATA_DIR=/tmp/hydor-test-editor-geometry node dist/dev/editor-geometry-test.js
import { geometry } from './editor-geometry.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const same = (got: unknown, want: unknown, what: string) => ok(got === want, got === want ? what : `${what}\n     got:  ${String(got)}\n     want: ${String(want)}`);

const G = geometry();
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

// ---- moving: edges and middles snap to the others' and to the boxes around, within a few pixels ------------------------------
{
  const other = box(200, 100, 100, 50);
  const frame = box(0, 0, 800, 600);
  // Its left edge 3 px from the other's left edge: it lands on it, and a line is drawn from one to the other.
  let s = G.snapMove(box(203, 300, 80, 40), [other], [frame], 6);
  same(s.dx, -3, 'a part 3 px from another’s left edge snaps to it');
  ok(s.lines.some((l) => l.x1 === 200 && l.x2 === 200 && l.y1 <= 100 && l.y2 >= 340), 'and a guide joins the two along that edge');
  // Beyond the reach: nothing moves.
  s = G.snapMove(box(210, 300, 80, 40), [other], [frame], 6);
  same(`${s.dx},${s.dy}`, '0,0', 'a part further than that stays where it is');
  // Its middle on another's middle.
  s = G.snapMove(box(222, 300, 56, 40), [other], [frame], 6);
  same(s.dx, 0, 'a part whose middle is on another’s is already lined up');
  s = G.snapMove(box(225, 300, 50, 40), [other], [frame], 6);
  ok(Math.abs(s.dx) <= 0.01 || s.dx === 0 || Math.abs(225 + 25 + s.dx - 250) < 0.01, 'its middle snaps to another’s middle');
  // Its right edge to the box it is in.
  s = G.snapMove(box(717, 300, 80, 40), [], [frame], 6);
  same(s.dx, 3, 'its right edge snaps to the edge of the box it is in');
  // The middle of the page.
  s = G.snapMove(box(358, 280, 80, 40), [], [frame], 6);
  same(s.dx, 2, 'its middle snaps to the middle of the box it is in');
  same(s.dy, -0, 'and a vertical middle to the middle (300) too: it is already there');
  // No snapping (Alt): nothing moves, the distances still show.
  s = G.snapMove(box(203, 300, 80, 40), [other], [frame], 6, false);
  same(s.dx, 0, 'with snapping off, nothing is pulled');
  ok(s.gaps.length > 0 && s.gaps.every((g) => /^\d+$/.test(g.label)), 'but the distances to what is around are given, as numbers on lines');
}
// Equal gaps: a part between two, spaced as the first two are.
{
  const a = box(0, 100, 50, 50);
  const b = box(100, 100, 50, 50);
  const s = G.snapMove(box(197, 100, 50, 50), [a, b], [box(0, 0, 1000, 400)], 6);
  ok(Math.abs(197 + s.dx - 200) < 0.01, 'a part beside two spaced evenly takes the same gap');
  same(s.gaps.length, 2, 'and both gaps are marked');
  same(s.gaps[0].label, '50', 'with their size');
}

// ---- sizing: the edges that move snap; the same width as another's ---------------------------------------------------------------
{
  const other = box(100, 100, 200, 80);
  const frame = box(0, 0, 800, 600);
  let s = G.snapSize(box(100, 300, 197, 60), { r: true }, [other], [frame], 6);
  same(s.box.w, 200, 'a right edge 3 px short of another’s right edge snaps to it');
  same(s.box.x, 100, 'and the left edge stays');
  ok(s.lines.length > 0, 'with a guide');
  s = G.snapSize(box(103, 300, 197, 60), { l: true }, [other], [frame], 6);
  same(`${s.box.x},${s.box.w}`, '100,200', 'a left edge snaps and the width follows, the right edge staying');
  s = G.snapSize(box(400, 300, 195, 60), { r: true }, [other], [frame], 6);
  same(s.box.w, 200, 'a part sized to nearly the width of another takes exactly its width');
  s = G.snapSize(box(400, 300, 195, 60), { r: true }, [other], [frame], 6, 'y');
  same(s.box.w, 195, 'with only the vertical direction asked, the width is left');
  s = G.snapSize(box(400, 300, 150, 77), { b: true }, [other], [frame], 6);
  same(s.box.h, 80, 'a height close to another’s takes it');
  s = G.snapSize(box(400, 300, 150, 60), { b: true }, [other], [frame], 6);
  same(s.box.h, 60, 'a size that matches nothing stays');
}

// ---- the address a link may have ------------------------------------------------------------------------------------------------
{
  const L = G.linkAddress;
  same(L('example.com'), 'https://example.com', 'a bare site gets https:// (it was a link to a page beside this one)');
  same(L('www.example.com/a?b=1#c'), 'https://www.example.com/a?b=1#c', 'with a path, a query and a fragment');
  same(L('  example.org  '), 'https://example.org', 'spaces around it are not part of it');
  same(L('https://a.example/x'), 'https://a.example/x', 'a web address with its scheme is kept');
  same(L('HTTP://A.example'), 'HTTP://A.example', 'in any case');
  same(L('//cdn.example.com/x.js'), 'https://cdn.example.com/x.js', 'one without a scheme (//host) is https');
  same(L('localhost:3000/app'), 'https://localhost:3000/app', 'a host with a port is a web address, not a scheme');
  same(L('example.com:8080/p'), 'https://example.com:8080/p', 'so is a site with a port');
  same(L('192.168.1.5'), 'https://192.168.1.5', 'an IP address');
  same(L('ann@example.com'), 'mailto:ann@example.com', 'an email address becomes mailto:');
  same(L('mailto:ann@example.com'), 'mailto:ann@example.com', 'a mailto: link is kept');
  same(L('+30 210 123 4567'), 'tel:+302101234567', 'a phone number becomes tel: (spaces gone)');
  same(L('tel:+302101234567'), 'tel:+302101234567', 'a tel: link is kept');
  same(L('#pricing'), '#pricing', 'a place in the page is kept');
  same(L('/about'), '/about', 'a path is kept');
  same(L('./team.html'), './team.html', 'a file beside the page is kept');
  same(L('../x/y'), '../x/y', 'one in the folder above');
  same(L('team.html'), 'team.html', 'a file name is a file beside the page, not a site');
  same(L('notes.pdf'), 'notes.pdf', 'so is a PDF’s');
  same(L('contact'), 'contact', 'a name alone stays as it is');
  same(L(''), null, 'nothing typed is no address');
  same(L('   '), null, 'nor are spaces');
  // Addresses that run code or show files are refused, however they are dressed.
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'jav&#x61;script:x', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>', 'data:image/svg+xml;base64,AAAA', 'file:///etc/passwd', 'blob:https://x/y', 'ftp2:x', '​javascript:alert(1)', 'javascript\u0000:alert(1)']) {
    const got = G.linkAddress(bad);
    ok(got === null || !/^(javascript|vbscript|data|file|blob):/i.test(got), `${JSON.stringify(bad)} does not become a link that runs or shows anything (${got})`);
  }
  same(L('javascript:alert(1)'), null, 'javascript: is refused');
  same(L('data:text/html,x'), null, 'data: is refused');
  same(L('vbscript:x'), null, 'vbscript: is refused');
  same(L('file:///etc/passwd'), null, 'file: is refused');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
