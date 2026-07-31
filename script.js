/* ================================================
   MHKFINDS - JAVASCRIPT
   Manhattan's #1 Student Deal Hub
   ================================================ */

// ========== GOOGLE SHEETS CONFIGURATION ==========
let allDeals = []; // global store for overlay search
let allDealsAnyDay = []; // includes deals not showing today, for share links

// Inline SVG icons (stroke follows the button's text color)
const ICON_HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6Z"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// Replace this URL with YOUR published Google Sheets CSV URL
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3QxDHqv4FuFfW2ygOAAPGco5WW-OJzAKYbdIQQ8lHguKr4e8yLnf7rNqHafiljTuW8h6-9-AWOCht/pub?gid=0&single=true&output=csv';

// ========== LOAD DEALS FROM GOOGLE SHEETS ==========
async function loadDeals() {
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const csvText = await response.text();
        allDealsAnyDay = parseCSV(csvText);
        const deals = allDealsAnyDay.filter(deal => deal.showsToday);

        // Featured deals get a carousel card up top AND stay in their
        // normal section, gold-highlighted, shuffled like everything else
        const featuredDeals = deals.filter(deal => deal.featured);
        const feedDeals = deals;

        // Separate deals by category
        let todayDeals = feedDeals.filter(deal => deal.category === 'today');
        let drinkDeals = feedDeals.filter(deal => deal.category === 'drinks');
        const otherDeals = feedDeals.filter(deal => deal.category === 'other');
        let events = feedDeals.filter(deal => deal.category === 'event');
        
        // Randomize section order — featured deals shuffle in with the
        // rest (the gold highlight is their boost, not position)
        todayDeals = shuffleArray(todayDeals);
        drinkDeals = shuffleArray(drinkDeals);
        
        // Sort events: recurring first (no event date), then one-time by date
        events = events.sort((a, b) => {
            const hasDateA = a.eventDate && a.eventDate.length > 0;
            const hasDateB = b.eventDate && b.eventDate.length > 0;
            
            // Both recurring (no dates) - maintain original order
            if (!hasDateA && !hasDateB) return 0;
            
            // A is recurring, B is one-time - A comes first
            if (!hasDateA && hasDateB) return -1;
            
            // A is one-time, B is recurring - B comes first
            if (hasDateA && !hasDateB) return 1;
            
            // Both have dates - sort chronologically (parsed in local timezone)
            return parseLocalDate(a.eventDate) - parseLocalDate(b.eventDate);
        });
        
        // Store all deals for overlay search
        allDeals = deals;

        // Render deals to the page
        renderPartners(featuredDeals);
        renderDeals('today', todayDeals);
        renderDeals('drinks', drinkDeals);
        renderDeals('deals', otherDeals);
        renderDeals('events', events);

        // Update deal count badges on mobile nav
        updateNavBadges();

        // If the visitor arrived via a shared deal link, open that deal
        openDealFromHash();

        document.getElementById('loadError').style.display = 'none';

    } catch (error) {
        console.error('Error loading deals:', error);
        // Replace the endlessly-shimmering skeletons with a retry state
        document.querySelectorAll('.skeleton-card').forEach(el => el.remove());
        document.getElementById('loadError').style.display = 'block';
    }
}

