// Shared helpers for the collections listing and detail pages.

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Resolves an SF Symbol name from collections.json to inline SVG, following the
// alias table first (`heart.circle.fill` and `heart.fill` are one drawing).
// Requires js/icons.js to have loaded — every page that calls this loads it
// immediately before this file.
function getIconSvg(iconName) {
    const icons = typeof QUIPS_ICONS === 'object' ? QUIPS_ICONS : {};
    const aliases = typeof QUIPS_ICON_ALIASES === 'object' ? QUIPS_ICON_ALIASES : {};
    const name = Object.prototype.hasOwnProperty.call(aliases, iconName)
        ? aliases[iconName]
        : iconName;
    return (Object.prototype.hasOwnProperty.call(icons, name) && icons[name]) || icons['sunrise.fill'];
}
