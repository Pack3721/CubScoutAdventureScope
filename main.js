// QR code update logic (moved from index.html)
function updateQrCode() {
    var url = window.location.href;
    var qrImg = document.getElementById('qr-code-img');
    // Determine QR size based on number of selected items
    var selectedCount = 0;
    if (window.ractive && typeof window.ractive.get === 'function') {
        var selected = window.ractive.get('selectedCloud');
        if (Array.isArray(selected)) selectedCount = selected.length;
    }
    // Base size 80, add 10px per item over 2, max 200
    var size = 80 + Math.max(0, (selectedCount - 2)) * 10;
    size = Math.min(size, 200);
    if (qrImg) {
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=2&data=' + encodeURIComponent(url);
        qrImg.style.width = size + 'px';
        qrImg.style.height = size + 'px';
    }
}
window.addEventListener('DOMContentLoaded', updateQrCode);
window.addEventListener('popstate', updateQrCode);
// Also update QR code when query string changes (main.js calls replaceState)
(function() {
    var origReplaceState = history.replaceState;
    history.replaceState = function() {
        origReplaceState.apply(this, arguments);
        updateQrCode();
    };
})();
// Helper: get cache buster from main.js script tag
function getCacheBuster() {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].getAttribute('src');
        if (src && src.startsWith('main.js')) {
            const match = src.match(/[?&]v=([^&]+)/);
            if (match) {
                return match[1];
            }
        }
    }
    return '';
}

// Register the service worker for offline support. updateViaCache: 'none' ensures the
// browser never serves the service-worker.js update check from its HTTP cache.
// Skipped on localhost: site.github.build_revision tracks the git HEAD commit, not the
// working tree, so uncommitted local edits never bust the cache-first cache -- the service
// worker would otherwise mask live changes during local development.
const isLocalDev = ['localhost', '127.0.0.1', ''].includes(location.hostname);
if ('serviceWorker' in navigator) {
    if (isLocalDev) {
        // Clean up anything registered/cached from before this check existed.
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()));
        if (window.caches) caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
    } else {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
                .catch(err => console.warn('Service worker registration failed:', err));
        });
    }
}

// Update banner: compares the version this page was loaded with (window.APP_VERSION,
// baked in by Jekyll at build time) against version.json, always fetched fresh, which
// reflects whatever is actually deployed right now.
function checkForUpdate() {
    fetch('version.json', { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
            if (data.version && data.version !== window.APP_VERSION) {
                const banner = document.getElementById('update-banner');
                const text = document.getElementById('update-banner-text');
                if (text) text.title = 'New version: ' + data.version;
                if (banner) banner.classList.add('is-active');
                // Browsers only check for a new service-worker.js periodically (up to 24h) on
                // their own; force an immediate check now that we know a new version exists,
                // so it's installed and active by the time the user clicks Refresh.
                if (navigator.serviceWorker) {
                    navigator.serviceWorker.getRegistration().then(reg => reg && reg.update());
                }
            }
        })
        .catch(() => {}); // offline or fetch failed -- nothing to report
}
window.addEventListener('load', checkForUpdate);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
});
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('update-banner-refresh');
    const dismissBtn = document.getElementById('update-banner-dismiss');
    const banner = document.getElementById('update-banner');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            // If a new worker is still installing/activating, wait for it to take control
            // before reloading so we don't land back on the stale cache; otherwise just
            // reload -- reg.update() above has likely already finished by the time of a click.
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                let reloaded = false;
                const reloadOnce = () => {
                    if (reloaded) return;
                    reloaded = true;
                    window.location.reload();
                };
                navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true });
                navigator.serviceWorker.getRegistration().then(reg => reg && reg.update());
                setTimeout(reloadOnce, 1500); // fallback if already up to date
            } else {
                window.location.reload();
            }
        });
    }
    if (dismissBtn) dismissBtn.addEventListener('click', () => banner && banner.classList.remove('is-active'));
});

// Helper: fetch YAML file with cache busting using extracted value
async function fetchYAML(url) {
    const cacheBuster = encodeURIComponent(getCacheBuster());
    const bustedUrl = `${url}?v=${cacheBuster}`;
    const res = await fetch(bustedUrl);
    if (!res.ok) throw new Error('Failed to fetch YAML');
    return await res.text();
}

