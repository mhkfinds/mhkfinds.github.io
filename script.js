/* ================================================
   MHKFINDS - JAVASCRIPT
   Manhattan's #1 Student Deal Hub
   ================================================ */

// ========== GOOGLE SHEETS CONFIGURATION ==========
let allDeals = []; // global store for overlay search

// Replace this URL with YOUR published Google Sheets CSV URL
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT3QxDHqv4FuFfW2ygOAAPGco5WW-OJzAKYbdIQQ8lHguKr4e8yLnf7rNqHafiljTuW8h6-9-AWOCht/pub?gid=0&single=true&output=csv';

// ========== LOAD DEALS FROM GOOGLE SHEETS ==========
async function loadDeals() {
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const csvText = await response.text();
        const deals = parseCSV(csvText);
        
        // Separate deals by category
        let todayDeals = deals.filter(deal => deal.category === 'today');
        let drinkDeals = deals.filter(deal => deal.category === 'drinks');
        const otherDeals = deals.filter(deal => deal.category === 'other');
        let events = deals.filter(deal => deal.category === 'event');
        
        // Sort Today's Deals: Featured first, then randomize the rest
        const featuredToday = todayDeals.filter(deal => deal.featured);
        const regularToday = todayDeals.filter(deal => !deal.featured);
        todayDeals = [...featuredToday, ...shuffleArray(regularToday)];
        
        // Sort Drink Deals: Featured first, then randomize the rest
        const featuredDrinks = drinkDeals.filter(deal => deal.featured);
        const regularDrinks = drinkDeals.filter(deal => !deal.featured);
        drinkDeals = [...featuredDrinks, ...shuffleArray(regularDrinks)];
        
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
            
            // Both have dates - sort chronologically (FIXED: parse in local timezone)
            const [yearA, monthA, dayA] = a.eventDate.split('-').map(Number);
            const [yearB, monthB, dayB] = b.eventDate.split('-').map(Number);
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateA - dateB;
        });
        
        // Store all deals for overlay search
        allDeals = deals;

        // Render deals to the page
        renderDeals('today', todayDeals);
        renderDeals('drinks', drinkDeals);
        renderDeals('deals', otherDeals);
        renderDeals('events', events);
        
        // Render weekly calendar
        renderWeeklyCalendar(deals);
        
    } catch (error) {
        console.error('Error loading deals:', error);
        // If loading fails, keep the default deals in HTML
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

// Parse CSV text into array of deal objects
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const deals = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day for accurate comparison
    
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = daysOfWeek[today.getDay()];
    const isWeekend = (today.getDay() === 0 || today.getDay() === 6); // Sunday or Saturday
    const isWeekday = !isWeekend;
    
    // Skip header row (line 0), start from line 1
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        // Simple CSV split by comma
        const values = line.split(',');
        
        if (values.length < 3) continue; // Skip invalid rows
        
        // Skip rows with no deal name (empty rows)
        const dealName = values[1]?.trim();
        if (!dealName) {
            console.log(`Skipping row ${i}: No deal name`);
            continue;
        }
        
        const expiresStr = values[6]?.trim() || '';
        const showOnStr = values[7]?.trim().toLowerCase() || '';
        const eventDateStr = values[8]?.trim() || ''; // Event Date column
        const featuredStr = values[9]?.trim().toLowerCase() || ''; // Featured column
        
        // Check if deal is expired
        if (expiresStr) {
            const expiresDate = new Date(expiresStr);
            if (expiresDate < today) {
                console.log(`Deal expired: ${values[1]} (expired ${expiresStr})`);
                continue; // Skip expired deals
            }
        }
        
        // Check if deal should show today
        if (showOnStr) {
            let shouldShow = false;
            
            console.log(`Checking deal: "${values[1]}" | Show On: "${showOnStr}" | Current Day: "${currentDay.toLowerCase()}"`);
            
            if (showOnStr === 'weekend' && isWeekend) {
                shouldShow = true;
                console.log(`  ✓ Weekend deal and today is weekend`);
            } else if (showOnStr === 'weekday' && isWeekday) {
                shouldShow = true;
                console.log(`  ✓ Weekday deal and today is weekday`);
            } else if (showOnStr === currentDay.toLowerCase()) {
                shouldShow = true;
                console.log(`  ✓ Day matches!`);
            }
            
            if (!shouldShow) {
                console.log(`  ✗ Skipping: Deal shows on "${showOnStr}", but today is "${currentDay}"`);
                continue; // Skip deals not for today
            }
        }
        
        deals.push({
            icon: values[0]?.trim() || '🎁',
            deal: values[1]?.trim() || '',
            business: values[2]?.trim() || '',
            location: values[3]?.trim() || '',
            details: values[4]?.trim() || '',
            category: (values[5]?.trim() || 'other').toLowerCase(),
            expires: expiresStr,
            showOn: showOnStr,
            eventDate: eventDateStr,
            featured: featuredStr === 'yes' || featuredStr === 'true' || featuredStr === '1'
        });
    }
    
    console.log(`Today is ${currentDay}. Loaded ${deals.length} active deals.`);
    console.log('Active deals:', deals);
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

