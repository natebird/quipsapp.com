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

    // Get stored theme or null if not set
    function getStoredTheme() {
        return localStorage.getItem(THEME_KEY);
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

    // Toggle theme and save preference
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
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

        // Other features
        initNavMenu();
        initSmoothScroll();
        initScrollAnimations();
        initHeaderScroll();
        updateCopyrightYear();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
