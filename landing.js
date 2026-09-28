// ========================================
// LANDING PAGE - JAVASCRIPT
// ========================================

document.addEventListener('DOMContentLoaded', function () {
    const cards = document.querySelectorAll('.invest-card');

    cards.forEach(card => {
        card.addEventListener('click', function () {
            const targetId = this.dataset.target;
            const panel = document.getElementById(targetId);
            const isOpen = panel.classList.contains('open');

            // Close any other open panel first
            document.querySelectorAll('.invest-detail.open').forEach(p => p.classList.remove('open'));

            if (!isOpen) {
                panel.classList.add('open');
                panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });
});

console.log('🚀 Task Earn Landing ready!');