// Create a deal card element
function createDealCard(deal) {
    const card = document.createElement('div');
    card.className = 'card';
    
    // Add featured class if deal is featured
    if (deal.featured) {
        card.classList.add('featured');
    }
    
    card.style.cursor = 'pointer'; // Show it's clickable
    
    // Store deal data for modal
    card.dataset.dealData = JSON.stringify(deal);
    
    // Add click handler
    card.addEventListener('click', () => openDealModal(deal));
    
    // Build the card HTML
    let html = '';
    
    // Add featured badge if deal is featured
    if (deal.featured) {
        html += `<div class="featured-badge">⭐ Featured</div>`;
    }
    
    // Add icon if exists
    if (deal.icon) {
        html += `<div class="card-icon">${deal.icon}</div>`;
    }
    
    // Add deal name
    if (deal.deal) {
        html += `<h3>${deal.deal}</h3>`;
    }
    
    // Add business name
    if (deal.business) {
        html += `<p>${deal.business}</p>`;
    }
    
    // Add location or details
    let smallText = deal.details || deal.location;
    
    // For events, add date if available
    // FIXED: Parse date in local timezone to avoid timezone offset issues
    if (deal.category === 'event' && deal.eventDate) {
        // Parse date components and create date in local timezone (not UTC)
        const [year, month, day] = deal.eventDate.split('-').map(Number);
        const eventDate = new Date(year, month - 1, day); // month is 0-indexed in JavaScript
        
        const options = { weekday: 'short', month: 'short', day: 'numeric' };
        const formattedDate = eventDate.toLocaleDateString('en-US', options);
        smallText = `📅 ${formattedDate}` + (smallText ? ` • ${smallText}` : '');
    }
    
    if (smallText) {
        const prefix = deal.location && !deal.details && deal.category !== 'event' ? '📍 ' : '';
        html += `<small>${prefix}${smallText}</small>`;
    }
    
    card.innerHTML = html;
    return card;
}

// Load deals when page loads
window.addEventListener('DOMContentLoaded', () => {
    loadDeals();
    initSearch();
    initPriceFilter();
    initMobileNav();
    initSearchOverlay();
});

// ========== SEARCH & PRICE FILTER ==========

let activePriceFilter = 'all';

function initSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');

    input.addEventListener('input', () => {
        clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
        applyFilters();
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

    const dollars = [...text.matchAll(/\$(\d+(?:\.\d{1,2})?)/g)].map(m => parseFloat(m[1]));
    const cents   = [...text.matchAll(/(\d+)¢/g)].map(m => parseFloat(m[1]) / 100);
    const all     = [...dollars, ...cents];

    return all.length ? Math.min(...all) : null;
}

function priceInRange(price, range) {
    if (range === 'all')   return true;
    if (price === null)    return true; // unknown price → show in every bucket
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
            msg.textContent = 'No deals match your filters.';
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
                const section = document.getElementById(target);
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    const matches = allDeals.filter(deal => {
        const text = [deal.deal, deal.business, deal.details, deal.location]
            .filter(Boolean).join(' ').toLowerCase();
        const searchMatch = !q || text.includes(q);
        const priceMatch = priceInRange(extractPrice(deal), priceRange);
        return searchMatch && priceMatch;
    });

    if (!q && priceRange === 'all') {
        container.innerHTML = '<p class="search-overlay-hint">Start typing to find deals...</p>';
        return;
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

    input.addEventListener('input', () => {
        renderOverlayResults(input.value, overlayPriceFilter);
    });

    document.querySelectorAll('.overlay-price-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.overlay-price-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            overlayPriceFilter = btn.dataset.range;
            renderOverlayResults(input.value, overlayPriceFilter);
        });
    });
}

