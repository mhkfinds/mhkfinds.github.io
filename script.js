/* ================================================
   MHKFINDS - JAVASCRIPT
   Manhattan's #1 Student Deal Hub
   ================================================ */

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

// ========== SCROLL TO TOP BUTTON (Optional) ==========
// Uncomment this section if you want a "Back to Top" button

/*
// Create scroll to top button
const scrollButton = document.createElement('button');
scrollButton.innerHTML = '↑';
scrollButton.className = 'scroll-to-top';
scrollButton.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, #512888, #FFD700);
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    display: none;
    z-index: 1000;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    transition: all 0.3s;
`;

document.body.appendChild(scrollButton);

// Show button when scrolled down
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollButton.style.display = 'block';
    } else {
        scrollButton.style.display = 'none';
    }
});

// Scroll to top when clicked
scrollButton.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

scrollButton.addEventListener('mouseenter', () => {
    scrollButton.style.transform = 'scale(1.1)';
});

scrollButton.addEventListener('mouseleave', () => {
    scrollButton.style.transform = 'scale(1)';
});
*/

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

// ========== CARD CLICK ACTIONS (Optional) ==========
// Add click functionality to deal cards
// Uncomment if you want cards to do something when clicked

/*
document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', function() {
        const dealName = this.querySelector('h3').textContent;
        const businessName = this.querySelector('p').textContent;
        
        alert(`🎉 ${dealName} at ${businessName}\n\nShow this to redeem your deal!`);
        
        // Or you could redirect to a detail page:
        // window.location.href = '/deal-details.html?deal=' + encodeURIComponent(dealName);
    });
});
*/

// ========== CONSOLE WELCOME MESSAGE ==========
console.log('%c🎉 Welcome to MHKfinds! 🎉', 'font-size: 20px; color: #512888; font-weight: bold;');
console.log('%cManhattan\'s #1 Student Deal Hub', 'font-size: 14px; color: #FFD700;');
console.log('%cFollow @mhkfinds on Instagram for daily deals!', 'font-size: 12px; color: #666;');

// ========== PAGE LOAD ANIMATION (Optional) ==========
// Fade in content when page loads

/*
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});
*/