// Helper: extract keywords and requirements
function extractKeywordsAndRequirements(data) {
    const requiredNames = new Set();
    const notRequiredNames = new Set();
    const tags = new Set();
    const stemNovaNames = new Set();
    const requirements = [];
    if (!data.ranks) return { requiredNames, notRequiredNames, tags, stemNovaNames, requirements };
    data.ranks.forEach(rank => {
        if (!rank.adventure_list) return;
        rank.adventure_list.forEach(adv => {
            // alternate_name
            if (adv.alternate_name) {
                if (adv.required) requiredNames.add(adv.alternate_name);
                else notRequiredNames.add(adv.alternate_name);
            }
            // stem_nova (array or string)
            let stemNovaArr = [];
            if (Array.isArray(adv.stem_nova)) {
                stemNovaArr = adv.stem_nova.filter(x => typeof x === 'string');
            } else if (typeof adv.stem_nova === 'string') {
                stemNovaArr = [adv.stem_nova];
            }
            stemNovaArr.forEach(nova => stemNovaNames.add(nova));
            // requirements tags
            if (adv.requirements) {
                adv.requirements.forEach(req => {
                    if (req.tags && Array.isArray(req.tags)) {
                        req.tags.forEach(tag => tags.add(tag));
                    }
                    requirements.push({
                        adventure: adv.name,
                        adventureAlt: adv.alternate_name || "",
                        adventureRequired: !!adv.required,
                        adventureUrl: adv.url,
                        requirement: req.name,
                        description: req.description || "",
                        tags: req.tags || [],
                        rank: rank.rank,
                        stemNova: stemNovaArr.length ? stemNovaArr : null
                    });
                });
            }
        });
    });
    // Remove empty tag
    tags.delete("");
    stemNovaNames.delete("");
    return { requiredNames, notRequiredNames, tags, stemNovaNames, requirements };
}

// Render cloud
function renderCloud({ requiredNames, notRequiredNames, tags }) {
    const cloud = [];
    // Defensive: filter to only strings before sorting
    const onlyStrings = arr => arr.filter(x => typeof x === 'string');
    const requiredSorted = onlyStrings(Array.from(requiredNames)).sort((a, b) => a.localeCompare(b));
    const notRequiredSorted = onlyStrings(Array.from(notRequiredNames)).sort((a, b) => a.localeCompare(b));
    const tagsSorted = onlyStrings(Array.from(tags)).sort((a, b) => a.localeCompare(b));
    const stemNovaSorted = onlyStrings(Array.from(arguments[0].stemNovaNames || [])).sort((a, b) => a.localeCompare(b));
    requiredSorted.forEach(name => cloud.push({ text: name, type: 'req' }));
    notRequiredSorted.forEach(name => cloud.push({ text: name, type: 'elec' }));
    tagsSorted.forEach(tag => cloud.push({ text: tag, type: 'keyword' }));
    // A selectable "Nova Awards" header matches any requirement with a stem_nova award,
    // acting as a parent tag over the individual awards (see visibleCloud's grouping).
    if (stemNovaSorted.length) {
        cloud.push({ text: 'Nova Awards', type: 'nova', isGroup: true });
    }
    stemNovaSorted.forEach(name => cloud.push({ text: name, type: 'nova' }));
    return cloud;
}

// Group any tag under another tag that is its hyphen-prefix (e.g. `camp-overnight` under
// `camp`, `civics-flag-ceremony` under `civics`), purely by name -- no explicit parent list.
// Picks the longest existing prefix as the immediate parent.
function buildTagHierarchyMaps(tagsSet) {
    const childrenMap = {};
    const parentMap = {};
    Array.from(tagsSet).forEach(tag => {
        const parts = tag.split('-');
        for (let i = parts.length - 1; i > 0; i--) {
            const candidate = parts.slice(0, i).join('-');
            if (tagsSet.has(candidate)) {
                parentMap[tag] = candidate;
                (childrenMap[candidate] = childrenMap[candidate] || []).push(tag);
                break;
            }
        }
    });
    return { childrenMap, parentMap };
}

