// The HTML of a profile page.
const key = (id) => String(id).trim().toLowerCase();

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// The page of `profileId` as `viewerId` sees it: people looking at their own page see "(you)" after the name.
export async function renderProfilePage(profiles, viewerId, profileId) {
  const profile = await profiles.get(profileId);
  if (!profile) return '<h1>No such profile</h1>';
  if (viewerId != null && key(viewerId) === key(profileId)) profile.name += ' (you)';
  return `<article><h1>${escapeHtml(profile.name)}</h1>\n<p>${escapeHtml(profile.bio ?? '')}</p></article>`;
}
