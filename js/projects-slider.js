// Projects slider functionality
document.addEventListener('DOMContentLoaded', function() {
    const projectsContainer = document.querySelector('.projects-container');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const projectWidth = 380; // Width of one project card + margin
    let currentIndex = 0;
    const totalProjects = document.querySelectorAll('.project-link').length;
    let maxIndex = Math.max(0, totalProjects - Math.floor(projectsContainer.parentElement.offsetWidth / projectWidth));

    function updateSlider() {
        const translateX = -currentIndex * projectWidth;
        projectsContainer.style.transform = `translateX(${translateX}px)`;
        
        // Update button states
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex >= maxIndex;
    }

    function calculateMaxIndex() {
        const containerWidth = projectsContainer.parentElement.offsetWidth;
        const visibleProjects = Math.floor(containerWidth / projectWidth);
        maxIndex = Math.max(0, totalProjects - visibleProjects);
    }

    // Arrow navigation
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateSlider();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentIndex < maxIndex) {
            currentIndex++;
            updateSlider();
        }
    });

    // Touch/swipe support
    let startX = 0;
    let isDragging = false;

    projectsContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    });

    projectsContainer.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
    });

    projectsContainer.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        
        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;
        
        // Swipe threshold
        if (Math.abs(diffX) > 50) {
            if (diffX > 0 && currentIndex < maxIndex) {
                // Swipe left - next
                currentIndex++;
                updateSlider();
            } else if (diffX < 0 && currentIndex > 0) {
                // Swipe right - previous
                currentIndex--;
                updateSlider();
            }
        }
        
        isDragging = false;
    });

    // Mouse drag support for desktop
    let mouseStartX = 0;
    let isMouseDragging = false;

    projectsContainer.addEventListener('mousedown', (e) => {
        mouseStartX = e.clientX;
        isMouseDragging = true;
        projectsContainer.style.cursor = 'grabbing';
    });

    projectsContainer.addEventListener('mousemove', (e) => {
        if (!isMouseDragging) return;
        e.preventDefault();
    });

    projectsContainer.addEventListener('mouseup', (e) => {
        if (!isMouseDragging) return;
        
        const endX = e.clientX;
        const diffX = mouseStartX - endX;
        
        // Drag threshold
        if (Math.abs(diffX) > 50) {
            if (diffX > 0 && currentIndex < maxIndex) {
                // Drag left - next
                currentIndex++;
                updateSlider();
            } else if (diffX < 0 && currentIndex > 0) {
                // Drag right - previous
                currentIndex--;
                updateSlider();
            }
        }
        
        isMouseDragging = false;
        projectsContainer.style.cursor = 'grab';
    });

    projectsContainer.addEventListener('mouseleave', () => {
        isMouseDragging = false;
        projectsContainer.style.cursor = 'grab';
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            currentIndex--;
            updateSlider();
        } else if (e.key === 'ArrowRight' && currentIndex < maxIndex) {
            currentIndex++;
            updateSlider();
        }
    });

    // Initialize
    calculateMaxIndex();
    updateSlider();
    projectsContainer.style.cursor = 'grab';

    // Update on resize
    window.addEventListener('resize', () => {
        calculateMaxIndex();
        if (currentIndex > maxIndex) currentIndex = maxIndex;
        updateSlider();
    });
});