// True if a cloud item (req/elec adventure name, keyword tag, or nova award/group) applies to
// a given requirement. Shared by the cloud-selection filter and the per-rank relevance map.
function cloudItemMatchesRequirement(item, req) {
    return (item.type === 'req' && (req.adventureAlt === item.text || req.adventure === item.text)) ||
        (item.type === 'elec' && (req.adventureAlt === item.text || req.adventure === item.text)) ||
        (item.type === 'keyword' && req.tags.includes(item.text)) ||
        (item.type === 'nova' && Array.isArray(req.stemNova) && req.stemNova.length && (item.isGroup || req.stemNova.includes(item.text)));
}

// Filter requirements by selected cloud items and group by rank
function filterRequirementsByRank(requirements, selectedCloud) {
    if (!selectedCloud.length) return {};
    const filtered = requirements.filter(req => {
        return selectedCloud.some(sel => cloudItemMatchesRequirement(sel, req));
    });
    // Group by rank, then by adventure (as array for Ractive)
    const grouped = {};
    filtered.forEach(req => {
        const rank = req.rank || "Unknown";
        if (!grouped[rank]) grouped[rank] = {};
        const adv = req.adventure || "Unknown Adventure";
        if (!grouped[rank][adv]) grouped[rank][adv] = [];
        grouped[rank][adv].push(req);
    });
    // Convert adventures to array for each rank
    const groupedForRactive = {};
    Object.keys(grouped).forEach(rank => {
        groupedForRactive[rank] = Object.keys(grouped[rank]).map(advName => ({
            name: advName,
            requirements: grouped[rank][advName]
        }));
    });
    return groupedForRactive;
}

// Get up to 6 ranks in order of appearance
function getRankOrder(requirements) {
    const order = [];
    requirements.forEach(req => {
        const rank = req.rank || "Unknown";
        if (!order.includes(rank)) order.push(rank);
    });
    return order.slice(0, 6);
}

// --- Query String & Title Helpers ---
// Map type to first letter for compact query string
const typeToLetter = { req: 'r', elec: 'e', keyword: 'k', nova: 'n' };
const letterToType = { r: 'req', e: 'elec', k: 'keyword', n: 'nova' };
function encodeCloudItems(items) {
    // Replace any character except a-z, 0-9, or dash with _, and lowercase everything
    return items.map(item => {
        const letter = (typeToLetter[item.type] || item.type[0]).toLowerCase();
        const safeText = (item.text || '').toLowerCase().replace(/[^a-z0-9-]/g, '_');
        return letter + '_' + safeText;
    }).join('.');
}
function decodeCloudItems(str, cloud) {
    if (!str) return [];
    return str.toLowerCase().split('.').map(pair => {
        const letter = pair[0];
        const type = letterToType[letter] || letter;
        const encodedText = pair.slice(2); // skip letter and underscore
        // Build regex: replace _ with . (wildcard), match from start to end, case-insensitive
        const regex = new RegExp('^' + encodedText.replace(/_/g, '.') + '$', 'i');
        // Find the first matching cloud item of the correct type (case-insensitive)
        return cloud.find(c => c.type === type && regex.test((c.text || '').toLowerCase()));
    }).filter(Boolean);
}
let originalTitle = document.title;
function updateQueryStringAndTitle(selectedCloud, selectedRanks) {
    const encoded = encodeCloudItems(selectedCloud);
    const encodedRanks = encodeRanks(selectedRanks || []);
    const url = new URL(window.location);
    if (encoded) {
        url.searchParams.set('q', encoded);
    } else {
        url.searchParams.delete('q');
    }
    if (encodedRanks) {
        url.searchParams.set('r', encodedRanks);
    } else {
        url.searchParams.delete('r');
    }
    window.history.replaceState({}, '', url);
    // Update title
    if (selectedCloud.length) {
        document.title = originalTitle + ': ' + selectedCloud.map(i => i.text).join(', ');
    } else {
        document.title = originalTitle;
    }
}