// Shuffle array randomly (Fisher-Yates algorithm)
function shuffleArray(array) {
    const shuffled = [...array]; // Create a copy
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Parse a date string as LOCAL time (new Date('2026-07-15') would be UTC,
// which shifts the day in US timezones). Handles YYYY-MM-DD and M/D/YYYY.
function parseLocalDate(str) {
    if (!str) return null;
    const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (us) {
        const year = +us[3] < 100 ? +us[3] + 2000 : +us[3];
        return new Date(year, +us[1] - 1, +us[2]);
    }
    const fallback = new Date(str);
    return isNaN(fallback) ? null : fallback;
}

// Split CSV text into rows of fields, respecting quoted fields
// (so commas and line breaks inside a cell don't corrupt the row)
function parseCSVRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
                else inQuotes = false;
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

// Parse CSV text into array of deal objects
function parseCSV(csvText) {
    const rows = parseCSVRows(csvText.trim());
    const deals = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day for accurate comparison

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = daysOfWeek[today.getDay()];
    const isWeekend = (today.getDay() === 0 || today.getDay() === 6); // Sunday or Saturday
    const isWeekday = !isWeekend;

    // Skip header row (row 0), start from row 1
    for (let i = 1; i < rows.length; i++) {
        const values = rows[i];

        if (values.length < 3) continue; // Skip invalid rows
        
        // Skip rows with no deal name (empty rows)
        const dealName = values[1]?.trim();
        if (!dealName) continue;
        
        const expiresStr = values[6]?.trim() || '';
        const showOnStr = values[7]?.trim().toLowerCase() || '';
        const eventDateStr = values[8]?.trim() || ''; // Event Date column
        // Featured column: any accepted value = carousel card up top plus
        // a gold-highlighted card in the deal's normal section
        const featuredStr = values[9]?.trim().toLowerCase() || '';
        
        // Check if deal is expired — a deal stays visible THROUGH its
        // expiration date and disappears the day after
        if (expiresStr) {
            const expiresDate = parseLocalDate(expiresStr);
            if (expiresDate && expiresDate < today) continue; // Skip expired deals
        }

        // Check if deal should show today — Show On can be a single value
        // or a comma-separated list ("Friday, Saturday"). Off-day deals are
        // kept (flagged) so shared links to them still open.
        let showsToday = true;
        if (showOnStr) {
            showsToday = showOnStr.split(',')
                .map(t => t.trim())
                .filter(Boolean)
                .some(t =>
                    (t === 'weekend' && isWeekend) ||
                    (t === 'weekday' && isWeekday) ||
                    t === currentDay.toLowerCase());
        }
        
        // Sheet uses "food" as the category name; it renders in the
        // "Food Deals" section (internally still keyed "today")
        let category = (values[5]?.trim() || 'other').toLowerCase();
        if (category === 'food') category = 'today';

        deals.push({
            icon: values[0]?.trim() || '🎁',
            deal: values[1]?.trim() || '',
            business: values[2]?.trim() || '',
            location: values[3]?.trim() || '',
            details: values[4]?.trim() || '',
            category,
            expires: expiresStr,
            showOn: showOnStr,
            eventDate: eventDateStr,
            featured: ['yes', 'true', '1', 'featured', 'partner'].includes(featuredStr),
            id: values[10]?.trim() || '', // stable ID from the sheet's ID column
            showsToday
        });
    }

    return deals;
}

// Render deals to a specific section
function renderDeals(sectionId, deals) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const grid = section.querySelector('.grid');
    if (!grid) return;
    
    // If no deals, hide the entire section
    if (deals.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    // Show section and clear existing deals
    section.style.display = 'block';
    grid.innerHTML = '';
    
    // Add each deal as a card
    deals.forEach(deal => {
        const card = createDealCard(deal);
        grid.appendChild(card);
    });
}

// Create a deal card element (feed style)
function createDealCard(deal) {
    const card = document.createElement('div');
    card.className = 'card';

    // Add featured class if deal is featured
    if (deal.featured) {
        card.classList.add('featured');
    }

    // Store deal data for modal
    card.dataset.dealData = JSON.stringify(deal);

    // Add click handler
    card.addEventListener('click', () => openDealModal(deal));

    // Meta line: location or details; events get their date prefixed
    let metaText = deal.details || deal.location;
    if (deal.category === 'event' && deal.eventDate) {
        const eventDate = parseLocalDate(deal.eventDate);
        if (eventDate) {
            const options = { weekday: 'short', month: 'short', day: 'numeric' };
            const formattedDate = eventDate.toLocaleDateString('en-US', options);
            metaText = `📅 ${formattedDate}` + (metaText ? ` • ${metaText}` : '');
        }
    }

    card.innerHTML = `
        ${deal.featured ? '<div class="featured-badge">★ Featured</div>' : ''}
        <div class="card-main">
            <div class="card-emoji">${deal.icon || '🎁'}</div>
            <div class="card-info">
                ${deal.deal ? `<h3>${deal.deal}</h3>` : ''}
                ${deal.business ? `<p class="card-biz">${deal.business}</p>` : ''}
                ${metaText ? `<small class="card-meta"><span class="meta-dot"></span><span>${metaText}</span></small>` : ''}
            </div>
        </div>
        <div class="card-actions">
            <span class="card-hint">Tap for details</span>
            <div class="card-buttons"></div>
        </div>`;

    const buttons = card.querySelector('.card-buttons');

    // Share button
    const shareBtn = document.createElement('button');
    shareBtn.className = 'card-share-btn';
    shareBtn.setAttribute('aria-label', 'Share deal');
    shareBtn.innerHTML = ICON_SHARE;
    shareBtn.addEventListener('click', e => {
        e.stopPropagation();
        shareDeal(deal, shareBtn);
    });
    buttons.appendChild(shareBtn);

    // Heart (favorite) button
    const heartBtn = document.createElement('button');
    heartBtn.className = 'card-heart-btn';
    heartBtn.innerHTML = ICON_HEART;
    if (isDealFavorited(deal)) {
        heartBtn.classList.add('favorited');
        heartBtn.setAttribute('aria-label', 'Unsave deal');
    } else {
        heartBtn.setAttribute('aria-label', 'Save deal');
    }
    heartBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleFavorite(deal, heartBtn);
    });
    buttons.appendChild(heartBtn);

    return card;
}

