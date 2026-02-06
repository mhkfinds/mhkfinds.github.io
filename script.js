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
        const todayDeals = deals.filter(deal => deal.category === 'today');
        const otherDeals = deals.filter(deal => deal.category === 'other');
        const events = deals.filter(deal => deal.category === 'event');
        
        // Render deals to the page
        renderDeals('today', todayDeals);
        renderDeals('deals', otherDeals);
        renderDeals('events', events);
        
    } catch (error) {
        console.error('Error loading deals:', error);
        // If loading fails, keep the default deals in HTML
    }
}

// Parse CSV text into array of deal objects
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const deals = [];
    
    // Skip header row (line 0), start from line 1
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        // Simple CSV split by comma
        const values = line.split(',');
        
        if (values.length < 3) continue; // Skip invalid rows
        
        deals.push({
            icon: values[0]?.trim() || '🎁',
            deal: values[1]?.trim() || '',
            business: values[2]?.trim() || '',
            location: values[3]?.trim() || '',
            details: values[4]?.trim() || '',
            category: (values[5]?.trim() || 'other').toLowerCase()
        });
    }
    
    console.log('Loaded deals:', deals); // Debug log
    return deals;
}

// Render deals to a specific section
function renderDeals(sectionId, deals) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const grid = section.querySelector('.grid');
    if (!grid) return;
    
    // Clear existing deals (except if no deals loaded, keep defaults)
    if (deals.length > 0) {
        grid.innerHTML = '';
    }
    
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
    
    // Build the card HTML
    let html = '';
    
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
    const smallText = deal.details || deal.location;
    if (smallText) {
        const prefix = deal.location && !deal.details ? '📍 ' : '';
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