// --- Rank Filter (r=) query string helpers ---
// Populated from each rank's `grade` field in data/ranks/*.yml (see buildRankGradeLetters below),
// so the K/1/2/3/4/5 letters and rank display order come from the data, not a hardcoded list.
let RANK_ORDER = [];
let gradeLetterToRank = {};
let rankToGradeLetter = {};
// Derive a compact grade-level letter (k, 1-5) from a `grade` string like "Kindergarten" or "3rd Grade"
function gradeToLetter(grade) {
    const g = (grade || '').trim().toLowerCase();
    if (g.startsWith('kindergarten')) return 'k';
    const match = g.match(/^(\d+)/);
    return match ? match[1] : null;
}
// Build RANK_ORDER/rankToGradeLetter/gradeLetterToRank from the loaded rank data,
// in the same order the ranks appear in data.ranks.
function buildRankGradeLetters(ranks) {
    RANK_ORDER = [];
    rankToGradeLetter = {};
    gradeLetterToRank = {};
    ranks.forEach(r => {
        const letter = gradeToLetter(r.grade);
        if (!letter) return;
        RANK_ORDER.push(r.rank);
        rankToGradeLetter[r.rank] = letter;
        gradeLetterToRank[letter] = r.rank;
    });
}
function encodeRanks(selectedRanks) {
    if (!selectedRanks || !selectedRanks.length) return '';
    return RANK_ORDER
        .filter(rank => selectedRanks.includes(rank))
        .map(rank => rankToGradeLetter[rank])
        .join('');
}
function decodeRanks(str) {
    if (!str) return [];
    const ranks = str.toLowerCase().split('').map(ch => gradeLetterToRank[ch]).filter(Boolean);
    return RANK_ORDER.filter(rank => ranks.includes(rank));
}

// Copy URL / Share button logic. Where the Web Share API is available (mainly mobile
// browsers), use the native share sheet instead of a clipboard copy -- it's the more
// natural mobile pattern (Messages, Mail, AirDrop, etc.) and needs no "Copied!" feedback
// of its own since the OS sheet already confirms the action.
function setupCopyUrlButton() {
    var btn = document.getElementById('copy-url-btn');
    if (!btn) return;
    var label = btn.querySelector('.copy-url-label');
    var icon = document.getElementById('copy-url-icon');

    if (navigator.share) {
        btn.title = 'Share this view';
        if (label) label.textContent = 'Share';
        if (icon) {
            // Apple-style "square and arrow up" share icon (note the different viewBox).
            icon.setAttribute('viewBox', '0 0 16 16');
            icon.innerHTML = '<path fill="currentColor" fill-rule="evenodd" d="M3.5 6a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 1 0-1h2A1.5 1.5 0 0 1 14 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 14.5v-8A1.5 1.5 0 0 1 3.5 5h2a.5.5 0 0 1 0 1h-2z"/><path fill="currentColor" fill-rule="evenodd" d="M7.646.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 1.707V10.5a.5.5 0 0 1-1 0V1.707L5.354 3.854a.5.5 0 1 1-.708-.708l3-3z"/>';
        }
        btn.addEventListener('click', function() {
            navigator.share({ title: document.title, url: window.location.href })
                .catch(function(err) {
                    if (err && err.name === 'AbortError') return; // user dismissed the sheet
                    console.warn('Share failed:', err);
                });
        });
        return;
    }

    btn.addEventListener('click', function() {
        var url = window.location.href;
        navigator.clipboard.writeText(url).then(function() {
            btn.classList.add('is-success');
            if (label) label.textContent = 'Copied!';
            setTimeout(function() {
                btn.classList.remove('is-success');
                if (label) label.textContent = 'Copy URL';
            }, 1200);
        }, function() {
            btn.classList.add('is-danger');
            if (label) label.textContent = 'Failed';
            setTimeout(function() {
                btn.classList.remove('is-danger');
                if (label) label.textContent = 'Copy URL';
            }, 1200);
        });
    });
}