// ========== FEATURED PARTNERS CAROUSEL ==========

function createPartnerCard(deal) {
    const el = document.createElement('article');
    el.className = 'partner-card';
    el.innerHTML = `
        <span class="partner-flag">★ Featured</span>
        <div class="partner-emoji">${deal.icon || '🎁'}</div>
        <h3 class="partner-title">${deal.deal}</h3>
        ${deal.details ? `<p class="partner-details">${deal.details}</p>` : ''}
        <div class="partner-foot">
            <div class="partner-biz">
                <span class="partner-biz-text">
                    <strong>${deal.business || ''}</strong>
                    ${deal.location ? `<small><span class="meta-dot"></span>${deal.location}</small>` : ''}
                </span>
            </div>
            <button class="partner-go" aria-label="View deal">${ICON_ARROW}</button>
        </div>`;
    el.addEventListener('click', () => openDealModal(deal));
    return el;
}

function renderPartners(partners) {
    const section = document.getElementById('partners');
    const scroll = document.getElementById('partnersScroll');
    if (!section || !scroll) return;

    if (partners.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    scroll.innerHTML = '';
    partners.forEach(deal => scroll.appendChild(createPartnerCard(deal)));
}

// Load deals when page loads
window.addEventListener('DOMContentLoaded', () => {
    showSkeletons();
    loadDeals();
    initSearch();
    initPriceFilter();
    initMobileNav();
    initSearchOverlay();

    document.getElementById('loadRetryBtn').addEventListener('click', () => {
        document.getElementById('loadError').style.display = 'none';
        showSkeletons();
        loadDeals();
    });
});

function showSkeletons() {
    ['today', 'drinks', 'events', 'deals'].forEach(id => {
        const section = document.getElementById(id);
        if (!section) return;
        const grid = section.querySelector('.grid');
        if (!grid) return;
        for (let i = 0; i < 3; i++) {
            const sk = document.createElement('div');
            sk.className = 'skeleton-card';
            sk.innerHTML = `
                <div class="skeleton-pulse skeleton-icon"></div>
                <div class="skeleton-lines">
                    <div class="skeleton-pulse skeleton-title"></div>
                    <div class="skeleton-pulse skeleton-subtitle"></div>
                </div>
            `;
            grid.appendChild(sk);
        }
    });
}

// ========== SEARCH & PRICE FILTER ==========

let activePriceFilter = 'all';

function initSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    let searchTrackTimeout = null;

    input.addEventListener('input', () => {
        clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
        applyFilters();
        // Track search in GA after user pauses typing (1s debounce)
        clearTimeout(searchTrackTimeout);
        const q = input.value.trim();
        if (q.length >= 2) {
            searchTrackTimeout = setTimeout(() => {
                if (typeof gtag !== 'undefined') gtag('event', 'search', { search_term: q });
            }, 1000);
        }
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        applyFilters();
        input.focus();
    });
}

function initPriceFilter() {
    document.querySelectorAll('.price-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.price-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activePriceFilter = btn.dataset.range;
            applyFilters();
        });
    });
}

