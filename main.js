// Helper: fetch YAML file with cache busting using Jekyll build revision
async function fetchYAML(url) {
    const cacheBuster = encodeURIComponent('{{ site.github.build_revision }}');
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
    const requirements = [];
    if (!data.ranks) return { requiredNames, notRequiredNames, tags, requirements };
    data.ranks.forEach(rank => {
        if (!rank.adventure_list) return;
        rank.adventure_list.forEach(adv => {
            // alternate_name
            if (adv.alternate_name) {
                if (adv.required) requiredNames.add(adv.alternate_name);
                else notRequiredNames.add(adv.alternate_name);
            }
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
                        rank: rank.rank
                    });
                });
            }
        });
    });
    // Remove empty tag
    tags.delete("");
    return { requiredNames, notRequiredNames, tags, requirements };
}

// Render cloud
function renderCloud({ requiredNames, notRequiredNames, tags }) {
    const cloud = [];
    // Sort each set alphabetically
    const requiredSorted = Array.from(requiredNames).sort((a, b) => a.localeCompare(b));
    const notRequiredSorted = Array.from(notRequiredNames).sort((a, b) => a.localeCompare(b));
    const tagsSorted = Array.from(tags).sort((a, b) => a.localeCompare(b));
    requiredSorted.forEach(name => cloud.push({ text: name, type: 'required' }));
    notRequiredSorted.forEach(name => cloud.push({ text: name, type: 'not-required' }));
    tagsSorted.forEach(tag => cloud.push({ text: tag, type: 'tag-keyword' }));
    return cloud;
}

// Filter requirements by selected cloud items and group by rank
function filterRequirementsByRank(requirements, selectedCloud) {
    if (!selectedCloud.length) return {};
    const filtered = requirements.filter(req => {
        return selectedCloud.some(sel =>
            req.adventureAlt === sel.text ||
            req.adventure === sel.text ||
            req.tags.includes(sel.text)
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
        const { requiredNames, notRequiredNames, tags, requirements } = extractKeywordsAndRequirements(data);
        const cloud = renderCloud({ requiredNames, notRequiredNames, tags });

        // Cub Scout rank colors
        const rankColors = {
            lion:    { color: '#FFD700', text: '#7a5c00', bg: '#FFF9E3' }, // gold/yellow
            tiger:   { color: '#FF8800', text: '#7a3c00', bg: '#FFF2E0' }, // orange
            wolf:    { color: '#D7263D', text: '#fff', bg: '#FFE3E8' },    // red
            bear:    { color: '#1E90FF', text: '#fff', bg: '#E3F0FF' },    // blue
            webelos: { color: '#2E8B57', text: '#fff', bg: '#E3FFF0' },    // green
            'arrow of light': { color: '#20B2AA', text: '#fff', bg: '#E0FFFF' }, // teal
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
                        >{{text}}</span>
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
                                                </div>
                                                <ul>
                                                    {{#each requirements:i}}
                                                        <li>
                                                            <a href="{{adventureUrl}}" target="_blank">{{requirement}}</a>: <span class="requirement-desc">{{description}}</span>
                                                            {{#if tags.length}}
                                                                <br><span class="tag is-light">{{tags.join(', ')}}</span>
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
                        <p class="has-text-grey">Select a word cloud item to see matching requirements.</p>
                    {{/if}}
                </div>
            </div>
            `,
            data: {
                cloud,
                selectedCloud: [],
                filteredRequirements: {},
                rankOrder: [],
                rankStyles: {}
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
                            req.tags.includes(sel.text)
                        );
                    }));
                    rankStyles = buildRankStyles(order);
                    this.set('filteredRequirements', filtered);
                    this.set('rankOrder', order);
                    this.set('rankStyles', rankStyles);
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
    } catch (e) {
        document.getElementById('keyword-cloud').innerHTML = '<p class="has-text-danger">Failed to load data.</p>';
        console.error(e);
    }
})();