// Main
(async function() {
    try {
        setupCopyUrlButton();
        const yamlText = await fetchYAML('data/adventure.yml');
        const data = jsyaml.load(yamlText);
        //yaml data ranks array starts with string stubs to pull from data/ranks/<stub>.yml to replace with new full object arrays
        for (let i = 0; i < data.ranks.length; i++) {
            if (typeof data.ranks[i] === 'string') {
                const rankYaml = await fetchYAML(`data/ranks/${data.ranks[i]}.yml`);
                data.ranks[i] = jsyaml.load(rankYaml);
            }
        }
        buildRankGradeLetters(data.ranks);

        const { requiredNames, notRequiredNames, tags, stemNovaNames, requirements } = extractKeywordsAndRequirements(data);
        const cloud = renderCloud({ requiredNames, notRequiredNames, tags, stemNovaNames });
        const { childrenMap: tagChildrenMap, parentMap: tagParentMap } = buildTagHierarchyMaps(tags);

        // Which ranks each cloud item actually applies to (computed once, since cloud and
        // requirements are both static after load). Used to grey out items that don't apply to
        // any of the currently rank-filtered ranks.
        const itemRankSets = new Map();
        cloud.forEach(item => {
            const ranks = new Set();
            requirements.forEach(req => {
                if (cloudItemMatchesRequirement(item, req)) ranks.add(req.rank);
            });
            itemRankSets.set(item, ranks);
        });

        // The chain of ancestor tag names (immediate parent first) that must be expanded
        // for `item` to be visible in the cloud. Empty if it's already top-level.
        function getAncestorChain(item) {
            if (item.type === 'nova') {
                return item.isGroup ? [] : ['Nova Awards'];
            }
            const chain = [];
            let ancestor = tagParentMap[item.text];
            while (ancestor) {
                chain.push(ancestor);
                ancestor = tagParentMap[ancestor];
            }
            return chain;
        }

        // Tags that must be open because a currently selected item lives inside them -- computed
        // fresh from selectedCloud every time, so it's correct regardless of whether/when the
        // section had already been manually expanded.
        function getRequiredOpenTags(selectedCloud) {
            const requiredOpen = {};
            selectedCloud.forEach(sel => {
                getAncestorChain(sel).forEach(tag => { requiredOpen[tag] = true; });
            });
            return requiredOpen;
        }

        // True if any child (or deeper descendant) of `tag` is currently expanded. Collapsing
        // `tag` would hide that descendant's own expanded section, so its toggle should be inert.
        function hasExpandedDescendant(tag, expandedTags) {
            const children = tagChildrenMap[tag];
            if (!children) return false;
            return children.some(child => expandedTags[child] || hasExpandedDescendant(child, expandedTags));
        }

        // Build a map of nova_awards name -> url (normalize to lower case, trimmed)
        let novaAwardLinks = {};
        if (data.nova_awards && Array.isArray(data.nova_awards)) {
            data.nova_awards.forEach(award => {
                if (award.name && award.url) {
                    novaAwardLinks[award.name.trim().toLowerCase()] = award.url;
                }
            });
        }

        // Cub Scout rank colors and stem nova color
        const rankColors = {
            lion:    { color: '#FFD700', text: '#7a5c00', bg: '#FFF9E3' }, // gold/yellow
            tiger:   { color: '#FF8800', text: '#7a3c00', bg: '#FFF2E0' }, // orange
            wolf:    { color: '#D7263D', text: '#fff', bg: '#FFE3E8' },    // red
            bear:    { color: '#1E90FF', text: '#fff', bg: '#E3F0FF' },    // blue
            webelos: { color: '#2E8B57', text: '#fff', bg: '#E3FFF0' },    // green
            'arrow of light': { color: '#20B2AA', text: '#fff', bg: '#E0FFFF' }, // teal
            'stem-nova': { color: '#FF6EC7', text: '#fff', bg: '#FFF0FA' } // magenta/pink for stem nova
        };

        function getRankKey(rank) {
            return (rank || '').trim().toLowerCase();
        }

        // Build styles and grade map for ranks
        function buildRankStylesAndGrades(rankOrder) {
            const styles = {};
            const grades = {};
            if (data && Array.isArray(data.ranks)) {
                data.ranks.forEach(r => {
                    const key = getRankKey(r.rank);
                    grades[r.rank] = r.grade || '';
                });
            }
            rankOrder.forEach(rank => {
                const key = getRankKey(rank);
                styles[rank] = rankColors[key] || { color: '#363636', text: '#fff', bg: '#f5f7fa' };
            });
            return { styles, grades };
        }

        let rankStyles = {};
        let rankGrades = {};

        // --- Get initial selection from query string ---
        let initialSelectedCloud = [];
        const params = new URLSearchParams(window.location.search);
        if (params.has('q')) {
            initialSelectedCloud = decodeCloudItems(params.get('q'), cloud);
        }
        // Ranks to display; empty means "all" (default)
        let selectedRanks = decodeRanks(params.get('r'));

        // Compute filtered requirements + rank order for a cloud selection, then
        // narrow to selectedRanks (if any) while preserving RANK_ORDER.
        function computeFilteredAndOrder(selectedCloud) {
            const filtered = filterRequirementsByRank(requirements, selectedCloud);
            let order = getRankOrder(requirements.filter(req => {
                return selectedCloud.some(sel => cloudItemMatchesRequirement(sel, req));
            }));
            let finalFiltered = filtered;
            if (selectedRanks.length) {
                order = order.filter(rank => selectedRanks.includes(rank));
                finalFiltered = {};
                order.forEach(rank => { if (filtered[rank]) finalFiltered[rank] = filtered[rank]; });
            }
            return { filtered: finalFiltered, order };
        }

        // Sync the collapse/expand button's label and icon to the given cloudCollapsed state.
        // Label/icon always reflect the action the next click will perform.
        function updateCloudToggleButton(collapsed) {
            const btn = document.getElementById('toggle-cloud-btn');
            const icon = document.getElementById('toggle-cloud-icon');
            if (!btn || !icon) return;
            if (collapsed) {
                btn.querySelector('span:last-child').textContent = 'Expand Cloud';
                icon.innerHTML = '<path fill="currentColor" d="M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"/>';
            } else {
                btn.querySelector('span:last-child').textContent = 'Collapse Cloud';
                icon.innerHTML = '<path fill="currentColor" d="M7.41 18.59L8.83 20 12 16.83 15.17 20l1.41-1.41L12 14l-4.59 4.59zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10l4.59-4.59z"/>';
            }
        }

        // Recompute and apply filtered requirements/rank order using the given cloud
        // selection and the current selectedRanks, then sync the URL.
        function applyFilters(selectedCloud) {
            const { filtered, order } = computeFilteredAndOrder(selectedCloud);
            const { styles, grades } = buildRankStylesAndGrades(order);
            rankStyles = styles;
            rankGrades = grades;
            ractive.set('filteredRequirements', filtered);
            ractive.set('rankOrder', order);
            ractive.set('rankStyles', rankStyles);
            ractive.set('rankGrades', rankGrades);
            updateQueryStringAndTitle(selectedCloud, selectedRanks);
        }

        // Persist the ancestor chain of any pre-selected child (e.g. from a shared q= URL) as
        // expanded, so deselecting it later won't collapse the section (matches toggleCloud).
        const initialExpandedTags = {};
        initialSelectedCloud.forEach(item => {
            getAncestorChain(item).forEach(tag => { initialExpandedTags[tag] = true; });
        });

        const ractive = new Ractive({
            target: '#keyword-cloud',
            template: '#cloud-template',
            data: {
                cloud,
                selectedCloud: initialSelectedCloud,
                filteredRequirements: {},
                rankOrder: [],
                rankStyles: {},
                rankGrades: {}, // ensure grades are empty on initial load
                popoverAdventure: null,
                novaAwardLinks,
                cloudCollapsed: initialSelectedCloud.length > 0,
                // Tags the user has manually expanded via the +N/- toggle (or that were selected
                // on load). Tags required open by a *current* selection are derived fresh in
                // visibleCloud for the forced-open/grey styling, independent of this.
                expandedTags: initialExpandedTags,
                // Mirrors the module-level `selectedRanks` (kept in sync by updateRankFilterUI)
                // so visibleCloud can grey out tags that don't apply to the chosen ranks.
                selectedRanks: selectedRanks.slice()
            },
            computed: {
                // Cloud items to render in the expanded (non-collapsed) view: tags nested under
                // a collapsed parent (e.g. camp-overnight under camp) are hidden until every
                // ancestor in their chain has been expanded via the +N toggle. STEM Nova awards
                // are similarly collapsed behind the selectable "Nova Awards" header (see renderCloud).
                visibleCloud() {
                    const cloud = this.get('cloud');
                    const manualExpanded = this.get('expandedTags') || {};
                    const requiredOpen = getRequiredOpenTags(this.get('selectedCloud'));
                    const expanded = Object.assign({}, manualExpanded, requiredOpen);
                    const novaExpanded = !!expanded['Nova Awards'];
                    const activeRanksSet = new Set(this.get('selectedRanks') || []);
                    const isRankIrrelevant = item => {
                        if (!activeRanksSet.size) return false;
                        const ranks = itemRankSets.get(item);
                        return !!ranks && ranks.size > 0 && ![...ranks].some(r => activeRanksSet.has(r));
                    };
                    const result = [];

                    cloud.forEach((item, index) => {
                        if (item.type === 'nova') {
                            if (item.isGroup) {
                                result.push(Object.assign({}, item, {
                                    index,
                                    depth: 0,
                                    hasChildren: true,
                                    childCount: cloud.filter(c => c.type === 'nova' && !c.isGroup).length,
                                    expanded: novaExpanded,
                                    forcedOpen: !!requiredOpen['Nova Awards'],
                                    rankIrrelevant: isRankIrrelevant(item)
                                }));
                            } else if (novaExpanded) {
                                result.push(Object.assign({}, item, {
                                    index,
                                    depth: 1,
                                    hasChildren: false,
                                    childCount: 0,
                                    expanded: false,
                                    rankIrrelevant: isRankIrrelevant(item)
                                }));
                            }
                            return;
                        }

                        let ancestor = tagParentMap[item.text];
                        while (ancestor) {
                            if (!expanded[ancestor]) return;
                            ancestor = tagParentMap[ancestor];
                        }
                        let depth = 0;
                        let d = tagParentMap[item.text];
                        while (d) {
                            depth++;
                            d = tagParentMap[d];
                        }
                        const children = tagChildrenMap[item.text];
                        result.push(Object.assign({}, item, {
                            index,
                            depth,
                            hasChildren: !!children,
                            childCount: children ? children.length : 0,
                            expanded: !!expanded[item.text],
                            forcedOpen: !!requiredOpen[item.text] || hasExpandedDescendant(item.text, expanded),
                            rankIrrelevant: isRankIrrelevant(item)
                        }));
                    });

                    return result;
                }
            },
            on: {
                toggleTagExpand(event) {
                    if (event.node.getAttribute('data-forced') === 'true') return; // inert while a selected child forces it open
                    const tag = event.node.getAttribute('data-tag');
                    const expanded = Object.assign({}, this.get('expandedTags'));
                    expanded[tag] = !expanded[tag];
                    this.set('expandedTags', expanded);
                },
                toggleCloud(event) {
                    const i = parseInt(event.node.getAttribute('data-index'), 10);
                    const item = this.get('cloud')[i];
                    let selected = this.get('selectedCloud').slice();
                    const idx = selected.findIndex(sel => sel.text === item.text && sel.type === item.type);
                    if (idx >= 0) {
                        // Deselecting never collapses a section -- expandedTags is left as-is.
                        selected.splice(idx, 1);
                    } else {
                        selected.push(item);
                        // Persist the ancestor chain as expanded so a later deselect doesn't
                        // close it back up (visibleCloud's forcedOpen/grey styling is still
                        // derived live from selectedCloud, independent of this).
                        const expandedTags = Object.assign({}, this.get('expandedTags'));
                        getAncestorChain(item).forEach(tag => { expandedTags[tag] = true; });
                        this.set('expandedTags', expandedTags);
                    }
                    this.set('selectedCloud', selected);
                    applyFilters(selected);
                },
                toggleCloudCollapse() {
                    const collapsed = this.get('cloudCollapsed');
                    this.set('cloudCollapsed', !collapsed);
                    updateCloudToggleButton(!collapsed);
                },
                togglePopover(event) {
                    const adventureName = event.node.getAttribute('data-adventure');
                    if (this.get('popoverAdventure') === adventureName) {
                        this.set('popoverAdventure', null);
                    } else {
                        this.set('popoverAdventure', adventureName);
                    }
                }
            }
        });

        // Expose ractive globally for QR sizing logic
        window.ractive = ractive;

        // Sync collapse/expand button to the initial state (e.g. already collapsed on
        // refresh when the page loads with a populated q= query string)
        updateCloudToggleButton(ractive.get('cloudCollapsed'));

        // Initial filter and title update if loaded with query string
        if (initialSelectedCloud.length) {
            applyFilters(initialSelectedCloud);
        }

        // Add clear button functionality
        document.getElementById('clear-btn').addEventListener('click', function() {
            selectedRanks = [];
            updateRankFilterUI();
            ractive.set('selectedCloud', []);
            ractive.set('filteredRequirements', {});
            ractive.set('rankOrder', []);
            ractive.set('rankStyles', {});
            ractive.set('rankGrades', {});
            ractive.set('expandedTags', {});
            ractive.set('cloudCollapsed', false); // Expand the cloud
            updateQueryStringAndTitle([], selectedRanks);
        });

        // Add cloud collapse/expand button functionality
        document.getElementById('toggle-cloud-btn').addEventListener('click', function() {
            ractive.fire('toggleCloudCollapse');
        });

        // --- Rank filter dropdown ---
        function updateRankFilterUI() {
            const allCheckbox = document.getElementById('rank-filter-all');
            const rankCheckboxes = document.querySelectorAll('.rank-filter-checkbox');
            const label = document.getElementById('rank-filter-label');
            const printNote = document.getElementById('rank-filter-print-note');
            rankCheckboxes.forEach(cb => {
                cb.checked = selectedRanks.includes(cb.getAttribute('data-rank'));
            });
            if (allCheckbox) allCheckbox.checked = selectedRanks.length === 0;
            if (label) {
                if (!selectedRanks.length) {
                    label.textContent = 'Ranks: All';
                } else if (selectedRanks.length <= 2) {
                    label.textContent = 'Ranks: ' + selectedRanks.join(', ');
                } else {
                    label.textContent = 'Ranks: ' + selectedRanks.length + ' selected';
                }
            }
            if (printNote) {
                printNote.textContent = selectedRanks.length
                    ? '(Ranks shown: ' + selectedRanks.join(', ') + ')'
                    : '';
            }
            ractive.set('selectedRanks', selectedRanks.slice());
        }

        function setupRankFilterDropdown() {
            const dropdown = document.getElementById('rank-filter-dropdown');
            const btn = document.getElementById('rank-filter-btn');
            const allCheckbox = document.getElementById('rank-filter-all');
            const rankCheckboxes = document.querySelectorAll('.rank-filter-checkbox');
            if (!dropdown || !btn) return;

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdown.classList.toggle('is-active');
            });
            document.addEventListener('click', function(e) {
                if (!dropdown.contains(e.target)) dropdown.classList.remove('is-active');
            });

            if (allCheckbox) {
                allCheckbox.addEventListener('change', function() {
                    selectedRanks = [];
                    updateRankFilterUI();
                    applyFilters(ractive.get('selectedCloud'));
                });
            }
            rankCheckboxes.forEach(cb => {
                cb.addEventListener('change', function() {
                    const rank = cb.getAttribute('data-rank');
                    if (cb.checked) {
                        if (!selectedRanks.includes(rank)) selectedRanks.push(rank);
                    } else {
                        selectedRanks = selectedRanks.filter(r => r !== rank);
                    }
                    selectedRanks = RANK_ORDER.filter(r => selectedRanks.includes(r));
                    updateRankFilterUI();
                    applyFilters(ractive.get('selectedCloud'));
                });
            });
        }

        setupRankFilterDropdown();
        updateRankFilterUI();

        // Remove special style for stem-nova; let all tags use the same style
    } catch (e) {
        document.getElementById('keyword-cloud').innerHTML = '<p class="has-text-danger">Failed to load data.</p>';
        console.error(e);
    }
})();