// Extract the lowest price from deal name + details.
// Returns a number (dollars), or null if no price found.
function extractPrice(deal) {
    const text = `${deal.deal || ''} ${deal.details || ''}`;

    if (/\bfree\b/i.test(text)) return 0;

    // "$2 off cocktails" is a discount, not a price — ignore those amounts
    const cleaned = text.replace(/\$\d+(?:\.\d{1,2})?\s*off\b/gi, ' ');

    const dollars = [...cleaned.matchAll(/\$(\d+(?:\.\d{1,2})?)/g)].map(m => parseFloat(m[1]));
    const cents   = [...cleaned.matchAll(/(\d+)¢/g)].map(m => parseFloat(m[1]) / 100);
    const all     = [...dollars, ...cents];

    return all.length ? Math.min(...all) : null;
}

function priceInRange(price, range) {
    if (range === 'all')     return true;
    if (range === 'saved')   return true; // handled separately in applyFilters
    if (price === null)      return true; // unknown price → show in every bucket
    if (range === 'under5')  return price < 5;
    if (range === '5to10')   return price >= 5  && price < 10;
    if (range === '10to15')  return price >= 10 && price < 15;
    if (range === '15plus')  return price >= 15;
    return true;
}

function applyFilters() {
    const input       = document.getElementById('searchInput');
    const resultCount = document.getElementById('searchResultCount');
    const query       = input ? input.value.trim().toLowerCase() : '';
    const isFiltering = query || activePriceFilter !== 'all';

    let matchCount = 0;

    const favs = activePriceFilter === 'saved' ? getFavorites() : null;

    document.querySelectorAll('.card').forEach(card => {
        try {
            const deal = JSON.parse(card.dataset.dealData || '{}');

            // Search match
            let searchMatch = true;
            if (query) {
                const searchText = [deal.deal, deal.business, deal.details, deal.location]
                    .filter(Boolean).join(' ').toLowerCase();
                searchMatch = searchText.includes(query);
            }

            // Saved filter
            if (favs !== null && !dealInFavs(favs, deal)) {
                card.classList.add('search-hidden');
                return;
            }

            // Price match
            const priceMatch = priceInRange(extractPrice(deal), activePriceFilter);

            if (searchMatch && priceMatch) {
                card.classList.remove('search-hidden');
                matchCount++;
            } else {
                card.classList.add('search-hidden');
            }
        } catch (e) {
            card.classList.remove('search-hidden');
        }
    });

    // Per-section empty-state messages
    ['today', 'drinks', 'events', 'deals'].forEach(id => {
        const section = document.getElementById(id);
        if (!section) return;
        const grid = section.querySelector('.grid');
        if (!grid) return;

        const visible = section.querySelectorAll('.card:not(.search-hidden)').length;
        let msg = grid.querySelector('.search-no-results');

        if (visible === 0 && isFiltering) {
            if (!msg) {
                msg = document.createElement('p');
                msg.className = 'search-no-results';
                grid.appendChild(msg);
            }
            msg.textContent = activePriceFilter === 'saved'
                ? 'No saved deals yet — tap ❤️ on a deal to save it.'
                : 'No deals match your filters.';
            msg.style.display = 'block';
        } else if (msg) {
            msg.style.display = 'none';
        }
    });

    if (isFiltering) {
        resultCount.textContent = matchCount === 0
            ? 'No deals found'
            : `${matchCount} deal${matchCount !== 1 ? 's' : ''} found`;
        resultCount.style.display = 'block';
    } else {
        resultCount.style.display = 'none';
    }
}

// ========== MOBILE BOTTOM NAV ==========

function initMobileNav() {
    const morePanel = document.getElementById('morePanel');

    function closeMorePanel() {
        morePanel.classList.remove('open');
    }

    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;

            if (target === 'more') {
                const isOpen = morePanel.classList.contains('open');
                closeMorePanel();
                if (!isOpen) {
                    morePanel.classList.add('open');
                    setMobileNavActive('more');
                }
                return;
            }

            closeMorePanel();

            if (target === 'search') {
                openSearchOverlay();
            } else {
                if (target === 'today') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    const section = document.getElementById(target);
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setMobileNavActive(target);
            }
        });
    });

    // More panel — Other Deals
    document.getElementById('morePanelDeals').addEventListener('click', () => {
        closeMorePanel();
        const section = document.getElementById('deals');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setMobileNavActive('more');
    });

    // Close more panel when tapping outside (on the page content)
    document.addEventListener('click', e => {
        if (morePanel.classList.contains('open') &&
            !morePanel.contains(e.target) &&
            !e.target.closest('[data-target="more"]')) {
            closeMorePanel();
        }
    });

    window.addEventListener('scroll', () => {
        closeMorePanel();
        updateMobileNavOnScroll();
    }, { passive: true });
}

