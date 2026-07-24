/**
 * Quips Marketing Website
 * Main JavaScript - Theme toggle, smooth scroll, animations
 */

(function() {
    'use strict';

    // ===== Theme Management =====
    const THEME_KEY = 'quips-theme';
    const DARK_CLASS = 'dark-theme';
    const LIGHT_CLASS = 'light-theme';

    // Get system preference
    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // Get stored theme or null if not set (localStorage can throw when
    // storage is blocked, e.g. some private-browsing modes)
    function getStoredTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch (e) {
            return null;
        }
    }

    // Apply theme to document
    function applyTheme(theme) {
        const body = document.body;
        if (theme === 'dark') {
            body.classList.remove(LIGHT_CLASS);
            body.classList.add(DARK_CLASS);
        } else {
            body.classList.remove(DARK_CLASS);
            body.classList.add(LIGHT_CLASS);
        }
    }

    // Get current active theme
    function getCurrentTheme() {
        return document.body.classList.contains(DARK_CLASS) ? 'dark' : 'light';
    }

    // Initialize theme on page load
    function initTheme() {
        const storedTheme = getStoredTheme();
        // Use stored preference if exists, otherwise use system preference
        const theme = storedTheme || getSystemTheme();
        applyTheme(theme);
    }

    // Apply a specific theme and remember the preference
    function setTheme(theme) {
        applyTheme(theme);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) { /* storage blocked — theme still applies this page */ }
    }

    // Toggle theme and save preference
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    }

    // Listen for system theme changes (only applies if user hasn't set manual preference)
    function watchSystemTheme() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // Only auto-switch if user hasn't set a manual preference
            if (!getStoredTheme()) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    // ===== Smooth Scroll =====
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#') return; // Skip placeholder links

                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const headerOffset = 80;
                    const elementPosition = target.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    // ===== Scroll Animations =====
    function initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Observe feature cards
        document.querySelectorAll('.feature-card').forEach((card, index) => {
            card.style.opacity = '0';
            card.style.animationDelay = `${index * 0.1}s`;
            observer.observe(card);
        });

        // Observe screenshot wrappers
        document.querySelectorAll('.screenshot-wrapper').forEach((wrapper, index) => {
            wrapper.style.opacity = '0';
            wrapper.style.animationDelay = `${index * 0.15}s`;
            observer.observe(wrapper);
        });
    }

    // ===== Screenshot Gallery (manifest-driven) =====
    // Builds the "See it in action" gallery from images/screenshots.json so
    // adding/removing a screen is a data change, not an HTML edit. Each entry
    // renders a light + dark image pair (toggled by the active theme via CSS).
    async function initScreenshotGallery() {
        const container = document.getElementById('screenshots-gallery');
        if (!container) return;

        const manifestUrl = container.dataset.manifest || 'images/screenshots.json';

        let manifest;
        try {
            const response = await fetch(manifestUrl);
            manifest = await response.json();
        } catch (error) {
            console.error('Error loading screenshots manifest:', error);
            return; // Leave the <noscript> fallback in place.
        }

        const screens = (manifest && manifest.gallery) || [];
        if (!screens.length) return;

        // Clear the no-JS fallback now that we can render the real gallery.
        container.innerHTML = '';

        // Reveal-on-scroll for the wrappers we create (mirrors initScrollAnimations).
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        screens.forEach((screen, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'screenshot-wrapper';
            wrapper.style.opacity = '0';
            wrapper.style.animationDelay = `${index * 0.15}s`;

            const lightImg = makeGalleryImage(screen, 'light');
            const darkImg = makeGalleryImage(screen, 'dark');

            // If a screenshot hasn't been generated yet, hide the whole slot so
            // the live site never shows a broken-image icon.
            const onError = () => wrapper.remove();
            lightImg.addEventListener('error', onError);
            darkImg.addEventListener('error', onError);

            const label = document.createElement('span');
            label.className = 'screenshot-label';
            label.textContent = screen.label || '';

            wrapper.append(lightImg, darkImg, label);
            container.appendChild(wrapper);
            observer.observe(wrapper);
        });
    }

    function makeGalleryImage(screen, mode) {
        const img = document.createElement('img');
        img.src = `images/${screen[mode]}`;
        img.alt = screen.alt || screen.label || 'Quips screenshot';
        img.loading = 'lazy';
        img.className = `gallery-screenshot screenshot-${mode}`;
        return img;
    }

    // ===== Header Scroll Effect =====
    function initHeaderScroll() {
        const header = document.querySelector('.header');
        let lastScroll = 0;

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 50) {
                header.style.boxShadow = 'var(--shadow-md)';
            } else {
                header.style.boxShadow = 'none';
            }

            lastScroll = currentScroll;
        });
    }

    // ===== Navigation Menu =====
    function initNavMenu() {
        const menuToggle = document.getElementById('menuToggle');
        const navDropdown = document.getElementById('navDropdown');

        if (!menuToggle || !navDropdown) return;

        // Toggle menu on button click
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menuToggle.classList.contains('open');
            menuToggle.classList.toggle('open');
            navDropdown.classList.toggle('open');
            menuToggle.setAttribute('aria-expanded', !isOpen);
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuToggle.contains(e.target) && !navDropdown.contains(e.target)) {
                menuToggle.classList.remove('open');
                navDropdown.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menuToggle.classList.contains('open')) {
                menuToggle.classList.remove('open');
                navDropdown.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ===== Copyright Year =====
    function updateCopyrightYear() {
        const yearSpan = document.getElementById('copyright-year');
        if (yearSpan) {
            yearSpan.textContent = new Date().getFullYear();
        }
    }

    // ===== Newsletter Form =====
    function initNewsletter() {
        const form = document.querySelector('.newsletter-form');
        const submitBtn = document.querySelector('.newsletter-submit');
        const loadingBtn = document.querySelector('.newsletter-loading');
        const body = document.querySelector('.newsletter-body');
        const success = document.querySelector('.newsletter-success');

        if (!form) return;

        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (submitBtn && loadingBtn) {
                submitBtn.style.display = 'none';
                loadingBtn.style.display = 'inline-flex';
            }

            try {
                const formData = new FormData(form);
                await fetch(form.action, {
                    method: 'POST',
                    body: formData,
                    mode: 'no-cors'
                });

                // Show success state
                if (body && success) {
                    body.style.display = 'none';
                    success.style.display = 'block';
                }
            } catch (error) {
                // Reset button state on error
                if (submitBtn && loadingBtn) {
                    submitBtn.style.display = 'inline-flex';
                    loadingBtn.style.display = 'none';
                }
            }
        });
    }

    // ===== Course Signup Form =====
    function initCourseForm() {
        const forms = document.querySelectorAll('.course-signup-form');
        const heroSection = document.querySelector('.course-hero');
        const successSection = document.querySelector('.course-success');
        const otherSections = document.querySelectorAll('.course-section');

        if (!forms.length) return;

        forms.forEach(form => {
            const submitBtn = form.querySelector('.course-submit-btn');
            const loadingBtn = form.querySelector('.course-loading-btn');

            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                if (submitBtn && loadingBtn) {
                    submitBtn.style.display = 'none';
                    loadingBtn.style.display = 'inline-flex';
                }

                try {
                    const formData = new FormData(form);
                    await fetch(form.action, {
                        method: 'POST',
                        body: formData,
                        mode: 'no-cors'
                    });

                    // Show success state
                    if (heroSection && successSection) {
                        heroSection.style.display = 'none';
                        successSection.style.display = 'block';
                        otherSections.forEach(section => section.style.display = 'none');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                } catch (error) {
                    // Reset button state on error
                    if (submitBtn && loadingBtn) {
                        submitBtn.style.display = 'inline-flex';
                        loadingBtn.style.display = 'none';
                    }
                }
            });
        });
    }

    // ===== Homepage FAQ Accordion =====
    // Accessible accordion for the static FAQ list on index.html. Each
    // question is a <button aria-expanded aria-controls> paired with a
    // hidden answer panel. One panel open at a time.
    function initHomeFaq() {
        const toggles = document.querySelectorAll('.faq .faq-toggle');
        if (!toggles.length) return;

        toggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';

                // Close any other open panel first (one open at a time).
                toggles.forEach(other => {
                    if (other === toggle) return;
                    other.setAttribute('aria-expanded', 'false');
                    const otherPanel = document.getElementById(other.getAttribute('aria-controls'));
                    if (otherPanel) otherPanel.hidden = true;
                });

                toggle.setAttribute('aria-expanded', String(!expanded));
                const panel = document.getElementById(toggle.getAttribute('aria-controls'));
                if (panel) panel.hidden = expanded;
            });
        });
    }

    // ===== App Store Deep Link (collection CTAs) =====
    // Post-launch, collection page App Store badges carry a
    // data-collection-id and try the native `quips://public-collection/<id>`
    // deep link first (for users who already have the app installed),
    // falling back to the badge's normal /go/appstore.html href if the app
    // doesn't open within DEEP_LINK_TIMEOUT_MS. Detection: if opening the
    // scheme backgrounds the tab (visibilitychange/pagehide fires) before the
    // timeout, the app handled it and the fallback navigation is skipped.
    // No-op today — badges only get data-collection-id once the TODO(launch)
    // comment around them is uncommented in scripts/build-collections.mjs.
    const DEEP_LINK_TIMEOUT_MS = 1500;

    function openInQuips(link) {
        const collectionId = link.dataset.collectionId;
        const fallbackUrl = link.getAttribute('href');
        if (!collectionId || !fallbackUrl) return;

        let appOpened = false;
        const markOpened = () => {
            if (document.hidden) appOpened = true;
        };
        document.addEventListener('visibilitychange', markOpened);
        window.addEventListener('pagehide', markOpened);

        window.location.href = `quips://public-collection/${encodeURIComponent(collectionId)}`;

        setTimeout(() => {
            document.removeEventListener('visibilitychange', markOpened);
            window.removeEventListener('pagehide', markOpened);
            if (!appOpened) {
                window.location.href = fallbackUrl;
            }
        }, DEEP_LINK_TIMEOUT_MS);
    }

    function initDeepLinkBadges() {
        document.querySelectorAll('.app-store-badge[data-collection-id]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                openInQuips(link);
            });
        });
    }

    // ===== Initialize =====
    function init() {
        // Theme
        initTheme();
        watchSystemTheme();

        // Theme toggle button
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Inline theme links (e.g. "light mode" / "dark mode" in copy)
        document.querySelectorAll('.theme-inline-link').forEach(link => {
            link.addEventListener('click', () => setTheme(link.dataset.theme));
        });

        // Other features
        initNavMenu();
        initSmoothScroll();
        initScreenshotGallery();
        initScrollAnimations();
        initHeaderScroll();
        updateCopyrightYear();
        initNewsletter();
        initCourseForm();
        initHomeFaq();
        initDeepLinkBadges();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
