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
    requiredSorted.forEach(name => cloud.push({ text: name, type: 'required' }));
    notRequiredSorted.forEach(name => cloud.push({ text: name, type: 'not-required' }));
    tagsSorted.forEach(tag => cloud.push({ text: tag, type: 'tag-keyword' }));
    stemNovaSorted.forEach(name => cloud.push({ text: name, type: 'stem-nova' }));
    return cloud;
}

// Filter requirements by selected cloud items and group by rank
function filterRequirementsByRank(requirements, selectedCloud) {
    if (!selectedCloud.length) return {};
    const filtered = requirements.filter(req => {
        return selectedCloud.some(sel =>
            req.adventureAlt === sel.text ||
            req.adventure === sel.text ||
            req.tags.includes(sel.text) ||
            (Array.isArray(req.stemNova) && req.stemNova.includes(sel.text))
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

// Main
(async function() {
    try {
        const yamlText = await fetchYAML('data/adventure.yml');
        const data = jsyaml.load(yamlText);
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

        function buildRankStyles(rankOrder) {
            const styles = {};
            rankOrder.forEach(rank => {
                const key = getRankKey(rank);
                styles[rank] = rankColors[key] || { color: '#363636', text: '#fff', bg: '#f5f7fa' };
            });
            return styles;
        }

        let rankStyles = {};

        const ractive = new Ractive({
            target: '#keyword-cloud',
            template: `
            <div>
                <div class="mb-4">
                    {{#each cloud:i}}
                        <span class="cloud-keyword {{type}} {{selectedCloud.includes(cloud[i]) ? 'selected' : ''}}"
                            on-click="toggleCloud"
                            data-index="{{i}}"
                        >
                            {{#if type === 'stem-nova'}}
                                <span title="STEM Nova">{{text}} <span style="font-size:1.1em;">💥</span></span>
                            {{else}}
                                {{text}}
                            {{/if}}
                        </span>
                    {{/each}}
                </div>
                <div id="requirements-grid">
                    {{#if rankOrder.length}}
                        <div class="columns is-multiline">
                            {{#each rankOrder:i}}
                                <div class="column is-one-sixth">
                                    <div class="rank-header" style="background: {{rankStyles[rankOrder[i]].color}}; color: {{rankStyles[rankOrder[i]].text}};">
                                        {{rankOrder[i]}}
                                    </div>
                                    {{#each filteredRequirements[rankOrder[i]]:j}}
                                        <div class="adventure-group">
                                            <div class="adventure-box" style="background: {{rankStyles[rankOrder[i]].bg}};">
                                                <div class="adventure-title" style="color: {{rankStyles[rankOrder[i]].color}};">
                                                    {{name}}
                                                    {{#if requirements[0].adventureAlt}}
                                                        <span class="adventure-altname">{{requirements[0].adventureAlt}}</span>
                                                    {{/if}}
                                                    {{#if requirements[0].stemNova}}
                                                        <span class="stem-nova-badge has-tooltip"
                                                            style="color: #FF6EC7; margin-left: 0.5em; font-size: 1.1em; cursor: pointer; background: none; border-radius: 0; padding: 0; position: relative;"
                                                            on-click="togglePopover"
                                                            data-adventure="{{name}}"
                                                        >
                                                            💥
                                                            {{#if popoverAdventure === name}}
                                                                <div class="card popover-stem-nova" style="position: absolute; left: 1.5em; top: 0; z-index: 10; min-width: 180px; max-width: 260px; background: #fff; border: 1px solid #FF6EC7; box-shadow: 0 2px 8px rgba(50,115,220,0.10); border-radius: 0.5em; padding: 0.7em 1em;">
                                                                    <header class="card-header" style="background: #FF6EC7; color: #fff; border-radius: 0.5em 0.5em 0 0; padding: 0.3em 0.7em; font-size: 1em; font-weight: bold;">
                                                                        STEM Nova Awards
                                                                    </header>
                                                                    <div class="card-content" style="padding: 0.5em 0 0.2em 0;">
                                                                        <ul style="margin: 0; padding-left: 1.1em;">
                                                                            {{#each requirements[0].stemNova:n}}
                                                                                <li style="color: #FF6EC7; font-weight: 500; margin-bottom: 0.3em; line-height: 1.4;">
                                                                                    {{#if novaAwardLinks && novaAwardLinks[requirements[0].stemNova[n].toLowerCase().trim()]}}
                                                                                        <a href="{{novaAwardLinks[requirements[0].stemNova[n].toLowerCase().trim()]}}" target="_blank" style="color: #FF6EC7; text-decoration: underline;">{{requirements[0].stemNova[n]}}</a>
                                                                                    {{else}}
                                                                                        {{requirements[0].stemNova[n]}}
                                                                                    {{/if}}
                                                                                </li>
                                                                            {{/each}}
                                                                        </ul>
                                                                    </div>
                                                                </div>
                                                            {{/if}}
                                                        </span>
                                                    {{/if}}
                                                </div>
                                                <ul>
                                                    {{#each requirements:i}}
                                                        <li>
                                                            <a href="{{adventureUrl}}" target="_blank">{{requirement}}</a>: <span class="requirement-desc">{{description}}</span>
                                                            {{#if tags.length}}
                                                                <br>
                                                                {{#each tags:k}}
                                                                    <span class="tag is-light" style="margin-right:0.2em;">
                                                                        {{#if requirements[0].stemNova && requirements[0].stemNova.includes(tags[k])}}
                                                                            💥 {{tags[k]}}
                                                                        {{else}}
                                                                            {{tags[k]}}
                                                                        {{/if}}
                                                                    </span>
                                                                {{/each}}
                                                            {{/if}}
                                                        </li>
                                                        {{#if i < requirements.length - 1}}
                                                            <hr style="margin: 0.4em 0; border: none; border-top: 1px solid #e3e3e3;">
                                                        {{/if}}
                                                    {{/each}}
                                                </ul>
                                            </div>
                                        </div>
                                    {{/each}}
                                </div>
                            {{/each}}
                        </div>
                    {{else}}
                        <p class="has-text-grey requirements-empty-message">Select a word cloud item to see matching requirements.</p>
                    {{/if}}
                </div>
            </div>
            `,
            data: {
                cloud,
                selectedCloud: [],
                filteredRequirements: {},
                rankOrder: [],
                rankStyles: {},
                popoverAdventure: null,
                novaAwardLinks
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
                    const filtered = filterRequirementsByRank(requirements, selected);
                    const order = getRankOrder(requirements.filter(req => {
                        return selected.some(sel =>
                            req.adventureAlt === sel.text ||
                            req.adventure === sel.text ||
                            req.tags.includes(sel.text) ||
                            (Array.isArray(req.stemNova) && req.stemNova.includes(sel.text))
                        );
                    }));
                    rankStyles = buildRankStyles(order);
                    this.set('filteredRequirements', filtered);
                    this.set('rankOrder', order);
                    this.set('rankStyles', rankStyles);
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

        // Add clear button functionality
        document.getElementById('clear-btn').addEventListener('click', function() {
            ractive.set('selectedCloud', []);
            ractive.set('filteredRequirements', {});
            ractive.set('rankOrder', []);
            ractive.set('rankStyles', {});
        });

        // Remove special style for stem-nova; let all tags use the same style
    } catch (e) {
        document.getElementById('keyword-cloud').innerHTML = '<p class="has-text-danger">Failed to load data.</p>';
        console.error(e);
    }
})();