function updateNavBadges() {
    const targets = { today: 'today', drinks: 'drinks', events: 'events' };
    Object.entries(targets).forEach(([navTarget, sectionId]) => {
        const section = document.getElementById(sectionId);
        const btn = document.querySelector(`.mobile-nav-item[data-target="${navTarget}"]`);
        if (!section || !btn) return;
        const count = section.querySelectorAll('.card').length;
        let badge = btn.querySelector('.nav-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-badge';
                btn.appendChild(badge);
            }
            badge.textContent = count;
        } else if (badge) {
            badge.remove();
        }
    });
}

function setMobileNavActive(target) {
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === target);
    });
}

function updateMobileNavOnScroll() {
    const anchors = ['today', 'drinks', 'events', 'deals'];
    const threshold = window.scrollY + window.innerHeight / 3;
    let current = 'today';
    for (const id of anchors) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= threshold) current = id;
    }
    const targetMap = { today: 'today', drinks: 'drinks', events: 'events', deals: 'events' };
    setMobileNavActive(targetMap[current] || 'today');
}

// ========== SEARCH OVERLAY ==========

let overlayPriceFilter = 'all';

function openSearchOverlay() {
    const overlay = document.getElementById('searchOverlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('searchOverlayInput').focus(), 100);
    renderOverlayResults('', 'all');
}

function closeSearchOverlay() {
    const overlay = document.getElementById('searchOverlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('searchOverlayInput').value = '';
    overlayPriceFilter = 'all';
    document.querySelectorAll('.overlay-price-btn').forEach(b => b.classList.toggle('active', b.dataset.range === 'all'));
}

function renderOverlayResults(query, priceRange) {
    const container = document.getElementById('searchOverlayResults');
    const q = query.trim().toLowerCase();

    const favs = priceRange === 'saved' ? getFavorites() : null;

    const matches = allDeals.filter(deal => {
        if (favs !== null && !dealInFavs(favs, deal)) return false;
        // Events only show when the user has typed a search query
        if (deal.category === 'event' && !q) return false;
        const text = [deal.deal, deal.business, deal.details, deal.location]
            .filter(Boolean).join(' ').toLowerCase();
        const searchMatch = !q || text.includes(q);
        const priceMatch = priceInRange(extractPrice(deal), priceRange);
        return searchMatch && priceMatch;
    });

    // Sort: deals with an explicit price first, unknown price last
    if (priceRange !== 'all') {
        matches.sort((a, b) => {
            const pa = extractPrice(a), pb = extractPrice(b);
            if (pa !== null && pb === null) return -1;
            if (pa === null && pb !== null) return 1;
            return 0;
        });
    }

    if (matches.length === 0) {
        container.innerHTML = '<p class="search-overlay-empty">No deals found</p>';
        return;
    }

    container.innerHTML = '';
    matches.forEach(deal => {
        const btn = document.createElement('button');
        btn.className = 'search-result-item';
        btn.innerHTML = `
            <span class="search-result-icon">${deal.icon || '🎁'}</span>
            <div class="search-result-info">
                <strong>${deal.deal}</strong>
                <span>${deal.business}</span>
            </div>`;
        btn.addEventListener('click', () => {
            closeSearchOverlay();
            openDealModal(deal);
        });
        container.appendChild(btn);
    });
}

function initSearchOverlay() {
    const input = document.getElementById('searchOverlayInput');
    document.getElementById('searchOverlayCancel').addEventListener('click', closeSearchOverlay);
    let overlayTrackTimeout = null;

    input.addEventListener('input', () => {
        renderOverlayResults(input.value, overlayPriceFilter);
        // Track search in GA after user pauses typing (1s debounce)
        clearTimeout(overlayTrackTimeout);
        const q = input.value.trim();
        if (q.length >= 2) {
            overlayTrackTimeout = setTimeout(() => {
                if (typeof gtag !== 'undefined') gtag('event', 'search', { search_term: q });
            }, 1000);
        }
    });

    document.querySelectorAll('.overlay-price-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.overlay-price-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            overlayPriceFilter = btn.dataset.range;
            renderOverlayResults(input.value, overlayPriceFilter);
        });
    });

    // If the window grows to desktop size while the overlay is open,
    // close it so body scrolling isn't left locked
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 900 && document.getElementById('searchOverlay').classList.contains('open')) {
            closeSearchOverlay();
        }
    });
}

