// The HTML of a profile page.
const key = (id) => String(id).trim().toLowerCase();

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// The page of `profileId` as `viewerId` sees it: people looking at their own page see "(you)" after the name.
export async function renderProfilePage(profiles, viewerId, profileId) {
  const profile = await profiles.get(profileId);
  if (!profile) return '<h1>No such profile</h1>';
  // The profile object is the cache's own: it must not be changed here.
  const own = viewerId != null && key(viewerId) === key(profileId);
  const name = own ? `${profile.name} (you)` : profile.name;
  return `<article><h1>${escapeHtml(name)}</h1>\n<p>${escapeHtml(profile.bio ?? '')}</p></article>`;
}
