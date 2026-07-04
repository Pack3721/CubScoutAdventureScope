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
    stemNovaSorted.forEach(name => cloud.push({ text: name, type: 'nova' }));
    return cloud;
}

// Filter requirements by selected cloud items and group by rank
function filterRequirementsByRank(requirements, selectedCloud) {
    if (!selectedCloud.length) return {};
    const filtered = requirements.filter(req => {
        return selectedCloud.some(sel =>
            (sel.type === 'req' && (req.adventureAlt === sel.text || req.adventure === sel.text)) ||
            (sel.type === 'elec' && (req.adventureAlt === sel.text || req.adventure === sel.text)) ||
            (sel.type === 'keyword' && req.tags.includes(sel.text)) ||
            (sel.type === 'nova' && Array.isArray(req.stemNova) && req.stemNova.includes(sel.text))
        );
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

// Copy URL button logic
function setupCopyUrlButton() {
    var btn = document.getElementById('copy-url-btn');
    if (!btn) return;
    btn.addEventListener('click', function() {
        var url = window.location.href;
        navigator.clipboard.writeText(url).then(function() {
            btn.classList.add('is-success');
            btn.querySelector('span:last-child').textContent = 'Copied!';
            setTimeout(function() {
                btn.classList.remove('is-success');
                btn.querySelector('span:last-child').textContent = 'Copy URL';
            }, 1200);
        }, function() {
            btn.classList.add('is-danger');
            btn.querySelector('span:last-child').textContent = 'Failed';
            setTimeout(function() {
                btn.classList.remove('is-danger');
                btn.querySelector('span:last-child').textContent = 'Copy URL';
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
                return selectedCloud.some(sel =>
                    (sel.type === 'req' && (req.adventureAlt === sel.text || req.adventure === sel.text)) ||
                    (sel.type === 'elec' && (req.adventureAlt === sel.text || req.adventure === sel.text)) ||
                    (sel.type === 'keyword' && req.tags.includes(sel.text)) ||
                    (sel.type === 'nova' && Array.isArray(req.stemNova) && req.stemNova.includes(sel.text))
                );
            }));
            let finalFiltered = filtered;
            if (selectedRanks.length) {
                order = order.filter(rank => selectedRanks.includes(rank));
                finalFiltered = {};
                order.forEach(rank => { if (filtered[rank]) finalFiltered[rank] = filtered[rank]; });
            }
            return { filtered: finalFiltered, order };
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
                cloudCollapsed: initialSelectedCloud.length > 0
            },
            on: {
                toggleCloud(event) {
                    const i = parseInt(event.node.getAttribute('data-index'), 10);
                    const item = this.get('cloud')[i];
                    let selected = this.get('selectedCloud').slice();
                    const idx = selected.findIndex(sel => sel.text === item.text && sel.type === item.type);
                    if (idx >= 0) selected.splice(idx, 1);
                    else selected.push(item);
                    this.set('selectedCloud', selected);
                    applyFilters(selected);
                },
                toggleCloudCollapse() {
                    const collapsed = this.get('cloudCollapsed');
                    this.set('cloudCollapsed', !collapsed);
                    // Update button text/icon
                    const btn = document.getElementById('toggle-cloud-btn');
                    const icon = document.getElementById('toggle-cloud-icon');
                    if (btn && icon) {
                        if (!collapsed) {
                            btn.querySelector('span:last-child').textContent = 'Expand Cloud';
                            icon.innerHTML = '<path fill="currentColor" d="M7 14l5-5 5 5H7z"/>';
                        } else {
                            btn.querySelector('span:last-child').textContent = 'Collapse Cloud';
                            icon.innerHTML = '<path fill="currentColor" d="M7 10l5 5 5-5H7z"/>';
                        }
                    }
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