// ========== PWA: SERVICE WORKER + INSTALL PROMPT ==========

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .catch(err => console.warn('SW registration failed:', err));
}

let deferredInstallPrompt = null;
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

// Capture Android install prompt
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
});

// Hide banner after install
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideBanner();
});

function hideBanner() {
    const b = document.getElementById('installBanner');
    if (b) b.style.display = 'none';
}

function showBanner() {
    const b = document.getElementById('installBanner');
    if (b) b.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
    // Don't show if already installed or user dismissed permanently
    if (isStandalone || localStorage.getItem('pwaInstallDismissed')) return;

    // Show the banner for everyone (iOS + Android)
    showBanner();

    // Install button click
    document.getElementById('installBtn')?.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
            // Android: trigger native prompt
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            hideBanner();
        } else if (isIOS) {
            // iOS: show step-by-step tooltip
            document.getElementById('iosTooltip').style.display = 'block';
        } else {
            // Desktop / other: open browser menu hint
            alert('To install: open your browser menu and choose "Install app" or "Add to Home Screen".');
        }
    });

    // Dismiss banner
    document.getElementById('installDismiss')?.addEventListener('click', () => {
        hideBanner();
        localStorage.setItem('pwaInstallDismissed', '1');
    });

    // Close iOS tooltip
    document.getElementById('iosTooltipClose')?.addEventListener('click', () => {
        document.getElementById('iosTooltip').style.display = 'none';
    });
});

// Offline / online detection
window.addEventListener('offline', () => {
    const b = document.getElementById('offlineBanner');
    if (b) b.style.display = 'block';
});

window.addEventListener('online', () => {
    const b = document.getElementById('offlineBanner');
    if (b) b.style.display = 'none';
    loadDeals();
});

// ========== SCROLL TO TOP ==========
const scrollTopBtn = document.getElementById('scrollTopBtn');

window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 300);
}, { passive: true });

scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ========== CONSOLE WELCOME MESSAGE ==========
console.log('%c🎉 Welcome to MHKfinds! 🎉', 'font-size: 20px; color: #512888; font-weight: bold;');
console.log('%cManhattan\'s #1 Student Deal Hub', 'font-size: 14px; color: #FFD700;');
console.log('%cFollow @mhkfinds on Instagram for daily deals!', 'font-size: 12px; color: #666;');

// ========== FAVORITES ==========

function getDealId(deal) {
    return deal.id || `${deal.deal}|${deal.business}`;
}

// Favorites saved before the sheet had an ID column were keyed by
// "deal|business" — keep recognizing those so nobody loses their hearts
function getLegacyDealId(deal) {
    return `${deal.deal}|${deal.business}`;
}

function dealInFavs(favs, deal) {
    return favs.has(getDealId(deal)) || favs.has(getLegacyDealId(deal));
}

function getFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem('mhkfinds-favorites') || '[]')); }
    catch { return new Set(); }
}

function saveFavorites(set) {
    localStorage.setItem('mhkfinds-favorites', JSON.stringify([...set]));
}

function isDealFavorited(deal) {
    return dealInFavs(getFavorites(), deal);
}

function toggleFavorite(deal, btn) {
    const favs = getFavorites();
    const id = getDealId(deal);
    if (dealInFavs(favs, deal)) {
        favs.delete(id);
        favs.delete(getLegacyDealId(deal));
        btn.classList.remove('favorited');
        btn.setAttribute('aria-label', 'Save deal');
    } else {
        favs.add(id);
        btn.classList.add('favorited');
        btn.setAttribute('aria-label', 'Unsave deal');
        // Pop animation on save
        btn.classList.add('pop');
        setTimeout(() => btn.classList.remove('pop'), 400);
        trackDeal('save_deal', deal);
    }
    saveFavorites(favs);

    // Re-apply filters in case 'saved' filter is active
    if (activePriceFilter === 'saved') applyFilters();
}

