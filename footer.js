// ========================================
// SITE-WIDE FOOTER
// ========================================
// Injected via JS so the same footer doesn't need to be hand-copied
// into every page. Include footer.css + footer.js on any page that
// should show it.

(function () {
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
        <div class="footer-links">
            <a href="support.html">Support</a>
            <a href="terms.html">Terms &amp; Conditions</a>
            <a href="privacy.html">Privacy Policy</a>
        </div>
        <div class="footer-socials">
            <a href="#" aria-label="Twitter"><i class="fab fa-twitter"></i></a>
            <a href="#" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
            <a href="#" aria-label="Telegram"><i class="fab fa-telegram"></i></a>
            <a href="#" aria-label="Facebook"><i class="fab fa-facebook"></i></a>
        </div>
        <div class="footer-copyright">&copy; ${new Date().getFullYear()} ULTRON. All rights reserved.</div>
    `;
    document.body.appendChild(footer);
})();
