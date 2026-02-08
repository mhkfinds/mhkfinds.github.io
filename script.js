/* ================================================
   MHKFINDS - JAVASCRIPT
   Manhattan's #1 Student Deal Hub
   ================================================ */

// ========== GOOGLE SHEETS CONFIGURATION ==========
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
        const drinkDeals = deals.filter(deal => deal.category === 'drinks');
        const otherDeals = deals.filter(deal => deal.category === 'other');
        let events = deals.filter(deal => deal.category === 'event');
        
        // Sort Today's Deals: Featured first, then randomize the rest
        const featuredToday = todayDeals.filter(deal => deal.featured);
        const regularToday = todayDeals.filter(deal => !deal.featured);
        todayDeals = [...featuredToday, ...shuffleArray(regularToday)];
        
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
            
            // Both have dates - sort chronologically
            const dateA = new Date(a.eventDate);
            const dateB = new Date(b.eventDate);
            return dateA - dateB;
        });
        
        // Render deals to the page
        renderDeals('today', todayDeals);
        renderDeals('drinks', drinkDeals);
        renderDeals('deals', otherDeals);
        renderDeals('events', events);
        
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
    if (deal.category === 'event' && deal.eventDate) {
        const eventDate = new Date(deal.eventDate);
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
window.addEventListener('DOMContentLoaded', loadDeals);

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