// ========== SMOOTH SCROLLING ==========
// Makes navigation links scroll smoothly to sections
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ========== ACTIVE NAV LINK HIGHLIGHTING ==========
// Highlights the current section in the navigation

const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

window.addEventListener('scroll', () => {
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        
        if (window.pageYOffset >= (sectionTop - 200)) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.style.background = 'rgba(255, 255, 255, 0.15)';
        link.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        
        if (link.getAttribute('href') === `#${current}`) {
            link.style.background = 'rgba(255, 255, 255, 0.25)';
            link.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        }
    });
});

// ========== CONSOLE WELCOME MESSAGE ==========
console.log('%c🎉 Welcome to MHKfinds! 🎉', 'font-size: 20px; color: #512888; font-weight: bold;');
console.log('%cManhattan\'s #1 Student Deal Hub', 'font-size: 14px; color: #FFD700;');
console.log('%cFollow @mhkfinds on Instagram for daily deals!', 'font-size: 12px; color: #666;');

// ========== MODAL FUNCTIONALITY ==========

function openDealModal(deal) {
    const modal = document.getElementById('dealModal');
    
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
    
    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeDealModal() {
    const modal = document.getElementById('dealModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling
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


// ========== WEEKLY CALENDAR FUNCTIONALITY ==========

function renderWeeklyCalendar(deals) {
    const calendarGrid = document.querySelector('.calendar-grid');
    if (!calendarGrid) return;
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayEmojis = {
        'Monday': '📅',
        'Tuesday': '🌮',
        'Wednesday': '🍷',
        'Thursday': '🍺',
        'Friday': '🍕',
        'Saturday': '🎉',
        'Sunday': '☀️'
    };
    
    calendarGrid.innerHTML = '';
    
    days.forEach(day => {
        const dayLower = day.toLowerCase();
        
        // Count deals for this day
        const dayDeals = deals.filter(deal => {
            if (!deal.showOn) return true; // Every day deals count for all days
            if (deal.showOn === dayLower) return true;
            if (deal.showOn === 'weekday' && ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(dayLower)) return true;
            if (deal.showOn === 'weekend' && ['saturday', 'sunday'].includes(dayLower)) return true;
            return false;
        });
        
        const dealCount = dayDeals.length;
        
        // Get top 3 deals for preview
        const topDeals = dayDeals.slice(0, 3);
        
        // Create card
        const card = document.createElement('div');
        card.className = 'calendar-day-card';
        
        // Highlight today
        const today = new Date();
        const todayDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];
        if (day === todayDay) {
            card.classList.add('today');
        }
        
        let html = `
            <div class="calendar-day-header">
                <span class="calendar-day-emoji">${dayEmojis[day]}</span>
                <h3>${day}</h3>
                <span class="calendar-day-count">${dealCount} deal${dealCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="calendar-day-preview">
        `;
        
        if (topDeals.length > 0) {
            topDeals.forEach(deal => {
                html += `<div class="calendar-deal-preview">${deal.icon} ${deal.deal}</div>`;
            });
            
            if (dayDeals.length > 3) {
                html += `<div class="calendar-more">+${dayDeals.length - 3} more</div>`;
            }
        } else {
            html += `<div class="calendar-no-deals">No exclusive deals</div>`;
        }
        
        html += `</div>`;
        
        card.innerHTML = html;
        calendarGrid.appendChild(card);
    });
}