// ========== PER-DEAL ANALYTICS ==========

// Sends save/share/view/directions events to GA per deal — this is the
// data used to show businesses how their deals perform
function trackDeal(action, deal) {
    if (typeof gtag !== 'undefined') {
        gtag('event', action, {
            deal_id: getDealId(deal),
            deal_name: deal.deal,
            business: deal.business
        });
    }
}

// ========== SHARE FUNCTIONALITY ==========

// Direct link to one deal — opening it lands with the deal's popup open
function getDealUrl(deal) {
    return `https://mhkfinds.com/#deal=${encodeURIComponent(getDealId(deal))}`;
}

function openDealFromHash() {
    const match = location.hash.match(/^#deal=(.+)$/);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    const deal = allDealsAnyDay.find(d => getDealId(d) === id);
    if (deal) openDealModal(deal);
}

// Also react if a deal link is opened while the app is already running
window.addEventListener('hashchange', openDealFromHash);

async function shareDeal(deal, buttonEl) {
    trackDeal('share_deal', deal);
    const text = `${deal.deal} at ${deal.business}`;
    const url = getDealUrl(deal);

    if (navigator.share) {
        try {
            await navigator.share({ title: 'MHKfinds Deal', text, url });
        } catch (e) {
            // User cancelled — do nothing
        }
    } else {
        // Desktop fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(`${text} — ${url}`);
            const orig = buttonEl.innerHTML;
            // Small round card buttons only fit a checkmark
            buttonEl.innerHTML = buttonEl.classList.contains('card-share-btn') ? '✓' : '✓ Copied!';
            setTimeout(() => { buttonEl.innerHTML = orig; }, 1500);
        } catch (e) {
            // ignore
        }
    }
}

// ========== MODAL FUNCTIONALITY ==========

function getDirectionsUrl(location, business) {
    const base = location || business || 'Manhattan, KS';
    const full = base.toLowerCase().includes('manhattan') ? base : `${base}, Manhattan, KS`;
    const encoded = encodeURIComponent(full);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return isIOS
        ? `https://maps.apple.com/?address=${encoded}`
        : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function openDealModal(deal) {
    const modal = document.getElementById('dealModal');
    trackDeal('view_deal', deal);

    // Populate modal with deal data
    document.getElementById('modalIcon').textContent = deal.icon || '🎁';
    document.getElementById('modalDealName').textContent = deal.deal || 'Deal';
    document.getElementById('modalBusiness').textContent = deal.business || 'Business';
    document.getElementById('modalLocation').textContent = deal.location || 'N/A';

    // Show/hide details
    const detailsRow = document.getElementById('modalDetailsRow');
    if (deal.details) {
        document.getElementById('modalDetails').textContent = deal.details;
        detailsRow.style.display = 'block';
    } else {
        detailsRow.style.display = 'none';
    }

    // Directions button
    const directionsBtn = document.getElementById('modalDirectionsBtn');
    if (deal.location || deal.business) {
        directionsBtn.onclick = (e) => {
            e.stopPropagation();
            trackDeal('get_directions', deal);
            window.open(getDirectionsUrl(deal.location, deal.business), '_blank');
        };
        directionsBtn.style.display = 'flex';
    } else {
        directionsBtn.style.display = 'none';
    }

    // Share button
    const shareBtn = document.getElementById('modalShareBtn');
    if (shareBtn) {
        shareBtn.onclick = (e) => {
            e.stopPropagation();
            shareDeal(deal, shareBtn);
        };
    }

    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDealModal() {
    const modal = document.getElementById('dealModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling

    // Drop a #deal= hash so the same shared link works again later
    if (location.hash.startsWith('#deal=')) {
        history.replaceState(null, '', location.pathname + location.search);
    }
}

// Close modal when clicking X
document.querySelector('.modal-close').addEventListener('click', closeDealModal);

// Close modal when clicking outside
document.getElementById('dealModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeDealModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeDealModal();
    }
});
